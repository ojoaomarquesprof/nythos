"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Crown, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";

function formatLimit(limit: number | null): string {
  return limit === null ? "Ilimitado" : String(limit);
}

export function CurrentPlanCard() {
  const {
    loading,
    planName,
    statusLabel,
    subscriptionStatus,
    usage,
    limits,
    usageAgainstLimits,
    daysLeft,
  } = useSubscription();

  const activePatientsState = usageAgainstLimits.find((state) => state.key === "activePatients");
  const requiresAttention = subscriptionStatus === "past_due"
    || subscriptionStatus === "expired"
    || subscriptionStatus === "cancelled";

  return (
    <Card className="overflow-hidden rounded-[32px] border-0 shadow-sm glass-panel">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg text-primary">
              <Crown className="h-5 w-5" />
              Plano atual
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Fundacao de assinatura da plataforma Nythos.
            </p>
          </div>
          <Badge
            className={
              requiresAttention
                ? "rounded-full bg-amber-100 px-3 py-1 text-amber-700 hover:bg-amber-100"
                : "rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 hover:bg-emerald-100"
            }
          >
            {loading ? "Carregando" : statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-8 pt-2">
        <div className="rounded-3xl border border-white/50 bg-white/45 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary/60">
            Plano
          </p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-black text-foreground">
                {loading ? "..." : planName}
              </p>
              {subscriptionStatus === "trialing" && (
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {daysLeft} {daysLeft === 1 ? "dia restante" : "dias restantes"} de teste.
                </p>
              )}
            </div>
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-semibold text-foreground">
              <Users className="h-4 w-4 text-primary" />
              Pacientes ativos
            </span>
            <span className="font-bold text-foreground">
              {usage.activePatients ?? 0} / {formatLimit(limits.max_active_patients)}
            </span>
          </div>
          {activePatientsState?.percent !== null && activePatientsState?.percent !== undefined && (
            <div className="h-2 overflow-hidden rounded-full bg-primary/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 to-teal-500 transition-all"
                style={{ width: `${activePatientsState.percent}%` }}
              />
            </div>
          )}
          {activePatientsState?.isOverLimit && (
            <div className="flex gap-2 rounded-2xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Seu uso esta acima do limite deste plano. Nesta fase, o acesso
                aos dados existentes permanece preservado.
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-2xl bg-white/45 p-3">
            <p className="text-muted-foreground">Equipe</p>
            <p className="mt-1 font-bold text-foreground">
              {usage.teamMembers ?? 0} / {formatLimit(limits.max_team_members)}
            </p>
          </div>
          <div className="rounded-2xl bg-white/45 p-3">
            <p className="text-muted-foreground">Documentos</p>
            <p className="mt-1 font-bold text-foreground">
              {usage.documents ?? 0} / {formatLimit(limits.max_documents)}
            </p>
          </div>
        </div>

        <Link
          href="/dashboard/settings/billing"
          className={cn(buttonVariants({ size: "lg" }), "h-11 w-full rounded-2xl font-bold")}
        >
          Ver planos
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
