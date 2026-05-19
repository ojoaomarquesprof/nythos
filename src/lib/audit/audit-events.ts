import type { Json } from "@/types/database";

export const AUDIT_ACTIONS = {
  COMPLETE_SESSION: "complete_session",
  REVERSE_COMPLETED_SESSION: "reverse_completed_session",
  CONFIRM_CASH_FLOW: "confirm_cash_flow",
  CANCEL_CASH_FLOW: "cancel_cash_flow",
  GENERATE_RECEIPT: "generate_receipt",
  CREATE_SESSION_PACKAGE: "create_session_package",
  SET_SESSION_PACKAGE_STATUS: "set_session_package_status",
  UPLOAD_PATIENT_DOCUMENT: "upload_patient_document",
  DOWNLOAD_PATIENT_DOCUMENT: "download_patient_document",
  DELETE_PATIENT_DOCUMENT: "delete_patient_document",
} as const;

export const AUDIT_ENTITY_TYPES = {
  SESSION: "session",
  CASH_FLOW: "cash_flow",
  SESSION_PACKAGE: "session_package",
  PATIENT_DOCUMENT: "patient_document",
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
  /storage[_-]?path/i,
  /access[_-]?path/i,
  /file[_-]?name/i,
  /notes?$/i,
  /note[_-]?content/i,
  /evolution[_-]?(text|content|notes?|encrypted|raw)/i,
  /diagnosis/i,
  /prontuario/i,
  /anamnese/i,
  /clinical/i,
  /description[_-]?encrypted/i,
  /session[_-]?notes[_-]?encrypted/i,
  /^headers?$/i,
] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && !(value instanceof Date);
}

function isSensitiveKey(key: string): boolean {
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
