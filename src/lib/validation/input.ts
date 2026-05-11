const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_TOKEN_REGEX = /^[A-Za-z0-9_-]{8,200}$/;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOnlyAllowedKeys(
  obj: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(obj).every((key) => allowed.has(key));
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!ISO_DATE_REGEX.test(trimmed)) return false;
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === trimmed;
}

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && EMAIL_REGEX.test(value.trim()) && value.trim().length <= 254;
}

export function isValidPublicToken(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_TOKEN_REGEX.test(value.trim());
}

export function isLikelyPhoneOrCpf(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 8 &&
    value.trim().length <= 24 &&
    /^[0-9+\-().\s]+$/.test(value.trim())
  );
}

export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function toInteger(value: unknown): number | null {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return null;
  return Number.isInteger(numeric) ? numeric : null;
}
