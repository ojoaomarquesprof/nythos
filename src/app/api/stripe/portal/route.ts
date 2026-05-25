import { NextResponse } from "next/server";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildSafePortalApiResponse,
  buildStripePortalReturnUrl,
  canActorManagePlatformBilling,
  createNythosStripePortalSession,
  createStripeHttpClient,
  getStripeConfig,
  NythosBillingError,
  sanitizeStripeError,
  StripeApiError,
  type AccountSubscriptionForStripe,
  type SafePortalApiResponse,
  type StripePortalFailureCode,
} from "@/lib/stripe/nythos-billing";

export const runtime = "nodejs";

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

function failureResponse(
  code: StripePortalFailureCode,
  message: string
): SafePortalApiResponse {
  return {
    success: false,
    code,
    message,
  };
}

function portalErrorCode(error: NythosBillingError): StripePortalFailureCode {
  if (error.code === "stripe_live_environment_blocked" || error.code === "stripe_live_key_blocked") {
    return "stripe_portal_disabled";
  }

  if (error.code === "stripe_missing_secret_key" || error.code === "stripe_secret_key_unavailable") {
    return "stripe_portal_disabled";
  }

  return "stripe_portal_session_failed";
}

async function readPortalRequestBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};

  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    throw new NythosBillingError(
      "invalid_portal_payload",
      "Nao foi possivel abrir o gerenciamento de assinatura agora.",
      400
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        failureResponse("not_authenticated", "Unauthorized"),
        { status: 401 }
      );
    }

    const body = await readPortalRequestBody(request);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, employer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile || !canActorManagePlatformBilling(profile)) {
      return NextResponse.json(
        failureResponse("not_owner", "Somente o responsavel da conta pode gerenciar a assinatura."),
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();
    const { data: subscription, error: subscriptionError } = await adminClient
      .from("account_subscriptions")
      .select(ACCOUNT_SUBSCRIPTION_COLUMNS)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;

    const config = getStripeConfig();
    const result = await createNythosStripePortalSession({
      profile,
      subscription: subscription as AccountSubscriptionForStripe | null,
      config,
      stripeClient: createStripeHttpClient(config),
      returnUrl: buildStripePortalReturnUrl(request.url, body.returnPath),
    });

    return NextResponse.json(buildSafePortalApiResponse(result), {
      status: result.ok ? 200 : result.status,
    });
  } catch (error) {
    if (error instanceof NythosBillingError) {
      const code = portalErrorCode(error);
      logSafeError("[stripe-portal] Safe billing error", error, { code });
      return NextResponse.json(
        failureResponse(code, safeClientError(error.message)),
        { status: error.status }
      );
    }

    if (error instanceof StripeApiError) {
      logSafeError("[stripe-portal] Stripe test-mode error", sanitizeStripeError(error));
      return NextResponse.json(
        failureResponse(
          "stripe_portal_session_failed",
          "Nao foi possivel abrir o gerenciamento de assinatura agora."
        ),
        { status: 502 }
      );
    }

    logSafeError("[stripe-portal] Unexpected portal error", error);
    return NextResponse.json(
      failureResponse(
        "stripe_portal_session_failed",
        "Nao foi possivel abrir o gerenciamento de assinatura agora."
      ),
      { status: 500 }
    );
  }
}
