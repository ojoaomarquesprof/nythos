/**
 * @/lib/auth/patient-session.ts
 *
 * Utilitário centralizado para criar, ler e apagar o cookie de sessão
 * do paciente (nythos_patient_session). Não há JWT — o cookie é um valor
 * simples assinado com HMAC-SHA256 usando a variável PATIENT_SESSION_SECRET.
 *
 * Formato do payload: `<patient_id>.<timestamp_ms>`
 * Valor no cookie: `<payload>.<hmac_hex>`
 */

import { cookies } from "next/headers";

const COOKIE_NAME = "nythos_patient_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const DEV_FALLBACK_SECRET = "nythos-dev-fallback-secret-change-me";

function getPatientSessionSecret(): string {
  const secret = process.env.PATIENT_SESSION_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PATIENT_SESSION_SECRET is required in production.");
    }

    return DEV_FALLBACK_SECRET;
  }

  if (process.env.NODE_ENV === "production" && secret === DEV_FALLBACK_SECRET) {
    throw new Error("PATIENT_SESSION_SECRET must not use the development fallback in production.");
  }

  return secret;
}

// ─── HMAC helpers (Web Crypto API — available in Edge & Node 18+) ─────────────

async function getKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(getPatientSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(payload: string): Promise<string> {
  const key = await getKey();
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Buffer.from(sig).toString("hex");
}

async function verify(payload: string, hmac: string): Promise<boolean> {
  const expected = await sign(payload);
  // Constant-time comparison
  if (expected.length !== hmac.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ hmac.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Cria e define o cookie de sessão para o paciente.
 * Deve ser chamado em Server Actions ou Route Handlers (contexto de servidor).
 */
export async function createPatientSession(patientId: string): Promise<void> {
  const payload = `${patientId}.${Date.now()}`;
  const hmac = await sign(payload);
  const value = `${payload}.${hmac}`;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * Lê e valida o cookie de sessão do paciente.
 * Retorna o `patient_id` se válido, ou `null` se ausente/inválido/expirado.
 */
export async function getPatientSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  // Formato: <patient_id>.<ts>.<hmac>
  const lastDot = raw.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = raw.slice(0, lastDot);
  const hmac = raw.slice(lastDot + 1);

  const valid = await verify(payload, hmac).catch(() => false);
  if (!valid) return null;

  // Extrair patient_id (tudo antes do segundo ponto)
  const firstDot = payload.indexOf(".");
  if (firstDot === -1) return null;

  const timestamp = Number(payload.slice(firstDot + 1));
  if (!Number.isFinite(timestamp)) return null;
  if (Date.now() - timestamp > MAX_AGE_SECONDS * 1000) return null;

  return payload.slice(0, firstDot);
}

/**
 * Lê o cookie sem validação criptográfica — para uso no middleware (Edge).
 * O middleware apenas verifica presença; a validade é checada no servidor.
 */
export function getPatientSessionRaw(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

/**
 * Remove o cookie de sessão (logout do paciente).
 */
export async function clearPatientSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
