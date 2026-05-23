import { NextResponse } from "next/server";
import { logSafeError } from "@/lib/errors/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertTestWebhookConfig,
  buildStripeWebhookDecision,
  createStripeHttpClient,
  enrichStripeWebhookDecisionWithSubscription,
  getStripeConfig,
  hasProcessedStripeEvent,
  mergeStripeWebhookMetadata,
  NythosBillingError,
  sanitizeStripeError,
  StripeApiError,
  verifyStripeWebhookSignature,
  type AccountSubscriptionForStripe,
  type StripeWebhookDecision,
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

function compactPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

async function findStripeSubscriptionRow(
  decision: Extract<StripeWebhookDecision, { action: "update_subscription" }>
): Promise<AccountSubscriptionForStripe | null> {
  const adminClient = createAdminClient();

  if (decision.providerSubscriptionId) {
    const { data, error } = await adminClient
      .from("account_subscriptions")
      .select(ACCOUNT_SUBSCRIPTION_COLUMNS)
      .eq("provider", "stripe")
      .eq("provider_subscription_id", decision.providerSubscriptionId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as unknown as AccountSubscriptionForStripe;
  }

  if (decision.providerCustomerId) {
    const { data, error } = await adminClient
      .from("account_subscriptions")
      .select(ACCOUNT_SUBSCRIPTION_COLUMNS)
      .eq("provider", "stripe")
      .eq("provider_customer_id", decision.providerCustomerId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as unknown as AccountSubscriptionForStripe;
  }

  return null;
}

async function updateStripeSubscriptionRow(
  subscription: AccountSubscriptionForStripe,
  decision: Extract<StripeWebhookDecision, { action: "update_subscription" }>
) {
  const adminClient = createAdminClient();
  const patch = compactPatch({
    plan_id: "professional",
    status: decision.status,
    provider: "stripe",
    provider_customer_id: decision.providerCustomerId,
    provider_subscription_id: decision.providerSubscriptionId,
    current_period_started_at: decision.currentPeriodStartedAt,
    current_period_ends_at: decision.currentPeriodEndsAt,
    cancel_at_period_end: decision.cancelAtPeriodEnd,
    metadata: mergeStripeWebhookMetadata(subscription, decision.metadata, decision.eventId),
  });

  const { error } = await adminClient
    .from("account_subscriptions")
    .update(patch)
    .eq("owner_user_id", subscription.owner_user_id)
    .eq("provider", "stripe");

  if (error) throw error;
}

export async function POST(req: Request) {
  const config = getStripeConfig();

  try {
    assertTestWebhookConfig(config);
  } catch (error) {
    const status = error instanceof NythosBillingError ? error.status : 503;
    return NextResponse.json({ received: false, error: "stripe_webhook_not_configured" }, { status });
  }

  let decision: StripeWebhookDecision;

  try {
    const rawBody = await req.text();
    const event = verifyStripeWebhookSignature(
      rawBody,
      req.headers.get("stripe-signature"),
      config.webhookSecret as string
    );
    decision = buildStripeWebhookDecision(event);

    if (
      decision.action === "update_subscription"
      && decision.eventType === "checkout.session.completed"
      && decision.providerSubscriptionId
      && config.secretKey
    ) {
      const stripeClient = createStripeHttpClient(config);
      const stripeSubscription = await stripeClient.retrieveSubscription(decision.providerSubscriptionId);
      decision = enrichStripeWebhookDecisionWithSubscription(decision, stripeSubscription);
    }
  } catch (error) {
    if (error instanceof NythosBillingError) {
      return NextResponse.json(
        { received: false, error: "stripe_webhook_signature_failed" },
        { status: error.status }
      );
    }

    if (error instanceof StripeApiError) {
      logSafeError("[stripe-webhook] Stripe API lookup failed", sanitizeStripeError(error));
      return NextResponse.json({ received: false, error: "stripe_lookup_failed" }, { status: 502 });
    }

    logSafeError("[stripe-webhook] Webhook validation failed", error);
    return NextResponse.json({ received: false, error: "stripe_webhook_failed" }, { status: 400 });
  }

  if (decision.action === "ignore") {
    return NextResponse.json({
      received: true,
      ignored: true,
      event: decision.eventType,
      reason: decision.reason,
    });
  }

  try {
    const subscription = await findStripeSubscriptionRow(decision);

    if (!subscription) {
      return NextResponse.json({
        received: true,
        ignored: true,
        event: decision.eventType,
        reason: "subscription_not_found",
      });
    }

    if (hasProcessedStripeEvent(subscription.metadata, decision.eventId)) {
      return NextResponse.json({
        received: true,
        ignored: true,
        event: decision.eventType,
        reason: "duplicate_event",
      });
    }

    await updateStripeSubscriptionRow(subscription, decision);

    return NextResponse.json({
      received: true,
      updated: true,
      event: decision.eventType,
      status: decision.status,
    });
  } catch (error) {
    logSafeError("[stripe-webhook] Stripe webhook processing failed", error, {
      event: decision.eventType,
      providerSubscriptionId: decision.providerSubscriptionId,
      providerCustomerId: decision.providerCustomerId,
    });

    return NextResponse.json(
      {
        received: true,
        updated: false,
        error: "webhook_processing_failed",
      },
      { status: 500 }
    );
  }
}
