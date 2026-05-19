import { logSafeError } from "@/lib/errors/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sanitizeAuditMetadata,
  type AuditAction,
  type AuditEntityType,
  type AuditMetadata,
} from "./audit-events";

type AuditEventInput = {
  actorId: string | null;
  actorRole?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  patientId?: string | null;
  sessionId?: string | null;
  packageId?: string | null;
  cashFlowId?: string | null;
  documentId?: string | null;
  metadata?: AuditMetadata | null;
};

async function resolveActorRole(
  admin: ReturnType<typeof createAdminClient>,
  actorId: string | null,
  actorRole?: string | null
): Promise<string | null> {
  if (actorRole) return actorRole;
  if (!actorId) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", actorId)
    .maybeSingle();

  if (error) {
    logSafeError("[audit] Failed to resolve actor role", error, { actorId });
    return null;
  }

  return data?.role ?? null;
}

export async function recordAuditEvent(input: AuditEventInput): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const actorRole = await resolveActorRole(admin, input.actorId, input.actorRole);
    const metadata = sanitizeAuditMetadata(input.metadata ?? {});

    const { error } = await admin.from("audit_logs").insert({
      user_id: input.actorId,
      actor_role: actorRole,
      action: input.action,
      table_name: input.entityType,
      record_id: input.entityId ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      patient_id: input.patientId ?? null,
      session_id: input.sessionId ?? null,
      package_id: input.packageId ?? null,
      cash_flow_id: input.cashFlowId ?? null,
      document_id: input.documentId ?? null,
      metadata,
    });

    if (error) {
      logSafeError("[audit] Failed to record audit event", error, {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
      });
      return false;
    }

    return true;
  } catch (error) {
    logSafeError("[audit] Unexpected failure while recording audit event", error, {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
    });
    return false;
  }
}
