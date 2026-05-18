import type { SessionPackageManageStatus, SessionPackagePaymentStatus, SessionPackageStatus } from "@/types/database";

export const SESSION_PACKAGE_STATUS_LABELS: Record<SessionPackageStatus, string> = {
  active: "Ativo",
  paused: "Pausado",
  completed: "Concluido",
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

export function calculateSessionPackageUnitAmount(totalAmount: number, totalSessions: number): number {
  if (!Number.isFinite(totalAmount) || !Number.isInteger(totalSessions) || totalSessions <= 0) {
    throw new Error("invalid_package_totals");
  }

  return Math.round((totalAmount / totalSessions) * 100) / 100;
}

export function calculateRemainingPackageSessions(totalSessions: number, usedSessions: number): number {
  if (!Number.isInteger(totalSessions) || !Number.isInteger(usedSessions)) {
    throw new Error("invalid_package_sessions");
  }

  return Math.max(totalSessions - usedSessions, 0);
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
