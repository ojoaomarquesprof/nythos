"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  createGoogleCalendarOAuthState,
  GOOGLE_CALENDAR_OAUTH_NONCE_COOKIE,
  GOOGLE_CALENDAR_OAUTH_STATE_MAX_AGE_SECONDS,
} from "@/lib/google/oauth-state";
import {
  decryptGoogleTokenIfNeeded,
  decryptGoogleTokenFields,
  isEncryptedGoogleToken,
  updateGoogleTokensEncrypted,
} from "@/lib/google/calendar-tokens";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { toInteger } from "@/lib/validation/input";
import { logSafeError } from "@/lib/errors/safe-error";

type SessionInsert = Database['public']['Tables']['sessions']['Insert'];
type SessionSyncRow = Pick<Database["public"]["Tables"]["sessions"]["Row"], "scheduled_at" | "google_event_id">;
type ExternalEventUpsert = Database["public"]["Tables"]["external_calendar_events"]["Insert"];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  status?: string;
  transparency?: string;
  htmlLink?: string;
}

export interface CalendarSyncResult {
  success: boolean;
  imported: number;
  externalImported?: number;
  skipped: number;
  error?: string;
  needsAuth?: boolean;
  authUrl?: string;
}

export interface CalendarStatusResult {
  connected: boolean;
  calendarId?: string;
  tokenExpiry?: string | null;
}

interface ParsedGoogleEventWindow {
  startsAtIso: string;
  endsAtIso: string;
  durationMinutes: number;
  isAllDay: boolean;
}

function parseGoogleEventWindow(event: GoogleCalendarEvent): ParsedGoogleEventWindow | null {
  const timedStart = event.start?.dateTime;
  const timedEnd = event.end?.dateTime;

  if (timedStart) {
    const start = new Date(timedStart);
    const end = timedEnd ? new Date(timedEnd) : new Date(start.getTime() + 50 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const safeEnd = end.getTime() > start.getTime() ? end : new Date(start.getTime() + 50 * 60 * 1000);
    const durationMinutes = Math.max(15, Math.round((safeEnd.getTime() - start.getTime()) / 60000));

    return {
      startsAtIso: start.toISOString(),
      endsAtIso: safeEnd.toISOString(),
      durationMinutes,
      isAllDay: false,
    };
  }

  const allDayStart = event.start?.date;
  if (!allDayStart) return null;

  const start = new Date(`${allDayStart}T00:00:00`);
  const endDateRaw = event.end?.date;
  const parsedEnd = endDateRaw ? new Date(`${endDateRaw}T00:00:00`) : new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const end = parsedEnd.getTime() > start.getTime()
    ? parsedEnd
    : new Date(start.getTime() + 24 * 60 * 60 * 1000);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const durationMinutes = Math.max(60, Math.round((end.getTime() - start.getTime()) / 60000));

  return {
    startsAtIso: start.toISOString(),
    endsAtIso: end.toISOString(),
    durationMinutes,
    isAllDay: true,
  };
}

// ─── Helper: Refresh the Google access token if expired ─────────────────────

async function refreshGoogleToken(
  userId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      logSafeError("[calendar-sync] Token refresh failed", await response.text());
      return null;
    }

    const data = await response.json();
    const newAccessToken: string = data.access_token;
    const expiresIn: number = data.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // service_role is required to encrypt and persist Google tokens via Vault-backed RPCs.
    await updateGoogleTokensEncrypted(supabaseAdmin, userId, {
      google_access_token: newAccessToken,
      google_refresh_token: refreshToken,
      google_token_expiry: expiresAt,
    });

    return newAccessToken;
  } catch (err) {
    logSafeError("[calendar-sync] Error refreshing token", err);
    return null;
  }
}

// ─── Helper: Get a valid Google access token (refresh if needed) ─────────────

async function getValidAccessToken(
  userId: string,
  profile: { google_access_token: string | null; google_refresh_token: string | null; google_token_expiry: string | null }
): Promise<string | null> {
  let accessToken = profile.google_access_token;
  let refreshToken = profile.google_refresh_token;

  if (isEncryptedGoogleToken(accessToken)) {
    try {
      accessToken = await decryptGoogleTokenIfNeeded(supabaseAdmin, accessToken);
    } catch (err) {
      logSafeError("[calendar-sync] Failed to decrypt access token before Google call", err);
      accessToken = null;
    }
  }

  if (isEncryptedGoogleToken(refreshToken)) {
    try {
      refreshToken = await decryptGoogleTokenIfNeeded(supabaseAdmin, refreshToken);
    } catch (err) {
      logSafeError("[calendar-sync] Failed to decrypt refresh token before token refresh", err);
      refreshToken = null;
    }
  }

  if (!accessToken || !refreshToken) {
    return null;
  }

  // Check if token is still valid (with 5-minute buffer)
  if (profile.google_token_expiry) {
    const expiry = new Date(profile.google_token_expiry).getTime();
    const bufferMs = 5 * 60 * 1000;
    if (Date.now() + bufferMs < expiry) {
      return isEncryptedGoogleToken(accessToken) ? null : accessToken;
    }
  }

  // Token expired or no expiry info — refresh it
  return await refreshGoogleToken(userId, refreshToken);
}

