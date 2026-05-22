import { describe, expect, it } from "vitest";
import {
  AsaasApiError,
  assertNoPublicAsaasSecrets,
  buildAsaasCustomerPayload,
  assertSandboxCheckoutConfig,
  buildAsaasSubscriptionPayload,
  buildAsaasWebhookDecision,
  buildSafeCheckoutApiResponse,
  canActorStartPlatformCheckout,
  createNythosProAsaasCheckout,
  DEFAULT_ASAAS_SANDBOX_BASE_URL,
  getAsaasConfig,
  getPublicAsaasEnvNames,
  parseNythosCheckoutRequest,
  pickSafeAsaasPaymentUrl,
  resolveNythosProCheckout,
  sanitizeAsaasError,
  type AccountSubscriptionForAsaas,
} from "./nythos-billing";

function baseSubscription(overrides: Partial<AccountSubscriptionForAsaas> = {}): AccountSubscriptionForAsaas {
  return {
    owner_user_id: "owner-1",
    plan_id: "professional",
    status: "trialing",
    trial_ends_at: "2026-06-05T12:00:00.000Z",
    current_period_started_at: null,
    current_period_ends_at: null,
    provider: null,
    provider_customer_id: null,
    provider_subscription_id: null,
    metadata: {},
    ...overrides,
  };
}

