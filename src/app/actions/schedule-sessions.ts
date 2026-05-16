"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptGoogleTokenIfNeeded,
  decryptGoogleTokenFields,
  isEncryptedGoogleToken,
  updateGoogleTokensEncrypted,
} from "@/lib/google/calendar-tokens";
import {
  hasOnlyAllowedKeys,
  isPlainObject,
  isValidUuid,
  toFiniteNumber,
  toInteger,
} from "@/lib/validation/input";
import { logSafeError } from "@/lib/errors/safe-error";
import type { ExternalCalendarEvent, Session } from "@/types/database";

export interface CreateSessionPayload {
  therapistId: string;
  patientId: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  durationMinutes?: number;
  sessionType?: string;
  sessionPrice?: number | null;
  billingMode?: "single" | "free";
  location?: string;
  isRecurring?: boolean;
  recurrencePeriod?: "weekly" | "monthly";
  recurrenceCount?: number;
  isIndefinite?: boolean;
}

export interface CreateSessionResult {
  success: boolean;
  createdCount?: number;
  googleCreatedCount?: number;
  warning?: string;
  error?: string;
}

export interface CancelSessionPayload {
  sessionId: string;
}

export interface CancelSessionResult {
  success: boolean;
  warning?: string;
  error?: string;
}

export interface CompleteSessionPayload {
  sessionId: string;
  allowFutureCompletion?: boolean;
}

export interface CompleteSessionResult {
  success: boolean;
  billingCreated?: boolean;
  billingAlreadyExists?: boolean;
  billingSkippedReason?: "courtesy_or_zero_value";
  needsEvolution?: boolean;
  requiresConfirmation?: boolean;
  error?: string;
}

type TherapistGoogleProfile = {
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: string | null;
  google_calendar_id: string | null;
  timezone: string | null;
  full_name: string | null;
};

type TimeInterval = {
  start: Date;
  end: Date;
};

type SessionConflictRow = Pick<Session, "scheduled_at" | "duration_minutes">;
type ExternalEventConflictRow = Pick<ExternalCalendarEvent, "starts_at" | "ends_at">;

const ALLOWED_CREATE_SESSION_KEYS = [
  "therapistId",
  "patientId",
  "scheduledDate",
  "scheduledTime",
  "durationMinutes",
  "sessionType",
  "sessionPrice",
  "billingMode",
  "location",
  "isRecurring",
  "recurrencePeriod",
  "recurrenceCount",
  "isIndefinite",
] as const;

const ALLOWED_SESSION_TYPES = new Set([
  "individual",
  "couple",
  "group",
  "online",
  "initial_assessment",
]);

const ALLOWED_CANCEL_SESSION_KEYS = ["sessionId"] as const;
const ALLOWED_COMPLETE_SESSION_KEYS = ["sessionId", "allowFutureCompletion"] as const;

type ValidatedCreatePayload = {
  therapistId: string;
  patientId: string;
  scheduledDate: string;
  scheduledTime: string;
  duration: number;
  sessionType: string;
  sessionPrice: number | null;
  billingMode: "single" | "free";
  location: string;
  isRecurring: boolean;
  recurrencePeriod: "weekly" | "monthly";
  recurrenceCount: number;
  isIndefinite: boolean;
};