// ─── Action: Check if Google Calendar is connected ──────────────────────────

export async function getCalendarStatus(): Promise<CalendarStatusResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { connected: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("google_access_token, google_refresh_token, google_token_expiry, google_calendar_id")
    .eq("id", user.id)
    .single();

  return {
    connected: !!(profile?.google_access_token && profile?.google_refresh_token),
    calendarId: profile?.google_calendar_id ?? "primary",
    tokenExpiry: profile?.google_token_expiry ?? null,
  };
}

// ─── Action: Initiate Google Calendar OAuth link ─────────────────────────────

export async function linkGoogleCalendar(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  let oauthState: ReturnType<typeof createGoogleCalendarOAuthState>;
  try {
    oauthState = createGoogleCalendarOAuthState(user.id);
  } catch (err) {
    logSafeError("[calendar-sync] Failed to create Google OAuth state", err);
    return { error: "Configuração de segurança do Google Calendar indisponível." };
  }

  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_CALENDAR_OAUTH_NONCE_COOKIE, oauthState.nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google-calendar/callback",
    maxAge: GOOGLE_CALENDAR_OAUTH_STATE_MAX_AGE_SECONDS,
    expires: oauthState.expiresAt,
  });

  // Build the Google OAuth URL with offline access to get refresh_token
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-calendar/callback`,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ].join(" "),
    access_type: "offline",
    prompt: "consent", // Force consent to always get refresh_token
    state: oauthState.state,
  });

  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
}

// ─── Action: Disconnect Google Calendar ──────────────────────────────────────

export async function disconnectGoogleCalendar(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Não autenticado." };

  const { error } = await supabase
    .from("profiles")
    .update({
      google_access_token: null,
      google_refresh_token: null,
      google_token_expiry: null,
    })
    .eq("id", user.id);

  if (error) {
    logSafeError("[calendar-sync] Failed to disconnect Google Calendar", error);
    return { success: false, error: "Não foi possível desconectar o Google Calendar." };
  }

  revalidatePath("/dashboard/schedule");
  return { success: true };
}

// ─── Action: Sync Google Calendar events → Nythos sessions ──────────────────

export async function syncGoogleCalendar(
  daysAhead: number = 30
): Promise<CalendarSyncResult> {
  const safeDaysAhead = toInteger(daysAhead);
  if (safeDaysAhead === null || safeDaysAhead < 1 || safeDaysAhead > 90) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      error: "Janela de sincronização inválida.",
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { success: false, imported: 0, skipped: 0, error: "Não autenticado.", needsAuth: true };

  // Load profile with tokens
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("google_access_token, google_refresh_token, google_token_expiry, google_calendar_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, imported: 0, skipped: 0, error: "Perfil não encontrado." };
  }

  // service_role is required to decrypt Google tokens via Vault-backed RPCs.
  const decryptedProfile = await decryptGoogleTokenFields(supabaseAdmin, profile);

  if (!decryptedProfile.google_refresh_token) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      needsAuth: true,
      error: "Google Calendar não conectado. Por favor, conecte sua conta.",
    };
  }

  // 2. Get valid access token (auto-refresh if needed)
  const accessToken = await getValidAccessToken(user.id, decryptedProfile);
  if (!accessToken || isEncryptedGoogleToken(accessToken)) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      needsAuth: true,
      error: "Sessão do Google expirada. Reconecte sua conta do Google Calendar.",
    };
  }

  // 3. Fetch events from Google Calendar
  const calendarId = profile.google_calendar_id ?? "primary";
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + safeDaysAhead * 24 * 60 * 60 * 1000).toISOString();

  const gcalUrl = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  );
  gcalUrl.searchParams.set("timeMin", timeMin);
  gcalUrl.searchParams.set("timeMax", timeMax);
  gcalUrl.searchParams.set("singleEvents", "true");
  gcalUrl.searchParams.set("orderBy", "startTime");
  gcalUrl.searchParams.set("maxResults", "250");
  gcalUrl.searchParams.set("showDeleted", "true");

  let gcalResponse: Response;
  try {
    gcalResponse = await fetch(gcalUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    logSafeError("[calendar-sync] Failed to call Google Calendar API", err);
    return {
      success: false,
      imported: 0,
      skipped: 0,
      error: "Erro ao comunicar com o Google Calendar.",
    };
  }

  if (!gcalResponse.ok) {
    const errText = await gcalResponse.text();
    logSafeError("[calendar-sync] Google Calendar API error", errText);
    return {
      success: false,
      imported: 0,
      skipped: 0,
      error: "Erro ao buscar eventos do Google Calendar.",
    };
  }

  const gcalData = await gcalResponse.json();
  const events: GoogleCalendarEvent[] = gcalData.items ?? [];

  if (events.length === 0) {
    return { success: true, imported: 0, skipped: 0 };
  }

  // 4. Load the therapist's patients to match names
  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name")
    .eq("user_id", user.id)
    .eq("status", "active");

  const patientList: { id: string; full_name: string }[] = patients ?? [];

  // 5. Load existing sessions in the sync window to avoid duplicates
  const { data: existingSessions } = await supabase
    .from("sessions")
    .select("scheduled_at, google_event_id")
    .eq("user_id", user.id)
    .gte("scheduled_at", timeMin)
    .lte("scheduled_at", timeMax);

  // Build a set of already-synced Google event IDs for quick lookup
  const syncedEventIds = new Set<string>(
    (existingSessions ?? [])
      .map((s: SessionSyncRow) => s.google_event_id)
      .filter((eventId): eventId is string => typeof eventId === "string" && eventId.length > 0)
  );

  // Also track existing scheduled_at times (in minutes) to avoid exact time duplicates
  const existingTimes = new Set<string>(
    (existingSessions ?? []).map((s: SessionSyncRow) =>
      new Date(s.scheduled_at).toISOString().slice(0, 16) // "YYYY-MM-DDTHH:MM"
    )
  );

  // 6. Process events
  let imported = 0;
  let externalImported = 0;
  let skipped = 0;

  

  for (const event of events) {
    if (!event.id) {
      skipped++;
      continue;
    }

    // If a Google event was cancelled, cancel linked clinical sessions and remove external blocks.
    if (event.status === "cancelled") {
      try {
        await supabase
          .from("sessions")
          .update({ status: "cancelled" })
          .eq("user_id", user.id)
          .eq("google_event_id", event.id)
          .neq("status", "cancelled");

        await supabase
          .from("external_calendar_events")
          .delete()
          .eq("user_id", user.id)
          .eq("google_event_id", event.id);
      } catch (err) {
        logSafeError("[calendar-sync] Failed to remove cancelled external event", err, { eventId: event.id });
      }
      skipped++;
      continue;
    }

    // Ignore all-day (start.date/end.date) and "free" events that do not block time.
    const isAllDayEvent = !event.start?.dateTime && !!event.start?.date;
    const isTransparent = event.transparency === "transparent";
    if (isAllDayEvent || isTransparent) {
      try {
        await supabase
          .from("external_calendar_events")
          .delete()
          .eq("user_id", user.id)
          .eq("google_event_id", event.id);
      } catch (err) {
        logSafeError("[calendar-sync] Failed to remove ignored external event", err, { eventId: event.id });
      }
      skipped++;
      continue;
    }

    const window = parseGoogleEventWindow(event);
    if (!window) {
      skipped++;
      continue;
    }

    // Skip already synced events
    if (syncedEventIds.has(event.id)) { skipped++; continue; }

    const scheduledAt = window.startsAtIso;
    const timeKey = scheduledAt.slice(0, 16);
    if (existingTimes.has(timeKey)) { skipped++; continue; }

    // Try to match a patient from the event title
    const summary = (event.summary ?? "").toLowerCase();
    const matchedPatient = patientList.find((p) =>
      summary.includes(p.full_name.split(" ")[0].toLowerCase())
    );

    // Determine location from event
    const location = event.location ? "office" : "online";

    // If no patient matched, store as external availability block (not a clinical session).
    if (!matchedPatient) {
      try {
        const externalEventRecord: ExternalEventUpsert = {
          user_id: user.id,
          google_event_id: event.id,
          calendar_id: calendarId,
          title: event.summary ?? "Compromisso (Google)",
          description: event.description ?? null,
          location: event.location ?? null,
          starts_at: window.startsAtIso,
          ends_at: window.endsAtIso,
          is_all_day: window.isAllDay,
          html_link: event.htmlLink ?? null,
        };

        const { error: externalUpsertError } = await supabase
          .from("external_calendar_events")
          .upsert(externalEventRecord, { onConflict: "user_id,google_event_id" });

        if (externalUpsertError) throw externalUpsertError;
        externalImported++;
      } catch (externalErr) {
        logSafeError("[calendar-sync] Failed to upsert external calendar block", externalErr, { eventId: event.id });
      }

      // Count as skipped from clinical import perspective (no session created).
      skipped++;
      continue;
    }

    // Matched a patient: this should be a session, not an external block.
    await supabase
      .from("external_calendar_events")
      .delete()
      .eq("user_id", user.id)
      .eq("google_event_id", event.id);

    // Build session record
    const sessionRecord: SessionInsert = {
      user_id: user.id,
      patient_id: matchedPatient.id,
      scheduled_at: scheduledAt,
      duration_minutes: window.durationMinutes > 0 ? window.durationMinutes : 50,
      session_type: "individual",
      location,
      status: "scheduled",
      google_event_id: event.id,
    };

    try {
      const { error: insertError } = await supabase.from("sessions").insert(sessionRecord);
      if (insertError) throw insertError;
      existingTimes.add(timeKey);
      imported++;
    } catch (insertErr) {
      logSafeError("[calendar-sync] Failed to insert session", insertErr, { eventId: event.id });
      skipped++;
    }
  }

  revalidatePath("/dashboard/schedule");

  return {
    success: true,
    imported,
    externalImported,
    skipped,
  };
}