describe("Nythos Asaas billing helpers", () => {
  it("uses safe defaults when Asaas env vars are absent", () => {
    expect(getAsaasConfig({})).toMatchObject({
      apiKey: null,
      baseUrl: DEFAULT_ASAAS_SANDBOX_BASE_URL,
      checkoutEnabled: false,
      environment: "sandbox",
      webhookToken: null,
    });
  });

  it("enables sandbox checkout only with explicit flag and sandbox base URL", () => {
    const config = getAsaasConfig({
      ASAAS_CHECKOUT_ENABLED: "true",
      ASAAS_ENVIRONMENT: "sandbox",
      ASAAS_BASE_URL: `${DEFAULT_ASAAS_SANDBOX_BASE_URL}/`,
      ASAAS_API_KEY: "sandbox-key",
      ASAAS_WEBHOOK_TOKEN: "webhook-token",
    });

    expect(config).toMatchObject({
      apiKey: "sandbox-key",
      baseUrl: DEFAULT_ASAAS_SANDBOX_BASE_URL,
      checkoutEnabled: true,
      environment: "sandbox",
      webhookToken: "webhook-token",
    });
    expect(() => assertSandboxCheckoutConfig(config)).not.toThrow();
  });

  it("blocks Asaas env vars with NEXT_PUBLIC prefix", () => {
    const env = {
      NEXT_PUBLIC_ASAAS_API_KEY: "secret",
      ASAAS_API_KEY: "server-secret",
    };

    expect(getPublicAsaasEnvNames(env)).toEqual(["NEXT_PUBLIC_ASAAS_API_KEY"]);
    expect(() => assertNoPublicAsaasSecrets(env)).toThrow("Variaveis Asaas nao podem usar prefixo NEXT_PUBLIC_.");
    expect(() => getAsaasConfig(env)).toThrow("Variaveis Asaas nao podem usar prefixo NEXT_PUBLIC_.");
  });

  it("maps Nythos PRO monthly and yearly values server-side", () => {
    const monthly = resolveNythosProCheckout("monthly");
    const yearly = resolveNythosProCheckout("yearly");

    expect(monthly.amount).toBe(89);
    expect(monthly.providerCycle).toBe("MONTHLY");
    expect(yearly.amount).toBe(899);
    expect(yearly.providerCycle).toBe("YEARLY");

    expect(buildAsaasSubscriptionPayload({
      customerId: "cus_123",
      checkout: monthly,
      ownerUserId: "owner-1",
      nextDueDate: "2026-06-05",
    })).toMatchObject({
      customer: "cus_123",
      billingType: "UNDEFINED",
      value: 89,
      cycle: "MONTHLY",
    });
  });

  it("accepts only pro monthly/yearly and rejects client-side prices", () => {
    expect(parseNythosCheckoutRequest({ plan: "pro", billingCycle: "monthly" })).toEqual({
      plan: "pro",
      billingCycle: "monthly",
    });
    expect(parseNythosCheckoutRequest({
      plan: "pro",
      billingCycle: "yearly",
      billingDocument: "123.456.789-01",
    })).toEqual({
      plan: "pro",
      billingCycle: "yearly",
      billingDocument: "12345678901",
    });

    expect(() => parseNythosCheckoutRequest({ plan: "clinic", billingCycle: "monthly" }))
      .toThrow("Pagamento online disponivel apenas para Nythos PRO.");
    expect(() => parseNythosCheckoutRequest({ plan: "free", billingCycle: "monthly" }))
      .toThrow("Pagamento online disponivel apenas para Nythos PRO.");
    expect(() => parseNythosCheckoutRequest({ plan: "legacy", billingCycle: "monthly" }))
      .toThrow("Pagamento online disponivel apenas para Nythos PRO.");
    expect(() => parseNythosCheckoutRequest({ plan: "pro", billingCycle: "monthly", amount: 1 }))
      .toThrow("O pagamento da plataforma calcula plano e preco no servidor.");
    expect(() => parseNythosCheckoutRequest({
      plan: "pro",
      billingCycle: "monthly",
      billingDocument: "123",
    })).toThrow("Informe um CPF com 11 digitos ou CNPJ com 14 digitos.");
  });

  it("builds Asaas customers with normalized CPF or CNPJ only when present", () => {
    expect(buildAsaasCustomerPayload({
      id: "owner-1",
      full_name: "Owner",
      email: "owner@example.com",
      cpf: "123.456.789-01",
    }, "owner-1")).toMatchObject({
      name: "Owner",
      cpfCnpj: "12345678901",
      email: "owner@example.com",
    });

    expect(buildAsaasCustomerPayload({
      id: "owner-1",
      full_name: "Owner",
      cpf: "12.345.678/0001-90",
    }, "owner-1")).toMatchObject({
      cpfCnpj: "12345678000190",
    });

    expect(() => buildAsaasCustomerPayload({
      id: "owner-1",
      full_name: "Owner",
      cpf: null,
    }, "owner-1")).toThrow("Informe seu CPF ou CNPJ para continuar.");
  });

  it("allows only account owners to start platform checkout", () => {
    expect(canActorStartPlatformCheckout({ role: "therapist", employer_id: null })).toBe(true);
    expect(canActorStartPlatformCheckout({ role: "admin", employer_id: null })).toBe(true);
    expect(canActorStartPlatformCheckout({ role: "secretary", employer_id: null })).toBe(false);
    expect(canActorStartPlatformCheckout({ role: "therapist", employer_id: "owner-1" })).toBe(false);
  });

  it("keeps checkout disabled without calling Asaas or the subscription store", async () => {
    let asaasCalls = 0;
    let storeCalls = 0;

    const result = await createNythosProAsaasCheckout({
      ownerUserId: "owner-1",
      profile: {
        id: "owner-1",
        full_name: "Owner",
        email: "owner@example.com",
        cpf: null,
      },
      checkout: resolveNythosProCheckout("monthly"),
      config: {
        apiKey: null,
        baseUrl: "https://api-sandbox.asaas.com/v3",
        checkoutEnabled: false,
        environment: "sandbox",
        webhookToken: null,
      },
      asaasClient: {
        async createCustomer() {
          asaasCalls += 1;
          throw new Error("should not call Asaas");
        },
        async createSubscription() {
          asaasCalls += 1;
          throw new Error("should not call Asaas");
        },
        async listSubscriptionPayments() {
          asaasCalls += 1;
          throw new Error("should not call Asaas");
        },
      },
      store: {
        async getOrCreateSubscription() {
          storeCalls += 1;
          return baseSubscription();
        },
        async updateSubscription() {
          storeCalls += 1;
          return baseSubscription();
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      checkoutEnabled: false,
      code: "checkout_disabled",
    });
    expect(asaasCalls).toBe(0);
    expect(storeCalls).toBe(0);
  });

  it("creates a sandbox subscription and returns only safe UI fields", async () => {
    let customerCalls = 0;
    let subscriptionCalls = 0;
    let currentSubscription = baseSubscription({
      status: "legacy",
      trial_ends_at: null,
    });

    const result = await createNythosProAsaasCheckout({
      ownerUserId: "owner-1",
      profile: {
        id: "owner-1",
        full_name: "Owner",
        email: "owner@example.com",
        cpf: "12345678901",
      },
      checkout: resolveNythosProCheckout("yearly"),
      config: {
        apiKey: "sandbox-key",
        baseUrl: DEFAULT_ASAAS_SANDBOX_BASE_URL,
        checkoutEnabled: true,
        environment: "sandbox",
        webhookToken: "webhook-token",
      },
      asaasClient: {
        async createCustomer() {
          customerCalls += 1;
          return { id: "cus_123" };
        },
        async createSubscription() {
          subscriptionCalls += 1;
          return { id: "sub_123" };
        },
        async listSubscriptionPayments() {
          return [{
            id: "pay_123",
            status: "PENDING",
            invoiceUrl: "https://sandbox.asaas.com/i/pay_123",
          }];
        },
      },
      store: {
        async getOrCreateSubscription() {
          return currentSubscription;
        },
        async updateSubscription(_ownerUserId, patch) {
          currentSubscription = {
            ...currentSubscription,
            ...patch,
          };
          return currentSubscription;
        },
      },
      now: new Date("2026-05-22T12:00:00.000Z"),
    });

    expect(customerCalls).toBe(1);
    expect(subscriptionCalls).toBe(1);
    expect(result).toMatchObject({
      ok: true,
      billingCycle: "yearly",
      code: "subscription_created",
      paymentUrl: "https://sandbox.asaas.com/i/pay_123",
      reusedProviderSubscription: false,
    });
    expect(currentSubscription).toMatchObject({
      provider: "asaas",
      provider_customer_id: "cus_123",
      provider_subscription_id: "sub_123",
      plan_id: "professional",
      status: "past_due",
    });

    const safeResponse = buildSafeCheckoutApiResponse(result);
    expect(safeResponse).toMatchObject({
      success: true,
      checkoutEnabled: true,
      billingCycle: "yearly",
      planLabel: "Nythos PRO",
      paymentUrl: "https://sandbox.asaas.com/i/pay_123",
    });
    expect(JSON.stringify(safeResponse)).not.toContain("cus_123");
    expect(JSON.stringify(safeResponse)).not.toContain("sub_123");
    expect(JSON.stringify(safeResponse)).not.toContain("provider");
  });

  it("reuses an existing subscription for repeated clicks in the same cycle", async () => {
    let customerCalls = 0;
    let subscriptionCalls = 0;
    const result = await createNythosProAsaasCheckout({
      ownerUserId: "owner-1",
      profile: {
        id: "owner-1",
        full_name: "Owner",
        email: "owner@example.com",
        cpf: "12345678901",
      },
      checkout: resolveNythosProCheckout("monthly"),
      config: {
        apiKey: "sandbox-key",
        baseUrl: DEFAULT_ASAAS_SANDBOX_BASE_URL,
        checkoutEnabled: true,
        environment: "sandbox",
        webhookToken: "webhook-token",
      },
      asaasClient: {
        async createCustomer() {
          customerCalls += 1;
          return { id: "cus_123" };
        },
        async createSubscription() {
          subscriptionCalls += 1;
          return { id: "sub_456" };
        },
        async listSubscriptionPayments() {
          return [{
            invoiceUrl: "https://sandbox.asaas.com/i/pay_456",
          }];
        },
      },
      store: {
        async getOrCreateSubscription() {
          return baseSubscription({
            provider: "asaas",
            provider_customer_id: "cus_123",
            provider_subscription_id: "sub_123",
            metadata: {
              nythos_billing_cycle: "monthly",
            },
          });
        },
        async updateSubscription() {
          throw new Error("should not update subscription");
        },
      },
    });

    expect(customerCalls).toBe(0);
    expect(subscriptionCalls).toBe(0);
    expect(result).toMatchObject({
      ok: true,
      code: "subscription_already_processing",
      billingCycle: "monthly",
      paymentUrl: "https://sandbox.asaas.com/i/pay_456",
      reusedProviderSubscription: true,
    });
  });

  it("blocks billing cycle changes while upgrade/downgrade is not implemented", async () => {
    await expect(createNythosProAsaasCheckout({
      ownerUserId: "owner-1",
      profile: {
        id: "owner-1",
        full_name: "Owner",
        email: "owner@example.com",
        cpf: "12345678901",
      },
      checkout: resolveNythosProCheckout("yearly"),
      config: {
        apiKey: "sandbox-key",
        baseUrl: DEFAULT_ASAAS_SANDBOX_BASE_URL,
        checkoutEnabled: true,
        environment: "sandbox",
        webhookToken: "webhook-token",
      },
      asaasClient: {
        async createCustomer() {
          throw new Error("should not call Asaas");
        },
        async createSubscription() {
          throw new Error("should not call Asaas");
        },
        async listSubscriptionPayments() {
          throw new Error("should not call Asaas");
        },
      },
      store: {
        async getOrCreateSubscription() {
          return baseSubscription({
            provider: "asaas",
            provider_customer_id: "cus_123",
            provider_subscription_id: "sub_123",
            metadata: {
              nythos_billing_cycle: "monthly",
            },
          });
        },
        async updateSubscription() {
          throw new Error("should not update subscription");
        },
      },
    })).rejects.toThrow("Troca de ciclo sera habilitada em breve.");
  });

  it("returns only safe Asaas payment URLs", () => {
    expect(pickSafeAsaasPaymentUrl({
      invoiceUrl: "https://sandbox.asaas.com/i/pay_123",
    })).toBe("https://sandbox.asaas.com/i/pay_123");

    expect(pickSafeAsaasPaymentUrl({
      invoiceUrl: "https://example.com/phishing",
      bankSlipUrl: "https://www.asaas.com/b/pdf/pay_123",
    })).toBe("https://www.asaas.com/b/pdf/pay_123");

    expect(pickSafeAsaasPaymentUrl({
      paymentUrl: "javascript:alert(1)",
    })).toBeNull();
  });

  it("blocks production configuration for this phase", () => {
    const config = getAsaasConfig({
      ASAAS_CHECKOUT_ENABLED: "true",
      ASAAS_ENVIRONMENT: "production",
      ASAAS_API_KEY: "secret",
    });

    expect(() => assertSandboxCheckoutConfig(config)).toThrow("Pagamento online indisponivel para esta conta no momento.");
  });

  it("sanitizes Asaas errors before logging", () => {
    const sanitized = sanitizeAsaasError(
      new AsaasApiError(400, {
        errors: [
          {
            code: "invalid",
            description: "Falha com access_token=SECRET_VALUE",
          },
        ],
      })
    );

    const serialized = JSON.stringify(sanitized);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("SECRET_VALUE");
  });

  it("ignores unknown webhook events and maps known payment events idempotently", () => {
    expect(buildAsaasWebhookDecision({
      event: "PAYMENT_CREATED",
      payment: { id: "pay_1", subscription: "sub_1" },
    })).toMatchObject({
      action: "ignore",
      reason: "unmapped_event",
    });

    const now = new Date("2026-05-22T12:00:00.000Z");
    const receivedPayload = {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1", subscription: "sub_1", status: "RECEIVED" },
    };

    const firstDecision = buildAsaasWebhookDecision(receivedPayload, now);
    const secondDecision = buildAsaasWebhookDecision(receivedPayload, now);

    expect(firstDecision).toEqual(secondDecision);
    expect(firstDecision).toMatchObject({
      action: "update_subscription",
      event: "PAYMENT_RECEIVED",
      providerSubscriptionId: "sub_1",
      status: "active",
      metadata: {
        provider: "asaas",
        last_asaas_event: "PAYMENT_RECEIVED",
        last_asaas_event_at: "2026-05-22T12:00:00.000Z",
        last_asaas_payment_id: "pay_1",
        last_asaas_payment_status: "RECEIVED",
      },
    });

    expect(buildAsaasWebhookDecision({
      event: "PAYMENT_OVERDUE",
      payment: { id: "pay_2", subscription: "sub_1", status: "OVERDUE" },
    }, now)).toMatchObject({
      action: "update_subscription",
      status: "past_due",
    });
  });
});
