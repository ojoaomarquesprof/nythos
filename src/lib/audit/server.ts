import { logSafeError } from "@/lib/errors/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
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

type ActorInput = Pick<AuditEventInput, "actorId" | "actorRole">;

type SessionAuditBaseInput = ActorInput & {
  sessionId: string;
  patientId?: string | null;
  packageId?: string | null;
};

type SessionScheduleAuditFields = {
  scheduledAt?: string | null;
  previousScheduledAt?: string | null;
  newScheduledAt?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  durationMinutes?: number | null;
  billingMode?: string | null;
  sessionPrice?: number | null;
  isRecurring?: boolean;
  recurrenceCount?: number | null;
  googleSynced?: boolean;
  conflictChecked?: boolean;
};

function buildSessionScheduleMetadata(
  input: SessionAuditBaseInput & SessionScheduleAuditFields
): AuditMetadata {
  return {
    session_id: input.sessionId,
    patient_id: input.patientId ?? null,
    scheduled_at: input.scheduledAt ?? undefined,
    previous_scheduled_at: input.previousScheduledAt ?? undefined,
    new_scheduled_at: input.newScheduledAt ?? undefined,
    old_status: input.oldStatus ?? undefined,
    new_status: input.newStatus ?? undefined,
    duration_minutes: input.durationMinutes ?? undefined,
    billing_mode: input.billingMode ?? undefined,
    package_id: input.packageId ?? undefined,
    session_price: input.sessionPrice ?? undefined,
    is_recurring: input.isRecurring,
    recurrence_count: input.recurrenceCount ?? undefined,
    google_synced: input.googleSynced,
    conflict_checked: input.conflictChecked,
  };
}

export async function recordSessionCreated(input: SessionAuditBaseInput & SessionScheduleAuditFields): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.isRecurring
      ? AUDIT_ACTIONS.CREATE_RECURRING_SESSIONS
      : AUDIT_ACTIONS.CREATE_SESSION,
    entityType: AUDIT_ENTITY_TYPES.SESSION,
    entityId: input.sessionId,
    patientId: input.patientId,
    sessionId: input.sessionId,
    packageId: input.packageId,
    metadata: buildSessionScheduleMetadata(input),
  });
}

export async function recordSessionCancelled(input: SessionAuditBaseInput & SessionScheduleAuditFields): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: AUDIT_ACTIONS.CANCEL_SESSION,
    entityType: AUDIT_ENTITY_TYPES.SESSION,
    entityId: input.sessionId,
    patientId: input.patientId,
    sessionId: input.sessionId,
    packageId: input.packageId,
    metadata: buildSessionScheduleMetadata(input),
  });
}

export async function recordSessionRescheduled(input: SessionAuditBaseInput & SessionScheduleAuditFields): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: AUDIT_ACTIONS.RESCHEDULE_SESSION,
    entityType: AUDIT_ENTITY_TYPES.SESSION,
    entityId: input.sessionId,
    patientId: input.patientId,
    sessionId: input.sessionId,
    packageId: input.packageId,
    metadata: buildSessionScheduleMetadata(input),
  });
}

export async function recordSessionEvolutionSaved(
  input: SessionAuditBaseInput & {
    hadPreviousEvolution?: boolean;
    hasScales?: boolean;
    scaleFields?: string[];
    source?: "schedule" | "patient";
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.hadPreviousEvolution
      ? AUDIT_ACTIONS.UPDATE_SESSION_EVOLUTION
      : AUDIT_ACTIONS.CREATE_SESSION_EVOLUTION,
    entityType: AUDIT_ENTITY_TYPES.SESSION,
    entityId: input.sessionId,
    patientId: input.patientId,
    sessionId: input.sessionId,
    packageId: input.packageId,
    metadata: {
      patient_id: input.patientId ?? null,
      session_id: input.sessionId,
      had_previous_evolution: input.hadPreviousEvolution === true,
      has_scales: input.hasScales === true,
      scale_fields: input.scaleFields ?? [],
      source: input.source,
    },
  });
}

export async function recordGeneralNoteAppended(
  input: ActorInput & {
    patientId: string;
    source?: "schedule" | "patient";
    lengthBucket?: "short" | "medium" | "long";
    createdBy?: string | null;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: AUDIT_ACTIONS.APPEND_GENERAL_NOTE,
    entityType: AUDIT_ENTITY_TYPES.PATIENT,
    entityId: input.patientId,
    patientId: input.patientId,
    metadata: {
      patient_id: input.patientId,
      note_type: "general_note",
      source: input.source,
      length_bucket: input.lengthBucket,
      created_by: input.createdBy ?? null,
    },
  });
}
