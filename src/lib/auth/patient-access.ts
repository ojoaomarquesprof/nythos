export type PatientAccessState = "active" | "not_found" | "revoked" | "expired" | "archived" | "rotated";

export interface PatientAccessRecord {
  id: string;
  full_name?: string | null;
  date_of_birth?: string | null;
  status?: string | null;
  access_token?: string | null;
  access_token_issued_at?: string | null;
  access_token_expires_at?: string | null;
  access_token_revoked_at?: string | null;
  access_token_last_used_at?: string | null;
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

export function getPatientAccessState(
  patient: PatientAccessRecord | null | undefined,
  sessionIssuedAt?: number | null
): PatientAccessState {
  if (!patient?.id) return "not_found";

  if (patient.status === "archived") {
    return "archived";
  }

  const revokedAt = toTimestamp(patient.access_token_revoked_at);
  if (revokedAt !== null) {
    if (sessionIssuedAt == null || sessionIssuedAt < revokedAt) {
      return "revoked";
    }
  }

  const issuedAt = toTimestamp(patient.access_token_issued_at);
  if (issuedAt !== null && sessionIssuedAt != null && sessionIssuedAt < issuedAt) {
    return "rotated";
  }

  const expiresAt = toTimestamp(patient.access_token_expires_at);
  if (expiresAt !== null && expiresAt <= Date.now()) {
    return "expired";
  }

  return "active";
}

export function getPatientAccessErrorMessage(
  state: PatientAccessState,
  context: "lookup" | "verify" | "session"
): string {
  switch (state) {
    case "revoked":
      return context === "session"
        ? "Seu acesso foi revogado. Solicite um novo link ao seu terapeuta."
        : "Este link foi revogado. Solicite um novo link ao seu terapeuta.";
    case "expired":
      return context === "session"
        ? "Seu acesso expirou. Abra um novo link enviado pelo seu terapeuta."
        : "Este link expirou. Solicite um novo link ao seu terapeuta.";
    case "archived":
      return "Este acesso foi desativado. Entre em contato com seu terapeuta.";
    case "rotated":
      return context === "session"
        ? "Seu link de acesso foi regenerado. Abra o link mais recente enviado pelo seu terapeuta."
        : "Este link não é mais válido. Solicite o link mais recente ao seu terapeuta.";
    case "not_found":
    default:
      return context === "lookup"
        ? "Link de acesso não encontrado."
        : "Link de acesso não encontrado ou inválido.";
  }
}