function parseCreatePayload(payload: CreateSessionPayload): { ok: true; value: ValidatedCreatePayload } | { ok: false; error: string } {
  if (!isPlainObject(payload) || !hasOnlyAllowedKeys(payload, ALLOWED_CREATE_SESSION_KEYS)) {
    return { ok: false, error: "Payload inválido para criação de sessão." };
  }

  if (!isValidUuid(payload.therapistId) || !isValidUuid(payload.patientId)) {
    return { ok: false, error: "Identificadores inválidos para criação de sessão." };
  }

  const dateRaw = String(payload.scheduledDate ?? "").trim();
  const timeRaw = String(payload.scheduledTime ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw) || !/^\d{2}:\d{2}$/.test(timeRaw)) {
    return { ok: false, error: "Data/horário inválidos." };
  }

  const [year, month, day] = dateRaw.split("-").map(Number);
  const [hours, minutes] = timeRaw.split(":").map(Number);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return { ok: false, error: "Data/horário inválidos." };
  }

  const probeDate = new Date(year, month - 1, day, hours, minutes, 0);
  if (Number.isNaN(probeDate.getTime())) {
    return { ok: false, error: "Data/horário inválidos." };
  }

  const duration = toInteger(payload.durationMinutes) ?? 50;
  if (duration <= 0 || duration > 480) {
    return { ok: false, error: "Duração inválida." };
  }

  const price = toFiniteNumber(payload.sessionPrice);
  if (payload.sessionPrice !== undefined && payload.sessionPrice !== null && (price === null || price < 0)) {
    return { ok: false, error: "Preço de sessão inválido." };
  }

  const billingMode = payload.billingMode ?? (price === 0 ? "free" : "single");
  if (!["single", "free"].includes(billingMode)) {
    return { ok: false, error: "Tipo de cobrança inválido." };
  }

  if (billingMode === "single" && (price === null || price <= 0)) {
    return {
      ok: false,
      error: "Sessão avulsa precisa ter valor maior que zero. Para não cobrar, selecione cortesia.",
    };
  }

  const sessionType = String(payload.sessionType ?? "individual").trim();
  if (!ALLOWED_SESSION_TYPES.has(sessionType)) {
    return { ok: false, error: "Tipo de sessão inválido." };
  }

  const location = String(payload.location ?? "office").trim();
  if (!location || location.length > 80) {
    return { ok: false, error: "Local da sessão inválido." };
  }

  const isRecurring = !!payload.isRecurring;
  const recurrencePeriod = payload.recurrencePeriod === "monthly" ? "monthly" : "weekly";
  const recurrenceCount = Math.max(1, Math.min(toInteger(payload.recurrenceCount) ?? 4, 24));

  return {
    ok: true,
    value: {
      therapistId: payload.therapistId.trim(),
      patientId: payload.patientId.trim(),
      scheduledDate: dateRaw,
      scheduledTime: timeRaw,
      duration,
      sessionType,
      sessionPrice: billingMode === "free" ? 0 : price,
      billingMode,
      location,
      isRecurring,
      recurrencePeriod,
      recurrenceCount,
      isIndefinite: !!payload.isIndefinite,
    },
  };
}

function parseCancelPayload(payload: CancelSessionPayload): { ok: true; sessionId: string } | { ok: false; error: string } {
  if (!isPlainObject(payload) || !hasOnlyAllowedKeys(payload, ALLOWED_CANCEL_SESSION_KEYS)) {
    return { ok: false, error: "Payload inválido para cancelamento." };
  }

  if (!isValidUuid(payload.sessionId)) {
    return { ok: false, error: "Sessão inválida." };
  }

  return { ok: true, sessionId: payload.sessionId.trim() };
}

function parseCompletePayload(payload: CompleteSessionPayload): { ok: true; sessionId: string; allowFutureCompletion: boolean } | { ok: false; error: string } {
  if (!isPlainObject(payload) || !hasOnlyAllowedKeys(payload, ALLOWED_COMPLETE_SESSION_KEYS)) {
    return { ok: false, error: "Payload inválido para conclusão da sessão." };
  }

  if (!isValidUuid(payload.sessionId)) {
    return { ok: false, error: "Sessão inválida." };
  }

  return {
    ok: true,
    sessionId: payload.sessionId.trim(),
    allowFutureCompletion: payload.allowFutureCompletion === true,
  };
}

