import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import {
  GOOGLE_CALENDAR_OAUTH_NONCE_COOKIE,
  validateGoogleCalendarOAuthState,
} from "@/lib/google/oauth-state";
import { buildEncryptedGoogleTokenUpdate } from "@/lib/google/calendar-tokens";

// This route handles the OAuth 2.0 callback from Google after the user
// authorizes Nythos to access their Google Calendar.
// Google redirects here with ?code=...&state=<userId>
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const cookieStore = await cookies();
  const nonceCookie = cookieStore.get(GOOGLE_CALENDAR_OAUTH_NONCE_COOKIE)?.value;

  function redirectToSchedule(result: "success" | "error", reason?: string) {
    const dashboardUrl = new URL("/dashboard/schedule", appUrl);
    dashboardUrl.searchParams.set("google_auth", result);
    if (reason) dashboardUrl.searchParams.set("google_auth_error", reason);

    const response = NextResponse.redirect(dashboardUrl);
    response.cookies.set(GOOGLE_CALENDAR_OAUTH_NONCE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth/google-calendar/callback",
      maxAge: 0,
    });

    return response;
  }

  let validatedState: ReturnType<typeof validateGoogleCalendarOAuthState>;
  try {
    validatedState = validateGoogleCalendarOAuthState(state, nonceCookie);
  } catch (err) {
    console.error("[google-calendar/callback] OAuth state validation failed:", err);
    return redirectToSchedule("error", "invalid_state");
  }

  if (!validatedState.ok) {
    console.error("[google-calendar/callback] Invalid OAuth state:", validatedState.reason);
    return redirectToSchedule("error", validatedState.reason);
  }

  // Handle user denial
  if (error) {
    console.error("[google-calendar/callback] OAuth error:", error);
    return redirectToSchedule("error", "google_denied");
  }

  if (!code) {
    console.error("[google-calendar/callback] OAuth error: Missing code");
    return redirectToSchedule("error", "missing_code");
  }

  // Exchange authorization code for access + refresh tokens
  try {
    // service_role is used only after signed state + nonce validation, for token encryption/persistence.
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", validatedState.payload.userId)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("[google-calendar/callback] State user not found:", profileError);
      return redirectToSchedule("error", "invalid_user");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${appUrl}/api/auth/google-calendar/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("[google-calendar/callback] Token exchange failed:", errText);
      return redirectToSchedule("error", "token_exchange_failed");
    }

    const tokens = await tokenResponse.json();
    const {
      access_token,
      refresh_token,
      expires_in = 3600,
    } = tokens as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!access_token) {
      return redirectToSchedule("error", "missing_access_token");
    }

    const tokenExpiry = new Date(Date.now() + expires_in * 1000).toISOString();
    const encryptedTokenUpdate = await buildEncryptedGoogleTokenUpdate(admin, {
      google_access_token: access_token,
      // Only overwrite refresh_token if Google actually returned one.
      // Google only returns it on first authorization or after "prompt=consent".
      ...(refresh_token ? { google_refresh_token: refresh_token } : {}),
      google_token_expiry: tokenExpiry,
    });

    // Persist tokens in the user's profile using the admin client (bypasses RLS)
    const { error: updateError } = await admin
      .from("profiles")
      .update(encryptedTokenUpdate)
      .eq("id", validatedState.payload.userId);

    if (updateError) {
      console.error("[google-calendar/callback] Failed to save tokens:", updateError);
      return redirectToSchedule("error", "save_failed");
    }

    // Redirect back to schedule page with success flag
    return redirectToSchedule("success");
  } catch (err) {
    console.error("[google-calendar/callback] Unexpected error:", err);
    return redirectToSchedule("error", "unexpected");
  }
}

