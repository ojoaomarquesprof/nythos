import { createHmac, timingSafeEqual } from "crypto";
import { redactSensitiveText } from "../errors/safe-error";
import {
  PLAN_DEFINITIONS,
  type SubscriptionStatus,
} from "../subscription/plan-rules";
import type { Json } from "../../types/database";

export const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";
export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;
export const STRIPE_EMBEDDED_CHECKOUT_UI_MODE = "embedded_page";

export type StripeEnvironment = "test" | "live";
export type NythosCheckoutPlan = "pro";
export type NythosBillingCycle = "monthly" | "yearly";
export type StripeCheckoutMode = "embedded" | "hosted";
export type StripeAccountStatus = Extract<
  SubscriptionStatus,
  "trialing" | "active" | "past_due" | "cancelled" | "expired"
>;

export type StripeConfig = {
  secretKey: string | null;
  webhookSecret: string | null;
  checkoutEnabled: boolean;
  environment: StripeEnvironment;
  priceProMonthly: string | null;
  priceProYearly: string | null;
  apiBaseUrl: string;
};

export type NythosProCheckout = {
  plan: NythosCheckoutPlan;
  planId: "professional";
  billingCycle: NythosBillingCycle;
  amount: number;
  description: string;
  priceId: string;
};

export type OwnerCheckoutProfile = {
  id: string;
  full_name?: string | null;
  clinic_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  employer_id?: string | null;
};

export type AccountSubscriptionForStripe = {
  owner_user_id: string;
  plan_id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_started_at: string | null;
  current_period_ends_at: string | null;
  provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  metadata: Json;
};

export type AccountSubscriptionPatch = Partial<{
  plan_id: string;
  status: StripeAccountStatus;
  trial_ends_at: string | null;
  current_period_started_at: string | null;
  current_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  provider: "stripe";
  provider_customer_id: string;
  provider_subscription_id: string | null;
  metadata: Json;
}>;

export type CheckoutSubscriptionStore = {
  getOrCreateSubscription(ownerUserId: string): Promise<AccountSubscriptionForStripe>;
  updateSubscription(
    ownerUserId: string,
    patch: AccountSubscriptionPatch
  ): Promise<AccountSubscriptionForStripe>;
};

export type StripeCustomer = {
  id: string;
};

export type StripeCheckoutSession = {
  id: string;
  client_secret?: string | null;
  url: string | null;
  customer?: string | null;
  subscription?: string | null;
  expires_at?: number | null;
};

export type StripeCheckoutFailureCode =
  | "stripe_checkout_disabled"
  | "stripe_price_not_configured"
  | "stripe_embedded_session_failed"
  | "stripe_hosted_session_failed"
  | "stripe_invalid_mode"
  | "subscription_cycle_change_blocked"
  | "legacy_provider_requires_manual_migration"
  | "stripe_checkout_failed";

export type StripeSubscription = {
  id: string;
  customer?: string | null;
  status?: string | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean | null;
  metadata?: Record<string, string | null | undefined> | null;
};

export type StripeClient = {
  createCustomer(input: {
    ownerUserId: string;
    profile: OwnerCheckoutProfile;
  }): Promise<StripeCustomer>;
  createCheckoutSession(input: {
    checkout: NythosProCheckout;
    checkoutMode: StripeCheckoutMode;
    customerId: string;
    ownerUserId: string;
    returnUrl: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<StripeCheckoutSession>;
  retrieveSubscription(subscriptionId: string): Promise<StripeSubscription | null>;
};

export type StripeCheckoutResult =
  | {
      ok: false;
      checkoutEnabled: false;
      code: StripeCheckoutFailureCode;
      billingCycle?: NythosBillingCycle;
      message: string;
    }
  | {
      ok: true;
      checkoutEnabled: true;
      planId: "professional";
      billingCycle: NythosBillingCycle;
      planLabel: string;
      checkoutMode: StripeCheckoutMode;
      clientSecret: string | null;
      checkoutUrl: string | null;
      message: string;
      reusedCheckoutSession: boolean;
    };

export type SafeCheckoutApiResponse = {
  success: boolean;
  code?: StripeCheckoutFailureCode;
  checkoutMode?: StripeCheckoutMode;
  clientSecret?: string | null;
  checkoutUrl?: string | null;
  message: string;
  billingCycle?: NythosBillingCycle;
  planLabel?: string;
};

export type StripeEvent = {
  id: string;
  type: string;
  created?: number;
  data: {
    object: Record<string, unknown>;
  };
};

export type StripeWebhookDecision =
  | {
      action: "ignore";
      eventId: string | null;
      eventType: string | null;
      reason: "invalid_event" | "unmapped_event" | "missing_provider_ids";
    }
  | {
      action: "update_subscription";
      eventId: string;
      eventType: string;
      providerCustomerId?: string;
      providerSubscriptionId?: string;
      status: StripeAccountStatus;
      billingCycle?: NythosBillingCycle;
      currentPeriodStartedAt?: string | null;
      currentPeriodEndsAt?: string | null;
      cancelAtPeriodEnd?: boolean;
      metadata: Record<string, Json>;
    };

export class NythosBillingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "NythosBillingError";
  }
}

