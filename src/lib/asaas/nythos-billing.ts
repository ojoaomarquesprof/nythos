import { redactSensitiveText } from "../errors/safe-error";
import {
  PLAN_DEFINITIONS,
  type SubscriptionStatus,
} from "../subscription/plan-rules";
import type { Json } from "../../types/database";
import {
  getBillingDocumentValidationMessage,
  normalizeCpfCnpj,
} from "./billing-document";

export const DEFAULT_ASAAS_SANDBOX_BASE_URL = "https://api-sandbox.asaas.com/v3";
export const DEFAULT_ASAAS_PRODUCTION_BASE_URL = "https://api.asaas.com/v3";

export type AsaasEnvironment = "sandbox" | "production";
export type NythosCheckoutPlan = "pro";
export type NythosBillingCycle = "monthly" | "yearly";
export type AsaasSubscriptionCycle = "MONTHLY" | "YEARLY";
export type AsaasAccountStatus = Extract<SubscriptionStatus, "trialing" | "active" | "past_due">;
export type AsaasCheckoutCode =
  | "subscription_created"
  | "subscription_already_processing"
  | "missing_billing_document"
  | "checkout_disabled";

export type AsaasConfig = {
  apiKey: string | null;
  baseUrl: string;
  checkoutEnabled: boolean;
  environment: AsaasEnvironment;
  webhookToken: string | null;
};

export type NythosProCheckout = {
  plan: NythosCheckoutPlan;
  planId: "professional";
  billingCycle: NythosBillingCycle;
  providerCycle: AsaasSubscriptionCycle;
  amount: number;
  description: string;
};

export type OwnerCheckoutProfile = {
  id: string;
  full_name?: string | null;
  clinic_name?: string | null;
  email?: string | null;
  cpf?: string | null;
  phone?: string | null;
  role?: string | null;
  employer_id?: string | null;
};

export type AccountSubscriptionForAsaas = {
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
  status: AsaasAccountStatus;
  trial_ends_at: string | null;
  current_period_started_at: string | null;
  current_period_ends_at: string | null;
  provider: "asaas";
  provider_customer_id: string;
  provider_subscription_id: string;
  metadata: Json;
}>;

export type AsaasCustomerPayload = {
  name: string;
  cpfCnpj: string;
  email?: string;
  mobilePhone?: string;
  externalReference: string;
  notificationDisabled: boolean;
};

export type AsaasSubscriptionPayload = {
  customer: string;
  billingType: "UNDEFINED";
  value: number;
  nextDueDate: string;
  cycle: AsaasSubscriptionCycle;
  description: string;
  externalReference: string;
};

export type AsaasSubscriptionResponse = {
  id: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  paymentUrl?: string | null;
  checkoutUrl?: string | null;
};

export type AsaasPaymentSummary = {
  id?: string;
  status?: string | null;
  dueDate?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  paymentUrl?: string | null;
  checkoutUrl?: string | null;
};

export type AsaasClient = {
  createCustomer(payload: AsaasCustomerPayload): Promise<{ id: string }>;
  createSubscription(payload: AsaasSubscriptionPayload): Promise<AsaasSubscriptionResponse>;
  listSubscriptionPayments(subscriptionId: string): Promise<AsaasPaymentSummary[]>;
};

export type CheckoutSubscriptionStore = {
  getOrCreateSubscription(ownerUserId: string): Promise<AccountSubscriptionForAsaas>;
  updateSubscription(
    ownerUserId: string,
    patch: AccountSubscriptionPatch
  ): Promise<AccountSubscriptionForAsaas>;
};

export type AsaasCheckoutResult =
  | {
      ok: false;
      checkoutEnabled: false;
      code: "checkout_disabled";
      message: string;
    }
  | {
      ok: true;
      checkoutEnabled: true;
      provider: "asaas";
      planId: "professional";
      billingCycle: NythosBillingCycle;
      amount: number;
      subscriptionStatus: AsaasAccountStatus;
      nextDueDate: string;
      paymentUrl: string | null;
      code: Exclude<AsaasCheckoutCode, "checkout_disabled">;
      message: string;
      reusedProviderSubscription: boolean;
    };

