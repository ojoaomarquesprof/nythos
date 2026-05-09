import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type GoogleTokenFields = {
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: string | null;
  google_calendar_id: string | null;
};

export type GoogleTokenUpdate = {
  google_access_token?: string | null;
  google_refresh_token?: string | null;
  google_token_expiry?: string | null;
};

export async function encryptGoogleTokenIfNeeded(
  admin: AdminClient,
  token: string | null | undefined
): Promise<string | null> {
  if (token == null) return null;

  const { data, error } = await (admin as any).rpc("encrypt_google_token_if_needed", {
    p_token: token,
  });

  if (error) {
    throw new Error(`Failed to encrypt Google Calendar token: ${error.message}`);
  }

  return (data as string | null) ?? null;
}

export async function decryptGoogleTokenIfNeeded(
  admin: AdminClient,
  token: string | null | undefined
): Promise<string | null> {
  if (token == null) return null;

  const { data, error } = await (admin as any).rpc("decrypt_google_token_if_needed", {
    p_token: token,
  });

  if (error) {
    throw new Error(`Failed to decrypt Google Calendar token: ${error.message}`);
  }

  return (data as string | null) ?? null;
}

export async function decryptGoogleTokenFields<T extends GoogleTokenFields>(
  admin: AdminClient,
  profile: T
): Promise<T> {
  const [accessToken, refreshToken] = await Promise.all([
    decryptGoogleTokenIfNeeded(admin, profile.google_access_token),
    decryptGoogleTokenIfNeeded(admin, profile.google_refresh_token),
  ]);

  return {
    ...profile,
    google_access_token: accessToken,
    google_refresh_token: refreshToken,
  };
}

export async function buildEncryptedGoogleTokenUpdate(
  admin: AdminClient,
  update: GoogleTokenUpdate
): Promise<GoogleTokenUpdate> {
  const encrypted: GoogleTokenUpdate = {};

  if (Object.prototype.hasOwnProperty.call(update, "google_access_token")) {
    encrypted.google_access_token = await encryptGoogleTokenIfNeeded(admin, update.google_access_token);
  }

  if (Object.prototype.hasOwnProperty.call(update, "google_refresh_token")) {
    encrypted.google_refresh_token = await encryptGoogleTokenIfNeeded(admin, update.google_refresh_token);
  }

  if (Object.prototype.hasOwnProperty.call(update, "google_token_expiry")) {
    encrypted.google_token_expiry = update.google_token_expiry ?? null;
  }

  return encrypted;
}

export async function updateGoogleTokensEncrypted(
  admin: AdminClient,
  userId: string,
  update: GoogleTokenUpdate
): Promise<void> {
  const encrypted = await buildEncryptedGoogleTokenUpdate(admin, update);

  const { error } = await admin
    .from("profiles")
    .update(encrypted)
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to save Google Calendar tokens: ${error.message}`);
  }
}
