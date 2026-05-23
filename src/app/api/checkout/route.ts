import { NextResponse } from "next/server";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildSafeCheckoutApiResponse,
  buildSafeCheckoutFailureResponse,
  canActorStartPlatformCheckout,
  createNythosProStripeCheckout,
  createStripeHttpClient,
  getStripeConfig,
  getSafeCheckoutFailureCode,
  NythosBillingError,
  parseNythosCheckoutRequest,
  resolveNythosProCheckout,
  sanitizeStripeError,
  StripeApiError,
  type AccountSubscriptionForStripe,
  type AccountSubscriptionPatch,
  type CheckoutSubscriptionStore,
  type NythosBillingCycle,
  type StripeCheckoutMode,
} from "@/lib/stripe/nythos-billing";

const ACCOUNT_SUBSCRIPTION_COLUMNS = [
  "owner_user_id",
  "plan_id",
  "status",
  "trial_ends_at",
  "current_period_started_at",
  "current_period_ends_at",
  "provider",
  "provider_customer_id",
  "provider_subscription_id",
  "metadata",
].join(", ");

type AdminClient = ReturnType<typeof createAdminClient>;

function asAccountSubscriptionForStripe(data: unknown): AccountSubscriptionForStripe {
  return data as AccountSubscriptionForStripe;
}

function createCheckoutSubscriptionStore(adminClient: AdminClient): CheckoutSubscriptionStore {
  async function getOrCreateSubscription(ownerUserId: string): Promise<AccountSubscriptionForStripe> {
    const { data, error } = await adminClient
      .from("account_subscriptions")
      .select(ACCOUNT_SUBSCRIPTION_COLUMNS)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();

    if (error) throw error;
    if (data) return asAccountSubscriptionForStripe(data);

    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const { data: inserted, error: insertError } = await adminClient
      .from("account_subscriptions")
      .insert({
        owner_user_id: ownerUserId,
        plan_id: "professional",
        status: "trialing",
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
        metadata: {
          source: "stripe_checkout_backfill",
          billing_effects_enabled: false,
        },
      })
      .select(ACCOUNT_SUBSCRIPTION_COLUMNS)
      .single();

    if (insertError) throw insertError;
    return asAccountSubscriptionForStripe(inserted);
  }

  async function updateSubscription(
    ownerUserId: string,
    patch: AccountSubscriptionPatch
  ): Promise<AccountSubscriptionForStripe> {
    const { data, error } = await adminClient
      .from("account_subscriptions")
      .update(patch)
      .eq("owner_user_id", ownerUserId)
      .select(ACCOUNT_SUBSCRIPTION_COLUMNS)
      .single();

    if (error) throw error;
    return asAccountSubscriptionForStripe(data);
  }

  return {
    getOrCreateSubscription,
    updateSubscription,
  };
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new NythosBillingError("invalid_json", "Payload de checkout invalido.");
  }
}

function buildBillingUrl(request: Request, status: "success" | "cancelled"): string {
  const url = new URL("/dashboard/settings/billing", request.url);
  url.searchParams.set("checkout", status);
  return url.toString();
}

function buildEmbeddedReturnUrl(request: Request): string {
  const origin = new URL(request.url).origin;
  return `${origin}/dashboard/settings/billing?checkout=return&session_id={CHECKOUT_SESSION_ID}`;
}

export async function POST(request: Request) {
  let billingCycle: NythosBillingCycle | undefined;
  let checkoutMode: StripeCheckoutMode | undefined;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        buildSafeCheckoutFailureResponse("Unauthorized"),
        { status: 401 }
      );
    }

    const payload = parseNythosCheckoutRequest(await readJsonBody(request));
    billingCycle = payload.billingCycle;
    checkoutMode = payload.checkoutMode;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, employer_id, full_name, clinic_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || !canActorStartPlatformCheckout(profile)) {
      return NextResponse.json(
        buildSafeCheckoutFailureResponse(
          safeClientError("Somente o owner da conta pode iniciar checkout da plataforma."),
          billingCycle
        ),
        { status: 403 }
      );
    }

    const config = getStripeConfig();
    if (!config.checkoutEnabled) {
      return NextResponse.json(
        buildSafeCheckoutApiResponse({
          ok: false,
          checkoutEnabled: false,
          code: "stripe_checkout_disabled",
          billingCycle,
          message: "O pagamento online ainda nao esta disponivel para esta conta. Seu plano nao foi alterado.",
        }),
        { status: 503 }
      );
    }

    const checkout = resolveNythosProCheckout(payload.billingCycle, config);
    const adminClient = createAdminClient();
    const checkoutProfile = {
      ...profile,
      email: profile.email ?? user.email ?? null,
    };

    const result = await createNythosProStripeCheckout({
      ownerUserId: user.id,
      profile: checkoutProfile,
      checkout,
      config,
      stripeClient: createStripeHttpClient(config),
      store: createCheckoutSubscriptionStore(adminClient),
      checkoutMode: payload.checkoutMode,
      returnUrl: buildEmbeddedReturnUrl(request),
      successUrl: buildBillingUrl(request, "success"),
      cancelUrl: buildBillingUrl(request, "cancelled"),
    });

    return NextResponse.json(buildSafeCheckoutApiResponse(result));
  } catch (error) {
    if (error instanceof NythosBillingError) {
      const code = getSafeCheckoutFailureCode(error.code, checkoutMode);
      logSafeError("[checkout] Safe billing error", error, { code, billingCycle, checkoutMode });
      return NextResponse.json(
        buildSafeCheckoutFailureResponse(safeClientError(error.message), billingCycle, code),
        { status: error.status }
      );
    }

    if (error instanceof StripeApiError) {
      const code = checkoutMode === "hosted" ? "stripe_hosted_session_failed" : "stripe_embedded_session_failed";
      logSafeError("[checkout] Stripe test-mode error", sanitizeStripeError(error), {
        code,
        billingCycle,
        checkoutMode,
      });
      return NextResponse.json(
        buildSafeCheckoutFailureResponse(
          safeClientError("Nao foi possivel iniciar o checkout agora. Tente novamente em instantes."),
          billingCycle,
          code
        ),
        { status: 502 }
      );
    }

    logSafeError("[checkout] Unexpected checkout error", error);
    return NextResponse.json(
      buildSafeCheckoutFailureResponse(
        safeClientError("Nao foi possivel iniciar o checkout agora. Tente novamente em instantes."),
        billingCycle,
        "stripe_checkout_failed"
      ),
      { status: 500 }
    );
  }
}
