const DEFAULT_CLIENT_ERROR = "Não foi possível concluir a operação.";

const SENSITIVE_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b(ENC::)[A-Za-z0-9+/=:_-]+/gi,
  /\b(access_token|refresh_token|public_token|hmac|cookie|secret|authorization)\b\s*[:=]\s*["']?[^"',\s}]+/gi,
];

export function safeClientError(message: string = DEFAULT_CLIENT_ERROR): string {
  return message;
}

export function redactSensitiveText(text: string): string {
  return SENSITIVE_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, (match) => {
      if (match.startsWith("ENC::")) return "ENC::[REDACTED]";
      if (match.toLowerCase().startsWith("bearer ")) return "Bearer [REDACTED]";
      const [key] = match.split(/[:=]/, 1);
      return `${key}=[REDACTED]`;
    }),
    text
  );
}

export function sanitizeErrorForLog(error: unknown): unknown {
  if (error == null) return error;
  if (typeof error === "string") return redactSensitiveText(error);

  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSensitiveText(error.message),
    };
  }

  try {
    return JSON.parse(redactSensitiveText(JSON.stringify(error)));
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
