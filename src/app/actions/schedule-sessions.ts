"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptGoogleTokenFields,
  updateGoogleTokensEncrypted,
} from "@/lib/google/calendar-tokens";

export interface CreateSessionPayload {
  therapistId: string;
  patientId: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  durationMinutes?: number;
  sessionType?: string;
  sessionPrice?: number | null;
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
  if (!profile.google_access_token || !profile.google_refresh_token) return null;

  if (profile.google_token_expiry) {
    const expiryMs = new Date(profile.google_token_expiry).getTime();
    if (Date.now() + 5 * 60 * 1000 < expiryMs) {
      return profile.google_access_token;
    }
  }

  return refreshGoogleToken(admin, therapistId, profile.google_refresh_token);
}

export async function createScheduleSessions(
  payload: CreateSessionPayload
): Promise<CreateSessionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "SessÃ£o invÃ¡lida." };

    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("id, employer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!actorProfile) return { success: false, error: "Perfil nÃ£o encontrado." };

    const canWriteForTherapist =
      actorProfile.id === payload.therapistId ||
      actorProfile.employer_id === payload.therapistId;

    if (!canWriteForTherapist) {
      return { success: false, error: "VocÃª nÃ£o tem permissÃ£o para agendar nesta agenda." };
    }

    if (!payload.patientId || !payload.scheduledDate || !payload.scheduledTime) {
      return { success: false, error: "Paciente, data e horÃ¡rio sÃ£o obrigatÃ³rios." };
    }

    const [year, month, day] = payload.scheduledDate.split("-").map(Number);
    const [hours, minutes] = payload.scheduledTime.split(":").map(Number);
    const baseDate = new Date(year, month - 1, day, hours, minutes, 0);
    if (Number.isNaN(baseDate.getTime())) {
      return { success: false, error: "Data/horÃ¡rio invÃ¡lido." };
    }

    const duration = payload.durationMinutes && payload.durationMinutes > 0 ? payload.durationMinutes : 50;
    const period = payload.recurrencePeriod === "monthly" ? "monthly" : "weekly";
    const requestedCount = payload.recurrenceCount && payload.recurrenceCount > 0 ? payload.recurrenceCount : 4;
    const seriesCount = payload.isRecurring ? (payload.isIndefinite ? 12 : Math.min(requestedCount, 24)) : 1;
    const recurrenceRule = payload.isRecurring
      ? `RRULE:FREQ=${period === "monthly" ? "MONTHLY" : "WEEKLY"};COUNT=${seriesCount}`
      : null;

    const rows = [];
    const candidateIntervals: TimeInterval[] = [];
    let cursor = baseDate;
    for (let i = 0; i < seriesCount; i++) {
      const start = new Date(cursor);
      const end = new Date(start.getTime() + duration * 60 * 1000);

      rows.push({
        user_id: payload.therapistId,
        patient_id: payload.patientId,
        scheduled_at: start.toISOString(),
        duration_minutes: duration,
        session_type: payload.sessionType || "individual",
        session_price: payload.sessionPrice ?? null,
        location: payload.location || "office",
        status: "scheduled",
        is_recurring: payload.isRecurring ? true : false,
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
      .eq("user_id", payload.therapistId)
      .neq("status", "cancelled")
      .lt("scheduled_at", maxEnd.toISOString());

    if (existingSessionsError) {
      return { success: false, error: existingSessionsError.message };
    }

    const sessionIntervals: TimeInterval[] = (existingSessions || []).map((s: any) => {
      const start = new Date(s.scheduled_at);
      const end = new Date(start.getTime() + (s.duration_minutes ?? 50) * 60 * 1000);
      return { start, end };
    });

    const { data: externalEvents, error: externalEventsError } = await (supabase as any)
      .from("external_calendar_events")
      .select("id, starts_at, ends_at")
      .eq("user_id", payload.therapistId)
      .lt("starts_at", maxEnd.toISOString())
      .gt("ends_at", minStart.toISOString());

    if (externalEventsError) {
      return { success: false, error: externalEventsError.message };
    }

    const externalIntervals: TimeInterval[] = (externalEvents || []).map((e: any) => ({
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
      .eq("id", payload.patientId)
      .eq("user_id", payload.therapistId)
      .maybeSingle();

    if (!patient) {
      return { success: false, error: "Paciente invÃ¡lido para esta agenda." };
    }

    const { data: createdSessions, error } = await supabase
      .from("sessions")
      .insert(rows)
      .select("id, scheduled_at, duration_minutes, location, google_event_id");

    if (error || !createdSessions) {
      return { success: false, error: error?.message || "Falha ao salvar sessÃ£o." };
    }

    let googleCreatedCount = 0;
    let warning: string | undefined;

    const admin = createAdminClient();

    // service_role is needed only for encrypted Google token reads/decryption.
    const { data: therapistProfile } = await admin
      .from("profiles")
      .select("google_access_token, google_refresh_token, google_token_expiry, google_calendar_id, timezone, full_name")
      .eq("id", payload.therapistId)
      .maybeSingle();

    if (therapistProfile?.google_refresh_token) {
      const profile = await decryptGoogleTokenFields(
        admin,
        therapistProfile as TherapistGoogleProfile
      );
      const accessToken = await getValidAccessToken(admin, payload.therapistId, profile);

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
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao criar sessÃ£o." };
  }
}

export async function cancelScheduleSession(
  payload: CancelSessionPayload
): Promise<CancelSessionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Sessão inválida." };
    if (!payload.sessionId) return { success: false, error: "Sessão inválida." };

    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("id, employer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!actorProfile) return { success: false, error: "Perfil não encontrado." };

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, user_id, status, google_event_id")
      .eq("id", payload.sessionId)
      .maybeSingle();

    if (sessionError) return { success: false, error: sessionError.message };
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

      if (cancelError) return { success: false, error: cancelError.message };
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
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao cancelar sessão." };
  }
}

