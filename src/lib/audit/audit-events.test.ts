import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "./audit-events";

describe("audit event metadata sanitization", () => {
  it("removes tokens, signed URLs and storage paths", () => {
    const metadata = sanitizeAuditMetadata({
      action: "download_patient_document",
      status: "confirmed",
      amount: 250,
      access_token: "secret-token",
      refreshToken: "refresh-token",
      signedUrl: "https://example.test/file?token=abc",
      storage_path: "patients/patient-id/document-id/report.pdf",
      fileName: "laudo-paciente.pdf",
      nested: {
        public_token: "patient-token",
        status: "ok",
      },
    });

    expect(metadata).toEqual({
      action: "download_patient_document",
      status: "confirmed",
      amount: 250,
      nested: { status: "ok" },
    });
  });

  it("removes clinical note and evolution content while keeping operational fields", () => {
    const metadata = sanitizeAuditMetadata({
      old_status: "scheduled",
      new_status: "completed",
      billing_mode: "package",
      had_evolution: true,
      note: "conteudo clinico",
      notes: "mais conteudo clinico",
      evolutionText: "evolucao clinica",
      diagnosis: "diagnostico",
      session_notes_encrypted: "ENC::abc",
      description_encrypted: "ENC::def",
      flags: {
        had_evolution: true,
        package_credit_reversed: false,
      },
    });

    expect(metadata).toEqual({
      old_status: "scheduled",
      new_status: "completed",
      billing_mode: "package",
      had_evolution: true,
      flags: {
        had_evolution: true,
        package_credit_reversed: false,
      },
    });
  });

  it("redacts token-like strings in safe keys", () => {
    const metadata = sanitizeAuditMetadata({
      action: "generate_receipt",
      callback: "https://example.test/download?token=abc123",
    });

    expect(metadata).toEqual({
      action: "generate_receipt",
      callback: "[REDACTED]",
    });
  });
});
