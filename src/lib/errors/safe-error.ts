const DEFAULT_CLIENT_ERROR = "Nao foi possivel concluir a operacao.";

const SENSITIVE_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b(ENC::)[A-Za-z0-9+/=:_-]+/gi,
  /["']?\b(access_token|refresh_token|public_token|patient_token|hmac|cookie|set-cookie|secret|authorization|x-api-key|api_key|signed_url)\b["']?\s*[:=]\s*["']?[^"',\s}]+/gi,
  /([?&](access_token|refresh_token|token|public_token|patient_token|signed_url)=)[^&\s]+/gi,
];

const SENSITIVE_KEYS = new Set([
  "access_token",
  "accesstoken",
  "authorization",
  "body",
  "clinical_note",
  "clinicalnote",
  "cookie",
  "cookies",
  "diagnosis",
  "evolution",
  "feedback",
  "headers",
  "hmac",
  "payload",
  "patient_token",
  "patienttoken",
  "pdf_content",
  "pdfcontent",
  "public_token",
  "publictoken",
  "refresh_token",
  "refreshtoken",
  "request",
  "response",
  "secret",
  "session_notes",
  "sessionnotes",
  "set-cookie",
  "signed_url",
  "signedurl",
  "stack",
  "storage_path",
  "storagepath",
  "task_response",
  "taskresponse",
  "token",
  "url",
  "x-api-key",
  "xapikey",
]);

function normalizeKey(key: string): string {
  return key.replace(/[-_]/g, "").toLowerCase();
}

function shouldRedactKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.has(lowerKey) || SENSITIVE_KEYS.has(normalizeKey(key));
}

export function safeClientError(message: string = DEFAULT_CLIENT_ERROR): string {
  return message;
}

export function redactSensitiveText(text: string): string {
  return SENSITIVE_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, (match) => {
      if (match.startsWith("ENC::")) return "ENC::[REDACTED]";
      if (match.toLowerCase().startsWith("bearer ")) return "Bearer [REDACTED]";
      if (
        /^[?&](access_token|refresh_token|token|public_token|patient_token|signed_url)=/i.test(
          match
        )
      ) {
        const [prefix] = match.split("=", 1);
        return `${prefix}=[REDACTED]`;
      }
      const [key] = match.split(/[:=]/, 1);
      return `${key}=[REDACTED]`;
    }),
    text
  );
}

function sanitizeValueForLog(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value !== "object") return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveText(value.message),
    };
  }

  if (value instanceof Date) return value.toISOString();

  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValueForLog(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      shouldRedactKey(key) ? "[REDACTED]" : sanitizeValueForLog(item, seen),
    ])
  );
}

export function sanitizeErrorForLog(error: unknown): unknown {
  try {
    return sanitizeValueForLog(error, new WeakSet());
  } catch {
    return "[UNSERIALIZABLE_ERROR]";
  }
}

export function logSafeError(context: string, error: unknown, meta?: unknown): void {
  if (meta === undefined) {
    console.error(context, sanitizeErrorForLog(error));
    return;
  }

  console.error(context, {
    error: sanitizeErrorForLog(error),
    meta: sanitizeErrorForLog(meta),
  });
}
