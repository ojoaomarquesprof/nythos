import { NextResponse } from "next/server";
import { logSafeError } from "@/lib/errors/safe-error";
import { buildAsaasWebhookDecision, getAsaasConfig, mergeWebhookMetadata } from "@/lib/asaas/nythos-billing";
import { createAdminClient } from "@/lib/supabase/admin";

async function readWebhookPayload(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const config = getAsaasConfig();
  const webhookToken = config.webhookToken;
  const authToken = req.headers.get("asaas-access-token");

  if (!webhookToken || authToken !== webhookToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await readWebhookPayload(req);
  const decision = buildAsaasWebhookDecision(payload);

  if (decision.action === "ignore") {
    return NextResponse.json({
      received: true,
      ignored: true,
      event: decision.event,
      reason: decision.reason,
    });
  }

  try {
    const adminClient = createAdminClient();
    const { data: subscription, error: selectError } = await adminClient
      .from("account_subscriptions")
      .select("owner_user_id, current_period_started_at, metadata")
      .eq("provider", "asaas")
      .eq("provider_subscription_id", decision.providerSubscriptionId)
      .maybeSingle();

    if (selectError) throw selectError;

    if (!subscription) {
      return NextResponse.json({
        received: true,
        ignored: true,
        event: decision.event,
        reason: "subscription_not_found",
      });
    }

    const now = new Date().toISOString();
    const patch = {
      plan_id: "professional",
      status: decision.status,
      current_period_started_at: decision.status === "active"
        ? (subscription.current_period_started_at ?? now)
        : subscription.current_period_started_at,
      metadata: mergeWebhookMetadata(subscription, decision.metadata),
    };

    const { error: updateError } = await adminClient
      .from("account_subscriptions")
      .update(patch)
      .eq("owner_user_id", subscription.owner_user_id)
      .eq("provider", "asaas")
      .eq("provider_subscription_id", decision.providerSubscriptionId);

    if (updateError) throw updateError;

    return NextResponse.json({
      received: true,
      updated: true,
      event: decision.event,
      status: decision.status,
    });
  } catch (error) {
    logSafeError("[webhooks] Asaas webhook processing failed", error, {
      event: decision.event,
      providerSubscriptionId: decision.providerSubscriptionId,
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
