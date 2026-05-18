import type { SessionPackageManageStatus, SessionPackagePaymentStatus, SessionPackageStatus } from "@/types/database";

export const SESSION_PACKAGE_STATUS_LABELS: Record<SessionPackageStatus, string> = {
  active: "Ativo",
  paused: "Pausado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export const SESSION_PACKAGE_PAYMENT_STATUS_LABELS: Record<SessionPackagePaymentStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  partial: "Parcial",
  cancelled: "Cancelado",
};

export const MANAGEABLE_SESSION_PACKAGE_STATUSES: readonly SessionPackageManageStatus[] = [
  "active",
  "paused",
  "cancelled",
];

export type PackageReservableSession = {
  id: string | null | undefined;
  status: string | null | undefined;
};

export type SessionBillingStatus = "pending" | "confirmed" | "cancelled";
export type SessionPackageUsageStatus = "active" | "reversed" | "kept";

export type SessionPackageScheduleBlockReason =
  | "package_not_active"
  | "package_expired"
  | "package_payment_blocked"
  | "package_without_balance";

export type PackageCreditConsumptionDecision =
  | { canComplete: true; shouldCreateUsage: true }
  | { canComplete: true; shouldCreateUsage: false; reason: "already_consumed" }
  | { canComplete: false; shouldCreateUsage: false; reason: "package_without_balance" };

export type PackageCreditReversalDecision =
  | { canReverse: true; shouldReverseUsage: true }
  | { canReverse: true; shouldReverseUsage: false; reason: "already_reversed" | "usage_not_found" };

export const SESSION_PACKAGE_SCHEDULE_BLOCK_MESSAGES: Record<SessionPackageScheduleBlockReason, string> = {
  package_not_active: "Este pacote não está ativo.",
  package_expired: "Este pacote está vencido.",
  package_payment_blocked: "Este pacote precisa estar pago antes de ser usado.",
  package_without_balance: "Este pacote não possui saldo disponível.",
};

export function calculateSessionPackageUnitAmount(totalAmount: number, totalSessions: number): number {
  if (!Number.isFinite(totalAmount) || !Number.isInteger(totalSessions) || totalSessions <= 0) {
    throw new Error("invalid_package_totals");
  }

  return Math.round((totalAmount / totalSessions) * 100) / 100;
}

export function calculateSessionPackageUsagePercent(totalSessions: number, usedSessions: number): number {
  if (!Number.isInteger(totalSessions) || !Number.isInteger(usedSessions) || totalSessions <= 0) {
    return 0;
  }

  const percent = Math.round((Math.max(usedSessions, 0) / totalSessions) * 100);
  return Math.min(Math.max(percent, 0), 100);
}

export function calculateRemainingPackageSessions(totalSessions: number, usedSessions: number): number {
  if (!Number.isInteger(totalSessions) || !Number.isInteger(usedSessions)) {
    throw new Error("invalid_package_sessions");
  }

  return Math.max(totalSessions - usedSessions, 0);
}

export function shouldCountSessionAsPackageReservation(status: string | null | undefined): boolean {
  return status !== "cancelled";
}

export function shouldCountCashFlowAsActiveSessionBilling(
  status: string | null | undefined
): status is Exclude<SessionBillingStatus, "cancelled"> {
  return status === "pending" || status === "confirmed";
}

export function shouldCountPackageUsageAsActive(
  status: string | null | undefined
): status is Extract<SessionPackageUsageStatus, "active"> {
  return status === "active";
}

export function shouldCreateSessionBilling(input: {
  billingMode: string | null | undefined;
  amount: number;
  hasActiveBillingForSession: boolean;
}): boolean {
  if (input.billingMode !== "single") return false;
  if (input.hasActiveBillingForSession) return false;
  return Number.isFinite(input.amount) && input.amount > 0;
}

export function calculateSessionPackageReservedSessions(
  packageSessions: PackageReservableSession[],
  activeUsageSessionIds: Iterable<string | null | undefined> = []
): number {
  const usedSessionIds = new Set(
    Array.from(activeUsageSessionIds).filter((id): id is string => Boolean(id))
  );

  return packageSessions.reduce((total, session) => {
    if (!session.id || usedSessionIds.has(session.id)) return total;
    if (!shouldCountSessionAsPackageReservation(session.status)) return total;
    return total + 1;
  }, 0);
}

