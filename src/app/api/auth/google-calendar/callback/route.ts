import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// This route handles the OAuth 2.0 callback from Google after the user
// authorizes Nythos to access their Google Calendar.
// Google redirects here with ?code=...&state=<userId>
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const dashboardUrl = `${appUrl}/dashboard/schedule`;

  // Handle user denial
  if (error || !code || !userId) {
    console.error("[google-calendar/callback] OAuth error:", error ?? "Missing code or userId");
    return NextResponse.redirect(`${dashboardUrl}?google_auth=error`);
  }

  // Exchange authorization code for access + refresh tokens
  try {
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
      return NextResponse.redirect(`${dashboardUrl}?google_auth=error`);
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
      return NextResponse.redirect(`${dashboardUrl}?google_auth=error`);
    }

    const tokenExpiry = new Date(Date.now() + expires_in * 1000).toISOString();

    // Persist tokens in the user's profile using the admin client (bypasses RLS)
    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("profiles")
      .update({
        google_access_token: access_token,
        // Only overwrite refresh_token if Google actually returned one.
        // Google only returns it on first authorization or after "prompt=consent".
        ...(refresh_token ? { google_refresh_token: refresh_token } : {}),
        google_token_expiry: tokenExpiry,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("[google-calendar/callback] Failed to save tokens:", updateError);
      return NextResponse.redirect(`${dashboardUrl}?google_auth=error`);
    }

    // Redirect back to schedule page with success flag
    return NextResponse.redirect(`${dashboardUrl}?google_auth=success`);
  } catch (err) {
    console.error("[google-calendar/callback] Unexpected error:", err);
    return NextResponse.redirect(`${dashboardUrl}?google_auth=error`);
  }
}

