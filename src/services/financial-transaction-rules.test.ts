import { describe, expect, it } from "vitest";
import {
  canCancelCashFlow,
  canConfirmCashFlowPayment,
  deriveSessionPackagePaymentStatusFromCashFlow,
  getCashFlowCategoryLabel,
  getCashFlowOriginLabel,
  getCashFlowStatusLabel,
  isManualPaymentMethod,
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
});
