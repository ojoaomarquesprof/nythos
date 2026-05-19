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

export const CASH_FLOW_IMMUTABLE_FIELDS = [
  "user_id",
  "session_id",
  "package_id",
  "patient_id",
  "type",
  "category",
  "amount",
  "guardian_id",
] as const;

export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];
export type CashFlowOrigin = keyof typeof CASH_FLOW_ORIGIN_LABELS;
export type CashFlowImmutableField = (typeof CASH_FLOW_IMMUTABLE_FIELDS)[number];

export type CashFlowLike = {
  id?: string | null;
  user_id?: string | null;
  status?: string | null;
  type?: string | null;
  category?: string | null;
  package_id?: string | null;
  session_id?: string | null;
  amount?: number | string | null;
  description?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  patient_id?: string | null;
  guardian_id?: string | null;
  patient?: { id?: string | null; full_name?: string | null } | null;
  session?: { id?: string | null; scheduled_at?: string | null; billing_mode?: string | null } | null;
  session_package?: {
    id?: string | null;
    name?: string | null;
    total_sessions?: number | null;
    unit_amount?: number | string | null;
  } | null;
};

export type CashFlowReceiptOrigin = "session" | "package";

export type CashFlowReceiptPayload = {
  id: string | null;
  origin: CashFlowReceiptOrigin;
  originLabel: string;
  patientName: string;
  description: string;
  amount: number;
  paidAt: string | null;
  paymentMethod: string | null;
  sessionDate: string | null;
  packageName: string | null;
  packageTotalSessions: number | null;
  packageUnitAmount: number | null;
};

export type CashFlowSummary = {
  receivedTotal: number;
  pendingTotal: number;
  cancelledTotal: number;
  overdueTotal: number;
  expensesTotal: number;
  balanceTotal: number;
  packageReceivedTotal: number;
  packagePendingTotal: number;
  sessionReceivedTotal: number;
  sessionPendingTotal: number;
  otherReceivedTotal: number;
  pendingCount: number;
  overdueCount: number;
  packagePendingCount: number;
  sessionPendingCount: number;
  expensesCount: number;
  cancelledCount: number;
};