export type SafeCheckoutApiResponse = {
  success: boolean;
  checkoutEnabled: boolean;
  code: AsaasCheckoutCode | string;
  status?: AsaasAccountStatus;
  billingCycle?: NythosBillingCycle;
  planLabel?: string;
  message: string;
  paymentUrl?: string | null;
  nextDueDate?: string;
};

export type AsaasWebhookDecision =
  | {
      action: "ignore";
      event: string | null;
      reason: "invalid_payload" | "unmapped_event" | "missing_provider_subscription_id";
    }
  | {
      action: "update_subscription";
      event: string;
      providerSubscriptionId: string;
      status: Extract<SubscriptionStatus, "active" | "past_due">;
      metadata: Record<string, Json>;
    };

const ACTIVE_PAYMENT_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);

const PAST_DUE_PAYMENT_EVENTS = new Set([
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_CHARGEBACK_CANCELLED",
]);

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

export class AsaasApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown
  ) {
    super("Asaas API request failed");
    this.name = "AsaasApiError";
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseEnvironment(value: string | undefined): AsaasEnvironment {
  return value?.trim().toLowerCase() === "production" ? "production" : "sandbox";
}

function compactRecord<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ) as Partial<T>;
}

function digitsOnly(value?: string | null): string {
  return value?.replace(/\D/g, "") ?? "";
}

function isFutureDate(value: string | null, now: Date): boolean {
  return Boolean(value && new Date(value).getTime() > now.getTime());
}

function toDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addCycle(date: Date, cycle: NythosBillingCycle): Date {
  const next = new Date(date);
  if (cycle === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function asObject(value: Json): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Json>;
}

function readStringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isSafeAsaasUrl(value: string | null | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)asaas\.com(\.br)?$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function getStoredBillingCycle(metadata: Json): NythosBillingCycle | null {
  const value = asObject(metadata).nythos_billing_cycle;
  return value === "monthly" || value === "yearly" ? value : null;
}

function extractAsaasPaymentSummary(value: unknown): AsaasPaymentSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  return compactRecord({
    id: readStringField(record, "id"),
    status: readStringField(record, "status"),
    dueDate: readStringField(record, "dueDate"),
    invoiceUrl: readStringField(record, "invoiceUrl"),
    bankSlipUrl: readStringField(record, "bankSlipUrl"),
    paymentUrl: readStringField(record, "paymentUrl"),
    checkoutUrl: readStringField(record, "checkoutUrl"),
  }) as AsaasPaymentSummary;
}

export function pickSafeAsaasPaymentUrl(...sources: Array<unknown>): string | null {
  for (const source of sources) {
    if (Array.isArray(source)) {
      const nested = pickSafeAsaasPaymentUrl(...source);
      if (nested) return nested;
      continue;
    }

    if (!source || typeof source !== "object") continue;
    const record = source as Record<string, unknown>;
    const candidates = [
      readStringField(record, "invoiceUrl"),
      readStringField(record, "bankSlipUrl"),
      readStringField(record, "paymentUrl"),
      readStringField(record, "checkoutUrl"),
    ];
    const safeUrl = candidates.find(isSafeAsaasUrl);
    if (safeUrl) return safeUrl;
  }

  return null;
}

export function getPublicAsaasEnvNames(env: Record<string, string | undefined> = process.env): string[] {
  return Object.keys(env).filter((key) => /^NEXT_PUBLIC_.*(?:ASAAS|ASSAS)/i.test(key));
}

export function assertNoPublicAsaasSecrets(env: Record<string, string | undefined> = process.env): void {
  const publicNames = getPublicAsaasEnvNames(env);
  if (publicNames.length === 0) return;

  throw new NythosBillingError(
    "asaas_public_env_blocked",
    "Variaveis Asaas nao podem usar prefixo NEXT_PUBLIC_.",
    500
  );
}

