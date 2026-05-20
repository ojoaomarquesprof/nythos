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
      clinicalNote: "nota clinica",
      evolutionText: "evolucao clinica",
      evolution_content: "conteudo de evolucao",
      diagnosis: "diagnostico",
      diagnosticHypothesis: "hipotese diagnostica",
      therapeuticPlan: "plano terapeutico",
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

  it("removes Google response, tokens and raw payload while keeping scheduling fields", () => {
    const metadata = sanitizeAuditMetadata({
      session_id: "session-id",
      patient_id: "patient-id",
      scheduled_at: "2026-05-20T14:00:00.000Z",
      previous_scheduled_at: "2026-05-19T14:00:00.000Z",
      new_scheduled_at: "2026-05-20T14:00:00.000Z",
      duration_minutes: 50,
      billing_mode: "single",
      package_id: null,
      session_price: 250,
      is_recurring: true,
      recurrence_count: 4,
      google_synced: true,
      conflict_checked: true,
      googleResponse: { id: "google-event-id", htmlLink: "https://calendar.google.test/event" },
      google_event_id: "google-event-id",
      google_calendar_id: "primary",
      accessToken: "secret-token",
      payload: {
        clinicalNote: "conteudo clinico",
      },
      response: {
        token: "secret-token",
      },
    });

    expect(metadata).toEqual({
      session_id: "session-id",
      patient_id: "patient-id",
      scheduled_at: "2026-05-20T14:00:00.000Z",
      previous_scheduled_at: "2026-05-19T14:00:00.000Z",
      new_scheduled_at: "2026-05-20T14:00:00.000Z",
      duration_minutes: 50,
      billing_mode: "single",
      package_id: null,
      session_price: 250,
      is_recurring: true,
      recurrence_count: 4,
      google_synced: true,
      conflict_checked: true,
    });
  });

  it("keeps safe evolution flags without scale values or clinical text", () => {
    const metadata = sanitizeAuditMetadata({
      patient_id: "patient-id",
      session_id: "session-id",
      had_previous_evolution: false,
      has_scales: true,
      scale_fields: ["mood_happy_sad", "mood_anxious_calm"],
      source: "schedule",
      evolution_notes: "texto clinico",
      mood_happy_sad: 8,
      mood_anxious_calm: 4,
    });

    expect(metadata).toEqual({
      patient_id: "patient-id",
      session_id: "session-id",
      had_previous_evolution: false,
      has_scales: true,
      scale_fields: ["mood_happy_sad", "mood_anxious_calm"],
      source: "schedule",
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
