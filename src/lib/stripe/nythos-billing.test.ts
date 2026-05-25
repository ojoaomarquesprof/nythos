import { createHmac } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  assertNoPublicStripeSecrets,
  assertTestCheckoutConfig,
  buildSafeCheckoutApiResponse,
  buildSafeCheckoutFailureResponse,
  buildSafePortalApiResponse,
  buildStripeCheckoutSessionParams,
  buildStripePortalReturnUrl,
  buildStripePortalSessionParams,
  buildStripeWebhookDecision,
  canActorStartPlatformCheckout,
  createNythosStripePortalSession,
  createNythosProStripeCheckout,
  enrichStripeWebhookDecisionWithSubscription,
  getPublicStripeSecretEnvNames,
  getSafeCheckoutFailureCode,
  getStripeConfig,
  hasProcessedStripeEvent,
  mergeStripeWebhookMetadata,
  parseNythosCheckoutRequest,
  resolveNythosProCheckout,
  sanitizeStripeError,
  StripeApiError,
  verifyStripeWebhookSignature,
  type AccountSubscriptionForStripe,
  type NythosProCheckout,
  type StripeClient,
  type StripeConfig,
} from "./nythos-billing";

const enabledConfig: StripeConfig = {
  secretKey: "sk_test_123",
  webhookSecret: "whsec_123",
  checkoutEnabled: true,
  environment: "test",
  priceProMonthly: "price_monthly_123",
  priceProYearly: "price_yearly_123",
  apiBaseUrl: "https://api.stripe.com/v1",
};

const monthlyCheckout: NythosProCheckout = {
  plan: "pro",
  planId: "professional",
  billingCycle: "monthly",
  amount: 89,
  description: "Nythos PRO mensal",
  priceId: "price_monthly_123",
};

const routeUrls = {
  returnUrl: "http://localhost:3000/dashboard/settings/billing?checkout=return&session_id={CHECKOUT_SESSION_ID}",
  successUrl: "http://localhost:3000/dashboard/settings/billing?checkout=success",
  cancelUrl: "http://localhost:3000/dashboard/settings/billing?checkout=cancelled",
};

