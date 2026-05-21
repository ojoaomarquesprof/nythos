"use client";

import Link from "next/link";
import { ArrowLeft, Check, Clock, CreditCard, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { useSubscription } from "@/hooks/use-subscription";
import { PLAN_DEFINITIONS, type SubscriptionPlanId } from "@/lib/subscription/plan-rules";
import { cn } from "@/lib/utils";

const COMMERCIAL_PLAN_IDS: SubscriptionPlanId[] = ["free", "professional", "clinic"];

function formatPrice(value: number | null): string {
  if (value === null) return "Sob consulta";
  if (value === 0) return "R$ 0";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function BillingPage() {
  const {
    loading,
    planId,
    planName,
    statusLabel,
    subscriptionStatus,
    usage,
    limits,
    daysLeft,
  } = useSubscription();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <div className="rounded-[32px] border border-white/40 bg-white/45 p-6 shadow-sm backdrop-blur-md">
        <Link
          href="/dashboard/settings"
          className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para configuracoes
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Billing da plataforma
            </div>
            <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
              Planos e assinatura
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Esta tela prepara a estrutura comercial do Nythos. Checkout e
              cobranca real ainda nao estao ativos nesta fase.
            </p>
          </div>
          <Badge className="w-fit rounded-full bg-teal-100 px-4 py-1.5 text-teal-700 hover:bg-teal-100">
            Sem cobranca ativa
          </Badge>
        </div>
      </div>

      <Card className="overflow-hidden rounded-[32px] border-0 shadow-sm glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl text-primary">
            <CreditCard className="h-5 w-5" />
            Plano atual
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 p-8 pt-0 md:grid-cols-[1fr_1.2fr]">
          <div className="rounded-3xl border border-white/60 bg-white/50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary/60">
              Conta
            </p>
            <p className="mt-2 text-3xl font-black text-foreground">
              {loading ? "..." : planName}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Status: <span className="font-semibold text-foreground">{statusLabel}</span>
            </p>
            {subscriptionStatus === "trialing" && (
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                <Clock className="h-3.5 w-3.5" />
                {daysLeft} {daysLeft === 1 ? "dia restante" : "dias restantes"}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/60 bg-white/50 p-4">
              <p className="text-xs text-muted-foreground">Pacientes ativos</p>
              <p className="mt-2 text-xl font-black text-foreground">
                {usage.activePatients ?? 0} / {limits.max_active_patients ?? "Ilimitado"}
              </p>
            </div>
            <div className="rounded-3xl border border-white/60 bg-white/50 p-4">
              <p className="text-xs text-muted-foreground">Equipe</p>
              <p className="mt-2 text-xl font-black text-foreground">
                {usage.teamMembers ?? 0} / {limits.max_team_members ?? "Ilimitado"}
              </p>
            </div>
            <div className="rounded-3xl border border-white/60 bg-white/50 p-4">
              <p className="text-xs text-muted-foreground">Documentos</p>
              <p className="mt-2 text-xl font-black text-foreground">
                {usage.documents ?? 0} / {limits.max_documents ?? "Ilimitado"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {COMMERCIAL_PLAN_IDS.map((id) => {
          const plan = PLAN_DEFINITIONS[id];
          const isCurrent = planId === id;

          return (
            <Card
              key={plan.id}
              className={cn(
                "rounded-[28px] border-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                isCurrent ? "ring-2 ring-primary/40" : ""
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  {isCurrent && (
                    <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
                      Atual
                    </Badge>
                  )}
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {plan.description}
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <p className="text-3xl font-black text-foreground">
                    {formatPrice(plan.monthlyPrice)}
                  </p>
                  <p className="text-xs font-medium text-muted-foreground">
                    {plan.monthlyPrice === null ? "para clinicas" : "por mes"}
                  </p>
                </div>

                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled
                  className={cn(
                    buttonVariants({ variant: isCurrent ? "secondary" : "outline", size: "lg" }),
                    "w-full cursor-not-allowed rounded-2xl"
                  )}
                >
                  {isCurrent ? "Plano atual" : "Checkout em preparacao"}
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
