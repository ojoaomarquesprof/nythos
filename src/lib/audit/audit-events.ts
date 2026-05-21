import type { Json } from "@/types/database";

export const AUDIT_ACTIONS = {
  CREATE_SESSION: "create_session",
  CREATE_RECURRING_SESSIONS: "create_recurring_sessions",
  CANCEL_SESSION: "cancel_session",
  RESCHEDULE_SESSION: "reschedule_session",
  COMPLETE_SESSION: "complete_session",
  REVERSE_COMPLETED_SESSION: "reverse_completed_session",
  CREATE_SESSION_EVOLUTION: "create_session_evolution",
  UPDATE_SESSION_EVOLUTION: "update_session_evolution",
  APPEND_GENERAL_NOTE: "append_general_note",
  CONFIRM_CASH_FLOW: "confirm_cash_flow",
  CANCEL_CASH_FLOW: "cancel_cash_flow",
  GENERATE_RECEIPT: "generate_receipt",
  CREATE_SESSION_PACKAGE: "create_session_package",
  SET_SESSION_PACKAGE_STATUS: "set_session_package_status",
  UPLOAD_PATIENT_DOCUMENT: "upload_patient_document",
  DOWNLOAD_PATIENT_DOCUMENT: "download_patient_document",
  DELETE_PATIENT_DOCUMENT: "delete_patient_document",
  GENERATE_PATIENT_LINK: "generate_patient_link",
  REVOKE_PATIENT_LINK: "revoke_patient_link",
  REGENERATE_PATIENT_LINK: "regenerate_patient_link",
  PATIENT_PORTAL_ACCESS_GRANTED: "patient_portal_access_granted",
  CREATE_PATIENT_CONSENT: "create_patient_consent",
  UPDATE_PATIENT_CONSENT_STATUS: "update_patient_consent_status",
  REVOKE_PATIENT_CONSENT: "revoke_patient_consent",
  DELETE_PATIENT_CONSENT: "delete_patient_consent",
  CREATE_CARE_CONTACT: "create_care_contact",
  UPDATE_CARE_CONTACT: "update_care_contact",
  REMOVE_CARE_CONTACT: "remove_care_contact",
  AUTHORIZE_CARE_CONTACT: "authorize_care_contact",
  REVOKE_CARE_CONTACT_AUTHORIZATION: "revoke_care_contact_authorization",
  CREATE_TREATMENT_PLAN: "create_treatment_plan",
  UPDATE_TREATMENT_PLAN: "update_treatment_plan",
  CHANGE_TREATMENT_PLAN_STATUS: "change_treatment_plan_status",
  CREATE_TREATMENT_GOAL: "create_treatment_goal",
  UPDATE_TREATMENT_GOAL: "update_treatment_goal",
  COMPLETE_TREATMENT_GOAL: "complete_treatment_goal",
  PAUSE_TREATMENT_GOAL: "pause_treatment_goal",
  CREATE_PATIENT_TASK: "create_patient_task",
  UPDATE_PATIENT_TASK: "update_patient_task",
  CANCEL_PATIENT_TASK: "cancel_patient_task",
  COMPLETE_PATIENT_TASK_BY_THERAPIST: "complete_patient_task_by_therapist",
  PUBLIC_ANAMNESIS_OPENED: "public_anamnesis_opened",
  PUBLIC_ANAMNESIS_SUBMITTED: "public_anamnesis_submitted",
  PUBLIC_ANAMNESIS_REVOKED_OR_INVALID_ACCESS: "public_anamnesis_revoked_or_invalid_access",
  PATIENT_CHECKIN_CREATED: "patient_checkin_created",
  EMOTION_DIARY_ENTRY_CREATED: "emotion_diary_entry_created",
  PATIENT_TASK_ANSWERED: "patient_task_answered",
  PATIENT_TASK_VIEWED: "patient_task_viewed",
  CLINICAL_PDF_EXPORTED: "clinical_pdf_exported",
  SESSION_PDF_EXPORTED: "session_pdf_exported",
  PATIENT_RECORD_EXPORTED: "patient_record_exported",
  ANAMNESIS_PDF_EXPORTED: "anamnesis_pdf_exported",
  UPDATE_ACCOUNT_SUBSCRIPTION: "update_account_subscription",
} as const;

