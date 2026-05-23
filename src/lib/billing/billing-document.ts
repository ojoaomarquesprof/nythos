export function normalizeCpfCnpj(value?: string | null): string {
  return value?.replace(/\D/g, "") ?? "";
}

export function isValidCpfCnpjLength(value?: string | null): boolean {
  const normalized = normalizeCpfCnpj(value);
  return normalized.length === 11 || normalized.length === 14;
}

export function getBillingDocumentValidationMessage(value?: string | null): string | null {
  const normalized = normalizeCpfCnpj(value);

  if (!normalized) {
    return "Informe um CPF ou CNPJ para continuar.";
  }

  if (!isValidCpfCnpjLength(normalized)) {
    return "Informe um CPF com 11 digitos ou CNPJ com 14 digitos.";
  }

  return null;
}
