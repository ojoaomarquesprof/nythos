import { describe, expect, it } from "vitest";
import {
  CASH_FLOW_IMMUTABLE_FIELDS,
  canCancelCashFlow,
  canConfirmCashFlowPayment,
  deriveSessionPackagePaymentStatusFromCashFlow,
  getCashFlowImmutableFieldChanges,
  getOverdueTransactions,
  getCashFlowCategoryLabel,
  getCashFlowOriginLabel,
  getCashFlowStatusLabel,
  groupPendingByPatient,
  hasCashFlowImmutableFieldChanges,
  summarizeCashFlow,
  isManualPaymentMethod,
  isTransactionInMonth,
} from "./financial-transaction-rules";

describe("financial transaction rules", () => {
  it("keeps cash flow status labels friendly", () => {
    expect(getCashFlowStatusLabel("pending")).toBe("Pendente");
    expect(getCashFlowStatusLabel("confirmed")).toBe("Pago");
    expect(getCashFlowStatusLabel("cancelled")).toBe("Cancelado");
    expect(getCashFlowStatusLabel("unknown")).toBe("Status desconhecido");
  });

  it("allows manual payment only for pending income", () => {
    expect(canConfirmCashFlowPayment({ status: "pending", type: "income" })).toBe(true);
    expect(canConfirmCashFlowPayment({ status: "confirmed", type: "income" })).toBe(false);
    expect(canConfirmCashFlowPayment({ status: "cancelled", type: "income" })).toBe(false);
    expect(canConfirmCashFlowPayment({ status: "pending", type: "expense" })).toBe(false);
  });

  it("allows cancelling only pending entries", () => {
    expect(canCancelCashFlow({ status: "pending" })).toBe(true);
    expect(canCancelCashFlow({ status: "confirmed" })).toBe(false);
    expect(canCancelCashFlow({ status: "cancelled" })).toBe(false);
  });

  it("detects immutable cash flow field changes without blocking transition metadata", () => {
    const before = {
      user_id: "user-1",
      session_id: "session-1",
      package_id: null,
      patient_id: "patient-1",
      type: "income",
      category: "session",
      amount: "100.00",
      guardian_id: null,
      status: "pending",
      paid_at: null,
      payment_method: null,
    };

    expect(hasCashFlowImmutableFieldChanges(before, {
      ...before,
      amount: 100,
      status: "confirmed",
      paid_at: "2026-05-19T12:00:00Z",
      payment_method: "pix",
    })).toBe(false);

    expect(getCashFlowImmutableFieldChanges(before, {
      ...before,
      user_id: "user-2",
      session_id: "session-2",
      package_id: "package-1",
      patient_id: "patient-2",
      type: "expense",
      category: "rent",
      amount: 120,
      guardian_id: "guardian-1",
    })).toEqual([...CASH_FLOW_IMMUTABLE_FIELDS]);
  });

  it("derives package payment status from cash flow status", () => {
    expect(deriveSessionPackagePaymentStatusFromCashFlow("pending")).toBe("pending");
    expect(deriveSessionPackagePaymentStatusFromCashFlow("confirmed")).toBe("paid");
    expect(deriveSessionPackagePaymentStatusFromCashFlow("cancelled")).toBe("cancelled");
    expect(deriveSessionPackagePaymentStatusFromCashFlow(null)).toBe("pending");
  });

  it("keeps category and origin labels friendly", () => {
    expect(getCashFlowCategoryLabel("package")).toBe("Pacote");
    expect(getCashFlowCategoryLabel("session")).toBe("Sessão");
    expect(getCashFlowCategoryLabel("other_income")).toBe("Outra receita");
    expect(getCashFlowCategoryLabel("unknown")).toBe("Outra");

    expect(getCashFlowOriginLabel({ category: "session" })).toBe("Sessão avulsa");
    expect(getCashFlowOriginLabel({ category: "package" })).toBe("Pacote de sessões");
    expect(getCashFlowOriginLabel({ type: "expense" })).toBe("Despesa");
    expect(getCashFlowOriginLabel({ type: "income", category: "other_income" })).toBe("Outro");
  });

  it("validates supported manual payment methods", () => {
    expect(isManualPaymentMethod("pix")).toBe(true);
    expect(isManualPaymentMethod("cash")).toBe(true);
    expect(isManualPaymentMethod("boleto")).toBe(false);
  });

  it("summarizes received, pending, overdue and expenses without counting cancelled as active money", () => {
    const summary = summarizeCashFlow([
      {
        type: "income",
        status: "confirmed",
        category: "session",
        session_id: "session-1",
        amount: 200,
        paid_at: "2026-05-18T12:00:00Z",
      },
      {
        type: "income",
        status: "pending",
        category: "package",
        package_id: "package-1",
        amount: 800,
        due_date: "2026-05-10",
      },
      {
        type: "income",
        status: "pending",
        category: "session",
        session_id: "session-2",
        amount: 180,
        due_date: "2026-05-25",
      },
      {
        type: "expense",
        status: "confirmed",
        category: "rent",
        amount: 120,
        paid_at: "2026-05-02T12:00:00Z",
      },
      {
        type: "income",
        status: "cancelled",
        category: "session",
        session_id: "session-3",
        amount: 300,
        due_date: "2026-05-01",
      },
    ], new Date("2026-05-19T12:00:00Z"));

    expect(summary.receivedTotal).toBe(200);
    expect(summary.pendingTotal).toBe(980);
    expect(summary.overdueTotal).toBe(800);
    expect(summary.expensesTotal).toBe(120);
    expect(summary.balanceTotal).toBe(80);
    expect(summary.cancelledTotal).toBe(300);
    expect(summary.packagePendingTotal).toBe(800);
    expect(summary.sessionPendingTotal).toBe(180);
    expect(summary.sessionReceivedTotal).toBe(200);
    expect(summary.packagePendingCount).toBe(1);
    expect(summary.sessionPendingCount).toBe(1);
  });

  it("finds overdue transactions by pending status and due date before the reference day", () => {
    const transactions = [
      { id: "overdue", status: "pending", due_date: "2026-05-18", amount: 100 },
      { id: "today", status: "pending", due_date: "2026-05-19", amount: 100 },
      { id: "paid-old", status: "confirmed", due_date: "2026-05-01", amount: 100 },
      { id: "no-due", status: "pending", due_date: null, amount: 100 },
    ];

    expect(getOverdueTransactions(transactions, new Date("2026-05-19T12:00:00Z")).map((item) => item.id))
      .toEqual(["overdue"]);
  });

  it("groups pending income by patient for compact debt reporting", () => {
    const groups = groupPendingByPatient([
      {
        type: "income",
        status: "pending",
        amount: 400,
        patient_id: "patient-a",
        patient: { id: "patient-a", full_name: "Ana" },
      },
      {
        type: "income",
        status: "pending",
        amount: 150,
        patient_id: "patient-b",
        patient: { id: "patient-b", full_name: "Bruno" },
      },
      {
        type: "income",
        status: "pending",
        amount: 250,
        patient_id: "patient-a",
        patient: { id: "patient-a", full_name: "Ana" },
      },
      {
        type: "income",
        status: "confirmed",
        amount: 900,
        patient_id: "patient-a",
        patient: { id: "patient-a", full_name: "Ana" },
      },
    ]);

    expect(groups).toEqual([
      { patientId: "patient-a", patientName: "Ana", total: 650, count: 2 },
      { patientId: "patient-b", patientName: "Bruno", total: 150, count: 1 },
    ]);
  });

  it("filters transactions by the reference month used by the UI", () => {
    expect(isTransactionInMonth({ due_date: "2026-05-19" }, 4, 2026)).toBe(true);
    expect(isTransactionInMonth({ paid_at: "2026-06-01T12:00:00Z" }, 4, 2026)).toBe(false);
  });
});
