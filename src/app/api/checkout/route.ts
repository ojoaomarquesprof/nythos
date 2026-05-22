import { NextResponse } from "next/server";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  AsaasApiError,
  buildSafeCheckoutApiResponse,
  canActorStartPlatformCheckout,
  createAsaasHttpClient,
  createNythosProAsaasCheckout,
  getAsaasConfig,
  NythosBillingError,
  parseNythosCheckoutRequest,
  resolveNythosProCheckout,
  sanitizeAsaasError,
  type AccountSubscriptionForAsaas,
  type AccountSubscriptionPatch,
  type CheckoutSubscriptionStore,
} from "@/lib/asaas/nythos-billing";

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

function asAccountSubscriptionForAsaas(data: unknown): AccountSubscriptionForAsaas {
  return data as AccountSubscriptionForAsaas;
}

function createCheckoutSubscriptionStore(adminClient: AdminClient): CheckoutSubscriptionStore {
  async function getOrCreateSubscription(ownerUserId: string): Promise<AccountSubscriptionForAsaas> {
    const { data, error } = await adminClient
      .from("account_subscriptions")
      .select(ACCOUNT_SUBSCRIPTION_COLUMNS)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();

    if (error) throw error;
    if (data) return asAccountSubscriptionForAsaas(data);

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
          source: "asaas_checkout_backfill",
          billing_effects_enabled: false,
        },
      })
      .select(ACCOUNT_SUBSCRIPTION_COLUMNS)
      .single();

    if (insertError) throw insertError;
    return asAccountSubscriptionForAsaas(inserted);
  }

  async function updateSubscription(
    ownerUserId: string,
    patch: AccountSubscriptionPatch
  ): Promise<AccountSubscriptionForAsaas> {
    const { data, error } = await adminClient
      .from("account_subscriptions")
      .update(patch)
      .eq("owner_user_id", ownerUserId)
      .select(ACCOUNT_SUBSCRIPTION_COLUMNS)
      .single();

    if (error) throw error;
    return asAccountSubscriptionForAsaas(data);
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

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = parseNythosCheckoutRequest(await readJsonBody(request));
    const checkout = resolveNythosProCheckout(payload.billingCycle);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, employer_id, full_name, clinic_name, email, cpf, phone")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || !canActorStartPlatformCheckout(profile)) {
      return NextResponse.json(
        {
          error: safeClientError("Somente o owner da conta pode iniciar checkout da plataforma."),
          code: "checkout_forbidden",
        },
        { status: 403 }
      );
    }

    const config = getAsaasConfig();

    if (!config.checkoutEnabled) {
      logSafeError("[checkout] Asaas checkout disabled", {
        code: "checkout_disabled",
        plan: payload.plan,
        billingCycle: payload.billingCycle,
      });

      return NextResponse.json(
        buildSafeCheckoutApiResponse({
          ok: false,
          checkoutEnabled: false,
          code: "checkout_disabled",
          message: "O pagamento online ainda nao esta disponivel para esta conta. Seu plano nao foi alterado.",
        }),
        { status: 503 }
      );
    }

    const adminClient = createAdminClient();
    let checkoutProfile = {
      ...profile,
      email: profile.email ?? user.email ?? null,
    };

    if (payload.billingDocument) {
      const { data: updatedProfile, error: updateProfileError } = await adminClient
        .from("profiles")
        .update({ cpf: payload.billingDocument })
        .eq("id", user.id)
        .select("id, role, employer_id, full_name, clinic_name, email, cpf, phone")
        .single();

      if (updateProfileError) {
        throw new NythosBillingError(
          "billing_document_save_failed",
          "Nao foi possivel salvar os dados de pagamento agora. Tente novamente.",
          500
        );
      }

      checkoutProfile = {
        ...updatedProfile,
        email: updatedProfile.email ?? user.email ?? null,
      };
    }

    const result = await createNythosProAsaasCheckout({
      ownerUserId: user.id,
      profile: checkoutProfile,
      checkout,
      config,
      asaasClient: createAsaasHttpClient(config),
      store: createCheckoutSubscriptionStore(adminClient),
    });

    if (!result.ok) {
      return NextResponse.json(buildSafeCheckoutApiResponse(result), { status: 503 });
    }

    return NextResponse.json(buildSafeCheckoutApiResponse(result));
  } catch (error) {
    if (error instanceof NythosBillingError) {
      return NextResponse.json(
        {
          error: safeClientError(error.message),
          code: error.code,
        },
        { status: error.status }
      );
    }

    if (error instanceof AsaasApiError) {
      logSafeError("[checkout] Asaas sandbox error", sanitizeAsaasError(error));
      return NextResponse.json(
        {
          error: safeClientError("Nao foi possivel iniciar o checkout agora. Tente novamente em instantes."),
          code: "asaas_checkout_failed",
        },
        { status: 502 }
      );
    }

    logSafeError("[checkout] Unexpected checkout error", error);
    return NextResponse.json(
      {
        error: safeClientError("Nao foi possivel iniciar o checkout agora. Tente novamente em instantes."),
        code: "checkout_failed",
      },
      { status: 500 }
    );
  }
}
