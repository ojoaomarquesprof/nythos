"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  status?: string;
  htmlLink?: string;
}

export interface CalendarSyncResult {
  success: boolean;
  imported: number;
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
      console.error("[calendar-sync] Token refresh failed:", await response.text());
      return null;
    }

    const data = await response.json();
    const newAccessToken: string = data.access_token;
    const expiresIn: number = data.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Persist the refreshed token
    const admin = createAdminClient();
    await (admin as any)
      .from("profiles")
      .update({
        google_access_token: newAccessToken,
        google_token_expiry: expiresAt,
      })
      .eq("id", userId);

    return newAccessToken;
  } catch (err) {
    console.error("[calendar-sync] Error refreshing token:", err);
    return null;
  }
}

// ─── Helper: Get a valid Google access token (refresh if needed) ─────────────

async function getValidAccessToken(
  userId: string,
  profile: { google_access_token: string | null; google_refresh_token: string | null; google_token_expiry: string | null }
): Promise<string | null> {
  if (!profile.google_access_token || !profile.google_refresh_token) {
    return null;
  }

  // Check if token is still valid (with 5-minute buffer)
  if (profile.google_token_expiry) {
    const expiry = new Date(profile.google_token_expiry).getTime();
    const bufferMs = 5 * 60 * 1000;
    if (Date.now() + bufferMs < expiry) {
      return profile.google_access_token;
    }
  }

  // Token expired or no expiry info — refresh it
  return await refreshGoogleToken(userId, profile.google_refresh_token);
}

// ─── Action: Check if Google Calendar is connected ──────────────────────────

export async function getCalendarStatus(): Promise<CalendarStatusResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { connected: false };

  const { data: profile } = await (supabase as any)
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
    state: user.id, // Pass user ID for the callback handler
  });

  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
}

// ─── Action: Disconnect Google Calendar ──────────────────────────────────────

export async function disconnectGoogleCalendar(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Não autenticado." };

  const { error } = await (supabase as any)
    .from("profiles")
    .update({
      google_access_token: null,
      google_refresh_token: null,
      google_token_expiry: null,
    })
    .eq("id", user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/schedule");
  return { success: true };
}

// ─── Action: Sync Google Calendar events → Nythos sessions ──────────────────

export async function syncGoogleCalendar(
  daysAhead: number = 30
): Promise<CalendarSyncResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { success: false, imported: 0, skipped: 0, error: "Não autenticado.", needsAuth: true };

  // Load profile with tokens
  const { data: profile, error: profileError } = await (supabase as any)
    .from("profiles")
    .select("google_access_token, google_refresh_token, google_token_expiry, google_calendar_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, imported: 0, skipped: 0, error: "Perfil não encontrado." };
  }

  if (!profile.google_refresh_token) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      needsAuth: true,
      error: "Google Calendar não conectado. Por favor, conecte sua conta.",
    };
  }

  // 2. Get valid access token (auto-refresh if needed)
  const accessToken = await getValidAccessToken(user.id, profile);
  if (!accessToken) {
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
  const timeMax = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  const gcalUrl = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  );
  gcalUrl.searchParams.set("timeMin", timeMin);
  gcalUrl.searchParams.set("timeMax", timeMax);
  gcalUrl.searchParams.set("singleEvents", "true");
  gcalUrl.searchParams.set("orderBy", "startTime");
  gcalUrl.searchParams.set("maxResults", "250");

  const gcalResponse = await fetch(gcalUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!gcalResponse.ok) {
    const errText = await gcalResponse.text();
    console.error("[calendar-sync] Google Calendar API error:", errText);
    return {
      success: false,
      imported: 0,
      skipped: 0,
      error: `Erro ao buscar eventos do Google: ${gcalResponse.status} ${gcalResponse.statusText}`,
    };
  }

  const gcalData = await gcalResponse.json();
  const events: GoogleCalendarEvent[] = gcalData.items ?? [];

  if (events.length === 0) {
    return { success: true, imported: 0, skipped: 0 };
  }

  // 4. Load the therapist's patients to match names
  const { data: patients } = await (supabase as any)
    .from("patients")
    .select("id, full_name")
    .eq("user_id", user.id)
    .eq("status", "active");

  const patientList: { id: string; full_name: string }[] = patients ?? [];

  // 5. Load existing sessions in the sync window to avoid duplicates
  const { data: existingSessions } = await (supabase as any)
    .from("sessions")
    .select("scheduled_at, google_event_id")
    .eq("user_id", user.id)
    .gte("scheduled_at", timeMin)
    .lte("scheduled_at", timeMax);

  // Build a set of already-synced Google event IDs for quick lookup
  const syncedEventIds = new Set<string>(
    (existingSessions ?? [])
      .map((s: any) => s.google_event_id)
      .filter(Boolean)
  );

  // Also track existing scheduled_at times (in minutes) to avoid exact time duplicates
  const existingTimes = new Set<string>(
    (existingSessions ?? []).map((s: any) =>
      new Date(s.scheduled_at).toISOString().slice(0, 16) // "YYYY-MM-DDTHH:MM"
    )
  );

  // 6. Process events
  let imported = 0;
  let skipped = 0;

  const admin = createAdminClient();

  for (const event of events) {
    // Skip cancelled events or all-day events (no dateTime)
    if (event.status === "cancelled") { skipped++; continue; }
    if (!event.start?.dateTime) { skipped++; continue; }

    // Skip already synced events
    if (event.id && syncedEventIds.has(event.id)) { skipped++; continue; }

    const scheduledAt = new Date(event.start.dateTime).toISOString();
    const timeKey = scheduledAt.slice(0, 16);
    if (existingTimes.has(timeKey)) { skipped++; continue; }

    // Calculate duration in minutes
    const startMs = new Date(event.start.dateTime).getTime();
    const endMs = event.end?.dateTime ? new Date(event.end.dateTime).getTime() : startMs + 50 * 60 * 1000;
    const durationMinutes = Math.round((endMs - startMs) / 60000);

    // Try to match a patient from the event title
    const summary = (event.summary ?? "").toLowerCase();
    const matchedPatient = patientList.find((p) =>
      summary.includes(p.full_name.split(" ")[0].toLowerCase())
    );

    // Determine location from event
    const location = event.location ? "office" : "online";

    // Skip events with no patient match — sessions require a patient_id
    if (!matchedPatient) {
      skipped++;
      continue;
    }

    // Build session record
    const sessionRecord: Record<string, unknown> = {
      user_id: user.id,
      patient_id: matchedPatient.id,
      scheduled_at: scheduledAt,
      duration_minutes: durationMinutes > 0 ? durationMinutes : 50,
      session_type: "individual",
      location,
      status: "scheduled",
      google_event_id: event.id ?? null,
    };

    try {
      await (admin as any).from("sessions").insert(sessionRecord);
      existingTimes.add(timeKey);
      imported++;
    } catch (insertErr) {
      console.error("[calendar-sync] Failed to insert session:", insertErr, sessionRecord);
      skipped++;
    }
  }

  revalidatePath("/dashboard/schedule");

  return {
    success: true,
    imported,
    skipped,
  };
}
