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

export async function recordPatientLinkEvent(
  input: ActorInput & {
    patientId: string;
    actionType: "generate" | "revoke" | "regenerate" | "grant";
    expiresAt?: string | null;
    linkStatus?: string | null;
    tokenRotated?: boolean;
  }
): Promise<boolean> {
  const actionByType = {
    generate: AUDIT_ACTIONS.GENERATE_PATIENT_LINK,
    revoke: AUDIT_ACTIONS.REVOKE_PATIENT_LINK,
    regenerate: AUDIT_ACTIONS.REGENERATE_PATIENT_LINK,
    grant: AUDIT_ACTIONS.PATIENT_PORTAL_ACCESS_GRANTED,
  } as const;

  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: actionByType[input.actionType],
    entityType: AUDIT_ENTITY_TYPES.PATIENT,
    entityId: input.patientId,
    patientId: input.patientId,
    metadata: {
      patient_id: input.patientId,
      action_type: input.actionType,
      expires_at: input.expiresAt ?? null,
      link_status: input.linkStatus ?? null,
      token_rotated: input.tokenRotated === true,
    },
  });
}

export async function recordPatientConsentEvent(
  input: ActorInput & {
    action: typeof AUDIT_ACTIONS.CREATE_PATIENT_CONSENT
      | typeof AUDIT_ACTIONS.UPDATE_PATIENT_CONSENT_STATUS
      | typeof AUDIT_ACTIONS.REVOKE_PATIENT_CONSENT
      | typeof AUDIT_ACTIONS.DELETE_PATIENT_CONSENT;
    patientId: string;
    consentId?: string | null;
    consentType?: string | null;
    oldStatus?: string | null;
    newStatus?: string | null;
    signedAt?: string | null;
    revokedAt?: string | null;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    entityType: AUDIT_ENTITY_TYPES.PATIENT_CONSENT,
    entityId: input.consentId ?? null,
    patientId: input.patientId,
    metadata: {
      patient_id: input.patientId,
      consent_id: input.consentId ?? null,
      consent_type: input.consentType ?? null,
      old_status: input.oldStatus ?? null,
      new_status: input.newStatus ?? null,
      signed_at: input.signedAt ?? null,
      revoked_at: input.revokedAt ?? null,
    },
  });
}

export async function recordCareContactEvent(
  input: ActorInput & {
    action: typeof AUDIT_ACTIONS.CREATE_CARE_CONTACT
      | typeof AUDIT_ACTIONS.UPDATE_CARE_CONTACT
      | typeof AUDIT_ACTIONS.REMOVE_CARE_CONTACT
      | typeof AUDIT_ACTIONS.AUTHORIZE_CARE_CONTACT
      | typeof AUDIT_ACTIONS.REVOKE_CARE_CONTACT_AUTHORIZATION;
    patientId: string;
    contactId?: string | null;
    contactType?: string | null;
    oldActive?: boolean | null;
    newActive?: boolean | null;
    oldAuthorized?: boolean | null;
    newAuthorized?: boolean | null;
    isEmergencyContact?: boolean;
    isFinancialResponsible?: boolean;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    entityType: AUDIT_ENTITY_TYPES.CARE_CONTACT,
    entityId: input.contactId ?? null,
    patientId: input.patientId,
    metadata: {
      patient_id: input.patientId,
      contact_id: input.contactId ?? null,
      contact_type: input.contactType ?? null,
      old_active: input.oldActive ?? null,
      new_active: input.newActive ?? null,
      old_authorized: input.oldAuthorized ?? null,
      new_authorized: input.newAuthorized ?? null,
      is_emergency_contact: input.isEmergencyContact === true,
      is_financial_responsible: input.isFinancialResponsible === true,
    },
  });
}

export async function recordTreatmentPlanEvent(
  input: ActorInput & {
    action: typeof AUDIT_ACTIONS.CREATE_TREATMENT_PLAN
      | typeof AUDIT_ACTIONS.UPDATE_TREATMENT_PLAN
      | typeof AUDIT_ACTIONS.CHANGE_TREATMENT_PLAN_STATUS;
    patientId: string;
    planId?: string | null;
    oldStatus?: string | null;
    newStatus?: string | null;
    hasReviewDate?: boolean;
    goalsCount?: number | null;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    entityType: AUDIT_ENTITY_TYPES.TREATMENT_PLAN,
    entityId: input.planId ?? null,
    patientId: input.patientId,
    metadata: {
      patient_id: input.patientId,
      plan_id: input.planId ?? null,
      old_status: input.oldStatus ?? null,
      new_status: input.newStatus ?? null,
      has_review_date: input.hasReviewDate === true,
      goals_count: input.goalsCount ?? null,
    },
  });
}