export function getAsaasConfig(env: Record<string, string | undefined> = process.env): AsaasConfig {
  assertNoPublicAsaasSecrets(env);

  const environment = parseEnvironment(env.ASAAS_ENVIRONMENT);
  const defaultBaseUrl =
    environment === "sandbox" ? DEFAULT_ASAAS_SANDBOX_BASE_URL : DEFAULT_ASAAS_PRODUCTION_BASE_URL;

  return {
    apiKey: env.ASAAS_API_KEY?.trim() || null,
    baseUrl: normalizeBaseUrl(env.ASAAS_BASE_URL?.trim() || defaultBaseUrl),
    checkoutEnabled: parseBoolean(env.ASAAS_CHECKOUT_ENABLED),
    environment,
    webhookToken: env.ASAAS_WEBHOOK_TOKEN?.trim() || null,
  };
}

export function assertSandboxCheckoutConfig(config: AsaasConfig): void {
  if (!config.checkoutEnabled) return;

  if (config.environment !== "sandbox") {
    throw new NythosBillingError(
      "asaas_production_blocked",
      "Pagamento online indisponivel para esta conta no momento.",
      503
    );
  }

  if (normalizeBaseUrl(config.baseUrl) !== DEFAULT_ASAAS_SANDBOX_BASE_URL) {
    throw new NythosBillingError(
      "asaas_non_sandbox_base_url",
      "Pagamento online indisponivel para esta conta no momento.",
      503
    );
  }

  if (!config.apiKey) {
    throw new NythosBillingError(
      "asaas_missing_api_key",
      "Pagamento online indisponivel para esta conta no momento.",
      503
    );
  }
}

export function parseNythosCheckoutRequest(payload: unknown): {
  plan: NythosCheckoutPlan;
  billingCycle: NythosBillingCycle;
  billingDocument?: string;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new NythosBillingError("invalid_checkout_payload", "Payload de checkout invalido.");
  }

  const record = payload as Record<string, unknown>;
  const allowedKeys = new Set(["plan", "billingCycle", "billingDocument"]);
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

  const billingDocument = typeof record.billingDocument === "string"
    ? normalizeCpfCnpj(record.billingDocument)
    : undefined;

  if (record.billingDocument !== undefined && !billingDocument) {
    throw new NythosBillingError(
      "invalid_billing_document",
      "Informe um CPF ou CNPJ para continuar."
    );
  }

  if (billingDocument) {
    const validationMessage = getBillingDocumentValidationMessage(billingDocument);
    if (validationMessage) {
      throw new NythosBillingError("invalid_billing_document", validationMessage);
    }
  }

  return {
    plan: "pro",
    billingCycle: record.billingCycle,
    ...(billingDocument ? { billingDocument } : {}),
  };
}

export function resolveNythosProCheckout(billingCycle: NythosBillingCycle): NythosProCheckout {
  const amount =
    billingCycle === "yearly"
      ? PLAN_DEFINITIONS.professional.yearlyPrice
      : PLAN_DEFINITIONS.professional.monthlyPrice;

  if (typeof amount !== "number") {
    throw new NythosBillingError("missing_pro_price", "Preco do Nythos PRO nao configurado.", 500);
  }

  return {
    plan: "pro",
    planId: "professional",
    billingCycle,
    providerCycle: billingCycle === "yearly" ? "YEARLY" : "MONTHLY",
    amount,
    description: billingCycle === "yearly" ? "Nythos PRO anual" : "Nythos PRO mensal",
  };
}

export function canActorStartPlatformCheckout(profile: Pick<OwnerCheckoutProfile, "role" | "employer_id">): boolean {
  if (profile.role === "secretary") return false;
  if (profile.employer_id) return false;
  return true;
}

