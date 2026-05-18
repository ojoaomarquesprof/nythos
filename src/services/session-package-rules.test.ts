import { describe, expect, it } from "vitest";
import {
  SESSION_PACKAGE_PAYMENT_STATUS_LABELS,
  SESSION_PACKAGE_STATUS_LABELS,
  calculateRemainingPackageSessions,
  calculateSessionPackageUnitAmount,
  calculateSessionPackageUsagePercent,
  canSetPackageTotalSessions,
  formatSessionPackageBalance,
  getSessionPackagePaymentStatusLabel,
  getSessionPackageStatusLabel,
  isManageableSessionPackageStatus,
  validateSessionPackageBasics,
} from "./session-package-rules";

describe("session package rules", () => {
  it("calculates unit amount rounded to cents", () => {
    expect(calculateSessionPackageUnitAmount(1000, 8)).toBe(125);
    expect(calculateSessionPackageUnitAmount(100, 3)).toBe(33.33);
  });

  it("calculates remaining sessions without going below zero", () => {
    expect(calculateRemainingPackageSessions(8, 3)).toBe(5);
    expect(calculateRemainingPackageSessions(4, 9)).toBe(0);
  });

  it("calculates usage percent clamped between zero and one hundred", () => {
    expect(calculateSessionPackageUsagePercent(4, 1)).toBe(25);
    expect(calculateSessionPackageUsagePercent(4, 9)).toBe(100);
    expect(calculateSessionPackageUsagePercent(0, 1)).toBe(0);
  });

  it("formats a compact balance label", () => {
    expect(formatSessionPackageBalance(4, 1)).toBe("1 usada · 3 restantes");
    expect(formatSessionPackageBalance(4, 3)).toBe("3 usadas · 1 restante");
  });

  it("blocks reducing total sessions below active usage", () => {
    expect(canSetPackageTotalSessions(4, 3)).toBe(true);
    expect(canSetPackageTotalSessions(3, 3)).toBe(true);
    expect(canSetPackageTotalSessions(2, 3)).toBe(false);
  });

  it("keeps package status labels friendly", () => {
    expect(SESSION_PACKAGE_STATUS_LABELS.active).toBe("Ativo");
    expect(SESSION_PACKAGE_STATUS_LABELS.paused).toBe("Pausado");
    expect(SESSION_PACKAGE_STATUS_LABELS.completed).toBe("Concluído");
    expect(SESSION_PACKAGE_STATUS_LABELS.cancelled).toBe("Cancelado");
    expect(SESSION_PACKAGE_PAYMENT_STATUS_LABELS.pending).toBe("Pendente");
    expect(getSessionPackageStatusLabel("active")).toBe("Ativo");
    expect(getSessionPackagePaymentStatusLabel("paid")).toBe("Pago");
  });

  it("allows only lifecycle statuses handled by management actions", () => {
    expect(isManageableSessionPackageStatus("active")).toBe(true);
    expect(isManageableSessionPackageStatus("paused")).toBe(true);
    expect(isManageableSessionPackageStatus("cancelled")).toBe(true);
    expect(isManageableSessionPackageStatus("completed")).toBe(false);
  });

  it("validates basic create and edit package input", () => {
    expect(validateSessionPackageBasics({
      name: "Pacote mensal",
      totalSessions: 4,
      totalAmount: 600,
      startDate: "2026-05-18",
      expiresAt: "2026-06-18",
    })).toBeNull();

    expect(validateSessionPackageBasics({
      name: "",
      totalSessions: 4,
      totalAmount: 600,
    })).toBe("Informe um nome para o pacote.");

    expect(validateSessionPackageBasics({
      name: "Pacote",
      totalSessions: 4,
      totalAmount: 600,
      startDate: "2026-06-18",
      expiresAt: "2026-05-18",
    })).toBe("A validade não pode ser anterior ao início.");
  });
});
