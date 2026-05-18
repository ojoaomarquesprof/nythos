import { describe, expect, it } from "vitest";
import {
  SESSION_PACKAGE_PAYMENT_STATUS_LABELS,
  SESSION_PACKAGE_STATUS_LABELS,
  calculateRemainingPackageSessions,
  calculateSessionPackageReservableSessions,
  calculateSessionPackageReservedSessions,
  calculateSessionPackageUnitAmount,
  calculateSessionPackageUsagePercent,
  canSetPackageTotalSessions,
  formatSessionPackageBalance,
  getPackageCreditConsumptionDecision,
  getPackageCreditReversalDecision,
  getSessionPackageScheduleBlockReason,
  getSessionPackagePaymentStatusLabel,
  getSessionPackageStatusLabel,
  isSessionPackageExpired,
  isManageableSessionPackageStatus,
  shouldCountCashFlowAsActiveSessionBilling,
  shouldCountPackageUsageAsActive,
  shouldCountSessionAsPackageReservation,
  shouldCreateSessionBilling,
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

  it("counts non-cancelled package sessions as reservations until they have active usage", () => {
    const sessions = [
      { id: "scheduled-1", status: "scheduled" },
      { id: "completed-1", status: "completed" },
      { id: "missed-1", status: "missed" },
      { id: "cancelled-1", status: "cancelled" },
      { id: "completed-used", status: "completed" },
    ];

    expect(shouldCountSessionAsPackageReservation("scheduled")).toBe(true);
    expect(shouldCountSessionAsPackageReservation("completed")).toBe(true);
    expect(shouldCountSessionAsPackageReservation("missed")).toBe(true);
    expect(shouldCountSessionAsPackageReservation("cancelled")).toBe(false);
    expect(calculateSessionPackageReservedSessions(sessions, ["completed-used"])).toBe(3);
  });

  it("counts only pending and confirmed cash_flow rows as active session billing", () => {
    expect(shouldCountCashFlowAsActiveSessionBilling("pending")).toBe(true);
    expect(shouldCountCashFlowAsActiveSessionBilling("confirmed")).toBe(true);
    expect(shouldCountCashFlowAsActiveSessionBilling("cancelled")).toBe(false);
    expect(shouldCountCashFlowAsActiveSessionBilling(null)).toBe(false);
  });

  it("creates session billing only for unpaid single sessions without active billing", () => {
    expect(shouldCreateSessionBilling({
      billingMode: "single",
      amount: 180,
      hasActiveBillingForSession: false,
    })).toBe(true);

    expect(shouldCreateSessionBilling({
      billingMode: "single",
      amount: 180,
      hasActiveBillingForSession: shouldCountCashFlowAsActiveSessionBilling("pending"),
    })).toBe(false);

    expect(shouldCreateSessionBilling({
      billingMode: "single",
      amount: 180,
      hasActiveBillingForSession: shouldCountCashFlowAsActiveSessionBilling("confirmed"),
    })).toBe(false);

    expect(shouldCreateSessionBilling({
      billingMode: "single",
      amount: 180,
      hasActiveBillingForSession: shouldCountCashFlowAsActiveSessionBilling("cancelled"),
    })).toBe(true);

    expect(shouldCreateSessionBilling({
      billingMode: "free",
      amount: 180,
      hasActiveBillingForSession: false,
    })).toBe(false);
  });

  it("counts only active package usages as consumed credits", () => {
    expect(shouldCountPackageUsageAsActive("active")).toBe(true);
    expect(shouldCountPackageUsageAsActive("reversed")).toBe(false);
    expect(shouldCountPackageUsageAsActive("kept")).toBe(false);
    expect(shouldCountPackageUsageAsActive(undefined)).toBe(false);
  });

  it("calculates package reservable balance from used and reserved sessions", () => {
    expect(calculateSessionPackageReservableSessions(4, 1, 2)).toBe(1);
    expect(calculateSessionPackageReservableSessions(4, 3, 3)).toBe(0);
  });

  it("decides package credit consumption idempotently", () => {
    expect(getPackageCreditConsumptionDecision({
      totalSessions: 4,
      usedSessions: 1,
      hasActiveUsageForSession: false,
    })).toEqual({ canComplete: true, shouldCreateUsage: true });

    expect(getPackageCreditConsumptionDecision({
      totalSessions: 4,
      usedSessions: 4,
      hasActiveUsageForSession: false,
    })).toEqual({
      canComplete: false,
      shouldCreateUsage: false,
      reason: "package_without_balance",
    });

    expect(getPackageCreditConsumptionDecision({
      totalSessions: 4,
      usedSessions: 4,
      hasActiveUsageForSession: true,
    })).toEqual({
      canComplete: true,
      shouldCreateUsage: false,
      reason: "already_consumed",
    });
  });

  it("decides package credit reversal idempotently", () => {
    expect(getPackageCreditReversalDecision({
      hasActiveUsageForSession: true,
    })).toEqual({ canReverse: true, shouldReverseUsage: true });

    expect(getPackageCreditReversalDecision({
      hasActiveUsageForSession: false,
      hasReversedUsageForSession: true,
    })).toEqual({
      canReverse: true,
      shouldReverseUsage: false,
      reason: "already_reversed",
    });

    expect(getPackageCreditReversalDecision({
      hasActiveUsageForSession: false,
    })).toEqual({
      canReverse: true,
      shouldReverseUsage: false,
      reason: "usage_not_found",
    });
  });

  it("validates whether a package can be reserved for scheduling", () => {
    expect(isSessionPackageExpired("2026-05-17", "2026-05-18")).toBe(true);
    expect(isSessionPackageExpired("2026-05-18", "2026-05-18")).toBe(false);
    expect(isSessionPackageExpired(null, "2026-05-18")).toBe(false);

    expect(getSessionPackageScheduleBlockReason({
      status: "paused",
      paymentStatus: "paid",
      allowUseBeforePayment: true,
      referenceDate: "2026-05-18",
      reservableSessions: 1,
    })).toBe("package_not_active");

    expect(getSessionPackageScheduleBlockReason({
      status: "active",
      paymentStatus: "pending",
      allowUseBeforePayment: false,
      referenceDate: "2026-05-18",
      reservableSessions: 1,
    })).toBe("package_payment_blocked");

    expect(getSessionPackageScheduleBlockReason({
      status: "active",
      paymentStatus: "paid",
      allowUseBeforePayment: true,
      expiresAt: "2026-05-17",
      referenceDate: "2026-05-18",
      reservableSessions: 1,
    })).toBe("package_expired");

    expect(getSessionPackageScheduleBlockReason({
      status: "active",
      paymentStatus: "paid",
      allowUseBeforePayment: true,
      referenceDate: "2026-05-18",
      reservableSessions: 2,
      requestedSessions: 3,
    })).toBe("package_without_balance");

    expect(getSessionPackageScheduleBlockReason({
      status: "active",
      paymentStatus: "pending",
      allowUseBeforePayment: true,
      referenceDate: "2026-05-18",
      reservableSessions: 2,
      requestedSessions: 2,
    })).toBeNull();
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
