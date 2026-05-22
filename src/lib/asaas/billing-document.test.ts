import { describe, expect, it } from "vitest";
import {
  getBillingDocumentValidationMessage,
  isValidCpfCnpjLength,
  normalizeCpfCnpj,
} from "./billing-document";

describe("billing document helpers", () => {
  it("normalizes CPF and CNPJ with or without masks", () => {
    expect(normalizeCpfCnpj("123.456.789-01")).toBe("12345678901");
    expect(normalizeCpfCnpj("12345678901")).toBe("12345678901");
    expect(normalizeCpfCnpj("12.345.678/0001-90")).toBe("12345678000190");
    expect(normalizeCpfCnpj("12345678000190")).toBe("12345678000190");
  });

  it("accepts only CPF and CNPJ lengths", () => {
    expect(isValidCpfCnpjLength("123.456.789-01")).toBe(true);
    expect(isValidCpfCnpjLength("12.345.678/0001-90")).toBe(true);
    expect(isValidCpfCnpjLength("123")).toBe(false);
    expect(isValidCpfCnpjLength("123456789012")).toBe(false);
  });

  it("returns safe validation messages without echoing the document", () => {
    expect(getBillingDocumentValidationMessage("")).toBe("Informe um CPF ou CNPJ para continuar.");
    expect(getBillingDocumentValidationMessage("123")).toBe("Informe um CPF com 11 digitos ou CNPJ com 14 digitos.");
    expect(getBillingDocumentValidationMessage("123.456.789-01")).toBeNull();
  });
});
