import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/auth/admin-authorization";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/audit-events";
import { recordAuditEvent } from "@/lib/audit/server";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES = ["active", "trialing", "past_due", "cancelled", "expired", "free", "legacy"] as const;

type AdminSubscriptionStatus = (typeof ALLOWED_STATUSES)[number];

function normalizeStatus(status: unknown): AdminSubscriptionStatus | null {
  if (status === "canceled") return "cancelled";
  if (typeof status !== "string") return null;
  return ALLOWED_STATUSES.includes(status as AdminSubscriptionStatus)
    ? status as AdminSubscriptionStatus
    : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const status = normalizeStatus(body.status);
    const days = Number(body.days || 0);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isPlatformAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    if (!status) {
      return NextResponse.json({ error: "Invalid subscription status" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const now = new Date();
    const periodEnd = new Date(now);

    if (Number.isFinite(days) && days > 0) {
      periodEnd.setDate(periodEnd.getDate() + days);
    } else if (status === "trialing") {
      periodEnd.setDate(periodEnd.getDate() + 14);
    } else if (status === "active") {
      periodEnd.setDate(periodEnd.getDate() + 30);
    }

    const { data: existingSub } = await adminClient
      .from("account_subscriptions")
      .select("id, status, plan_id")
      .eq("owner_user_id", id)
      .maybeSingle();

    const payload = {
      owner_user_id: id,
      status,
      plan_id: status === "free" ? "free" : "professional",
      trial_started_at: status === "trialing" ? now.toISOString() : null,
      trial_ends_at: status === "trialing" ? periodEnd.toISOString() : null,
      current_period_started_at: status === "active" ? now.toISOString() : null,
      current_period_ends_at: status === "active" ? periodEnd.toISOString() : null,
      cancel_at_period_end: false,
      metadata: {
        source: "manual_admin_update",
        billing_effects_enabled: false,
      },
      updated_at: now.toISOString(),
    };

    const result = await adminClient
      .from("account_subscriptions")
      .upsert(payload, { onConflict: "owner_user_id" })
      .select("id, owner_user_id, plan_id, status, trial_ends_at, current_period_ends_at, cancel_at_period_end")
      .single();

    if (result.error) throw result.error;

    await recordAuditEvent({
      actorId: user.id,
      action: AUDIT_ACTIONS.UPDATE_ACCOUNT_SUBSCRIPTION,
      entityType: AUDIT_ENTITY_TYPES.ACCOUNT_SUBSCRIPTION,
      entityId: result.data.id,
      metadata: {
        owner_user_id: id,
        old_status: existingSub?.status ?? null,
        new_status: status,
        old_plan_id: existingSub?.plan_id ?? null,
        new_plan_id: payload.plan_id,
        source: "admin",
      },
    });

    return NextResponse.json({ success: true, subscription: result.data });
  } catch (error) {
    logSafeError("Admin subscription API error", error);
    return NextResponse.json(
      { error: safeClientError("Nao foi possivel concluir a operacao.") },
      { status: 500 }
    );
  }
}
