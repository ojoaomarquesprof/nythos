import { describe, expect, it } from "vitest";
import {
  SESSION_PACKAGE_PAYMENT_STATUS_LABELS,
  SESSION_PACKAGE_STATUS_LABELS,
  calculateRemainingPackageSessions,
  calculateSessionPackageUnitAmount,
  canSetPackageTotalSessions,
  isManageableSessionPackageStatus,
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

  it("blocks reducing total sessions below active usage", () => {
    expect(canSetPackageTotalSessions(4, 3)).toBe(true);
    expect(canSetPackageTotalSessions(3, 3)).toBe(true);
    expect(canSetPackageTotalSessions(2, 3)).toBe(false);
  });

  it("keeps package status labels friendly", () => {
    expect(SESSION_PACKAGE_STATUS_LABELS.active).toBe("Ativo");
    expect(SESSION_PACKAGE_STATUS_LABELS.paused).toBe("Pausado");
    expect(SESSION_PACKAGE_STATUS_LABELS.cancelled).toBe("Cancelado");
    expect(SESSION_PACKAGE_PAYMENT_STATUS_LABELS.pending).toBe("Pendente");
  });

  it("allows only lifecycle statuses handled by management actions", () => {
    expect(isManageableSessionPackageStatus("active")).toBe(true);
    expect(isManageableSessionPackageStatus("paused")).toBe(true);
    expect(isManageableSessionPackageStatus("cancelled")).toBe(true);
    expect(isManageableSessionPackageStatus("completed")).toBe(false);
  });
});