export class StripeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown
  ) {
    super("Stripe API request failed");
    this.name = "StripeApiError";
  }
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseEnvironment(value: string | undefined): StripeEnvironment {
  return value?.trim().toLowerCase() === "live" ? "live" : "test";
}

function compactRecord<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ) as Partial<T>;
}

function asObject(value: Json): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Json>;
}

function readStringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readObjectField(record: Record<string, unknown>, field: string): Record<string, unknown> | null {
  const value = record[field];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readBooleanField(record: Record<string, unknown>, field: string): boolean | null {
  const value = record[field];
  return typeof value === "boolean" ? value : null;
}

function readNumberField(record: Record<string, unknown>, field: string): number | null {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function epochSecondsToIso(value: number | null): string | null {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

function digitsOnly(value?: string | null): string {
  return value?.replace(/\D/g, "") ?? "";
}

function isSafeStripeCheckoutUrl(value: string | null | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}

function getStoredBillingCycle(metadata: Json): NythosBillingCycle | null {
  const value = asObject(metadata).nythos_billing_cycle;
  return value === "monthly" || value === "yearly" ? value : null;
}

function getStoredCheckoutMode(metadata: Json): StripeCheckoutMode | null {
  const value = asObject(metadata).stripe_checkout_mode;
  return value === "embedded" || value === "hosted" ? value : null;
}

function getStoredCheckoutUrl(metadata: Json): string | null {
  const value = asObject(metadata).stripe_checkout_session_url;
  return typeof value === "string" && isSafeStripeCheckoutUrl(value) ? value : null;
}

function getStoredCheckoutClientSecret(metadata: Json): string | null {
  const value = asObject(metadata).stripe_checkout_client_secret;
  return typeof value === "string" && value.startsWith("cs_") ? value : null;
}

function getStoredCheckoutExpiresAt(metadata: Json): number | null {
  const value = asObject(metadata).stripe_checkout_session_expires_at;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isProcessingSessionReusable(
  subscription: AccountSubscriptionForStripe,
  checkout: NythosProCheckout,
  checkoutMode: StripeCheckoutMode,
  now: Date
): boolean {
  const storedBillingCycle = getStoredBillingCycle(subscription.metadata);
  const storedCheckoutMode = getStoredCheckoutMode(subscription.metadata);
  const checkoutUrl = getStoredCheckoutUrl(subscription.metadata);
  const clientSecret = getStoredCheckoutClientSecret(subscription.metadata);
  const expiresAt = getStoredCheckoutExpiresAt(subscription.metadata);

  return Boolean(
    storedBillingCycle === checkout.billingCycle
    && storedCheckoutMode === checkoutMode
    && (checkoutMode === "embedded" ? clientSecret : checkoutUrl)
    && expiresAt
    && expiresAt * 1000 > now.getTime() + 60_000
  );
}

function hasLegacyProvider(subscription: AccountSubscriptionForStripe): boolean {
  if (subscription.provider && subscription.provider !== "stripe") return true;
  return !subscription.provider && Boolean(
    subscription.provider_customer_id || subscription.provider_subscription_id
  );
}

function getProcessedStripeEventIds(metadata: Json): string[] {
  const value = asObject(metadata).stripe_processed_event_ids;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getCustomerName(profile: OwnerCheckoutProfile): string {
  return profile.clinic_name?.trim() || profile.full_name?.trim() || "Nythos customer";
}

function appendMetadata(params: URLSearchParams, prefix: string, metadata: Record<string, string>): void {
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`${prefix}[${key}]`, value);
  }
}

export function getSafeCheckoutFailureCode(
  code: string,
  checkoutMode?: StripeCheckoutMode
): StripeCheckoutFailureCode {
  if (code === "checkout_disabled") return "stripe_checkout_disabled";
  if (code === "missing_stripe_price_id" || code === "missing_pro_price") return "stripe_price_not_configured";
  if (code === "unsupported_checkout_mode") return "stripe_invalid_mode";
  if (code === "billing_cycle_change_not_supported") return "subscription_cycle_change_blocked";
  if (code === "legacy_provider_requires_manual_migration") return "legacy_provider_requires_manual_migration";
  if (code === "stripe_checkout_without_client_secret") return "stripe_embedded_session_failed";
  if (code === "stripe_checkout_without_url") return "stripe_hosted_session_failed";
  if (code.startsWith("stripe_")) {
    return checkoutMode === "hosted" ? "stripe_hosted_session_failed" : "stripe_embedded_session_failed";
  }
  return "stripe_checkout_failed";
}

function normalizeApiBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function compareHexDigest(expected: string, received: string): boolean {
  try {
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(received, "hex");
    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

export function getPublicStripeSecretEnvNames(env: Record<string, string | undefined> = process.env): string[] {
  return Object.keys(env).filter((key) => (
    /^NEXT_PUBLIC_/i.test(key)
    && /STRIPE/i.test(key)
    && !/^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY$/i.test(key)
  ));
}

export function assertNoPublicStripeSecrets(env: Record<string, string | undefined> = process.env): void {
  const publicNames = getPublicStripeSecretEnvNames(env);
  if (publicNames.length === 0) return;

  throw new NythosBillingError(
    "stripe_public_env_blocked",
    "Variaveis secretas Stripe nao podem usar prefixo NEXT_PUBLIC_.",
    500
  );
}

export function getStripeConfig(env: Record<string, string | undefined> = process.env): StripeConfig {
  assertNoPublicStripeSecrets(env);

  return {
    secretKey: env.STRIPE_SECRET_KEY?.trim() || null,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim() || null,
    checkoutEnabled: parseBoolean(env.STRIPE_CHECKOUT_ENABLED),
    environment: parseEnvironment(env.STRIPE_ENVIRONMENT),
    priceProMonthly: env.STRIPE_PRICE_PRO_MONTHLY?.trim() || null,
    priceProYearly: env.STRIPE_PRICE_PRO_YEARLY?.trim() || null,
    apiBaseUrl: normalizeApiBaseUrl(env.STRIPE_API_BASE_URL?.trim() || STRIPE_API_BASE_URL),
  };
}

export function assertTestCheckoutConfig(config: StripeConfig): void {
  if (!config.checkoutEnabled) return;

  if (config.environment !== "test") {
    throw new NythosBillingError(
      "stripe_live_environment_blocked",
      "Pagamento online indisponivel para esta conta no momento.",
      503
    );
  }

  if (!config.secretKey) {
    throw new NythosBillingError(
      "stripe_missing_secret_key",
      "Pagamento online indisponivel para esta conta no momento.",
      503
    );
  }

  if (!config.secretKey.startsWith("sk_test_")) {
    throw new NythosBillingError(
      "stripe_live_key_blocked",
      "Pagamento online indisponivel para esta conta no momento.",
      503
    );
  }
}

export function assertTestWebhookConfig(config: StripeConfig): void {
  if (config.environment !== "test") {
    throw new NythosBillingError(
      "stripe_live_environment_blocked",
      "Webhook Stripe indisponivel nesta fase.",
      503
    );
  }

  if (config.secretKey && !config.secretKey.startsWith("sk_test_")) {
    throw new NythosBillingError(
      "stripe_live_key_blocked",
      "Webhook Stripe indisponivel nesta fase.",
      503
    );
  }

  if (!config.webhookSecret) {
    throw new NythosBillingError(
      "stripe_missing_webhook_secret",
      "Webhook Stripe nao configurado.",
      503
    );
  }
}

export function parseNythosCheckoutRequest(payload: unknown): {
  plan: NythosCheckoutPlan;
  billingCycle: NythosBillingCycle;
  checkoutMode: StripeCheckoutMode;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new NythosBillingError("invalid_checkout_payload", "Payload de checkout invalido.");
  }

  const record = payload as Record<string, unknown>;
  const allowedKeys = new Set(["plan", "billingCycle", "checkoutMode"]);
  const unexpectedKey = Object.keys(record).find((key) => !allowedKeys.has(key));

  if (unexpectedKey) {
    throw new NythosBillingError(
      "unexpected_checkout_field",
      "O pagamento da plataforma calcula plano e preco no servidor."
    );
  }

  if (record.plan !== "pro") {
    throw new NythosBillingError(
      "unsupported_checkout_plan",
      "Pagamento online disponivel apenas para Nythos PRO."
    );
  }

  if (record.billingCycle !== "monthly" && record.billingCycle !== "yearly") {
    throw new NythosBillingError(
      "unsupported_billing_cycle",
      "Ciclo de cobranca invalido para Nythos PRO."
    );
  }

  if (
    record.checkoutMode !== undefined
    && record.checkoutMode !== "embedded"
    && record.checkoutMode !== "hosted"
  ) {
    throw new NythosBillingError(
      "unsupported_checkout_mode",
      "Modo de checkout invalido para Nythos PRO."
    );
  }

  return {
    plan: "pro",
    billingCycle: record.billingCycle,
    checkoutMode: record.checkoutMode === "hosted" ? "hosted" : "embedded",
  };
}

export function resolveNythosProCheckout(
  billingCycle: NythosBillingCycle,
  config: Pick<StripeConfig, "priceProMonthly" | "priceProYearly">
): NythosProCheckout {
  const amount =
    billingCycle === "yearly"
      ? PLAN_DEFINITIONS.professional.yearlyPrice
      : PLAN_DEFINITIONS.professional.monthlyPrice;
  const priceId = billingCycle === "yearly" ? config.priceProYearly : config.priceProMonthly;

  if (typeof amount !== "number") {
    throw new NythosBillingError("missing_pro_price", "Preco do Nythos PRO nao configurado.", 500);
  }

  if (!priceId || !priceId.startsWith("price_")) {
    throw new NythosBillingError(
      "missing_stripe_price_id",
      "Pagamento online indisponivel para esta conta no momento.",
      503
    );
  }

  return {
    plan: "pro",
    planId: "professional",
    billingCycle,
    amount,
    priceId,
    description: billingCycle === "yearly" ? "Nythos PRO anual" : "Nythos PRO mensal",
  };
}

export function canActorStartPlatformCheckout(profile: Pick<OwnerCheckoutProfile, "role" | "employer_id">): boolean {
  if (profile.role === "secretary") return false;
  if (profile.employer_id) return false;
  return true;
}

export function mergeAccountSubscriptionMetadata(
  current: Json,
  next: Record<string, Json>
): Json {
  return {
    ...asObject(current),
    ...next,
  };
}

export function buildSafeCheckoutApiResponse(result: StripeCheckoutResult): SafeCheckoutApiResponse {
  if (!result.ok) {
    return {
      success: false,
      code: result.code,
      message: result.message,
      billingCycle: result.billingCycle,
      planLabel: PLAN_DEFINITIONS.professional.name,
    };
  }

  return {
    success: true,
    checkoutMode: result.checkoutMode,
    clientSecret: result.clientSecret,
    checkoutUrl: result.checkoutUrl,
    message: result.message,
    billingCycle: result.billingCycle,
    planLabel: result.planLabel,
  };
}

export function buildSafeCheckoutFailureResponse(
  message: string,
  billingCycle?: NythosBillingCycle,
  code: StripeCheckoutFailureCode = "stripe_checkout_failed"
): SafeCheckoutApiResponse {
  return {
    success: false,
    code,
    message,
    billingCycle,
    planLabel: PLAN_DEFINITIONS.professional.name,
  };
}

export function buildStripeCheckoutSessionParams(input: {
  checkout: NythosProCheckout;
  checkoutMode: StripeCheckoutMode;
  customerId: string;
  ownerUserId: string;
  returnUrl: string;
  successUrl: string;
  cancelUrl: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  const metadata = {
    owner_user_id: input.ownerUserId,
    plan_id: input.checkout.planId,
    nythos_billing_cycle: input.checkout.billingCycle,
    source: "nythos_checkout",
  };

  params.set("mode", "subscription");
  params.set("customer", input.customerId);
  params.set("client_reference_id", input.ownerUserId);

  if (input.checkoutMode === "embedded") {
    params.set("ui_mode", STRIPE_EMBEDDED_CHECKOUT_UI_MODE);
    params.set("return_url", input.returnUrl);
  } else if (input.checkoutMode === "hosted") {
    params.set("success_url", input.successUrl);
    params.set("cancel_url", input.cancelUrl);
  } else {
    throw new NythosBillingError(
      "unsupported_checkout_mode",
      "Modo de checkout invalido para Nythos PRO."
    );
  }

  params.set("line_items[0][price]", input.checkout.priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("subscription_data[description]", input.checkout.description);
  params.set("metadata[stripe_checkout_mode]", input.checkoutMode);
  appendMetadata(params, "metadata", metadata);
  appendMetadata(params, "subscription_data[metadata]", metadata);

  return params;
}

export async function createNythosProStripeCheckout(input: {
  ownerUserId: string;
  profile: OwnerCheckoutProfile;
  checkout: NythosProCheckout;
  config: StripeConfig;
  stripeClient: StripeClient;
  store: CheckoutSubscriptionStore;
  checkoutMode: StripeCheckoutMode;
  returnUrl: string;
  successUrl: string;
  cancelUrl: string;
  now?: Date;
}): Promise<StripeCheckoutResult> {
  if (!input.config.checkoutEnabled) {
    return {
      ok: false,
      checkoutEnabled: false,
      code: "stripe_checkout_disabled",
      billingCycle: input.checkout.billingCycle,
      message: "O pagamento online ainda nao esta disponivel para esta conta. Seu plano nao foi alterado.",
    };
  }

  assertTestCheckoutConfig(input.config);

  const now = input.now ?? new Date();
  let accountSubscription = await input.store.getOrCreateSubscription(input.ownerUserId);

  if (hasLegacyProvider(accountSubscription)) {
    throw new NythosBillingError(
      "legacy_provider_requires_manual_migration",
      "Esta conta tem billing legado e precisa de migracao manual antes do checkout online.",
      409
    );
  }

  const storedBillingCycle = getStoredBillingCycle(accountSubscription.metadata);
  if (storedBillingCycle && storedBillingCycle !== input.checkout.billingCycle) {
    throw new NythosBillingError(
      "billing_cycle_change_not_supported",
      "Troca de ciclo sera habilitada em breve.",
      409
    );
  }

  if (accountSubscription.provider === "stripe" && accountSubscription.provider_subscription_id) {
    return {
      ok: true,
      checkoutEnabled: true,
      planId: "professional",
      billingCycle: input.checkout.billingCycle,
      planLabel: PLAN_DEFINITIONS.professional.name,
      checkoutMode: input.checkoutMode,
      clientSecret: null,
      checkoutUrl: null,
      message: "Ja existe uma assinatura Stripe ativa ou em processamento para este plano.",
      reusedCheckoutSession: true,
    };
  }

  if (isProcessingSessionReusable(accountSubscription, input.checkout, input.checkoutMode, now)) {
    return {
      ok: true,
      checkoutEnabled: true,
      planId: "professional",
      billingCycle: input.checkout.billingCycle,
      planLabel: PLAN_DEFINITIONS.professional.name,
      checkoutMode: input.checkoutMode,
      clientSecret: getStoredCheckoutClientSecret(accountSubscription.metadata),
      checkoutUrl: getStoredCheckoutUrl(accountSubscription.metadata),
      message: "Ja existe um checkout em processamento para este plano.",
      reusedCheckoutSession: true,
    };
  }

  let customerId = accountSubscription.provider === "stripe"
    ? accountSubscription.provider_customer_id
    : null;

  if (!customerId) {
    const customer = await input.stripeClient.createCustomer({
      ownerUserId: input.ownerUserId,
      profile: input.profile,
    });
    customerId = customer.id;
    accountSubscription = await input.store.updateSubscription(input.ownerUserId, {
      provider: "stripe",
      provider_customer_id: customerId,
      provider_subscription_id: null,
      metadata: mergeAccountSubscriptionMetadata(accountSubscription.metadata, {
        billing_effects_enabled: true,
        provider: "stripe",
        provider_customer_created_at: now.toISOString(),
        source: "stripe_checkout",
        stripe_environment: "test",
      }),
    });
  }

  const session = await input.stripeClient.createCheckoutSession({
    checkout: input.checkout,
    checkoutMode: input.checkoutMode,
    customerId,
    ownerUserId: input.ownerUserId,
    returnUrl: input.returnUrl,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  });

  if (input.checkoutMode === "embedded" && !session.client_secret?.startsWith("cs_")) {
    throw new NythosBillingError(
      "stripe_checkout_without_client_secret",
      "Nao foi possivel iniciar o checkout agora. Tente novamente em instantes.",
      502
    );
  }

  if (input.checkoutMode === "hosted" && !isSafeStripeCheckoutUrl(session.url)) {
    throw new NythosBillingError(
      "stripe_checkout_without_url",
      "Nao foi possivel iniciar o checkout agora. Tente novamente em instantes.",
      502
    );
  }

  await input.store.updateSubscription(input.ownerUserId, {
    provider: "stripe",
    provider_customer_id: customerId,
    provider_subscription_id: null,
    metadata: mergeAccountSubscriptionMetadata(accountSubscription.metadata, {
      billing_effects_enabled: true,
      provider: "stripe",
      source: "stripe_checkout",
      stripe_environment: "test",
      stripe_checkout_status: "pending",
      stripe_checkout_mode: input.checkoutMode,
      stripe_checkout_session_id: session.id,
      stripe_checkout_session_url: session.url,
      stripe_checkout_client_secret: session.client_secret ?? null,
      stripe_checkout_session_expires_at: session.expires_at ?? null,
      stripe_price_id: input.checkout.priceId,
      nythos_billing_cycle: input.checkout.billingCycle,
    }),
  });

  return {
    ok: true,
    checkoutEnabled: true,
    planId: "professional",
    billingCycle: input.checkout.billingCycle,
    planLabel: PLAN_DEFINITIONS.professional.name,
    checkoutMode: input.checkoutMode,
    clientSecret: session.client_secret ?? null,
    checkoutUrl: session.url,
    message: input.checkoutMode === "embedded"
      ? "Checkout iniciado. Complete o pagamento com seguranca."
      : "Checkout iniciado. Redirecionando para o pagamento seguro.",
    reusedCheckoutSession: false,
  };
}

export function createStripeHttpClient(config: StripeConfig): StripeClient {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!config.secretKey || !config.secretKey.startsWith("sk_test_")) {
      throw new NythosBillingError(
        "stripe_secret_key_unavailable",
        "Pagamento online indisponivel para esta conta no momento.",
        503
      );
    }

    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${config.secretKey}`,
        ...init?.headers,
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new StripeApiError(response.status, body);
    }

    return body as T;
  }

  return {
    async createCustomer({ ownerUserId, profile }) {
      const params = new URLSearchParams();
      params.set("name", getCustomerName(profile));
      params.set("metadata[owner_user_id]", ownerUserId);
      params.set("metadata[source]", "nythos_checkout");

      const email = profile.email?.trim();
      if (email) params.set("email", email);

      const phone = digitsOnly(profile.phone);
      if (phone) params.set("phone", phone);

      const body = await request<Record<string, unknown>>("/customers", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const id = readStringField(body, "id");
      if (!id) throw new StripeApiError(200, { message: "Stripe customer response without id" });
      return { id };
    },

    async createCheckoutSession(input) {
      const params = buildStripeCheckoutSessionParams(input);
      const body = await request<Record<string, unknown>>("/checkout/sessions", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const id = readStringField(body, "id");
      if (!id) throw new StripeApiError(200, { message: "Stripe checkout response without id" });

      return {
        id,
        client_secret: readStringField(body, "client_secret"),
        url: readStringField(body, "url"),
        customer: readStringField(body, "customer"),
        subscription: readStringField(body, "subscription"),
        expires_at: readNumberField(body, "expires_at"),
      };
    },

    async retrieveSubscription(subscriptionId) {
      const body = await request<Record<string, unknown>>(
        `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        { method: "GET" }
      );
      const id = readStringField(body, "id");
      if (!id) return null;

      const metadata = readObjectField(body, "metadata");
      const metadataStringValues = metadata
        ? Object.fromEntries(
            Object.entries(metadata).filter(([, value]) => typeof value === "string" || value === null)
          ) as Record<string, string | null>
        : null;

      return {
        id,
        customer: readStringField(body, "customer"),
        status: readStringField(body, "status"),
        current_period_start: readNumberField(body, "current_period_start"),
        current_period_end: readNumberField(body, "current_period_end"),
        cancel_at_period_end: readBooleanField(body, "cancel_at_period_end"),
        metadata: metadataStringValues,
      };
    },
  };
}

export function sanitizeStripeError(error: unknown): unknown {
  if (error instanceof StripeApiError) {
    const body = error.body && typeof error.body === "object"
      ? error.body as Record<string, unknown>
      : null;
    const stripeError = body && typeof body.error === "object" && body.error
      ? body.error as Record<string, unknown>
      : null;

    return compactRecord({
      name: error.name,
      status: error.status,
      type: typeof stripeError?.type === "string" ? stripeError.type : undefined,
      code: typeof stripeError?.code === "string" ? redactSensitiveText(stripeError.code) : undefined,
      message: typeof stripeError?.message === "string"
        ? redactSensitiveText(stripeError.message)
        : "Erro retornado pelo Stripe.",
    });
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSensitiveText(error.message),
    };
  }

  return "Erro Stripe nao identificado.";
}

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  webhookSecret: string,
  options: { now?: Date; toleranceSeconds?: number } = {}
): StripeEvent {
  if (!signatureHeader) {
    throw new NythosBillingError(
      "stripe_missing_signature",
      "Assinatura do webhook Stripe ausente.",
      400
    );
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=", 2);
      return [key, value];
    })
  );
  const timestamp = Number(parts.t);
  const receivedSignatures = signatureHeader
    .split(",")
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!Number.isFinite(timestamp) || receivedSignatures.length === 0) {
    throw new NythosBillingError(
      "stripe_invalid_signature",
      "Assinatura do webhook Stripe invalida.",
      400
    );
  }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const toleranceSeconds = options.toleranceSeconds ?? STRIPE_WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    throw new NythosBillingError(
      "stripe_signature_timestamp_outside_tolerance",
      "Assinatura do webhook Stripe invalida.",
      400
    );
  }

  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  const isValid = receivedSignatures.some((signature) => compareHexDigest(expected, signature));
  if (!isValid) {
    throw new NythosBillingError(
      "stripe_signature_mismatch",
      "Assinatura do webhook Stripe invalida.",
      400
    );
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    throw new NythosBillingError(
      "stripe_invalid_payload",
      "Payload do webhook Stripe invalido.",
      400
    );
  }

  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new NythosBillingError(
      "stripe_invalid_event",
      "Payload do webhook Stripe invalido.",
      400
    );
  }

  const record = event as Record<string, unknown>;
  const id = readStringField(record, "id");
  const type = readStringField(record, "type");
  const data = readObjectField(record, "data");
  const object = data ? readObjectField(data, "object") : null;

  if (!id || !type || !object) {
    throw new NythosBillingError(
      "stripe_invalid_event",
      "Payload do webhook Stripe invalido.",
      400
    );
  }

  return {
    id,
    type,
    created: readNumberField(record, "created") ?? undefined,
    data: { object },
  };
}

