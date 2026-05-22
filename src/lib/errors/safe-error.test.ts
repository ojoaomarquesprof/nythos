import { describe, expect, it } from "vitest";
import {
  redactSensitiveText,
  safeClientError,
  sanitizeErrorForLog,
} from "./safe-error";

describe("safe-error helpers", () => {
  it("redacts tokens from plain text errors", () => {
    const message =
      "Request failed with Bearer abc.def.ghi and ?token=secret-token";

    expect(redactSensitiveText(message)).toContain("Bearer [REDACTED]");
    expect(redactSensitiveText(message)).toContain("?token=[REDACTED]");
    expect(redactSensitiveText(message)).not.toContain("secret-token");
  });

  it("does not expose stack traces or sensitive object fields", () => {
    const sanitized = sanitizeErrorForLog({
      message: "Falha ao gerar URL",
      stack: "secret stack",
      headers: { cookie: "sid=123" },
      signed_url: "https://storage.example.com/file?token=abc",
      storage_path: "patients/real/document.pdf",
      payload: { clinicalNote: "conteudo clinico" },
      safeId: "evt_123",
    });

    expect(sanitized).toEqual({
      message: "Falha ao gerar URL",
      stack: "[REDACTED]",
      headers: "[REDACTED]",
      signed_url: "[REDACTED]",
      storage_path: "[REDACTED]",
      payload: "[REDACTED]",
      safeId: "evt_123",
    });
  });

  it("redacts CPF/CNPJ fields and text fragments", () => {
    const sanitized = sanitizeErrorForLog({
      cpf: "123.456.789-01",
      cpfCnpj: "12.345.678/0001-90",
      message: "Asaas rejected cpfCnpj=12345678901",
    });

    const serialized = JSON.stringify(sanitized);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("123.456.789-01");
    expect(serialized).not.toContain("12.345.678/0001-90");
    expect(serialized).not.toContain("12345678901");
  });

  it("returns a generic client message by default", () => {
    expect(safeClientError()).toBe("Nao foi possivel concluir a operacao.");
  });
});
