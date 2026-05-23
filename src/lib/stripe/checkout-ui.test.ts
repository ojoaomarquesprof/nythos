import { describe, expect, it } from "vitest";
import {
  buildCheckoutRequestBody,
  getCheckoutFailureMessage,
  getClinicCheckoutMessage,
} from "./checkout-ui";

describe("Stripe checkout UI helpers", () => {
  it("builds only the server-safe monthly and yearly checkout payloads", () => {
    expect(buildCheckoutRequestBody("pro-monthly")).toEqual({
      plan: "pro",
      billingCycle: "monthly",
      checkoutMode: "embedded",
    });
    expect(buildCheckoutRequestBody("pro-yearly", "hosted")).toEqual({
      plan: "pro",
      billingCycle: "yearly",
      checkoutMode: "hosted",
    });
  });

  it("does not build checkout payloads for trial or Clinic", () => {
    expect(buildCheckoutRequestBody("trial")).toBeNull();
    expect(buildCheckoutRequestBody("clinic")).toBeNull();
    expect(getClinicCheckoutMessage()).toBe("Para planos Clinic, fale com a equipe Nythos.");
  });

  it("normalizes safe checkout failure messages", () => {
    expect(getCheckoutFailureMessage({
      success: false,
      message: "O pagamento online ainda nao esta disponivel para esta conta. Seu plano nao foi alterado.",
    })).toBe("O pagamento online ainda nao esta disponivel para esta conta. Seu plano nao foi alterado.");

    expect(getCheckoutFailureMessage({})).toBe(
      "Nao foi possivel iniciar o checkout agora. Tente novamente em instantes."
    );
  });
});
