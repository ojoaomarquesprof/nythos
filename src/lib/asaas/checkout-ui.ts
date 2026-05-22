import type { NythosBillingCycle } from "./nythos-billing";

export type BillingPlanOptionKey = "trial" | "pro-monthly" | "pro-yearly" | "clinic";

export type NythosCheckoutRequestBody = {
  plan: "pro";
  billingCycle: NythosBillingCycle;
  billingDocument?: string;
};

export type NythosCheckoutUiResponse = {
  success?: boolean;
  checkoutEnabled?: boolean;
  code?: string;
  status?: string;
  billingCycle?: NythosBillingCycle;
  planLabel?: string;
  message?: string;
  paymentUrl?: string | null;
  nextDueDate?: string;
  error?: string;
};

export function buildCheckoutRequestBody(
  optionKey: BillingPlanOptionKey,
  billingDocument?: string
): NythosCheckoutRequestBody | null {
  if (optionKey === "pro-monthly") {
    return {
      plan: "pro",
      billingCycle: "monthly",
      ...(billingDocument ? { billingDocument } : {}),
    };
  }

  if (optionKey === "pro-yearly") {
    return {
      plan: "pro",
      billingCycle: "yearly",
      ...(billingDocument ? { billingDocument } : {}),
    };
  }

  return null;
}

export function getClinicCheckoutMessage(): string {
  return "Para planos Clinic, fale com a equipe Nythos para condicoes personalizadas.";
}

export function getCheckoutFailureMessage(response: NythosCheckoutUiResponse): string {
  return response.message
    || response.error
    || "Nao foi possivel iniciar o checkout agora. Tente novamente em instantes.";
}