function resolveBillingAmount(...values: Array<number | string | null | undefined>): number {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function getSessionDueDate(scheduledAt: string): string {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function addPeriod(date: Date, period: "weekly" | "monthly"): Date {
  const next = new Date(date);
  if (period === "monthly") {
    next.setMonth(next.getMonth() + 1);
  } else {
    next.setDate(next.getDate() + 7);
  }
  return next;
}

function overlaps(a: TimeInterval, b: TimeInterval): boolean {
  return a.start < b.end && a.end > b.start;
}

async function refreshGoogleToken(
  admin: ReturnType<typeof createAdminClient>,
  therapistId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const newAccessToken: string = data.access_token;
    const expiresIn: number = data.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await updateGoogleTokensEncrypted(admin, therapistId, {
      google_access_token: newAccessToken,
      google_refresh_token: refreshToken,
      google_token_expiry: expiresAt,
    });

    return newAccessToken;
  } catch {
    return null;
  }
}

async function getValidAccessToken(
  admin: ReturnType<typeof createAdminClient>,
  therapistId: string,
  profile: TherapistGoogleProfile
): Promise<string | null> {
  let accessToken = profile.google_access_token;
  let refreshToken = profile.google_refresh_token;

  if (isEncryptedGoogleToken(accessToken)) {
    try {
      accessToken = await decryptGoogleTokenIfNeeded(admin, accessToken);
    } catch (err) {
      logSafeError("[schedule-sessions] Failed to decrypt access token before Google call", err);
      accessToken = null;
    }
  }

  if (isEncryptedGoogleToken(refreshToken)) {
    try {
      refreshToken = await decryptGoogleTokenIfNeeded(admin, refreshToken);
    } catch (err) {
      logSafeError("[schedule-sessions] Failed to decrypt refresh token before token refresh", err);
      refreshToken = null;
    }
  }

  if (!accessToken || !refreshToken) return null;

  if (profile.google_token_expiry) {
    const expiryMs = new Date(profile.google_token_expiry).getTime();
    if (Date.now() + 5 * 60 * 1000 < expiryMs) {
      return isEncryptedGoogleToken(accessToken) ? null : accessToken;
    }
  }

  return refreshGoogleToken(admin, therapistId, refreshToken);
}

export async function createScheduleSessions(
  payload: CreateSessionPayload
): Promise<CreateSessionResult> {
  try {
    const parsedPayload = parseCreatePayload(payload);
    if (!parsedPayload.ok) {
      return { success: false, error: parsedPayload.error };
    }
    const input = parsedPayload.value;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "SessÃ£o invÃ¡lida." };

    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("id, employer_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (!actorProfile) return { success: false, error: "Perfil nÃ£o encontrado." };
    if (!["therapist", "admin", "secretary"].includes(actorProfile.role ?? "")) {
      return { success: false, error: "Perfil sem permissÃ£o para agendar sessÃµes." };
    }

    const effectiveTherapistId = actorProfile.employer_id ?? actorProfile.id;
    const canWriteForTherapist =
      actorProfile.id === input.therapistId ||
      actorProfile.employer_id === input.therapistId;

    if (!canWriteForTherapist) {
      return { success: false, error: "VocÃª nÃ£o tem permissÃ£o para agendar nesta agenda." };
    }

    if (input.therapistId !== effectiveTherapistId) {
      return { success: false, error: "VocÃª nÃ£o tem permissÃ£o para agendar nesta agenda." };
    }

    const [year, month, day] = input.scheduledDate.split("-").map(Number);
    const [hours, minutes] = input.scheduledTime.split(":").map(Number);
    const baseDate = new Date(year, month - 1, day, hours, minutes, 0);
    if (Number.isNaN(baseDate.getTime())) {
      return { success: false, error: "Data/horÃ¡rio invÃ¡lido." };
    }

    const duration = input.duration;
    const period = input.recurrencePeriod;
    const requestedCount = input.recurrenceCount;
    const seriesCount = input.isRecurring ? (input.isIndefinite ? 12 : Math.min(requestedCount, 24)) : 1;
    const recurrenceRule = input.isRecurring
      ? `RRULE:FREQ=${period === "monthly" ? "MONTHLY" : "WEEKLY"};COUNT=${seriesCount}`
      : null;

    const rows = [];
    const candidateIntervals: TimeInterval[] = [];
    let cursor = baseDate;
    for (let i = 0; i < seriesCount; i++) {
      const start = new Date(cursor);
      const end = new Date(start.getTime() + duration * 60 * 1000);

      rows.push({
        user_id: effectiveTherapistId,
        patient_id: input.patientId,
        scheduled_at: start.toISOString(),
        duration_minutes: duration,
        session_type: input.sessionType,
        session_price: input.sessionPrice,
        location: input.location,
        status: "scheduled" as const,
        is_recurring: input.isRecurring ? true : false,
        recurrence_rule: recurrenceRule,
      });

      candidateIntervals.push({ start, end });
      cursor = addPeriod(cursor, period);
    }

    const minStart = new Date(
      Math.min(...candidateIntervals.map((i) => i.start.getTime()))
    );
    const maxEnd = new Date(
      Math.max(...candidateIntervals.map((i) => i.end.getTime()))
    );

    const { data: existingSessions, error: existingSessionsError } = await supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, status")
      .eq("user_id", effectiveTherapistId)
      .neq("status", "cancelled")
      .lt("scheduled_at", maxEnd.toISOString());

    if (existingSessionsError) {
      logSafeError("[createScheduleSessions] Failed to load existing sessions", existingSessionsError);
      return { success: false, error: "Não foi possível validar conflitos de agenda." };
    }

    const sessionIntervals: TimeInterval[] = (existingSessions || []).map((s: SessionConflictRow) => {
      const start = new Date(s.scheduled_at);
      const end = new Date(start.getTime() + (s.duration_minutes ?? 50) * 60 * 1000);
      return { start, end };
    });

    const { data: externalEvents, error: externalEventsError } = await supabase
      .from("external_calendar_events")
      .select("id, starts_at, ends_at")
      .eq("user_id", effectiveTherapistId)
      .lt("starts_at", maxEnd.toISOString())
      .gt("ends_at", minStart.toISOString());

    if (externalEventsError) {
      logSafeError("[createScheduleSessions] Failed to load external events", externalEventsError);
      return { success: false, error: "Não foi possível validar bloqueios externos da agenda." };
    }

    const externalIntervals: TimeInterval[] = (externalEvents || []).map((e: ExternalEventConflictRow) => ({
      start: new Date(e.starts_at),
      end: new Date(e.ends_at),
    }));

    const hasSessionConflict = candidateIntervals.some((candidate) =>
      sessionIntervals.some((existing) => overlaps(candidate, existing))
    );
    const hasExternalConflict = candidateIntervals.some((candidate) =>
      externalIntervals.some((existing) => overlaps(candidate, existing))
    );

    if (hasSessionConflict || hasExternalConflict) {
      return {
        success: false,
        error: "HorÃ¡rio indisponÃ­vel. JÃ¡ existe uma sessÃ£o ou bloqueio nesse perÃ­odo.",
      };
    }

    const { data: patient } = await supabase
      .from("patients")
      .select("full_name")
      .eq("id", input.patientId)
      .eq("user_id", effectiveTherapistId)
      .maybeSingle();

    if (!patient) {
      return { success: false, error: "Paciente invÃ¡lido para esta agenda." };
    }

    const admin = createAdminClient();

    // service_role is required only for sessions INSERT because the table trigger
    // invokes encryption helpers that are intentionally not executable by authenticated.
    const { data: createdSessions, error } = await admin
      .from("sessions")
      .insert(rows)
      .select("id, scheduled_at, duration_minutes, location, google_event_id");

    if (error || !createdSessions) {
      logSafeError("[createScheduleSessions] Failed to create sessions", error);
      return { success: false, error: "Falha ao salvar sessão." };
    }

    let googleCreatedCount = 0;
    let warning: string | undefined;

    // service_role is needed only for encrypted Google token reads/decryption.
    const { data: therapistProfile } = await admin
      .from("profiles")
      .select("google_access_token, google_refresh_token, google_token_expiry, google_calendar_id, timezone, full_name")
      .eq("id", effectiveTherapistId)
      .maybeSingle();

    if (therapistProfile?.google_refresh_token) {
      const profile = await decryptGoogleTokenFields(
        admin,
        therapistProfile as TherapistGoogleProfile
      );
      const accessToken = await getValidAccessToken(admin, effectiveTherapistId, profile);

      if (!accessToken) {
        warning = "SessÃµes criadas no Nythos, mas nÃ£o foi possÃ­vel autenticar no Google Calendar.";
      } else {
        const calendarId = profile.google_calendar_id || "primary";
        const timezone = profile.timezone || "America/Sao_Paulo";
        const therapistName = profile.full_name || "Terapeuta";
        const patientName = patient.full_name || "Paciente";

        for (const created of createdSessions) {
          if (created.google_event_id) continue;

          const start = new Date(created.scheduled_at);
          const end = new Date(start.getTime() + (created.duration_minutes ?? 50) * 60 * 1000);

          const gcalPayload = {
            summary: `SessÃ£o - ${patientName}`,
            description: `Criado via Nythos.\nProfissional: ${therapistName}`,
            location:
              created.location === "online"
                ? "Online"
                : created.location === "office"
                  ? "Presencial"
                  : created.location || undefined,
            start: { dateTime: start.toISOString(), timeZone: timezone },
            end: { dateTime: end.toISOString(), timeZone: timezone },
          };

          try {
            const eventResponse = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(gcalPayload),
              }
            );

            if (!eventResponse.ok) {
              warning = "SessÃµes criadas no Nythos, mas algumas nÃ£o foram enviadas ao Google Calendar.";
              continue;
            }

            const eventData = await eventResponse.json();
            const eventId = eventData?.id as string | undefined;
            if (!eventId) {
              warning = "SessÃµes criadas no Nythos, mas algumas nÃ£o retornaram ID no Google Calendar.";
              continue;
            }

            await supabase
              .from("sessions")
              .update({ google_event_id: eventId })
              .eq("id", created.id)
              .is("google_event_id", null);

            googleCreatedCount++;
          } catch {
            warning = "SessÃµes criadas no Nythos, mas falha de comunicaÃ§Ã£o impediu envio ao Google Calendar.";
          }
        }
      }
    }

    revalidatePath("/dashboard/schedule");
    return { success: true, createdCount: rows.length, googleCreatedCount, warning };
  } catch (err: unknown) {
    logSafeError("[createScheduleSessions] Unexpected error", err);
    return { success: false, error: "Erro ao criar sessão." };
  }
}

