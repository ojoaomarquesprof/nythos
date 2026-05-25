"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  FileCheck2,
  FileText,
  Info,
  Layers3,
  Loader2,
  LockKeyhole,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSubscription } from "@/hooks/use-subscription";
import {
  buildCheckoutRequestBody,
  getCheckoutFailureMessage,
  getClinicCheckoutMessage,
  getPortalFailureMessage,
  type NythosCheckoutUiResponse,
  type NythosPortalUiResponse,
} from "@/lib/stripe/checkout-ui";
import {
  getNythosProAnnualSavings,
  PLAN_DEFINITIONS,
  type PlanLimits,
  type PlanFeatureKey,
  type SubscriptionPlanId,
  type SubscriptionStatus,
  type UsageLimitState,
} from "@/lib/subscription/plan-rules";
import { cn } from "@/lib/utils";

const annualSavings = getNythosProAnnualSavings();
const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : Promise.resolve(null);

const BILLING_PLAN_OPTIONS: Array<{
  key: "trial" | "pro-monthly" | "pro-yearly" | "clinic";
  targetPlanId: SubscriptionPlanId;
  title: string;
  description: string;
  price: string;
  caption: string;
  ctaLabel?: string;
  badge?: string;
  featured?: boolean;
  features: string[];
}> = [
  {
    key: "trial",
    targetPlanId: "free",
    title: "Trial PRO",
    description: "Teste gratuito de 14 dias com a experiencia do Nythos PRO liberada.",
    price: "14 dias",
    caption: "Para novas contas owner",
    badge: "Teste inicial",
    features: [
      "Ate 100 pacientes ativos",
      "Ate 1 secretaria/assistente",
      "Recursos principais liberados",
    ],
  },
  {
    key: "pro-monthly",
    targetPlanId: "professional",
    title: "Nythos PRO mensal",
    description: PLAN_DEFINITIONS.professional.description,
    price: "R$ 89/mes",
    caption: "Plano mensal",
    ctaLabel: "Assinar PRO mensal",
    featured: true,
    features: [
      "Ate 100 pacientes ativos",
      "1 profissional",
      "Ate 1 secretaria/assistente",
      "Agenda, prontuario, financeiro, pacotes e portal",
    ],
  },
  {
    key: "pro-yearly",
    targetPlanId: "professional",
    title: "Nythos PRO anual",
    description: "Economize no plano anual e mantenha sua rotina clinica organizada durante o ano inteiro.",
    price: "R$ 899/ano",
    caption: `Equivale a R$ ${annualSavings.equivalentMonthly.toFixed(2).replace(".", ",")}/mes`,
    ctaLabel: "Assinar PRO anual",
    features: [
      "12 x R$ 89 = R$ 1.068",
      "Economia de R$ 169/ano",
      "Mesmos limites e recursos do PRO mensal",
    ],
  },
  {
    key: "clinic",
    targetPlanId: "clinic",
    title: "Nythos Clinic",
    description: PLAN_DEFINITIONS.clinic.description,
    price: "Sob consulta",
    caption: "Condicoes personalizadas",
    ctaLabel: "Falar sobre Clinic",
    features: [
      "Acima de 100 pacientes ativos",
      "Equipe personalizada",
      "Maior volume de documentos e armazenamento",
      "Necessidades especificas de operacao",
    ],
  },
];

type BillingPlanOption = (typeof BILLING_PLAN_OPTIONS)[number];

type EmbeddedCheckoutState = {
  option: BillingPlanOption;
  clientSecret: string | null;
  checkoutUrl: string | null;
  message: string | null;
  error: string | null;
  awaitingWebhook: boolean;
};

