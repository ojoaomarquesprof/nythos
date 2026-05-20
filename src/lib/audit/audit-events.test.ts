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

  it("removes patient portal tokens and public links while keeping link status", () => {
    const metadata = sanitizeAuditMetadata({
      patient_id: "patient-id",
      action_type: "regenerate",
      expires_at: "2026-06-20T12:00:00.000Z",
      link_status: "active",
      token_rotated: true,
      access_token: "patient-secret-token",
      patientLink: "https://app.test/p/patient-secret-token",
      public_url: "https://app.test/p/patient-secret-token",
      hmac: "signature",
    });

    expect(metadata).toEqual({
      patient_id: "patient-id",
      action_type: "regenerate",
      expires_at: "2026-06-20T12:00:00.000Z",
      link_status: "active",
      token_rotated: true,
    });
  });

  it("removes contact personal data while keeping care network flags", () => {
    const metadata = sanitizeAuditMetadata({
      patient_id: "patient-id",
      contact_id: "contact-id",
      contact_type: "emergency",
      old_active: true,
      new_active: false,
      old_authorized: true,
      new_authorized: false,
      is_emergency_contact: true,
      is_financial_responsible: false,
      name: "Pessoa Sensivel",
      phone: "+55 11 99999-9999",
      email: "pessoa@example.test",
      cpf: "123.456.789-00",
      address: "Rua Sensivel",
      observations: "observacao livre",
    });

    expect(metadata).toEqual({
      patient_id: "patient-id",
      contact_id: "contact-id",
      contact_type: "emergency",
      old_active: true,
      new_active: false,
      old_authorized: true,
      new_authorized: false,
      is_emergency_contact: true,
      is_financial_responsible: false,
    });
  });

  it("removes treatment plan and goal text while keeping operational fields", () => {
    const metadata = sanitizeAuditMetadata({
      patient_id: "patient-id",
      plan_id: "plan-id",
      goal_id: "goal-id",
      old_status: "active",
      new_status: "paused",
      has_review_date: true,
      goals_count: 3,
      category: "skills",
      priority: "high",
      mainGoal: "objetivo textual",
      currentFocus: "foco clinico",
      strategies: "intervencao sensivel",
      intervention: "conteudo de intervencao",
      goal_title: "titulo do objetivo",
      goal_description: "descricao do objetivo",
    });

    expect(metadata).toEqual({
      patient_id: "patient-id",
      plan_id: "plan-id",
      goal_id: "goal-id",
      old_status: "active",
      new_status: "paused",
      has_review_date: true,
      goals_count: 3,
      category: "skills",
      priority: "high",
    });
  });

  it("removes task descriptions, patient responses and consent free text", () => {
    const metadata = sanitizeAuditMetadata({
      patient_id: "patient-id",
      task_id: "task-id",
      consent_id: "consent-id",
      consent_type: "general_consent",
      category: "homework",
      old_status: "pending",
      new_status: "completed",
      due_date: "2026-05-22",
      priority: "medium",
      signed_at: "2026-05-20T12:00:00.000Z",
      revoked_at: null,
      title: "titulo sensivel",
      task_description: "descricao sensivel",
      task_response: "resposta do paciente",
      patient_feedback: "feedback sensivel",
      consent_notes: "observacao livre",
      consent_text: "texto do consentimento",
      signature: "imagem-assinatura",
    });

    expect(metadata).toEqual({
      patient_id: "patient-id",
      task_id: "task-id",
      consent_id: "consent-id",
      consent_type: "general_consent",
      category: "homework",
      old_status: "pending",
      new_status: "completed",
      due_date: "2026-05-22",
      priority: "medium",
      signed_at: "2026-05-20T12:00:00.000Z",
      revoked_at: null,
    });
  });

  it("removes portal answers, clinical values and export payloads while keeping event flags", () => {
    const metadata = sanitizeAuditMetadata({
      patient_id: "patient-id",
      response_id: "response-id",
      request_id: "request-id",
      checkin_id: "checkin-id",
      diary_entry_id: "diary-id",
      task_id: "task-id",
      session_id: "session-id",
      source: "patient_portal",
      status: "completed",
      has_mood: true,
      has_anxiety: true,
      has_sleep: false,
      has_energy: true,
      has_emotion_label: true,
      has_text: true,
      answered_at: "2026-05-20T12:00:00.000Z",
      viewed_at: "2026-05-20T11:00:00.000Z",
      export_type: "patient_record",
      file_type: "pdf",
      includes_sections: ["general_notes", "session_evolutions"],
      mood_score: 5,
      anxiety_score: 4,
      sleep_quality: 2,
      energy_score: 3,
      emotion: "anxious",
      intensity: 9,
      diary_text: "texto sensivel",
      context: "contexto sensivel",
      triggers: "gatilhos",
      task_response: "resposta do paciente",
      feedback: "feedback livre",
      answers: { q1: "resposta" },
      responses: { q1: "resposta" },
      questions: ["pergunta sensivel"],
      public_token: "token-publico",
      patient_token: "token-paciente",
      signed_url: "https://example.test/file?token=secret",
      pdf_content: "conteudo do PDF",
      export_payload: { content: "conteudo" },
    });

    expect(metadata).toEqual({
      patient_id: "patient-id",
      response_id: "response-id",
      request_id: "request-id",
      checkin_id: "checkin-id",
      diary_entry_id: "diary-id",
      task_id: "task-id",
      session_id: "session-id",
      source: "patient_portal",
      status: "completed",
      has_mood: true,
      has_anxiety: true,
      has_sleep: false,
      has_energy: true,
      has_emotion_label: true,
      has_text: true,
      answered_at: "2026-05-20T12:00:00.000Z",
      viewed_at: "2026-05-20T11:00:00.000Z",
      export_type: "patient_record",
      file_type: "pdf",
      includes_sections: ["general_notes", "session_evolutions"],
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