export const AUDIT_ENTITY_TYPES = {
  SESSION: "session",
  PATIENT: "patient",
  CASH_FLOW: "cash_flow",
  SESSION_PACKAGE: "session_package",
  PATIENT_DOCUMENT: "patient_document",
  PATIENT_CONSENT: "patient_consent",
  CARE_CONTACT: "care_contact",
  TREATMENT_PLAN: "treatment_plan",
  TREATMENT_GOAL: "treatment_goal",
  PATIENT_TASK: "patient_task",
  ANAMNESIS_RESPONSE: "anamnesis_response",
  PATIENT_CHECKIN: "patient_checkin",
  EMOTION_DIARY_ENTRY: "emotion_diary_entry",
  CLINICAL_EXPORT: "clinical_export",
  ACCOUNT_SUBSCRIPTION: "account_subscription",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES];
export type AuditMetadata = Record<string, unknown>;

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /cookie/i,
  /authorization/i,
  /signed[_-]?url/i,
  /^url$/i,
  /public[_-]?(link|url)/i,
  /public[_-]?token/i,
  /patient[_-]?link/i,
  /patient[_-]?token/i,
  /access[_-]?token/i,
  /hmac/i,
  /storage[_-]?path/i,
  /access[_-]?path/i,
  /file[_-]?name/i,
  /phone/i,
  /email/i,
  /^cpf$/i,
  /address/i,
  /^name$/i,
  /full[_-]?name/i,
  /related[_-]?person[_-]?name/i,
  /organization/i,
  /signature/i,
  /notes?$/i,
  /observations?/i,
  /clinical[_-]?note/i,
  /note[_-]?content/i,
  /evolution[_-]?(text|content|notes?|encrypted|raw)/i,
  /^(mood[_-]?happy[_-]?sad|mood[_-]?anxious[_-]?calm|scale[_-]?value)$/i,
  /^mood(?:[_-]?score)?$/i,
  /anxiety/i,
  /sleep/i,
  /energy/i,
  /^emotion$/i,
  /emotion[_-]?label/i,
  /^intensity$/i,
  /diary[_-]?text/i,
  /^context$/i,
  /triggers?/i,
  /coping[_-]?strategy/i,
  /answers?/i,
  /responses?/i,
  /questions?/i,
  /diagnosis/i,
  /diagnostic/i,
  /hypothesis/i,
  /prontuario/i,
  /anamnese/i,
  /clinical/i,
  /therapeutic/i,
  /main[_-]?goal/i,
  /current[_-]?focus/i,
  /strateg(y|ies)/i,
  /intervention/i,
  /objective/i,
  /goal[_-]?(title|description|text|content|notes?)/i,
  /task[_-]?(title|description|response|feedback|content|notes?)/i,
  /^title$/i,
  /^description$/i,
  /patient[_-]?feedback/i,
  /^feedback$/i,
  /response[_-]?text/i,
  /free[_-]?text/i,
  /consent[_-]?(text|notes?|content|signature|document)/i,
  /description[_-]?encrypted/i,
  /session[_-]?notes[_-]?encrypted/i,
  /google[_-]?(response|payload|event|token|calendar)/i,
  /pdf[_-]?content/i,
  /export[_-]?payload/i,
  /^(payload|form[_-]?data|request|response|error)$/i,
  /^headers?$/i,
] as const;

const SAFE_KEY_ALLOWLIST = new Set([
  "token_rotated",
  "has_mood",
  "has_anxiety",
  "has_sleep",
  "has_energy",
  "has_emotion_label",
  "response_id",
  "answered_at",
  "viewed_at",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && !(value instanceof Date);
}

function isSensitiveKey(key: string): boolean {
  if (SAFE_KEY_ALLOWLIST.has(key)) return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeAuditValue(value: unknown, depth: number): Json | undefined {
  if (depth > 4) return "[MAX_DEPTH]";
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (typeof value === "string" && /([?&](token|access_token|refresh_token|public_token)=|signedUrl=)/i.test(value)) {
      return "[REDACTED]";
    }
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeAuditValue(item, depth + 1))
      .filter((item): item is Json => item !== undefined);
  }
  if (isPlainRecord(value)) {
    return sanitizeAuditMetadata(value, depth + 1);
  }

  return String(value);
}

export function sanitizeAuditMetadata(
  metadata: unknown,
  depth = 0
): Record<string, Json> {
  if (!isPlainRecord(metadata)) return {};

  return Object.entries(metadata).reduce<Record<string, Json>>((safe, [key, value]) => {
    if (isSensitiveKey(key)) return safe;

    const sanitized = sanitizeAuditValue(value, depth);
    if (sanitized !== undefined) {
      safe[key] = sanitized;
    }

    return safe;
  }, {});
}