export function mapStripeSubscriptionStatus(status?: string | null): StripeAccountStatus {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "canceled") return "cancelled";
  if (status === "incomplete_expired") return "expired";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  return "past_due";
}

export function getStripeSubscriptionPeriodPatch(subscription: StripeSubscription): Pick<
  Extract<StripeWebhookDecision, { action: "update_subscription" }>,
  "currentPeriodStartedAt" | "currentPeriodEndsAt" | "cancelAtPeriodEnd" | "billingCycle"
> {
  const billingCycle = subscription.metadata?.nythos_billing_cycle;
  return compactRecord({
    currentPeriodStartedAt: epochSecondsToIso(subscription.current_period_start ?? null),
    currentPeriodEndsAt: epochSecondsToIso(subscription.current_period_end ?? null),
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? undefined,
    billingCycle: billingCycle === "monthly" || billingCycle === "yearly" ? billingCycle : undefined,
  }) as Pick<
    Extract<StripeWebhookDecision, { action: "update_subscription" }>,
    "currentPeriodStartedAt" | "currentPeriodEndsAt" | "cancelAtPeriodEnd" | "billingCycle"
  >;
}

function readNestedSubscriptionId(record: Record<string, unknown>): string | null {
  const direct = readStringField(record, "subscription");
  if (direct) return direct;

  const parent = readObjectField(record, "parent");
  const subscriptionDetails = parent ? readObjectField(parent, "subscription_details") : null;
  return subscriptionDetails ? readStringField(subscriptionDetails, "subscription") : null;
}