export async function recordTreatmentGoalEvent(
  input: ActorInput & {
    action: typeof AUDIT_ACTIONS.CREATE_TREATMENT_GOAL
      | typeof AUDIT_ACTIONS.UPDATE_TREATMENT_GOAL
      | typeof AUDIT_ACTIONS.COMPLETE_TREATMENT_GOAL
      | typeof AUDIT_ACTIONS.PAUSE_TREATMENT_GOAL;
    patientId: string;
    planId?: string | null;
    goalId?: string | null;
    oldStatus?: string | null;
    newStatus?: string | null;
    priority?: string | null;
    category?: string | null;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    entityType: AUDIT_ENTITY_TYPES.TREATMENT_GOAL,
    entityId: input.goalId ?? null,
    patientId: input.patientId,
    metadata: {
      patient_id: input.patientId,
      plan_id: input.planId ?? null,
      goal_id: input.goalId ?? null,
      old_status: input.oldStatus ?? null,
      new_status: input.newStatus ?? null,
      priority: input.priority ?? null,
      category: input.category ?? null,
    },
  });
}

export async function recordPatientTaskEvent(
  input: ActorInput & {
    action: typeof AUDIT_ACTIONS.CREATE_PATIENT_TASK
      | typeof AUDIT_ACTIONS.UPDATE_PATIENT_TASK
      | typeof AUDIT_ACTIONS.CANCEL_PATIENT_TASK
      | typeof AUDIT_ACTIONS.COMPLETE_PATIENT_TASK_BY_THERAPIST;
    patientId: string;
    taskId?: string | null;
    category?: string | null;
    oldStatus?: string | null;
    newStatus?: string | null;
    dueDate?: string | null;
    priority?: string | null;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    entityType: AUDIT_ENTITY_TYPES.PATIENT_TASK,
    entityId: input.taskId ?? null,
    patientId: input.patientId,
    metadata: {
      patient_id: input.patientId,
      task_id: input.taskId ?? null,
      category: input.category ?? null,
      old_status: input.oldStatus ?? null,
      new_status: input.newStatus ?? null,
      due_date: input.dueDate ?? null,
      priority: input.priority ?? null,
    },
  });
}

export async function recordPublicAnamnesisOpened(
  input: ActorInput & {
    patientId?: string | null;
    templateId?: string | null;
    responseId?: string | null;
    requestId?: string | null;
    status?: string | null;
    tokenValid?: boolean;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: AUDIT_ACTIONS.PUBLIC_ANAMNESIS_OPENED,
    entityType: AUDIT_ENTITY_TYPES.ANAMNESIS_RESPONSE,
    entityId: input.responseId ?? input.requestId ?? null,
    patientId: input.patientId ?? null,
    metadata: {
      patient_id: input.patientId ?? null,
      template_id: input.templateId ?? null,
      response_id: input.responseId ?? null,
      request_id: input.requestId ?? null,
      source: "public_link",
      status: input.status ?? null,
      token_valid: input.tokenValid === true,
    },
  });
}

export async function recordPublicAnamnesisSubmitted(
  input: ActorInput & {
    patientId?: string | null;
    templateId?: string | null;
    responseId?: string | null;
    requestId?: string | null;
    submittedAt?: string | null;
    status?: string | null;
    tokenValid?: boolean;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: AUDIT_ACTIONS.PUBLIC_ANAMNESIS_SUBMITTED,
    entityType: AUDIT_ENTITY_TYPES.ANAMNESIS_RESPONSE,
    entityId: input.responseId ?? input.requestId ?? null,
    patientId: input.patientId ?? null,
    metadata: {
      patient_id: input.patientId ?? null,
      template_id: input.templateId ?? null,
      response_id: input.responseId ?? null,
      request_id: input.requestId ?? null,
      source: "public_link",
      submitted_at: input.submittedAt ?? null,
      status: input.status ?? null,
      token_valid: input.tokenValid === true,
    },
  });
}