export async function cancelScheduleSession(
  payload: CancelSessionPayload
): Promise<CancelSessionResult> {
  try {
    const parsedPayload = parseCancelPayload(payload);
    if (!parsedPayload.ok) {
      return { success: false, error: parsedPayload.error };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Sessão inválida." };

    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("id, employer_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (!actorProfile) return { success: false, error: "Perfil não encontrado." };
    if (!["therapist", "admin", "secretary"].includes(actorProfile.role ?? "")) {
      return { success: false, error: "Perfil sem permissão para alterar sessões." };
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, user_id, status, google_event_id")
      .eq("id", parsedPayload.sessionId)
      .maybeSingle();

    if (sessionError) {
      logSafeError("[cancelScheduleSession] Failed to load session", sessionError);
      return { success: false, error: "Não foi possível carregar a sessão." };
    }
    if (!session) return { success: false, error: "Sessão não encontrada." };

    const canWriteForTherapist =
      actorProfile.id === session.user_id || actorProfile.employer_id === session.user_id;
    if (!canWriteForTherapist) {
      return { success: false, error: "Você não tem permissão para alterar esta sessão." };
    }

    if (session.status !== "cancelled") {
      const { error: cancelError } = await supabase
        .from("sessions")
        .update({ status: "cancelled" })
        .eq("id", session.id);

      if (cancelError) {
        logSafeError("[cancelScheduleSession] Failed to cancel session", cancelError);
        return { success: false, error: "Não foi possível cancelar a sessão." };
      }
    }

    let warning: string | undefined;

    if (session.google_event_id) {
      const admin = createAdminClient();

      // service_role is needed only for encrypted Google token reads/decryption.
      const { data: therapistProfile } = await admin
        .from("profiles")
        .select("google_access_token, google_refresh_token, google_token_expiry, google_calendar_id")
        .eq("id", session.user_id)
        .maybeSingle();

      if (!therapistProfile?.google_refresh_token) {
        warning = "Sessão cancelada no Nythos, mas o Google Calendar não está conectado.";
      } else {
        const profile = await decryptGoogleTokenFields(
          admin,
          therapistProfile as TherapistGoogleProfile
        );
        const accessToken = await getValidAccessToken(
          admin,
          session.user_id,
          profile
        );

        if (!accessToken) {
          warning = "Sessão cancelada no Nythos, mas não foi possível autenticar no Google Calendar.";
        } else {
          const calendarId = profile.google_calendar_id || "primary";
          try {
            const response = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(session.google_event_id)}`,
              {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              }
            );

            if (!response.ok && response.status !== 404) {
              warning = "Sessão cancelada no Nythos, mas falhou ao cancelar no Google Calendar.";
            }
          } catch {
            warning = "Sessão cancelada no Nythos, mas falha de comunicação impediu cancelamento no Google Calendar.";
          }
        }
      }
    }

    revalidatePath("/dashboard/schedule");
    return { success: true, warning };
  } catch (err: unknown) {
    logSafeError("[cancelScheduleSession] Unexpected error", err);
    return { success: false, error: "Erro ao cancelar sessão." };
  }
}

export async function completeScheduleSession(
  payload: CompleteSessionPayload
): Promise<CompleteSessionResult> {
  try {
    const parsedPayload = parseCompletePayload(payload);
    if (!parsedPayload.ok) {
      return { success: false, error: parsedPayload.error };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Sessão inválida." };

    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("id, employer_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (!actorProfile) return { success: false, error: "Perfil não encontrado." };
    if (!["therapist", "admin"].includes(actorProfile.role ?? "")) {
      return { success: false, error: "Perfil sem permissão para finalizar sessões." };
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, user_id, patient_id, scheduled_at, status, session_price, session_notes_encrypted")
      .eq("id", parsedPayload.sessionId)
      .maybeSingle();

    if (sessionError) {
      logSafeError("[completeScheduleSession] Failed to load session", sessionError);
      return { success: false, error: "Não foi possível carregar a sessão." };
    }
    if (!session) return { success: false, error: "Sessão não encontrada." };

    const canWriteForTherapist =
      actorProfile.id === session.user_id || actorProfile.employer_id === session.user_id;
    if (!canWriteForTherapist) {
      return { success: false, error: "Você não tem permissão para alterar esta sessão." };
    }

    if (session.status === "cancelled") {
      return { success: false, error: "Sessão cancelada não pode ser marcada como realizada." };
    }

    const { data: existingBillingBefore, error: existingBillingError } = await supabase
      .from("cash_flow")
      .select("id")
      .eq("session_id", session.id)
      .limit(1)
      .maybeSingle();

    if (existingBillingError) {
      logSafeError("[completeScheduleSession] Failed to check existing billing", existingBillingError);
      return { success: false, error: "Não foi possível validar o financeiro da sessão." };
    }

    if (session.status === "completed") {
      return {
        success: true,
        billingAlreadyExists: !!existingBillingBefore,
        needsEvolution: !session.session_notes_encrypted,
      };
    }

    if (session.status !== "scheduled") {
      return { success: false, error: "Somente sessões agendadas podem ser marcadas como realizadas." };
    }

    const scheduledAt = new Date(session.scheduled_at);
    if (
      !parsedPayload.allowFutureCompletion &&
      !Number.isNaN(scheduledAt.getTime()) &&
      scheduledAt.getTime() > Date.now()
    ) {
      return {
        success: false,
        requiresConfirmation: true,
        error: "Esta sessão ainda está no futuro. Confirme manualmente para marcar como realizada.",
      };
    }

    const completedAt = new Date().toISOString();
    const { data: updatedSession, error: updateError } = await supabase
      .from("sessions")
      .update({
        status: "completed",
        completed_at: completedAt,
      })
      .eq("id", session.id)
      .eq("status", "scheduled")
      .select("id, session_notes_encrypted")
      .maybeSingle();

    if (updateError) {
      logSafeError("[completeScheduleSession] Failed to complete session", updateError);
      return { success: false, error: "Não foi possível marcar a sessão como realizada." };
    }

    if (!updatedSession) {
      return { success: false, error: "A sessão foi alterada por outra ação. Atualize e tente novamente." };
    }

    const { data: existingBillingAfter, error: billingAfterError } = await supabase
      .from("cash_flow")
      .select("id")
      .eq("session_id", session.id)
      .limit(1)
      .maybeSingle();

    if (billingAfterError) {
      logSafeError("[completeScheduleSession] Failed to reload billing after completion", billingAfterError);
      return { success: false, error: "Sessão realizada, mas não foi possível validar o lançamento financeiro." };
    }

    let billingCreated = !existingBillingBefore && !!existingBillingAfter;
    let billingAlreadyExists = !!existingBillingBefore || (!!existingBillingAfter && !billingCreated);
    let billingSkippedReason: CompleteSessionResult["billingSkippedReason"];

    if (!existingBillingAfter) {
      const [{ data: patient }, { data: therapistProfile }] = await Promise.all([
        supabase
          .from("patients")
          .select("full_name, session_price")
          .eq("id", session.patient_id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("session_price_default")
          .eq("id", session.user_id)
          .maybeSingle(),
      ]);

      const amount = resolveBillingAmount(
        session.session_price,
        patient?.session_price,
        therapistProfile?.session_price_default
      );

      if (amount > 0) {
        const { error: insertBillingError } = await supabase.from("cash_flow").insert({
          user_id: session.user_id,
          session_id: session.id,
          type: "income",
          amount,
          description: `Sessão realizada - ${patient?.full_name || "Paciente"}`,
          category: "session",
          status: "pending",
          due_date: getSessionDueDate(session.scheduled_at),
        });

        if (insertBillingError) {
          logSafeError("[completeScheduleSession] Failed to create fallback billing", insertBillingError);
          return { success: false, error: "Sessão realizada, mas não foi possível criar a cobrança pendente." };
        }
        billingCreated = true;
      } else {
        billingSkippedReason = "courtesy_or_zero_value";
      }
    }

    revalidatePath("/dashboard/schedule");
    revalidatePath(`/dashboard/patients/${session.patient_id}`);
    revalidatePath("/dashboard/finances");

    return {
      success: true,
      billingCreated,
      billingAlreadyExists,
      billingSkippedReason,
      needsEvolution: !updatedSession.session_notes_encrypted,
    };
  } catch (err: unknown) {
    logSafeError("[completeScheduleSession] Unexpected error", err);
    return { success: false, error: "Erro ao marcar sessão como realizada." };
  }
}

