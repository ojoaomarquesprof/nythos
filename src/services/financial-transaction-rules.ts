import type { CashFlowStatus, SessionPackagePaymentStatus } from "@/types/database";

export const CASH_FLOW_STATUS_LABELS: Record<CashFlowStatus, string> = {
  pending: "Pendente",
  confirmed: "Pago",
  cancelled: "Cancelado",
};

export const CASH_FLOW_CATEGORY_LABELS: Record<string, string> = {
  session: "Sessão",
  package: "Pacote",
  other_income: "Outra receita",
  rent: "Aluguel",
  supplies: "Materiais",
  marketing: "Marketing",
  education: "Formação",
  software: "Software",
  taxes: "Impostos",
  other_expense: "Outra despesa",
};

export const CASH_FLOW_ORIGIN_LABELS = {
  session: "Sessão avulsa",
  package: "Pacote de sessões",
  expense: "Despesa",
  other: "Outro",
} as const;

export const MANUAL_PAYMENT_METHODS = [
  "pix",
  "cash",
  "credit_card",
  "debit_card",
  "bank_transfer",
  "other",
] as const;

export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];
export type CashFlowOrigin = keyof typeof CASH_FLOW_ORIGIN_LABELS;

export type CashFlowLike = {
  status?: string | null;
  type?: string | null;
  category?: string | null;
  package_id?: string | null;
  session_id?: string | null;
};

export function getCashFlowStatusLabel(status: string | null | undefined): string {
  return CASH_FLOW_STATUS_LABELS[status as CashFlowStatus] ?? "Status desconhecido";
}

export function getCashFlowCategoryLabel(category: string | null | undefined): string {
  return CASH_FLOW_CATEGORY_LABELS[category || ""] ?? "Outra";
}

export function getCashFlowOrigin(transaction: CashFlowLike): CashFlowOrigin {
  if (transaction.category === "package" || transaction.package_id) return "package";
  if (transaction.category === "session" || transaction.session_id) return "session";
  if (transaction.type === "expense") return "expense";
  return "other";
}

export function getCashFlowOriginLabel(transaction: CashFlowLike): string {
  return CASH_FLOW_ORIGIN_LABELS[getCashFlowOrigin(transaction)];
}

export function canConfirmCashFlowPayment(transaction: CashFlowLike): boolean {
  return transaction.status === "pending" && transaction.type === "income";
}

export function canCancelCashFlow(transaction: CashFlowLike): boolean {
  return transaction.status === "pending";
}

export function isManualPaymentMethod(method: string | null | undefined): method is ManualPaymentMethod {
  return MANUAL_PAYMENT_METHODS.includes(method as ManualPaymentMethod);
}

export function deriveSessionPackagePaymentStatusFromCashFlow(
  status: string | null | undefined
): SessionPackagePaymentStatus {
  if (status === "confirmed") return "paid";
  if (status === "cancelled") return "cancelled";
  return "pending";
}