const FEATURE_ROWS: Array<{
  label: string;
  description: string;
  icon: typeof CalendarCheck2;
  feature?: PlanFeatureKey;
  limit?: "team" | "documents";
}> = [
  {
    label: "Agenda",
    description: "Sessoes, bloqueios e rotina semanal.",
    icon: CalendarCheck2,
  },
  {
    label: "Prontuario/evolucao",
    description: "Registros clinicos no contexto do paciente.",
    icon: FileText,
  },
  {
    label: "Financeiro clinico",
    description: "Recebimentos e pendencias ligados a rotina.",
    icon: WalletCards,
  },
  {
    label: "Pacotes de sessoes",
    description: "Saldo e uso de pacotes no fluxo clinico.",
    icon: PackageCheck,
    feature: "packages_enabled",
  },
  {
    label: "Portal do paciente",
    description: "Tarefas, documentos e acompanhamento.",
    icon: BadgeCheck,
    feature: "patient_portal_enabled",
  },
  {
    label: "Documentos",
    description: "Arquivos e consentimentos privados.",
    icon: FileCheck2,
    limit: "documents",
  },
  {
    label: "Recibos",
    description: "Recibos conectados ao atendimento.",
    icon: ReceiptText,
    feature: "receipts_enabled",
  },
  {
    label: "Google Calendar",
    description: "Bloqueios externos e menos conflitos.",
    icon: CalendarCheck2,
    feature: "google_calendar_enabled",
  },
  {
    label: "Audit log",
    description: "Rastreabilidade para acoes criticas.",
    icon: ShieldCheck,
    feature: "audit_log_enabled",
  },
  {
    label: "Relatorios basicos",
    description: "Leituras essenciais da rotina.",
    icon: Layers3,
  },
  {
    label: "Equipe/secretaria",
    description: "Acesso operacional para equipe.",
    icon: Users,
    limit: "team",
  },
];

