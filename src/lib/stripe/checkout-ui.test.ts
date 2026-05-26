import { describe, expect, it } from "vitest";
import {
  buildCheckoutRequestBody,
  getCheckoutFailureMessage,
  getClinicCheckoutMessage,
  getPortalFailureMessage,
} from "./checkout-ui";
import { ONLINE_PAYMENT_STANDBY_MESSAGE } from "../billing/payment-standby";

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
      message: ONLINE_PAYMENT_STANDBY_MESSAGE,
    })).toBe(ONLINE_PAYMENT_STANDBY_MESSAGE);

    expect(getCheckoutFailureMessage({})).toBe(ONLINE_PAYMENT_STANDBY_MESSAGE);
    expect(getPortalFailureMessage({
      success: false,
      code: "stripe_customer_missing",
      message: "Assine o Nythos PRO para gerenciar sua assinatura.",
    })).toBe("Assine o Nythos PRO para gerenciar sua assinatura.");
    expect(getPortalFailureMessage({})).toBe(ONLINE_PAYMENT_STANDBY_MESSAGE);
  });
});
