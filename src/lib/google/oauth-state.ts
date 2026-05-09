import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const GOOGLE_CALENDAR_OAUTH_NONCE_COOKIE = "nythos_gcal_oauth_nonce";
export const GOOGLE_CALENDAR_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

type GoogleCalendarOAuthStatePayload = {
  v: 1;
  userId: string;
  nonce: string;
  exp: number;
};

type StateValidationResult =
  | { ok: true; payload: GoogleCalendarOAuthStatePayload }
  | { ok: false; reason: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE_RE = /^[A-Za-z0-9_-]{32,128}$/;

function getStateSecret(): string {
  const secret = process.env.GOOGLE_CALENDAR_OAUTH_STATE_SECRET?.trim();

  if (!secret) {
    throw new Error("GOOGLE_CALENDAR_OAUTH_STATE_SECRET is required.");
  }

  if (secret.length < 32) {
    throw new Error("GOOGLE_CALENDAR_OAUTH_STATE_SECRET must be at least 32 characters.");
  }

  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);

  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function createGoogleCalendarOAuthState(userId: string): {
  state: string;
  nonce: string;
  expiresAt: Date;
} {
  if (!UUID_RE.test(userId)) {
    throw new Error("Invalid user id for Google Calendar OAuth state.");
  }

  const nonce = randomBytes(32).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + GOOGLE_CALENDAR_OAUTH_STATE_MAX_AGE_SECONDS;
  const payload = base64UrlEncode(JSON.stringify({ v: 1, userId, nonce, exp }));
  const signature = sign(payload);

  return {
    state: `${payload}.${signature}`,
    nonce,
    expiresAt: new Date(exp * 1000),
  };
}

export function validateGoogleCalendarOAuthState(
  state: string | null,
  expectedNonce: string | undefined
): StateValidationResult {
  if (!state) return { ok: false, reason: "missing_state" };
  if (!expectedNonce) return { ok: false, reason: "missing_nonce_cookie" };
  if (!NONCE_RE.test(expectedNonce)) return { ok: false, reason: "invalid_nonce_cookie" };

  const [payloadPart, signature, extra] = state.split(".");
  if (!payloadPart || !signature || extra) return { ok: false, reason: "invalid_state_format" };

  const expectedSignature = sign(payloadPart);
  if (!signaturesMatch(signature, expectedSignature)) {
    return { ok: false, reason: "invalid_state_signature" };
  }

  let payload: GoogleCalendarOAuthStatePayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart)) as GoogleCalendarOAuthStatePayload;
  } catch {
    return { ok: false, reason: "invalid_state_payload" };
  }

  if (payload.v !== 1) return { ok: false, reason: "unsupported_state_version" };
  if (!UUID_RE.test(payload.userId)) return { ok: false, reason: "invalid_state_user" };
  if (!NONCE_RE.test(payload.nonce)) return { ok: false, reason: "invalid_state_nonce" };
  if (!Number.isInteger(payload.exp)) return { ok: false, reason: "invalid_state_expiry" };
  if (payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired_state" };
  if (payload.nonce !== expectedNonce) return { ok: false, reason: "nonce_mismatch" };

  return { ok: true, payload };
}