export async function recordPublicAnamnesisInvalidAccess(
  input: ActorInput & {
    patientId?: string | null;
    templateId?: string | null;
    responseId?: string | null;
    requestId?: string | null;
    status?: string | null;
    tokenValid?: boolean;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: AUDIT_ACTIONS.PUBLIC_ANAMNESIS_REVOKED_OR_INVALID_ACCESS,
    entityType: AUDIT_ENTITY_TYPES.ANAMNESIS_RESPONSE,
    entityId: input.responseId ?? input.requestId ?? null,
    patientId: input.patientId ?? null,
    metadata: {
      patient_id: input.patientId ?? null,
      template_id: input.templateId ?? null,
      response_id: input.responseId ?? null,
      request_id: input.requestId ?? null,
      source: "public_link",
      status: input.status ?? null,
      token_valid: input.tokenValid === true,
    },
  });
}

export async function recordPatientCheckinCreated(
  input: ActorInput & {
    patientId: string;
    checkinId?: string | null;
    hasMood?: boolean;
    hasAnxiety?: boolean;
    hasSleep?: boolean;
    hasEnergy?: boolean;
    createdAt?: string | null;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: AUDIT_ACTIONS.PATIENT_CHECKIN_CREATED,
    entityType: AUDIT_ENTITY_TYPES.PATIENT_CHECKIN,
    entityId: input.checkinId ?? null,
    patientId: input.patientId,
    metadata: {
      patient_id: input.patientId,
      checkin_id: input.checkinId ?? null,
      source: "patient_portal",
      has_mood: input.hasMood === true,
      has_anxiety: input.hasAnxiety === true,
      has_sleep: input.hasSleep === true,
      has_energy: input.hasEnergy === true,
      created_at: input.createdAt ?? null,
    },
  });
}

export async function recordEmotionDiaryEntryCreated(
  input: ActorInput & {
    patientId: string;
    diaryEntryId?: string | null;
    hasEmotionLabel?: boolean;
    hasText?: boolean;
    createdAt?: string | null;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: AUDIT_ACTIONS.EMOTION_DIARY_ENTRY_CREATED,
    entityType: AUDIT_ENTITY_TYPES.EMOTION_DIARY_ENTRY,
    entityId: input.diaryEntryId ?? null,
    patientId: input.patientId,
    metadata: {
      patient_id: input.patientId,
      diary_entry_id: input.diaryEntryId ?? null,
      source: "patient_portal",
      has_emotion_label: input.hasEmotionLabel === true,
      has_text: input.hasText === true,
      created_at: input.createdAt ?? null,
    },
  });
}

export async function recordPatientTaskAnswered(
  input: ActorInput & {
    patientId: string;
    taskId: string;
    oldStatus?: string | null;
    newStatus?: string | null;
    answeredAt?: string | null;
    viewedAt?: string | null;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: AUDIT_ACTIONS.PATIENT_TASK_ANSWERED,
    entityType: AUDIT_ENTITY_TYPES.PATIENT_TASK,
    entityId: input.taskId,
    patientId: input.patientId,
    metadata: {
      patient_id: input.patientId,
      task_id: input.taskId,
      source: "patient_portal",
      old_status: input.oldStatus ?? null,
      new_status: input.newStatus ?? null,
      answered_at: input.answeredAt ?? null,
      viewed_at: input.viewedAt ?? null,
    },
  });
}

export async function recordClinicalPdfExported(
  input: ActorInput & {
    action: typeof AUDIT_ACTIONS.CLINICAL_PDF_EXPORTED
      | typeof AUDIT_ACTIONS.SESSION_PDF_EXPORTED
      | typeof AUDIT_ACTIONS.PATIENT_RECORD_EXPORTED
      | typeof AUDIT_ACTIONS.ANAMNESIS_PDF_EXPORTED;
    patientId?: string | null;
    sessionId?: string | null;
    responseId?: string | null;
    exportType: string;
    source?: string | null;
    includesSections?: string[];
    generatedAt?: string | null;
  }
): Promise<boolean> {
  return recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    entityType: AUDIT_ENTITY_TYPES.CLINICAL_EXPORT,
    entityId: input.sessionId ?? input.responseId ?? input.patientId ?? null,
    patientId: input.patientId ?? null,
    sessionId: input.sessionId ?? null,
    metadata: {
      patient_id: input.patientId ?? null,
      session_id: input.sessionId ?? null,
      response_id: input.responseId ?? null,
      export_type: input.exportType,
      file_type: "pdf",
      source: input.source ?? null,
      includes_sections: input.includesSections ?? [],
      generated_at: input.generatedAt ?? null,
    },
  });
}