function formatLimit(limit: number | null, suffix = ""): string {
  if (limit === null) return "Ilimitado";
  if (limit === 0) return "Nao incluso";
  return `${new Intl.NumberFormat("pt-BR").format(limit)}${suffix}`;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function statusBadgeClass(status: SubscriptionStatus): string {
  if (status === "trialing") return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  if (status === "free") return "bg-slate-100 text-slate-700 hover:bg-slate-100";
  if (status === "legacy") return "bg-violet-100 text-violet-700 hover:bg-violet-100";
  if (status === "past_due" || status === "expired" || status === "cancelled") {
    return "bg-rose-100 text-rose-700 hover:bg-rose-100";
  }
  return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
}

function usageToneClass(state: UsageLimitState): string {
  if (state.tone === "over") return "bg-rose-500";
  if (state.tone === "near") return "bg-amber-500";
  return "bg-gradient-to-r from-violet-600 to-teal-500";
}

function usageMessage(state: UsageLimitState): string {
  if (state.tone === "over") return "Uso acima do limite. Nada foi bloqueado nesta fase.";
  if (state.tone === "near") return "Perto do limite do plano.";
  if (state.tone === "unlimited") return "Sem limite definido para este plano.";
  return "Dentro do limite.";
}

function featureAvailability(
  row: (typeof FEATURE_ROWS)[number],
  limits: PlanLimits
) {
  if (row.feature) {
    return limits[row.feature]
      ? { label: "Disponivel", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      : { label: "Indisponivel", className: "bg-slate-100 text-slate-500", icon: XCircle };
  }

  if (row.limit === "team") {
    if (limits.max_team_members === null) {
      return { label: "Ilimitado", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 };
    }

    return limits.max_team_members > 0
      ? { label: `Ate ${limits.max_team_members}`, className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      : { label: "Indisponivel", className: "bg-slate-100 text-slate-500", icon: XCircle };
  }

  if (row.limit === "documents") {
    return limits.max_documents === null || limits.max_documents > 20
      ? { label: "Disponivel", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      : { label: "Limitado", className: "bg-amber-100 text-amber-700", icon: AlertCircle };
  }

  return { label: "Disponivel", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 };
}

function UsageCard({ state }: { state: UsageLimitState }) {
  const limitLabel = state.limit === null ? "Ilimitado" : formatLimit(state.limit);
  const usedLabel = state.key === "storageMb"
    ? `${new Intl.NumberFormat("pt-BR").format(state.used)} MB`
    : new Intl.NumberFormat("pt-BR").format(state.used);
  const displayLimit = state.key === "storageMb" && state.limit !== null
    ? `${formatLimit(state.limit)} MB`
    : limitLabel;

  return (
    <div className="rounded-[24px] border border-white/60 bg-white/55 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">{state.label}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {usageMessage(state)}
          </p>
        </div>
        <p className="text-right text-sm font-black text-foreground">
          {usedLabel}
          <span className="block text-[11px] font-semibold text-muted-foreground">
            / {displayLimit}
          </span>
        </p>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
        {state.percent === null ? (
          <div className="h-full w-full rounded-full bg-slate-300" />
        ) : (
          <div
            className={cn("h-full rounded-full transition-all", usageToneClass(state))}
            style={{ width: `${state.percent}%` }}
          />
        )}
      </div>
    </div>
  );
}

function EmbeddedCheckoutPanel({
  clientSecret,
  onComplete,
}: {
  clientSecret: string;
  onComplete: () => void;
}) {
  return (
    <div className="min-h-[520px] overflow-hidden rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
      <EmbeddedCheckoutProvider
        key={clientSecret}
        stripe={stripePromise}
        options={{ clientSecret, onComplete }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

export default function BillingPage() {
  const [checkoutLoadingKey, setCheckoutLoadingKey] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [embeddedCheckout, setEmbeddedCheckout] = useState<EmbeddedCheckoutState | null>(null);
  const {
    loading,
    planId,
    planName,
    statusLabel,
    subscriptionStatus,
    usageAgainstLimits,
    limits,
    daysLeft,
    subscription,
    canManagePlan,
    isTeamMember,
  } = useSubscription();

  const trialEndsAt = formatDate(subscription.trialEndsAt ?? subscription.currentPeriodEndsAt);
  const currentPlanName = subscriptionStatus === "trialing" ? "Teste gratis PRO" : planName;
  const isSubscriptionLoaded = !loading;
  const canRequestPlanChanges = isSubscriptionLoaded && canManagePlan;
  const portalUnavailableMessage = subscription.provider && subscription.provider !== "stripe"
    ? "Esta conta usa um provedor legado e precisa de migracao manual."
    : planId === "clinic"
      ? "Para planos Clinic, fale com a equipe Nythos."
      : subscriptionStatus === "trialing"
        ? "Assine o Nythos PRO para gerenciar sua assinatura."
        : "Voce ainda nao possui uma assinatura ativa para gerenciar.";

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("portal") !== "returned") return;

    toast.info("Voce voltou do gerenciamento de assinatura", {
      description: "As alteracoes podem levar alguns instantes para aparecer.",
    });
    url.searchParams.delete("portal");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const runCheckout = async (option: BillingPlanOption, mode: "embedded" | "hosted" = "embedded") => {
    const checkoutMode = mode === "embedded" && stripePublishableKey ? "embedded" : "hosted";
    const requestBody = buildCheckoutRequestBody(option.key, checkoutMode);
    if (!requestBody) {
      toast.info("Teste inicial", {
        description: "O trial gratuito e liberado automaticamente para novas contas owner.",
      });
      return false;
    }

    if (checkoutLoadingKey) return false;

    setCheckoutLoadingKey(option.key);
    if (checkoutMode === "embedded") {
      setEmbeddedCheckout({
        option,
        clientSecret: null,
        checkoutUrl: null,
        message: "Preparando checkout seguro...",
        error: null,
        awaitingWebhook: false,
      });
    }

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json().catch(() => ({})) as NythosCheckoutUiResponse;

      if (!response.ok || data.success === false) {
        const message = getCheckoutFailureMessage(data);
        const title = message.includes("pagamento online ainda nao esta disponivel")
          ? "Pagamento online em preparacao"
          : "Nao foi possivel iniciar o pagamento";

        if (checkoutMode === "embedded") {
          setEmbeddedCheckout({
            option,
            clientSecret: null,
            checkoutUrl: null,
            message: null,
            error: message,
            awaitingWebhook: false,
          });
        } else {
          toast.info(title, {
            description: message,
          });
        }
        return false;
      }

      if (checkoutMode === "embedded" && data.clientSecret) {
        setEmbeddedCheckout({
          option,
          clientSecret: data.clientSecret,
          checkoutUrl: data.checkoutUrl ?? null,
          message: data.message || "Checkout iniciado.",
          error: null,
          awaitingWebhook: false,
        });
        return true;
      }

      if (data.checkoutUrl) {
        toast.success(data.message || "Checkout iniciado.", {
          description: checkoutMode === "hosted"
            ? "Voce sera redirecionado para concluir o pagamento."
            : "Abrindo fallback hospedado para concluir o pagamento.",
        });
        window.location.assign(data.checkoutUrl);
        return true;
      }

      toast.info("Assinatura ja em andamento", {
        description: data.message || "Ja existe uma assinatura ativa ou em processamento para este plano.",
      });
      return true;
    } catch {
      const message = "Nao foi possivel iniciar o pagamento agora. Tente novamente em instantes.";
      if (checkoutMode === "embedded") {
        setEmbeddedCheckout({
          option,
          clientSecret: null,
          checkoutUrl: null,
          message: null,
          error: message,
          awaitingWebhook: false,
        });
      } else {
        toast.error("Nao foi possivel iniciar o pagamento", {
          description: message,
        });
      }
      return false;
    } finally {
      setCheckoutLoadingKey(null);
    }
  };

  const handlePlanRequest = async (option: BillingPlanOption) => {
    if (loading) return;

    if (!canManagePlan) {
      toast.info("Assinatura gerenciada pelo responsavel", {
        description: "Somente o responsavel da conta pode gerenciar a assinatura.",
      });
      return;
    }

    if (option.key === "clinic") {
      toast.info("Nythos Clinic", {
        description: getClinicCheckoutMessage(),
      });
      return;
    }

    await runCheckout(option);
  };

  const handlePortalRequest = async () => {
    if (loading) return;

    if (!canManagePlan) {
      toast.info("Assinatura gerenciada pelo responsavel", {
        description: "Somente o responsavel da conta pode gerenciar a assinatura.",
      });
      return;
    }

    if (!subscription.hasStripeCustomer) {
      toast.info("Gerenciamento indisponivel", {
        description: portalUnavailableMessage,
      });
      return;
    }

    if (portalLoading) return;
    setPortalLoading(true);

    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          returnPath: "/dashboard/settings/billing?portal=returned",
        }),
      });
      const data = await response.json().catch(() => ({})) as NythosPortalUiResponse;

      if (!response.ok || data.success === false || !data.url) {
        toast.info("Gerenciamento indisponivel", {
          description: getPortalFailureMessage(data),
        });
        return;
      }

      toast.success(data.message || "Redirecionando para o gerenciamento seguro.");
      window.location.assign(data.url);
    } catch {
      toast.error("Nao foi possivel abrir o gerenciamento", {
        description: "Tente novamente em instantes.",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <div className="rounded-[32px] border border-white/50 bg-white/55 p-6 shadow-sm backdrop-blur-md">
        <Link
          href="/dashboard/settings"
          className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para configuracoes
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              <CreditCard className="h-3.5 w-3.5" />
              Billing da plataforma
            </div>
            <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
              Plano e assinatura
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Acompanhe seu plano, limites de uso e recursos disponiveis no Nythos.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              href="/precos"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 rounded-2xl border-white/70 bg-white/70 px-5")}
            >
              Ver pagina de precos
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Badge className="w-fit rounded-full bg-teal-100 px-4 py-1.5 text-teal-700 hover:bg-teal-100">
              Informativo
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="overflow-hidden rounded-[32px] border-0 shadow-sm glass-panel">
          <CardHeader className="border-b border-white/50 pb-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl text-primary">
                  <ShieldCheck className="h-5 w-5" />
                  Plano atual
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Visao da assinatura da conta no Nythos.
                </p>
              </div>
              <Badge className={cn("w-fit rounded-full px-4 py-1.5", statusBadgeClass(subscriptionStatus))}>
                {loading ? "Carregando" : statusLabel}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-6 md:p-8">
            <div className="rounded-[28px] border border-white/60 bg-white/55 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary/60">
                Plano
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-3xl font-black text-foreground">
                    {loading ? "..." : currentPlanName}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Status: <span className="font-semibold text-foreground">{statusLabel}</span>
                  </p>
                </div>
                {isSubscriptionLoaded && subscriptionStatus === "trialing" && (
                  <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {daysLeft} {daysLeft === 1 ? "dia restante" : "dias restantes"}
                    </span>
                    {trialEndsAt && (
                      <span className="mt-1 block text-xs font-medium text-amber-700/75">
                        Termina em {trialEndsAt}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {canRequestPlanChanges && (
              <div className="flex flex-col gap-4 rounded-[24px] border border-white/70 bg-white/70 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <WalletCards className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-black text-foreground">
                      Gerenciamento da assinatura
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {subscription.hasStripeCustomer
                        ? "Atualize seus dados de cobranca e consulte faturas em um ambiente seguro de pagamento."
                        : portalUnavailableMessage}
                    </p>
                  </div>
                </div>
                {subscription.hasStripeCustomer && (
                  <Button
                    type="button"
                    className="h-11 shrink-0 rounded-2xl px-5"
                    disabled={portalLoading}
                    onClick={handlePortalRequest}
                  >
                    {portalLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    {portalLoading ? "Abrindo..." : "Gerenciar assinatura"}
                  </Button>
                )}
              </div>
            )}

            {isSubscriptionLoaded && subscriptionStatus === "trialing" && (
              <div className="flex gap-3 rounded-[24px] border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                <Clock className="mt-0.5 h-5 w-5 shrink-0" />
                <span>Experiencia Nythos PRO liberada durante o teste.</span>
              </div>
            )}

            {isSubscriptionLoaded && subscriptionStatus === "legacy" && (
              <div className="flex gap-3 rounded-[24px] border border-violet-100 bg-violet-50 p-4 text-sm leading-6 text-violet-800">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <span>Acesso preservado para contas existentes.</span>
              </div>
            )}

            {isSubscriptionLoaded && isTeamMember && (
              <div className="flex gap-3 rounded-[24px] border border-slate-200 bg-white/65 p-4 text-sm leading-6 text-slate-700">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>Este plano e gerenciado pelo responsavel da conta.</span>
              </div>
            )}

            <div className="flex gap-3 rounded-[24px] border border-teal-100 bg-teal-50/80 p-4 text-sm leading-6 text-teal-800">
              <Info className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                Pagamento online em preparacao. Seu plano atual nao sera alterado automaticamente por enquanto.
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[32px] border-0 shadow-sm glass-panel">
          <CardHeader className="border-b border-white/50 pb-5">
            <CardTitle className="text-xl text-primary">Uso do plano</CardTitle>
            <p className="text-sm text-muted-foreground">
              Acompanhe os limites principais da conta. Avisos sao informativos nesta fase.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2 md:p-8">
            {usageAgainstLimits.map((state) => (
              <UsageCard key={state.key} state={state} />
            ))}
            <div className="rounded-[24px] border border-white/60 bg-white/45 p-4 text-xs leading-5 text-muted-foreground sm:col-span-2">
              Armazenamento esta preparado para acompanhamento de arquivos. A medicao detalhada de tamanho pode ser refinada sem bloquear dados existentes.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-[32px] border-0 shadow-sm glass-panel">
        <CardHeader className="border-b border-white/50 pb-5">
          <CardTitle className="text-xl text-primary">Recursos disponiveis</CardTitle>
          <p className="text-sm text-muted-foreground">
            O que esta liberado, limitado ou indisponivel no plano atual.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:p-8">
          {FEATURE_ROWS.map((row) => {
            const availability = featureAvailability(row, limits);
            const Icon = row.icon;
            const StateIcon = availability.icon;

            return (
              <div key={row.label} className="rounded-[24px] border border-white/60 bg-white/55 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", availability.className)}>
                    <StateIcon className="h-3.5 w-3.5" />
                    {availability.label}
                  </span>
                </div>
                <p className="mt-4 text-sm font-bold text-foreground">{row.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.description}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-foreground">
              Comparacao de planos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Compare os planos comerciais e escolha como deseja continuar apos o teste.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          {BILLING_PLAN_OPTIONS.map((option) => {
            const isCurrent =
              (option.key === "trial" && subscriptionStatus === "trialing")
              || (option.key === "pro-monthly" && planId === "professional" && subscriptionStatus !== "trialing")
              || (option.key === "clinic" && planId === "clinic");
            const isTrialOption = option.key === "trial";
            const isLoading = checkoutLoadingKey === option.key;
            const disabled = loading || isCurrent || isTrialOption || !canRequestPlanChanges || Boolean(checkoutLoadingKey);
            const ctaLabel = loading
              ? "Carregando..."
              : isCurrent
              ? "Plano atual"
              : !canRequestPlanChanges
                ? "Gerenciado pelo responsavel"
                : isTrialOption
                  ? "Teste inicial"
                  : isLoading
                    ? "Iniciando..."
                  : option.ctaLabel ?? "Solicitar alteracao";

            return (
              <Card
                key={option.key}
                className={cn(
                  "flex h-full flex-col overflow-hidden rounded-[28px] border-0 shadow-sm transition-all",
                  option.featured ? "ring-2 ring-primary/30" : "",
                  isCurrent ? "bg-primary/5" : "bg-white/75"
                )}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-xl">{option.title}</CardTitle>
                    {option.featured && (
                      <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
                        Mais indicado
                      </Badge>
                    )}
                    {option.badge && !isCurrent && (
                      <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                        {option.badge}
                      </Badge>
                    )}
                    {isCurrent && !option.featured && (
                      <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                        Atual
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {option.description}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col space-y-5">
                  <div>
                    <p className="text-3xl font-black text-foreground">
                      {option.price}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">
                      {option.caption}
                    </p>
                  </div>

                  <ul className="space-y-2">
                    {option.features.map((feature) => (
                      <li key={feature} className="flex gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handlePlanRequest(option)}
                    className={cn(
                      buttonVariants({ variant: isCurrent ? "secondary" : "outline", size: "lg" }),
                      "mt-auto w-full rounded-2xl",
                      !disabled && "border-primary/30 bg-white text-primary hover:bg-primary/5",
                      disabled && "cursor-not-allowed opacity-70"
                    )}
                  >
                    {ctaLabel}
                  </button>
                  {!loading && !canManagePlan && !isCurrent && (
                    <p className="text-center text-xs leading-5 text-muted-foreground">
                      Somente o responsavel da conta pode gerenciar o plano.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog
        open={Boolean(embeddedCheckout)}
        onOpenChange={(open) => {
          if (!open) setEmbeddedCheckout(null);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[28px] border-0 bg-[#f8fafc] p-0 shadow-2xl sm:max-w-5xl">
          <DialogHeader className="border-b border-white/70 bg-white/90 px-5 py-5 sm:px-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <DialogTitle className="text-2xl font-black text-foreground">
                  Assinar Nythos PRO
                </DialogTitle>
                <DialogDescription className="mt-2 max-w-2xl leading-6">
                  {embeddedCheckout?.option.title ?? "Nythos PRO"} dentro da sua conta Nythos.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-fit rounded-2xl bg-white"
                onClick={() => setEmbeddedCheckout(null)}
              >
                Voltar
              </Button>
            </div>
          </DialogHeader>

          {embeddedCheckout && (
            <div className="grid gap-5 p-5 lg:grid-cols-[0.72fr_1.28fr] sm:p-7">
              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary/70">
                    Plano selecionado
                  </p>
                  <p className="mt-3 text-2xl font-black text-foreground">
                    {embeddedCheckout.option.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {embeddedCheckout.option.caption}
                  </p>
                  <p className="mt-5 text-3xl font-black text-foreground">
                    {embeddedCheckout.option.price}
                  </p>
                </div>

                <div className="rounded-[24px] border border-teal-100 bg-teal-50/85 p-4 text-sm leading-6 text-teal-800">
                  <div className="flex gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>O pagamento e processado pelo Stripe. O Nythos nao coleta nem salva dados de cartao.</span>
                  </div>
                </div>

                {(embeddedCheckout.error || !embeddedCheckout.clientSecret) && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-2xl bg-white"
                    disabled={Boolean(checkoutLoadingKey)}
                    onClick={() => runCheckout(embeddedCheckout.option, "hosted")}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Usar checkout seguro externo
                  </Button>
                )}
              </div>

              <div className="rounded-[28px] border border-white/70 bg-white/70 p-4 shadow-sm">
                {embeddedCheckout.awaitingWebhook ? (
                  <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[24px] bg-emerald-50 p-6 text-center">
                    <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                    <h3 className="mt-5 text-xl font-black text-emerald-950">
                      Pagamento concluido
                    </h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-emerald-800">
                      Estamos aguardando a confirmacao do webhook para atualizar sua assinatura.
                    </p>
                  </div>
                ) : embeddedCheckout.error ? (
                  <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[24px] bg-rose-50 p-6 text-center">
                    <AlertCircle className="h-12 w-12 text-rose-600" />
                    <h3 className="mt-5 text-xl font-black text-rose-950">
                      Nao foi possivel abrir o checkout
                    </h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-rose-800">
                      {embeddedCheckout.error}
                    </p>
                  </div>
                ) : embeddedCheckout.clientSecret ? (
                  <EmbeddedCheckoutPanel
                    clientSecret={embeddedCheckout.clientSecret}
                    onComplete={() => {
                      setEmbeddedCheckout((current) => current
                        ? {
                            ...current,
                            awaitingWebhook: true,
                            message: "Pagamento concluido. Aguardando confirmacao.",
                          }
                        : current);
                      toast.success("Pagamento concluido", {
                        description: "A assinatura sera atualizada assim que o webhook confirmar.",
                      });
                    }}
                  />
                ) : (
                  <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[24px] bg-slate-50 p-6 text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="mt-4 text-sm font-semibold text-slate-700">
                      {embeddedCheckout.message ?? "Preparando checkout seguro..."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