function buildBaseWebhookMetadata(event: StripeEvent): Record<string, Json> {
  return {
    provider: "stripe",
    last_stripe_event_id: event.id,
    last_stripe_event_type: event.type,
    last_stripe_event_at: new Date((event.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
  };
}

export function buildStripeWebhookDecision(event: StripeEvent): StripeWebhookDecision {
  if (!event.id || !event.type || !event.data?.object) {
    return { action: "ignore", eventId: event.id ?? null, eventType: event.type ?? null, reason: "invalid_event" };
  }

  const object = event.data.object;
  const metadata = readObjectField(object, "metadata");
  const billingCycle = metadata
    ? readStringField(metadata, "nythos_billing_cycle")
    : null;
  const normalizedBillingCycle = billingCycle === "monthly" || billingCycle === "yearly"
    ? billingCycle
    : undefined;

  if (event.type === "checkout.session.completed") {
    const providerCustomerId = readStringField(object, "customer");
    const providerSubscriptionId = readStringField(object, "subscription");

    if (!providerCustomerId && !providerSubscriptionId) {
      return {
        action: "ignore",
        eventId: event.id,
        eventType: event.type,
        reason: "missing_provider_ids",
      };
    }

    return {
      action: "update_subscription",
      eventId: event.id,
      eventType: event.type,
      providerCustomerId: providerCustomerId ?? undefined,
      providerSubscriptionId: providerSubscriptionId ?? undefined,
      status: "active",
      billingCycle: normalizedBillingCycle,
      metadata: compactRecord({
        ...buildBaseWebhookMetadata(event),
        stripe_checkout_status: "completed",
        stripe_checkout_session_id: readStringField(object, "id") ?? undefined,
        nythos_billing_cycle: normalizedBillingCycle,
      }) as Record<string, Json>,
    };
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const providerSubscriptionId = readStringField(object, "id");
    const providerCustomerId = readStringField(object, "customer");

    if (!providerSubscriptionId && !providerCustomerId) {
      return {
        action: "ignore",
        eventId: event.id,
        eventType: event.type,
        reason: "missing_provider_ids",
      };
    }

    const status = event.type === "customer.subscription.deleted"
      ? "cancelled"
      : mapStripeSubscriptionStatus(readStringField(object, "status"));

    return {
      action: "update_subscription",
      eventId: event.id,
      eventType: event.type,
      providerCustomerId: providerCustomerId ?? undefined,
      providerSubscriptionId: providerSubscriptionId ?? undefined,
      status,
      billingCycle: normalizedBillingCycle,
      currentPeriodStartedAt: epochSecondsToIso(readNumberField(object, "current_period_start")),
      currentPeriodEndsAt: epochSecondsToIso(readNumberField(object, "current_period_end")),
      cancelAtPeriodEnd: readBooleanField(object, "cancel_at_period_end") ?? undefined,
      metadata: compactRecord({
        ...buildBaseWebhookMetadata(event),
        stripe_subscription_status: readStringField(object, "status") ?? status,
        nythos_billing_cycle: normalizedBillingCycle,
      }) as Record<string, Json>,
    };
  }

  if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
    const providerSubscriptionId = readNestedSubscriptionId(object);
    const providerCustomerId = readStringField(object, "customer");

    if (!providerSubscriptionId && !providerCustomerId) {
      return {
        action: "ignore",
        eventId: event.id,
        eventType: event.type,
        reason: "missing_provider_ids",
      };
    }

    return {
      action: "update_subscription",
      eventId: event.id,
      eventType: event.type,
      providerCustomerId: providerCustomerId ?? undefined,
      providerSubscriptionId: providerSubscriptionId ?? undefined,
      status: event.type === "invoice.payment_failed" ? "past_due" : "active",
      metadata: compactRecord({
        ...buildBaseWebhookMetadata(event),
        last_stripe_invoice_id: readStringField(object, "id") ?? undefined,
        last_stripe_invoice_status: readStringField(object, "status") ?? undefined,
      }) as Record<string, Json>,
    };
  }

  return {
    action: "ignore",
    eventId: event.id,
    eventType: event.type,
    reason: "unmapped_event",
  };
}

export function enrichStripeWebhookDecisionWithSubscription(
  decision: StripeWebhookDecision,
  subscription: StripeSubscription | null
): StripeWebhookDecision {
  if (decision.action !== "update_subscription" || !subscription) return decision;

  const periodPatch = getStripeSubscriptionPeriodPatch(subscription);

  return {
    ...decision,
    providerCustomerId: decision.providerCustomerId ?? subscription.customer ?? undefined,
    providerSubscriptionId: decision.providerSubscriptionId ?? subscription.id,
    status: mapStripeSubscriptionStatus(subscription.status),
    ...periodPatch,
    metadata: compactRecord({
      ...decision.metadata,
      stripe_subscription_status: subscription.status ?? undefined,
      nythos_billing_cycle: periodPatch.billingCycle ?? decision.billingCycle,
    }) as Record<string, Json>,
  };
}

export function hasProcessedStripeEvent(metadata: Json, eventId: string): boolean {
  return getProcessedStripeEventIds(metadata).includes(eventId);
}

export function mergeStripeWebhookMetadata(
  subscription: Pick<AccountSubscriptionForStripe, "metadata">,
  metadata: Record<string, Json>,
  eventId: string
): Json {
  const processedEventIds = getProcessedStripeEventIds(subscription.metadata)
    .filter((id) => id !== eventId)
    .slice(-9);

  return mergeAccountSubscriptionMetadata(subscription.metadata, {
    ...metadata,
    stripe_processed_event_ids: [...processedEventIds, eventId],
  });
}
