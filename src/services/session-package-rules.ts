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
