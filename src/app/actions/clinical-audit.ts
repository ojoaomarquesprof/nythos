"use server";

import { AUDIT_ACTIONS } from "@/lib/audit/audit-events";
import {
  recordCareContactEvent,
  recordClinicalPdfExported,
  recordPatientConsentEvent,
  recordPatientLinkEvent,
  recordPublicAnamnesisInvalidAccess,
  recordPublicAnamnesisOpened,
  recordPublicAnamnesisSubmitted,
  recordTreatmentGoalEvent,
  recordTreatmentPlanEvent,
} from "@/lib/audit/server";
import { logSafeError } from "@/lib/errors/safe-error";
import { createClient } from "@/lib/supabase/server";

async function getActorId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function auditPatientLinkEvent(input: {
  patientId: string;
  actionType: "generate" | "revoke" | "regenerate" | "grant";
  expiresAt?: string | null;
  linkStatus?: string | null;
  tokenRotated?: boolean;
}): Promise<boolean> {
  try {
    const actorId = await getActorId();
    return recordPatientLinkEvent({
      actorId,
      patientId: input.patientId,
      actionType: input.actionType,
      expiresAt: input.expiresAt,
      linkStatus: input.linkStatus,
      tokenRotated: input.tokenRotated,
    });
  } catch (error) {
    logSafeError("[auditPatientLinkEvent] Unexpected failure", error, { patientId: input.patientId });
    return false;
  }
}

export async function auditPatientConsentEvent(input: {
  action: "create" | "update_status" | "revoke" | "delete";
  patientId: string;
  consentId?: string | null;
  consentType?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  signedAt?: string | null;
  revokedAt?: string | null;
}): Promise<boolean> {
  try {
    const actorId = await getActorId();
    const actionMap = {
      create: AUDIT_ACTIONS.CREATE_PATIENT_CONSENT,
      update_status: AUDIT_ACTIONS.UPDATE_PATIENT_CONSENT_STATUS,
      revoke: AUDIT_ACTIONS.REVOKE_PATIENT_CONSENT,
      delete: AUDIT_ACTIONS.DELETE_PATIENT_CONSENT,
    } as const;

    return recordPatientConsentEvent({
      actorId,
      action: actionMap[input.action],
      patientId: input.patientId,
      consentId: input.consentId,
      consentType: input.consentType,
      oldStatus: input.oldStatus,
      newStatus: input.newStatus,
      signedAt: input.signedAt,
      revokedAt: input.revokedAt,
    });
  } catch (error) {
    logSafeError("[auditPatientConsentEvent] Unexpected failure", error, { patientId: input.patientId });
    return false;
  }
}

export async function auditCareContactEvent(input: {
  action: "create" | "update" | "remove" | "authorize" | "revoke_authorization";
  patientId: string;
  contactId?: string | null;
  contactType?: string | null;
  oldActive?: boolean | null;
  newActive?: boolean | null;
  oldAuthorized?: boolean | null;
  newAuthorized?: boolean | null;
  isEmergencyContact?: boolean;
  isFinancialResponsible?: boolean;
}): Promise<boolean> {
  try {
    const actorId = await getActorId();
    const actionMap = {
      create: AUDIT_ACTIONS.CREATE_CARE_CONTACT,
      update: AUDIT_ACTIONS.UPDATE_CARE_CONTACT,
      remove: AUDIT_ACTIONS.REMOVE_CARE_CONTACT,
      authorize: AUDIT_ACTIONS.AUTHORIZE_CARE_CONTACT,
      revoke_authorization: AUDIT_ACTIONS.REVOKE_CARE_CONTACT_AUTHORIZATION,
    } as const;

    return recordCareContactEvent({
      actorId,
      action: actionMap[input.action],
      patientId: input.patientId,
      contactId: input.contactId,
      contactType: input.contactType,
      oldActive: input.oldActive,
      newActive: input.newActive,
      oldAuthorized: input.oldAuthorized,
      newAuthorized: input.newAuthorized,
      isEmergencyContact: input.isEmergencyContact,
      isFinancialResponsible: input.isFinancialResponsible,
    });
  } catch (error) {
    logSafeError("[auditCareContactEvent] Unexpected failure", error, { patientId: input.patientId });
    return false;
  }
}

export async function auditTreatmentPlanEvent(input: {
  action: "create" | "update" | "change_status";
  patientId: string;
  planId?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  hasReviewDate?: boolean;
  goalsCount?: number | null;
}): Promise<boolean> {
  try {
    const actorId = await getActorId();
    const actionMap = {
      create: AUDIT_ACTIONS.CREATE_TREATMENT_PLAN,
      update: AUDIT_ACTIONS.UPDATE_TREATMENT_PLAN,
      change_status: AUDIT_ACTIONS.CHANGE_TREATMENT_PLAN_STATUS,
    } as const;

    return recordTreatmentPlanEvent({
      actorId,
      action: actionMap[input.action],
      patientId: input.patientId,
      planId: input.planId,
      oldStatus: input.oldStatus,
      newStatus: input.newStatus,
      hasReviewDate: input.hasReviewDate,
      goalsCount: input.goalsCount,
    });
  } catch (error) {
    logSafeError("[auditTreatmentPlanEvent] Unexpected failure", error, { patientId: input.patientId });
    return false;
  }
}