export type PendingPatientGroup = {
  patientId: string | null;
  patientName: string;
  total: number;
  count: number;
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

export const getTransactionOriginLabel = getCashFlowOriginLabel;

export function canConfirmCashFlowPayment(transaction: CashFlowLike): boolean {
  return transaction.status === "pending" && transaction.type === "income";
}

export function canCancelCashFlow(transaction: CashFlowLike): boolean {
  return transaction.status === "pending";
}

export function getCashFlowReceiptOrigin(transaction: CashFlowLike): CashFlowReceiptOrigin | null {
  const origin = getCashFlowOrigin(transaction);
  if (origin === "session" || origin === "package") return origin;
  return null;
}

export function getCashFlowReceiptOriginLabel(transaction: CashFlowLike): string {
  const origin = getCashFlowReceiptOrigin(transaction);
  if (origin === "session") return CASH_FLOW_ORIGIN_LABELS.session;
  if (origin === "package") return CASH_FLOW_ORIGIN_LABELS.package;
  return "";
}

export function canGenerateCashFlowReceipt(transaction: CashFlowLike): boolean {
  return transaction.status === "confirmed"
    && transaction.type === "income"
    && getCashFlowReceiptOrigin(transaction) !== null
    && Boolean(transaction.patient_id || transaction.patient?.id);
}

function cleanReceiptText(value: string | null | undefined, fallback: string): string {
  const cleaned = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

export function buildCashFlowReceiptPayload(transaction: CashFlowLike): CashFlowReceiptPayload | null {
  if (!canGenerateCashFlowReceipt(transaction)) return null;

  const origin = getCashFlowReceiptOrigin(transaction);
  if (!origin) return null;

  const amount = toAmount(transaction.amount);
  const packageTotalSessions = transaction.session_package?.total_sessions ?? null;
  const packageUnitAmount = packageTotalSessions && packageTotalSessions > 0
    ? amount / packageTotalSessions
    : toAmount(transaction.session_package?.unit_amount) || null;

  return {
    id: transaction.id ?? null,
    origin,
    originLabel: getCashFlowReceiptOriginLabel(transaction),
    patientName: cleanReceiptText(transaction.patient?.full_name, "Paciente vinculado"),
    description: cleanReceiptText(transaction.description, origin === "package" ? "Pacote de sessoes" : "Sessao avulsa"),
    amount,
    paidAt: transaction.paid_at ?? null,
    paymentMethod: transaction.payment_method ?? null,
    sessionDate: transaction.session?.scheduled_at ?? transaction.due_date ?? null,
    packageName: origin === "package"
      ? cleanReceiptText(transaction.session_package?.name, "Pacote de sessoes")
      : null,
    packageTotalSessions,
    packageUnitAmount,
  };
}

function normalizeImmutableFieldValue(
  transaction: CashFlowLike,
  field: CashFlowImmutableField
): string | number | null {
  if (field === "amount") {
    const amount = Number(transaction.amount);
    return Number.isFinite(amount) ? amount : null;
  }

  return transaction[field] ?? null;
}

export function getCashFlowImmutableFieldChanges(
  before: CashFlowLike,
  after: CashFlowLike
): CashFlowImmutableField[] {
  return CASH_FLOW_IMMUTABLE_FIELDS.filter(
    (field) => normalizeImmutableFieldValue(before, field) !== normalizeImmutableFieldValue(after, field)
  );
}

export function hasCashFlowImmutableFieldChanges(before: CashFlowLike, after: CashFlowLike): boolean {
  return getCashFlowImmutableFieldChanges(before, after).length > 0;
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

function toAmount(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getTransactionReferenceDate(transaction: CashFlowLike): Date | null {
  return parseIsoDate(transaction.due_date)
    ?? parseIsoDate(transaction.paid_at)
    ?? parseIsoDate(transaction.created_at);
}

export function isTransactionInMonth(
  transaction: CashFlowLike,
  monthIndex: number,
  year: number
): boolean {
  const date = getTransactionReferenceDate(transaction);
  return !!date && date.getMonth() === monthIndex && date.getFullYear() === year;
}

export function isOverdueTransaction(
  transaction: CashFlowLike,
  referenceDate: Date = new Date()
): boolean {
  if (transaction.status !== "pending") return false;
  const dueDate = parseIsoDate(transaction.due_date);
  if (!dueDate) return false;
  return startOfLocalDay(dueDate).getTime() < startOfLocalDay(referenceDate).getTime();
}

export function getOverdueTransactions<T extends CashFlowLike>(
  transactions: T[],
  referenceDate: Date = new Date()
): T[] {
  return transactions.filter((transaction) => isOverdueTransaction(transaction, referenceDate));
}

export function summarizeCashFlow(
  transactions: CashFlowLike[],
  referenceDate: Date = new Date()
): CashFlowSummary {
  return transactions.reduce<CashFlowSummary>((summary, transaction) => {
    const amount = toAmount(transaction.amount);
    const origin = getCashFlowOrigin(transaction);
    const isIncome = transaction.type === "income";
    const isExpense = transaction.type === "expense";
    const isConfirmed = transaction.status === "confirmed";
    const isPending = transaction.status === "pending";
    const isCancelled = transaction.status === "cancelled";
    const isOverdue = isOverdueTransaction(transaction, referenceDate);

    if (isIncome && isConfirmed) {
      summary.receivedTotal += amount;
      if (origin === "package") summary.packageReceivedTotal += amount;
      else if (origin === "session") summary.sessionReceivedTotal += amount;
      else summary.otherReceivedTotal += amount;
    }

    if (isIncome && isPending) {
      summary.pendingTotal += amount;
      summary.pendingCount += 1;
      if (origin === "package") {
        summary.packagePendingTotal += amount;
        summary.packagePendingCount += 1;
      } else if (origin === "session") {
        summary.sessionPendingTotal += amount;
        summary.sessionPendingCount += 1;
      }
    }

    if (isCancelled) {
      summary.cancelledTotal += amount;
      summary.cancelledCount += 1;
    }

    if (isOverdue) {
      summary.overdueTotal += amount;
      summary.overdueCount += 1;
    }

    if (isExpense && isConfirmed) {
      summary.expensesTotal += amount;
      summary.expensesCount += 1;
    }

    summary.balanceTotal = summary.receivedTotal - summary.expensesTotal;
    return summary;
  }, {
    receivedTotal: 0,
    pendingTotal: 0,
    cancelledTotal: 0,
    overdueTotal: 0,
    expensesTotal: 0,
    balanceTotal: 0,
    packageReceivedTotal: 0,
    packagePendingTotal: 0,
    sessionReceivedTotal: 0,
    sessionPendingTotal: 0,
    otherReceivedTotal: 0,
    pendingCount: 0,
    overdueCount: 0,
    packagePendingCount: 0,
    sessionPendingCount: 0,
    expensesCount: 0,
    cancelledCount: 0,
  });
}

export function groupPendingByPatient(transactions: CashFlowLike[]): PendingPatientGroup[] {
  const groups = new Map<string, PendingPatientGroup>();

  transactions.forEach((transaction) => {
    if (transaction.status !== "pending" || transaction.type !== "income") return;
    const patientId = transaction.patient?.id || transaction.patient_id || null;
    const key = patientId || "unlinked";
    const existing = groups.get(key) ?? {
      patientId,
      patientName: transaction.patient?.full_name || "Paciente não vinculado",
      total: 0,
      count: 0,
    };

    existing.total += toAmount(transaction.amount);
    existing.count += 1;
    groups.set(key, existing);
  });

  return Array.from(groups.values()).sort((a, b) => b.total - a.total);
}
