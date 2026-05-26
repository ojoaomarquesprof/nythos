import type {
  NythosBillingCycle,
  StripeCheckoutFailureCode,
  StripeCheckoutMode,
  StripePortalFailureCode,
} from "./nythos-billing";
import { ONLINE_PAYMENT_STANDBY_MESSAGE } from "../billing/payment-standby";

export type BillingPlanOptionKey = "trial" | "pro-monthly" | "pro-yearly" | "clinic";

export type NythosCheckoutRequestBody = {
  plan: "pro";
  billingCycle: NythosBillingCycle;
  checkoutMode?: StripeCheckoutMode;
};

export type NythosCheckoutUiResponse = {
  success?: boolean;
  code?: StripeCheckoutFailureCode;
  checkoutMode?: StripeCheckoutMode;
  clientSecret?: string | null;
  checkoutUrl?: string | null;
  billingCycle?: NythosBillingCycle;
  planLabel?: string;
  message?: string;
  error?: string;
};

export type NythosPortalUiResponse = {
  success?: boolean;
  code?: StripePortalFailureCode;
  url?: string;
  message?: string;
  error?: string;
};

export function buildCheckoutRequestBody(
  optionKey: BillingPlanOptionKey,
  checkoutMode: StripeCheckoutMode = "embedded"
): NythosCheckoutRequestBody | null {
  if (optionKey === "pro-monthly") {
    return {
      plan: "pro",
      billingCycle: "monthly",
      checkoutMode,
    };
  }

  if (optionKey === "pro-yearly") {
    return {
      plan: "pro",
      billingCycle: "yearly",
      checkoutMode,
    };
  }

  return null;
}

export function getClinicCheckoutMessage(): string {
  return "Para planos Clinic, fale com a equipe Nythos.";
}

export function getCheckoutFailureMessage(response: NythosCheckoutUiResponse): string {
  return response.message
    || response.error
    || ONLINE_PAYMENT_STANDBY_MESSAGE;
}

export function getPortalFailureMessage(response: NythosPortalUiResponse): string {
  return response.message
    || response.error
    || ONLINE_PAYMENT_STANDBY_MESSAGE;
}