export async function auditTreatmentGoalEvent(input: {
  action: "create" | "update" | "complete" | "pause";
  patientId: string;
  planId?: string | null;
  goalId?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  priority?: string | null;
  category?: string | null;
}): Promise<boolean> {
  try {
    const actorId = await getActorId();
    const actionMap = {
      create: AUDIT_ACTIONS.CREATE_TREATMENT_GOAL,
      update: AUDIT_ACTIONS.UPDATE_TREATMENT_GOAL,
      complete: AUDIT_ACTIONS.COMPLETE_TREATMENT_GOAL,
      pause: AUDIT_ACTIONS.PAUSE_TREATMENT_GOAL,
    } as const;

    return recordTreatmentGoalEvent({
      actorId,
      action: actionMap[input.action],
      patientId: input.patientId,
      planId: input.planId,
      goalId: input.goalId,
      oldStatus: input.oldStatus,
      newStatus: input.newStatus,
      priority: input.priority,
      category: input.category,
    });
  } catch (error) {
    logSafeError("[auditTreatmentGoalEvent] Unexpected failure", error, { patientId: input.patientId });
    return false;
  }
}

export async function auditPublicAnamnesisOpened(input: {
  patientId?: string | null;
  templateId?: string | null;
  responseId?: string | null;
  requestId?: string | null;
  status?: string | null;
  tokenValid?: boolean;
}): Promise<boolean> {
  try {
    const actorId = await getActorId();
    return recordPublicAnamnesisOpened({
      actorId,
      patientId: input.patientId,
      templateId: input.templateId,
      responseId: input.responseId,
      requestId: input.requestId,
      status: input.status,
      tokenValid: input.tokenValid,
    });
  } catch (error) {
    logSafeError("[auditPublicAnamnesisOpened] Unexpected failure", error, {
      responseId: input.responseId ?? null,
    });
    return false;
  }
}

export async function auditPublicAnamnesisSubmitted(input: {
  patientId?: string | null;
  templateId?: string | null;
  responseId?: string | null;
  requestId?: string | null;
  submittedAt?: string | null;
  status?: string | null;
  tokenValid?: boolean;
}): Promise<boolean> {
  try {
    const actorId = await getActorId();
    return recordPublicAnamnesisSubmitted({
      actorId,
      patientId: input.patientId,
      templateId: input.templateId,
      responseId: input.responseId,
      requestId: input.requestId,
      submittedAt: input.submittedAt,
      status: input.status,
      tokenValid: input.tokenValid,
    });
  } catch (error) {
    logSafeError("[auditPublicAnamnesisSubmitted] Unexpected failure", error, {
      responseId: input.responseId ?? null,
    });
    return false;
  }
}

export async function auditPublicAnamnesisInvalidAccess(input: {
  patientId?: string | null;
  templateId?: string | null;
  responseId?: string | null;
  requestId?: string | null;
  status?: string | null;
  tokenValid?: boolean;
}): Promise<boolean> {
  try {
    const actorId = await getActorId();
    return recordPublicAnamnesisInvalidAccess({
      actorId,
      patientId: input.patientId,
      templateId: input.templateId,
      responseId: input.responseId,
      requestId: input.requestId,
      status: input.status,
      tokenValid: input.tokenValid,
    });
  } catch (error) {
    logSafeError("[auditPublicAnamnesisInvalidAccess] Unexpected failure", error, {
      responseId: input.responseId ?? null,
    });
    return false;
  }
}

export async function auditClinicalPdfExported(input: {
  action: "clinical" | "session" | "patient_record" | "anamnesis";
  patientId?: string | null;
  sessionId?: string | null;
  responseId?: string | null;
  exportType: string;
  source?: string | null;
  includesSections?: string[];
  generatedAt?: string | null;
}): Promise<boolean> {
  try {
    const actorId = await getActorId();
    const actionMap = {
      clinical: AUDIT_ACTIONS.CLINICAL_PDF_EXPORTED,
      session: AUDIT_ACTIONS.SESSION_PDF_EXPORTED,
      patient_record: AUDIT_ACTIONS.PATIENT_RECORD_EXPORTED,
      anamnesis: AUDIT_ACTIONS.ANAMNESIS_PDF_EXPORTED,
    } as const;

    return recordClinicalPdfExported({
      actorId,
      action: actionMap[input.action],
      patientId: input.patientId,
      sessionId: input.sessionId,
      responseId: input.responseId,
      exportType: input.exportType,
      source: input.source,
      includesSections: input.includesSections,
      generatedAt: input.generatedAt,
    });
  } catch (error) {
    logSafeError("[auditClinicalPdfExported] Unexpected failure", error, {
      patientId: input.patientId ?? null,
      sessionId: input.sessionId ?? null,
      responseId: input.responseId ?? null,
    });
    return false;
  }
}