export function buildAsaasCustomerPayload(
  profile: OwnerCheckoutProfile,
  ownerUserId: string
): AsaasCustomerPayload {
  const cpfCnpj = normalizeCpfCnpj(profile.cpf);
  const validationMessage = getBillingDocumentValidationMessage(cpfCnpj);

  if (validationMessage) {
    throw new NythosBillingError(
      "missing_billing_document",
      "Informe seu CPF ou CNPJ para continuar."
    );
  }

  const name = profile.clinic_name?.trim() || profile.full_name?.trim() || "Nythos customer";
  const phone = digitsOnly(profile.phone);

  return compactRecord({
    name,
    cpfCnpj,
    email: profile.email?.trim() || undefined,
    mobilePhone: phone || undefined,
    externalReference: `nythos:${ownerUserId}`,
    notificationDisabled: true,
  }) as AsaasCustomerPayload;
}

export function buildAsaasSubscriptionPayload(input: {
  customerId: string;
  checkout: NythosProCheckout;
  ownerUserId: string;
  nextDueDate: string;
}): AsaasSubscriptionPayload {
  return {
    customer: input.customerId,
    billingType: "UNDEFINED",
    value: input.checkout.amount,
    nextDueDate: input.nextDueDate,
    cycle: input.checkout.providerCycle,
    description: input.checkout.description,
    externalReference: `nythos:${input.ownerUserId}:${input.checkout.billingCycle}`,
  };
}

export function resolveInitialAsaasSubscriptionState(
  subscription: AccountSubscriptionForAsaas,
  now: Date
): AsaasAccountStatus {
  if (subscription.status === "trialing" && isFutureDate(subscription.trial_ends_at, now)) {
    return "trialing";
  }

  if (subscription.status === "active") return "active";

  return "past_due";
}