export function calculateSessionPackageReservableSessions(
  totalSessions: number,
  usedSessions: number,
  reservedSessions: number
): number {
  if (
    !Number.isInteger(totalSessions)
    || !Number.isInteger(usedSessions)
    || !Number.isInteger(reservedSessions)
  ) {
    throw new Error("invalid_package_sessions");
  }

  return Math.max(totalSessions - Math.max(usedSessions, 0) - Math.max(reservedSessions, 0), 0);
}

export function getPackageCreditConsumptionDecision(input: {
  totalSessions: number;
  usedSessions: number;
  hasActiveUsageForSession: boolean;
}): PackageCreditConsumptionDecision {
  if (!Number.isInteger(input.totalSessions) || !Number.isInteger(input.usedSessions)) {
    throw new Error("invalid_package_sessions");
  }

  if (input.hasActiveUsageForSession) {
    return { canComplete: true, shouldCreateUsage: false, reason: "already_consumed" };
  }

  if (input.usedSessions >= input.totalSessions) {
    return { canComplete: false, shouldCreateUsage: false, reason: "package_without_balance" };
  }

  return { canComplete: true, shouldCreateUsage: true };
}

export function getPackageCreditReversalDecision(input: {
  hasActiveUsageForSession: boolean;
  hasReversedUsageForSession?: boolean;
}): PackageCreditReversalDecision {
  if (input.hasActiveUsageForSession) {
    return { canReverse: true, shouldReverseUsage: true };
  }

  if (input.hasReversedUsageForSession) {
    return { canReverse: true, shouldReverseUsage: false, reason: "already_reversed" };
  }

  return { canReverse: true, shouldReverseUsage: false, reason: "usage_not_found" };
}

export function isSessionPackageExpired(
  expiresAt: string | null | undefined,
  referenceDate: string
): boolean {
  if (!expiresAt) return false;
  return expiresAt < referenceDate;
}

export function getSessionPackageScheduleBlockReason(input: {
  status: string | null | undefined;
  paymentStatus: string | null | undefined;
  allowUseBeforePayment: boolean | null | undefined;
  expiresAt?: string | null;
  referenceDate: string;
  reservableSessions: number;
  requestedSessions?: number;
}): SessionPackageScheduleBlockReason | null {
  if (input.status !== "active") return "package_not_active";
  if (isSessionPackageExpired(input.expiresAt, input.referenceDate)) return "package_expired";
  if (input.paymentStatus !== "paid" && input.allowUseBeforePayment === false) {
    return "package_payment_blocked";
  }
  if (input.reservableSessions < Math.max(input.requestedSessions ?? 1, 1)) {
    return "package_without_balance";
  }

  return null;
}

export function formatSessionPackageBalance(totalSessions: number, usedSessions: number): string {
  const remaining = calculateRemainingPackageSessions(totalSessions, usedSessions);
  const usedLabel = usedSessions === 1 ? "usada" : "usadas";
  const remainingLabel = remaining === 1 ? "restante" : "restantes";
  return `${usedSessions} ${usedLabel} · ${remaining} ${remainingLabel}`;
}

export function getSessionPackageStatusLabel(status: string | null | undefined): string {
  return SESSION_PACKAGE_STATUS_LABELS[status as SessionPackageStatus] ?? "Status desconhecido";
}

export function getSessionPackagePaymentStatusLabel(status: string | null | undefined): string {
  return SESSION_PACKAGE_PAYMENT_STATUS_LABELS[status as SessionPackagePaymentStatus] ?? "Status desconhecido";
}

export function canSetPackageTotalSessions(totalSessions: number, usedSessions: number): boolean {
  if (!Number.isInteger(totalSessions) || !Number.isInteger(usedSessions)) {
    return false;
  }

  return totalSessions > 0 && totalSessions >= usedSessions;
}

export function isManageableSessionPackageStatus(status: string): status is SessionPackageManageStatus {
  return MANAGEABLE_SESSION_PACKAGE_STATUSES.includes(status as SessionPackageManageStatus);
}

export function validateSessionPackageBasics(input: {
  name: string;
  totalSessions: number;
  totalAmount: number;
  startDate?: string | null;
  expiresAt?: string | null;
}): string | null {
  if (!input.name.trim()) return "Informe um nome para o pacote.";
  if (!Number.isInteger(input.totalSessions) || input.totalSessions <= 0) {
    return "A quantidade de sessões deve ser maior que zero.";
  }
  if (!Number.isFinite(input.totalAmount) || input.totalAmount <= 0) {
    return "O valor total do pacote deve ser maior que zero.";
  }
  if (input.startDate && input.expiresAt && input.expiresAt < input.startDate) {
    return "A validade não pode ser anterior ao início.";
  }

  return null;
}