function baseSubscription(overrides: Partial<AccountSubscriptionForStripe> = {}): AccountSubscriptionForStripe {
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

function signStripePayload(payload: string, secret: string, now: Date): string {
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function noOpStripeClient(): StripeClient {
  return {
    async createCustomer() {
      throw new Error("should not create customer");
    },
    async createCheckoutSession() {
      throw new Error("should not create checkout");
    },
    async createPortalSession() {
      throw new Error("should not create portal");
    },
    async retrieveSubscription() {
      throw new Error("should not retrieve subscription");
    },
  };
}

describe("Nythos Stripe billing helpers", () => {
  it("uses safe disabled defaults and blocks public Stripe secrets", () => {
    expect(getStripeConfig({})).toMatchObject({
      secretKey: null,
      webhookSecret: null,
      checkoutEnabled: false,
      environment: "test",
      priceProMonthly: null,
      priceProYearly: null,
    });

    const env = {
      NEXT_PUBLIC_STRIPE_SECRET_KEY: "sk_test_secret",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_public",
    };

    expect(getPublicStripeSecretEnvNames(env)).toEqual(["NEXT_PUBLIC_STRIPE_SECRET_KEY"]);
    expect(() => assertNoPublicStripeSecrets(env)).toThrow(
      "Variaveis secretas Stripe nao podem usar prefixo NEXT_PUBLIC_."
    );
  });

  it("blocks live mode and live secret keys in this phase", () => {
    expect(() => assertTestCheckoutConfig({
      ...enabledConfig,
      environment: "live",
    })).toThrow("Pagamento online indisponivel para esta conta no momento.");

    expect(() => assertTestCheckoutConfig({
      ...enabledConfig,
      secretKey: "sk_live_123",
    })).toThrow("Pagamento online indisponivel para esta conta no momento.");
  });

  it("accepts only PRO monthly/yearly and rejects unsafe client-side checkout fields", () => {
    expect(parseNythosCheckoutRequest({ plan: "pro", billingCycle: "monthly" })).toEqual({
      plan: "pro",
      billingCycle: "monthly",
      checkoutMode: "embedded",
    });
    expect(parseNythosCheckoutRequest({ plan: "pro", billingCycle: "yearly", checkoutMode: "hosted" })).toEqual({
      plan: "pro",
      billingCycle: "yearly",
      checkoutMode: "hosted",
    });

    expect(() => parseNythosCheckoutRequest({ plan: "clinic", billingCycle: "monthly" }))
      .toThrow("Pagamento online disponivel apenas para Nythos PRO.");
    expect(() => parseNythosCheckoutRequest({ plan: "trial", billingCycle: "monthly" }))
      .toThrow("Pagamento online disponivel apenas para Nythos PRO.");
    expect(() => parseNythosCheckoutRequest({ plan: "pro", billingCycle: "weekly" }))
      .toThrow("Ciclo de cobranca invalido para Nythos PRO.");
    expect(() => parseNythosCheckoutRequest({ plan: "pro", billingCycle: "monthly", checkoutMode: "other" }))
      .toThrow("Modo de checkout invalido para Nythos PRO.");
    expect(() => parseNythosCheckoutRequest({ plan: "pro", billingCycle: "monthly", priceId: "price_bad" }))
      .toThrow("O pagamento da plataforma calcula plano e preco no servidor.");
    expect(() => parseNythosCheckoutRequest({ plan: "pro", billingCycle: "monthly", provider: "asaas" }))
      .toThrow("O pagamento da plataforma calcula plano e preco no servidor.");
  });

  it("uses the server-side Stripe Price IDs for each PRO cycle", () => {
    expect(resolveNythosProCheckout("monthly", enabledConfig)).toMatchObject({
      amount: 89,
      priceId: "price_monthly_123",
      billingCycle: "monthly",
    });
    expect(resolveNythosProCheckout("yearly", enabledConfig)).toMatchObject({
      amount: 899,
      priceId: "price_yearly_123",
      billingCycle: "yearly",
    });
  });

  it("builds separated Stripe params for embedded and hosted Checkout Sessions", () => {
    const embeddedParams = buildStripeCheckoutSessionParams({
      checkout: monthlyCheckout,
      checkoutMode: "embedded",
      customerId: "cus_123",
      ownerUserId: "owner-1",
      ...routeUrls,
    });

    expect(embeddedParams.get("ui_mode")).toBe("embedded_page");
    expect(embeddedParams.get("return_url")).toContain("{CHECKOUT_SESSION_ID}");
    expect(embeddedParams.has("success_url")).toBe(false);
    expect(embeddedParams.has("cancel_url")).toBe(false);
    expect(embeddedParams.get("line_items[0][price]")).toBe("price_monthly_123");
    expect(embeddedParams.get("metadata[stripe_checkout_mode]")).toBe("embedded");

    const hostedParams = buildStripeCheckoutSessionParams({
      checkout: monthlyCheckout,
      checkoutMode: "hosted",
      customerId: "cus_123",
      ownerUserId: "owner-1",
      ...routeUrls,
    });

    expect(hostedParams.has("ui_mode")).toBe(false);
    expect(hostedParams.has("return_url")).toBe(false);
    expect(hostedParams.get("success_url")).toContain("checkout=success");
    expect(hostedParams.get("cancel_url")).toContain("checkout=cancelled");
    expect(hostedParams.get("metadata[stripe_checkout_mode]")).toBe("hosted");
  });

  it("returns safe checkout failure codes without leaking provider identifiers", () => {
    expect(getSafeCheckoutFailureCode("missing_stripe_price_id")).toBe("stripe_price_not_configured");
    expect(getSafeCheckoutFailureCode("stripe_api_error", "embedded")).toBe("stripe_embedded_session_failed");
    expect(getSafeCheckoutFailureCode("stripe_api_error", "hosted")).toBe("stripe_hosted_session_failed");
    expect(getSafeCheckoutFailureCode("billing_cycle_change_not_supported")).toBe("subscription_cycle_change_blocked");

    const response = buildSafeCheckoutFailureResponse(
      "Nao foi possivel iniciar o checkout agora. Tente novamente em instantes.",
      "yearly",
      "stripe_embedded_session_failed"
    );

    expect(response).toEqual({
      success: false,
      code: "stripe_embedded_session_failed",
      message: "Nao foi possivel iniciar o checkout agora. Tente novamente em instantes.",
      billingCycle: "yearly",
      planLabel: "Nythos PRO",
    });
    expect(JSON.stringify(response)).not.toContain("provider_customer_id");
    expect(JSON.stringify(response)).not.toContain("provider_subscription_id");
  });

  it("builds safe Stripe portal params and return URLs", () => {
    const params = buildStripePortalSessionParams({
      customerId: "cus_123",
      returnUrl: "http://localhost:3000/dashboard/settings/billing?portal=returned",
    });

    expect(params.get("customer")).toBe("cus_123");
    expect(params.get("return_url")).toContain("/dashboard/settings/billing?portal=returned");
    expect(buildStripePortalReturnUrl("http://localhost:3000/api/stripe/portal"))
      .toBe("http://localhost:3000/dashboard/settings/billing?portal=returned");
    expect(buildStripePortalReturnUrl(
      "http://localhost:3000/api/stripe/portal",
      "/dashboard/settings/billing?tab=planos"
    )).toBe("http://localhost:3000/dashboard/settings/billing?tab=planos&portal=returned");
    expect(() => buildStripePortalReturnUrl(
      "http://localhost:3000/api/stripe/portal",
      "https://evil.example/phish"
    )).toThrow("Nao foi possivel abrir o gerenciamento de assinatura agora.");
    expect(() => buildStripePortalReturnUrl(
      "http://localhost:3000/api/stripe/portal",
      "/admin"
    )).toThrow("Nao foi possivel abrir o gerenciamento de assinatura agora.");
  });

  it("creates a portal session for an owner with a Stripe customer and returns only a safe URL", async () => {
    let portalCalls = 0;
    const result = await createNythosStripePortalSession({
      profile: { role: "therapist", employer_id: null },
      subscription: baseSubscription({
        provider: "stripe",
        provider_customer_id: "cus_123",
        provider_subscription_id: "sub_123",
      }),
      config: enabledConfig,
      returnUrl: "http://localhost:3000/dashboard/settings/billing?portal=returned",
      stripeClient: {
        async createCustomer() {
          throw new Error("not used");
        },
        async createCheckoutSession() {
          throw new Error("not used");
        },
        async createPortalSession({ customerId, returnUrl }) {
          portalCalls += 1;
          expect(customerId).toBe("cus_123");
          expect(returnUrl).toContain("portal=returned");
          return {
            id: "bps_123",
            url: "https://billing.stripe.com/p/session/test_123",
            customer: customerId,
            return_url: returnUrl,
          };
        },
        async retrieveSubscription() {
          throw new Error("not used");
        },
      },
    });

    expect(portalCalls).toBe(1);
    const response = buildSafePortalApiResponse(result);
    expect(response).toEqual({
      success: true,
      url: "https://billing.stripe.com/p/session/test_123",
      message: "Redirecionando para o gerenciamento seguro de assinatura.",
    });
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("cus_123");
    expect(serialized).not.toContain("sub_123");
    expect(serialized).not.toContain("sk_test_123");
  });

  it("blocks portal for team members, missing customers, legacy providers, and live mode", async () => {
    const stripeCustomerSubscription = baseSubscription({
      provider: "stripe",
      provider_customer_id: "cus_123",
    });
    const common = {
      config: enabledConfig,
      stripeClient: noOpStripeClient(),
      returnUrl: "http://localhost:3000/dashboard/settings/billing?portal=returned",
    };

    await expect(createNythosStripePortalSession({
      ...common,
      profile: { role: "secretary", employer_id: null },
      subscription: stripeCustomerSubscription,
    })).resolves.toMatchObject({
      ok: false,
      code: "not_owner",
    });

    await expect(createNythosStripePortalSession({
      ...common,
      profile: { role: "therapist", employer_id: "owner-1" },
      subscription: stripeCustomerSubscription,
    })).resolves.toMatchObject({
      ok: false,
      code: "not_owner",
    });

    await expect(createNythosStripePortalSession({
      ...common,
      profile: { role: "therapist", employer_id: null },
      subscription: baseSubscription({ provider: "stripe", provider_customer_id: null }),
    })).resolves.toMatchObject({
      ok: false,
      code: "stripe_customer_missing",
    });

    await expect(createNythosStripePortalSession({
      ...common,
      profile: { role: "therapist", employer_id: null },
      subscription: baseSubscription({ provider: "asaas", provider_customer_id: "cus_legacy" }),
    })).resolves.toMatchObject({
      ok: false,
      code: "legacy_provider",
    });

    await expect(createNythosStripePortalSession({
      ...common,
      profile: { role: "therapist", employer_id: null },
      subscription: stripeCustomerSubscription,
      config: { ...enabledConfig, environment: "live" },
    })).rejects.toThrow("Pagamento online indisponivel para esta conta no momento.");
  });

  it("sanitizes Stripe portal errors before logging", () => {
    const sanitized = sanitizeStripeError(
      new StripeApiError(400, {
        error: {
          type: "invalid_request_error",
          code: "resource_missing",
          message: "No such customer: cus_123",
        },
      })
    );

    const serialized = JSON.stringify(sanitized);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("cus_123");
  });

  it("allows only account owners to start platform checkout", () => {
    expect(canActorStartPlatformCheckout({ role: "therapist", employer_id: null })).toBe(true);
    expect(canActorStartPlatformCheckout({ role: "admin", employer_id: null })).toBe(true);
    expect(canActorStartPlatformCheckout({ role: "secretary", employer_id: null })).toBe(false);
    expect(canActorStartPlatformCheckout({ role: "therapist", employer_id: "owner-1" })).toBe(false);
  });

  it("keeps checkout disabled without calling Stripe or the subscription store", async () => {
    let stripeCalls = 0;
    let storeCalls = 0;

    const result = await createNythosProStripeCheckout({
      ownerUserId: "owner-1",
      profile: { id: "owner-1", full_name: "Owner", email: "owner@example.com" },
      checkout: monthlyCheckout,
      config: { ...enabledConfig, checkoutEnabled: false },
      checkoutMode: "embedded",
      stripeClient: {
        async createCustomer() {
          stripeCalls += 1;
          throw new Error("should not call Stripe");
        },
        async createCheckoutSession() {
          stripeCalls += 1;
          throw new Error("should not call Stripe");
        },
        async createPortalSession() {
          stripeCalls += 1;
          throw new Error("should not call Stripe");
        },
        async retrieveSubscription() {
          stripeCalls += 1;
          throw new Error("should not call Stripe");
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
      ...routeUrls,
    });

    expect(result).toMatchObject({
      ok: false,
      checkoutEnabled: false,
    });
    expect(stripeCalls).toBe(0);
    expect(storeCalls).toBe(0);
  });

  it("creates an embedded monthly Checkout Session and returns a safe client secret", async () => {
    let currentSubscription = baseSubscription({ status: "trialing" });
    let customerCalls = 0;
    let checkoutCalls = 0;

    const stripeClient: StripeClient = {
      async createCustomer() {
        customerCalls += 1;
        return { id: "cus_123" };
      },
      async createCheckoutSession({ checkout, checkoutMode, returnUrl }) {
        checkoutCalls += 1;
        expect(checkout.priceId).toBe("price_monthly_123");
        expect(checkoutMode).toBe("embedded");
        expect(returnUrl).toContain("{CHECKOUT_SESSION_ID}");
        return {
          id: "cs_test_123",
          client_secret: "cs_test_123_secret_abc",
          url: null,
          expires_at: 1_800_000_000,
        };
      },
      async createPortalSession() {
        throw new Error("not used");
      },
      async retrieveSubscription() {
        throw new Error("not used");
      },
    };

    const result = await createNythosProStripeCheckout({
      ownerUserId: "owner-1",
      profile: { id: "owner-1", full_name: "Owner", email: "owner@example.com" },
      checkout: monthlyCheckout,
      checkoutMode: "embedded",
      config: enabledConfig,
      stripeClient,
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
      ...routeUrls,
      now: new Date("2026-05-22T12:00:00.000Z"),
    });

    expect(customerCalls).toBe(1);
    expect(checkoutCalls).toBe(1);
    expect(currentSubscription).toMatchObject({
      provider: "stripe",
      provider_customer_id: "cus_123",
      provider_subscription_id: null,
      status: "trialing",
    });
    expect(currentSubscription.metadata).toMatchObject({
      provider: "stripe",
      stripe_checkout_status: "pending",
      stripe_checkout_mode: "embedded",
      stripe_checkout_session_id: "cs_test_123",
      stripe_checkout_client_secret: "cs_test_123_secret_abc",
      nythos_billing_cycle: "monthly",
    });

    const safeResponse = buildSafeCheckoutApiResponse(result);
    expect(safeResponse).toMatchObject({
      success: true,
      checkoutMode: "embedded",
      clientSecret: "cs_test_123_secret_abc",
      checkoutUrl: null,
      billingCycle: "monthly",
      planLabel: "Nythos PRO",
    });
    const serialized = JSON.stringify(safeResponse);
    expect(serialized).not.toContain("cus_123");
    expect(serialized).not.toContain("sub_123");
    expect(serialized).not.toContain("sk_test_123");
    expect(serialized).not.toContain("whsec_123");
    expect(serialized).not.toContain("provider");
  });

  it("creates an embedded yearly Checkout Session and returns a client secret", async () => {
    let currentSubscription = baseSubscription({ status: "trialing" });
    const yearlyCheckout = resolveNythosProCheckout("yearly", enabledConfig);

    const result = await createNythosProStripeCheckout({
      ownerUserId: "owner-1",
      profile: { id: "owner-1", full_name: "Owner", email: "owner@example.com" },
      checkout: yearlyCheckout,
      checkoutMode: "embedded",
      config: enabledConfig,
      stripeClient: {
        async createCustomer() {
          return { id: "cus_yearly" };
        },
        async createCheckoutSession({ checkout }) {
          expect(checkout.priceId).toBe("price_yearly_123");
          return {
            id: "cs_test_yearly",
            client_secret: "cs_test_yearly_secret_abc",
            url: null,
            expires_at: 1_800_000_000,
          };
        },
        async createPortalSession() {
          throw new Error("not used");
        },
        async retrieveSubscription() {
          throw new Error("not used");
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
      ...routeUrls,
      now: new Date("2026-05-22T12:00:00.000Z"),
    });

    expect(buildSafeCheckoutApiResponse(result)).toMatchObject({
      success: true,
      checkoutMode: "embedded",
      clientSecret: "cs_test_yearly_secret_abc",
      billingCycle: "yearly",
    });
  });

  it("keeps hosted Checkout available as a fallback", async () => {
    let currentSubscription = baseSubscription({
      provider: "stripe",
      provider_customer_id: "cus_123",
      metadata: {},
    });

    const result = await createNythosProStripeCheckout({
      ownerUserId: "owner-1",
      profile: { id: "owner-1", full_name: "Owner", email: "owner@example.com" },
      checkout: monthlyCheckout,
      checkoutMode: "hosted",
      config: enabledConfig,
      stripeClient: {
        async createCustomer() {
          throw new Error("customer should be reused");
        },
        async createCheckoutSession({ checkoutMode, successUrl, cancelUrl }) {
          expect(checkoutMode).toBe("hosted");
          expect(successUrl).toContain("checkout=success");
          expect(cancelUrl).toContain("checkout=cancelled");
          return {
            id: "cs_test_hosted",
            client_secret: null,
            url: "https://checkout.stripe.com/c/pay/cs_test_hosted",
            expires_at: 1_800_000_000,
          };
        },
        async createPortalSession() {
          throw new Error("not used");
        },
        async retrieveSubscription() {
          throw new Error("not used");
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
      ...routeUrls,
      now: new Date("2026-05-22T12:00:00.000Z"),
    });

    expect(buildSafeCheckoutApiResponse(result)).toMatchObject({
      success: true,
      checkoutMode: "hosted",
      clientSecret: null,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_hosted",
    });
  });

  it("reuses a pending embedded checkout for the same cycle and mode", async () => {
    let stripeCalls = 0;
    const result = await createNythosProStripeCheckout({
      ownerUserId: "owner-1",
      profile: { id: "owner-1", full_name: "Owner", email: "owner@example.com" },
      checkout: monthlyCheckout,
      checkoutMode: "embedded",
      config: enabledConfig,
      stripeClient: {
        async createCustomer() {
          stripeCalls += 1;
          throw new Error("should not create customer");
        },
        async createCheckoutSession() {
          stripeCalls += 1;
          throw new Error("should not create checkout");
        },
        async createPortalSession() {
          stripeCalls += 1;
          throw new Error("should not create portal");
        },
        async retrieveSubscription() {
          stripeCalls += 1;
          throw new Error("should not retrieve subscription");
        },
      },
      store: {
        async getOrCreateSubscription() {
          return baseSubscription({
            provider: "stripe",
            provider_customer_id: "cus_123",
            metadata: {
              nythos_billing_cycle: "monthly",
              stripe_checkout_mode: "embedded",
              stripe_checkout_client_secret: "cs_test_123_secret_reused",
              stripe_checkout_session_expires_at: 1_800_000_000,
            },
          });
        },
        async updateSubscription() {
          throw new Error("should not update subscription");
        },
      },
      ...routeUrls,
      now: new Date("2026-05-22T12:00:00.000Z"),
    });

    expect(stripeCalls).toBe(0);
    expect(result).toMatchObject({
      ok: true,
      checkoutMode: "embedded",
      clientSecret: "cs_test_123_secret_reused",
      reusedCheckoutSession: true,
    });
  });

  it("blocks cycle changes and legacy Asaas provider rows", async () => {
    await expect(createNythosProStripeCheckout({
      ownerUserId: "owner-1",
      profile: { id: "owner-1", full_name: "Owner" },
      checkout: { ...monthlyCheckout, billingCycle: "yearly", priceId: "price_yearly_123", amount: 899 },
      checkoutMode: "embedded",
      config: enabledConfig,
      stripeClient: noOpStripeClient(),
      store: {
        async getOrCreateSubscription() {
          return baseSubscription({
            provider: "stripe",
            provider_customer_id: "cus_123",
            metadata: { nythos_billing_cycle: "monthly" },
          });
        },
        async updateSubscription() {
          throw new Error("should not update subscription");
        },
      },
      ...routeUrls,
    })).rejects.toThrow("Troca de ciclo sera habilitada em breve.");

    await expect(createNythosProStripeCheckout({
      ownerUserId: "owner-1",
      profile: { id: "owner-1", full_name: "Owner" },
      checkout: monthlyCheckout,
      checkoutMode: "embedded",
      config: enabledConfig,
      stripeClient: noOpStripeClient(),
      store: {
        async getOrCreateSubscription() {
          return baseSubscription({
            provider: "asaas",
            provider_customer_id: "cus_asaas",
          });
        },
        async updateSubscription() {
          throw new Error("should not update subscription");
        },
      },
      ...routeUrls,
    })).rejects.toThrow("Esta conta tem billing legado");
  });

  it("validates Stripe webhook signatures with the raw body", () => {
    const now = new Date("2026-05-22T12:00:00.000Z");
    const payload = JSON.stringify({
      id: "evt_123",
      type: "checkout.session.completed",
      created: Math.floor(now.getTime() / 1000),
      data: {
        object: {
          id: "cs_test_123",
          customer: "cus_123",
          subscription: "sub_123",
          metadata: { nythos_billing_cycle: "monthly" },
        },
      },
    });
    const signature = signStripePayload(payload, "whsec_123", now);

    expect(verifyStripeWebhookSignature(payload, signature, "whsec_123", { now })).toMatchObject({
      id: "evt_123",
      type: "checkout.session.completed",
    });
    expect(() => verifyStripeWebhookSignature(payload, signature, "whsec_wrong", { now }))
      .toThrow("Assinatura do webhook Stripe invalida.");
  });

  it("maps Stripe checkout completion, payment failures, and unknown events", () => {
    const checkoutDecision = buildStripeWebhookDecision({
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          customer: "cus_123",
          subscription: "sub_123",
          metadata: { nythos_billing_cycle: "monthly" },
        },
      },
    });

    expect(checkoutDecision).toMatchObject({
      action: "update_subscription",
      providerCustomerId: "cus_123",
      providerSubscriptionId: "sub_123",
      status: "active",
      billingCycle: "monthly",
    });

    const enriched = enrichStripeWebhookDecisionWithSubscription(checkoutDecision, {
      id: "sub_123",
      customer: "cus_123",
      status: "active",
      current_period_start: 1_779_235_200,
      current_period_end: 1_781_827_200,
      cancel_at_period_end: false,
      metadata: { nythos_billing_cycle: "monthly" },
    });

    expect(enriched).toMatchObject({
      action: "update_subscription",
      currentPeriodStartedAt: "2026-05-20T00:00:00.000Z",
      currentPeriodEndsAt: "2026-06-19T00:00:00.000Z",
      status: "active",
    });

    expect(buildStripeWebhookDecision({
      id: "evt_failed",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_123",
          customer: "cus_123",
          subscription: "sub_123",
          status: "open",
        },
      },
    })).toMatchObject({
      action: "update_subscription",
      status: "past_due",
      providerSubscriptionId: "sub_123",
    });

    expect(buildStripeWebhookDecision({
      id: "evt_unknown",
      type: "payment_intent.created",
      data: { object: { id: "pi_123" } },
    })).toMatchObject({
      action: "ignore",
      reason: "unmapped_event",
    });
  });

  it("stores processed Stripe event ids in metadata for idempotent retries", () => {
    const subscription = baseSubscription({
      metadata: {
        stripe_processed_event_ids: ["evt_old"],
      },
    });

    const merged = mergeStripeWebhookMetadata(subscription, {
      provider: "stripe",
      last_stripe_event_id: "evt_new",
    }, "evt_new");

    expect(merged).toMatchObject({
      provider: "stripe",
      last_stripe_event_id: "evt_new",
      stripe_processed_event_ids: ["evt_old", "evt_new"],
    });
    expect(hasProcessedStripeEvent(merged, "evt_new")).toBe(true);
  });

  it("keeps patient finance tables and Asaas out of the active Stripe flow", () => {
    const checkoutRoute = readFileSync(join(process.cwd(), "src/app/api/checkout/route.ts"), "utf8");
    const stripeWebhookRoute = readFileSync(join(process.cwd(), "src/app/api/stripe/webhook/route.ts"), "utf8");
    const stripePortalRoute = readFileSync(join(process.cwd(), "src/app/api/stripe/portal/route.ts"), "utf8");
    const activeFlow = `${checkoutRoute}\n${stripeWebhookRoute}\n${stripePortalRoute}`;

    expect(activeFlow).not.toMatch(/cash_flow|session_packages|receipt|recibo/i);
    expect(checkoutRoute).not.toMatch(/asaas/i);
    expect(stripeWebhookRoute).not.toMatch(/asaas/i);
    expect(stripePortalRoute).not.toMatch(/asaas/i);
  });
});