export function resolveNextDueDate(subscription: AccountSubscriptionForAsaas, now: Date): string {
  if (subscription.status === "trialing" && isFutureDate(subscription.trial_ends_at, now)) {
    return toDateInput(new Date(subscription.trial_ends_at as string));
  }

  return toDateInput(now);
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

export function buildSafeCheckoutApiResponse(result: AsaasCheckoutResult): SafeCheckoutApiResponse {
  if (!result.ok) {
    return {
      success: false,
      checkoutEnabled: false,
      code: result.code,
      message: result.message,
    };
  }

  return {
    success: true,
    checkoutEnabled: true,
    code: result.code,
    status: result.subscriptionStatus,
    billingCycle: result.billingCycle,
    planLabel: PLAN_DEFINITIONS.professional.name,
    message: result.message,
    paymentUrl: result.paymentUrl,
    nextDueDate: result.nextDueDate,
  };
}

async function findSubscriptionPaymentUrl(
  asaasClient: AsaasClient,
  providerSubscriptionId: string,
  subscriptionResponse?: AsaasSubscriptionResponse
): Promise<string | null> {
  const responseUrl = pickSafeAsaasPaymentUrl(subscriptionResponse);
  if (responseUrl) return responseUrl;

  try {
    const payments = await asaasClient.listSubscriptionPayments(providerSubscriptionId);
    return pickSafeAsaasPaymentUrl(payments);
  } catch {
    return null;
  }
}

export async function createNythosProAsaasCheckout(input: {
  ownerUserId: string;
  profile: OwnerCheckoutProfile;
  checkout: NythosProCheckout;
  config: AsaasConfig;
  asaasClient: AsaasClient;
  store: CheckoutSubscriptionStore;
  now?: Date;
}): Promise<AsaasCheckoutResult> {
  if (!input.config.checkoutEnabled) {
    return {
      ok: false,
      checkoutEnabled: false,
      code: "checkout_disabled",
      message: "O pagamento online ainda nao esta disponivel para esta conta. Seu plano nao foi alterado.",
    };
  }

  assertSandboxCheckoutConfig(input.config);

  const now = input.now ?? new Date();
  let accountSubscription = await input.store.getOrCreateSubscription(input.ownerUserId);

  if (accountSubscription.provider_subscription_id) {
    const storedBillingCycle = getStoredBillingCycle(accountSubscription.metadata);

    if (storedBillingCycle && storedBillingCycle !== input.checkout.billingCycle) {
      throw new NythosBillingError(
        "billing_cycle_change_not_supported",
        "Troca de ciclo sera habilitada em breve.",
        409
      );
    }

    const paymentUrl = await findSubscriptionPaymentUrl(
      input.asaasClient,
      accountSubscription.provider_subscription_id
    );

    return {
      ok: true,
      checkoutEnabled: true,
      provider: "asaas",
      planId: "professional",
      billingCycle: input.checkout.billingCycle,
      amount: input.checkout.amount,
      subscriptionStatus: resolveInitialAsaasSubscriptionState(accountSubscription, now),
      nextDueDate: resolveNextDueDate(accountSubscription, now),
      paymentUrl,
      code: "subscription_already_processing",
      message: "Ja existe uma assinatura em processamento para este plano.",
      reusedProviderSubscription: true,
    };
  }

  let customerId = accountSubscription.provider_customer_id;

  if (!customerId) {
    const customer = await input.asaasClient.createCustomer(
      buildAsaasCustomerPayload(input.profile, input.ownerUserId)
    );
    customerId = customer.id;
    accountSubscription = await input.store.updateSubscription(input.ownerUserId, {
      provider: "asaas",
      provider_customer_id: customerId,
      metadata: mergeAccountSubscriptionMetadata(accountSubscription.metadata, {
        billing_effects_enabled: true,
        provider: "asaas",
        provider_customer_created_at: now.toISOString(),
        source: "asaas_checkout",
      }),
    });
  }

  const nextDueDate = resolveNextDueDate(accountSubscription, now);
  const providerSubscription = await input.asaasClient.createSubscription(
    buildAsaasSubscriptionPayload({
      customerId,
      checkout: input.checkout,
      ownerUserId: input.ownerUserId,
      nextDueDate,
    })
  );
  const nextStatus = resolveInitialAsaasSubscriptionState(accountSubscription, now);
  const nextPeriodEndsAt = nextStatus === "active"
    ? addCycle(now, input.checkout.billingCycle).toISOString()
    : accountSubscription.current_period_ends_at;

  await input.store.updateSubscription(input.ownerUserId, {
    plan_id: "professional",
    status: nextStatus,
    provider: "asaas",
    provider_customer_id: customerId,
    provider_subscription_id: providerSubscription.id,
    current_period_started_at: nextStatus === "active"
      ? (accountSubscription.current_period_started_at ?? now.toISOString())
      : accountSubscription.current_period_started_at,
    current_period_ends_at: nextPeriodEndsAt,
    metadata: mergeAccountSubscriptionMetadata(accountSubscription.metadata, {
      billing_effects_enabled: true,
      provider: "asaas",
      provider_subscription_created_at: now.toISOString(),
      source: "asaas_checkout",
      asaas_billing_type: "UNDEFINED",
      asaas_subscription_cycle: input.checkout.providerCycle,
      nythos_billing_cycle: input.checkout.billingCycle,
    }),
  });
  const paymentUrl = await findSubscriptionPaymentUrl(
    input.asaasClient,
    providerSubscription.id,
    providerSubscription
  );

  return {
    ok: true,
    checkoutEnabled: true,
    provider: "asaas",
    planId: "professional",
    billingCycle: input.checkout.billingCycle,
    amount: input.checkout.amount,
    subscriptionStatus: nextStatus,
    nextDueDate,
    paymentUrl,
    code: "subscription_created",
    message: paymentUrl
      ? "Assinatura criada. Abra o pagamento para concluir."
      : "Assinatura criada. Aguarde a confirmacao do pagamento.",
    reusedProviderSubscription: false,
  };
}

export function createAsaasHttpClient(config: AsaasConfig): AsaasClient {
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    assertSandboxCheckoutConfig(config);

    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        access_token: config.apiKey as string,
        ...init?.headers,
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new AsaasApiError(response.status, body);
    }

    return body;
  }

  async function post<TPayload extends object>(path: string, payload: TPayload): Promise<AsaasSubscriptionResponse> {
    const body = await request(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!body || typeof body !== "object" || typeof (body as { id?: unknown }).id !== "string") {
      throw new AsaasApiError(200, { message: "Asaas response without id" });
    }

    const record = body as Record<string, unknown>;

    return compactRecord({
      id: record.id as string,
      invoiceUrl: readStringField(record, "invoiceUrl"),
      bankSlipUrl: readStringField(record, "bankSlipUrl"),
      paymentUrl: readStringField(record, "paymentUrl"),
      checkoutUrl: readStringField(record, "checkoutUrl"),
    }) as AsaasSubscriptionResponse;
  }

  return {
    createCustomer(payload) {
      return post("/customers", payload);
    },
    createSubscription(payload) {
      return post("/subscriptions", payload);
    },
    async listSubscriptionPayments(subscriptionId) {
      const body = await request(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments`, {
        method: "GET",
      });
      const data = body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
        ? (body as { data: unknown[] }).data
        : [];

      return data
        .map(extractAsaasPaymentSummary)
        .filter((payment): payment is AsaasPaymentSummary => Boolean(payment));
    },
  };
}

export function sanitizeAsaasError(error: unknown): unknown {
  if (error instanceof AsaasApiError) {
    const body = error.body;
    const errors = body && typeof body === "object" && Array.isArray((body as { errors?: unknown }).errors)
      ? (body as { errors: Array<{ code?: unknown; description?: unknown }> }).errors.map((item) => ({
          code: typeof item.code === "string" ? redactSensitiveText(item.code) : undefined,
          description: typeof item.description === "string"
            ? redactSensitiveText(item.description)
            : "Erro retornado pelo Asaas.",
        }))
      : undefined;

    return compactRecord({
      name: error.name,
      status: error.status,
      message: redactSensitiveText(error.message),
      errors,
    });
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSensitiveText(error.message),
    };
  }

  return "Erro Asaas nao identificado.";
}

export function buildAsaasWebhookDecision(payload: unknown, now: Date = new Date()): AsaasWebhookDecision {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { action: "ignore", event: null, reason: "invalid_payload" };
  }

  const record = payload as Record<string, unknown>;
  const event = typeof record.event === "string" ? record.event : null;

  if (!event) {
    return { action: "ignore", event: null, reason: "invalid_payload" };
  }

  const status = ACTIVE_PAYMENT_EVENTS.has(event)
    ? "active"
    : PAST_DUE_PAYMENT_EVENTS.has(event)
      ? "past_due"
      : null;

  if (!status) {
    return { action: "ignore", event, reason: "unmapped_event" };
  }

  const payment = record.payment && typeof record.payment === "object"
    ? record.payment as Record<string, unknown>
    : null;
  const providerSubscriptionId =
    typeof payment?.subscription === "string"
      ? payment.subscription
      : typeof record.subscription === "object"
        && record.subscription !== null
        && typeof (record.subscription as { id?: unknown }).id === "string"
          ? (record.subscription as { id: string }).id
          : null;

  if (!providerSubscriptionId) {
    return { action: "ignore", event, reason: "missing_provider_subscription_id" };
  }

  return {
    action: "update_subscription",
    event,
    providerSubscriptionId,
    status,
    metadata: compactRecord({
      provider: "asaas",
      last_asaas_event: event,
      last_asaas_event_at: now.toISOString(),
      last_asaas_payment_id: typeof payment?.id === "string" ? payment.id : undefined,
      last_asaas_payment_status: typeof payment?.status === "string" ? payment.status : undefined,
    }) as Record<string, Json>,
  };
}

export function mergeWebhookMetadata(subscription: Pick<AccountSubscriptionForAsaas, "metadata">, metadata: Record<string, Json>): Json {
  return mergeAccountSubscriptionMetadata(subscription.metadata, metadata);
}
