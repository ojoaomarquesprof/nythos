import { describe, expect, it } from "vitest";
import {
  buildCheckoutRequestBody,
  getCheckoutFailureMessage,
  getClinicCheckoutMessage,
} from "./checkout-ui";

describe("billing checkout UI helpers", () => {
  it("builds the monthly checkout API payload", () => {
    expect(buildCheckoutRequestBody("pro-monthly", "12345678901")).toEqual({
      plan: "pro",
      billingCycle: "monthly",
      billingDocument: "12345678901",
    });
  });

  it("builds the yearly checkout API payload", () => {
    expect(buildCheckoutRequestBody("pro-yearly")).toEqual({
      plan: "pro",
      billingCycle: "yearly",
    });
  });

  it("does not build checkout payloads for trial or Clinic", () => {
    expect(buildCheckoutRequestBody("trial")).toBeNull();
    expect(buildCheckoutRequestBody("clinic")).toBeNull();
    expect(getClinicCheckoutMessage()).toBe("Para planos Clinic, fale com a equipe Nythos para condicoes personalizadas.");
  });

  it("normalizes safe checkout failure messages", () => {
    expect(getCheckoutFailureMessage({
      success: false,
      code: "checkout_disabled",
      message: "O pagamento online ainda nao esta disponivel para esta conta. Seu plano nao foi alterado.",
    })).toBe("O pagamento online ainda nao esta disponivel para esta conta. Seu plano nao foi alterado.");

    expect(getCheckoutFailureMessage({})).toBe(
      "Nao foi possivel iniciar o checkout agora. Tente novamente em instantes."
    );
  });
});
