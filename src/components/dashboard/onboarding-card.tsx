"use client";

import { useEffect, useMemo, useState, type ElementType } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDollarSign,
  FileSignature,
  Minimize2,
  PackageCheck,
  Sparkles,
  UserPlus,
  Wifi,
} from "lucide-react";
import { getCalendarStatus } from "@/app/actions/calendar-sync";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  buildOnboardingProgress,
  getOnboardingCompletionFlags,
  ONBOARDING_STEPS,
  type OnboardingStepId,
} from "@/lib/onboarding-progress";
import { useSubscription } from "@/hooks/use-subscription";

const STORAGE_KEY = "nythos:onboarding:v1:collapsed";
const LEGACY_HIDDEN_STORAGE_KEY = "nythos:onboarding:v1:hidden";
const LOAD_WARNING_MESSAGE = "Nao foi possivel atualizar todos os passos agora.";

const stepIcons: Record<OnboardingStepId, ElementType> = {
  professional_profile: BadgeCheck,
  default_session_price: CircleDollarSign,
  first_patient: UserPlus,
  first_session: CalendarCheck2,
  google_calendar: Wifi,
  clinic_identity: Building2,
  patient_portal: FileSignature,
  session_package: PackageCheck,
};

function isRejected(result: PromiseSettledResult<unknown>): boolean {
  return result.status === "rejected";
}

function LoadingRows() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-white/65 p-3">
          <div className="size-9 animate-pulse rounded-xl bg-primary/10" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/3 animate-pulse rounded-full bg-slate-200" />
            <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function OnboardingCard() {
  const { therapistId, loading: subscriptionLoading } = useSubscription();
  const supabase = useMemo(() => createClient(), []);
  const [collapsed, setCollapsed] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasLoadWarning, setHasLoadWarning] = useState(false);
  const [flags, setFlags] = useState(() => getOnboardingCompletionFlags({}));

  const progress = useMemo(() => buildOnboardingProgress(flags), [flags]);
  const nextStep = progress.nextStep ?? ONBOARDING_STEPS[0];
  const canShowContent = storageReady && (!loading || progress.completed > 0);

  useEffect(() => {
    const legacyHidden = window.localStorage.getItem(LEGACY_HIDDEN_STORAGE_KEY) === "true";
    const storedCollapsed = window.localStorage.getItem(STORAGE_KEY) === "true";
    const shouldCollapse = storedCollapsed || legacyHidden;

    if (legacyHidden) {
      window.localStorage.setItem(STORAGE_KEY, "true");
      window.localStorage.removeItem(LEGACY_HIDDEN_STORAGE_KEY);
    }

    queueMicrotask(() => {
      setCollapsed(shouldCollapse);
      setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (subscriptionLoading) return;

    if (!therapistId) {
      queueMicrotask(() => {
        setLoading(false);
        setHasLoadWarning(true);
      });
      return;
    }

    const ownerUserId = therapistId;
    let cancelled = false;

    async function loadOnboardingState() {
      setLoading(true);
      setHasLoadWarning(false);

      const [
        profileRes,
        patientsRes,
        sessionsRes,
        packagesRes,
        portalRes,
        calendarStatus,
      ] = await Promise.allSettled([
        supabase
          .from("profiles")
          .select("full_name, crp, clinic_name, session_price_default, clinic_logo_url, signature_url")
          .eq("id", ownerUserId)
          .maybeSingle(),
        supabase
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("user_id", ownerUserId),
        supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", ownerUserId),
        supabase
          .from("session_packages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", ownerUserId),
        supabase
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("user_id", ownerUserId)
          .not("access_token_issued_at", "is", null)
          .is("access_token_revoked_at", null),
        getCalendarStatus(),
      ]);

      if (cancelled) return;

      const warning = [
        profileRes,
        patientsRes,
        sessionsRes,
        packagesRes,
        portalRes,
        calendarStatus,
      ].some((result) => (
        isRejected(result)
        || (result.status === "fulfilled" && "error" in result.value && Boolean(result.value.error))
      ));

      setFlags(getOnboardingCompletionFlags({
        profile: profileRes.status === "fulfilled" && !profileRes.value.error
          ? profileRes.value.data ?? null
          : null,
        patientsCount: patientsRes.status === "fulfilled" && !patientsRes.value.error
          ? patientsRes.value.count ?? 0
          : 0,
        sessionsCount: sessionsRes.status === "fulfilled" && !sessionsRes.value.error
          ? sessionsRes.value.count ?? 0
          : 0,
        googleCalendarConnected: calendarStatus.status === "fulfilled"
          ? calendarStatus.value.connected
          : false,
        portalConfiguredCount: portalRes.status === "fulfilled" && !portalRes.value.error
          ? portalRes.value.count ?? 0
          : 0,
        sessionPackagesCount: packagesRes.status === "fulfilled" && !packagesRes.value.error
          ? packagesRes.value.count ?? 0
          : 0,
      }));
      setHasLoadWarning(warning);
      setLoading(false);
    }

    void loadOnboardingState();

    return () => {
      cancelled = true;
    };
  }, [supabase, therapistId, subscriptionLoading]);

  function collapseOnboarding() {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setCollapsed(true);
  }

  function expandOnboarding() {
    window.localStorage.setItem(STORAGE_KEY, "false");
    setCollapsed(false);
  }

  if (storageReady && !loading && progress.isComplete) return null;

  if (collapsed && canShowContent) {
    return (
      <section className="animate-fade-in rounded-3xl border border-primary/10 bg-card/95 p-4 shadow-[0_16px_42px_rgba(41,31,67,0.08)] ring-1 ring-white/80">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/70">
                Primeiros passos
              </p>
              <h2 className="mt-1 text-base font-black tracking-tight text-foreground md:text-lg">
                Seu setup esta {progress.percent}% pronto
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Proximo: <span className="font-semibold text-foreground">{nextStep.title}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-40 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>{progress.completed}/{progress.total}</span>
                <span>{progress.percent}%</span>
              </div>
              <Progress value={progress.percent} className="[&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-primary [&_[data-slot=progress-indicator]]:to-teal-500" />
            </div>
            <Button type="button" variant="outline" className="rounded-2xl bg-white/70" onClick={expandOnboarding}>
              Reabrir onboarding
              <ChevronDown className="size-4" />
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="animate-fade-in overflow-hidden rounded-3xl border border-primary/10 bg-card/95 shadow-[0_16px_42px_rgba(41,31,67,0.08)] ring-1 ring-white/80">
      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)] lg:items-start md:p-5">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <Sparkles className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/70">
                  Primeiros passos
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-foreground md:text-2xl">
                  Prepare uma rotina clinica com calma
                </h2>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
              onClick={collapseOnboarding}
              aria-label="Minimizar primeiros passos"
            >
              <Minimize2 className="size-4" />
            </Button>
          </div>

          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Alguns ajustes iniciais deixam prontuario, agenda, financeiro e portal mais coerentes desde o primeiro atendimento.
          </p>

          <div className="rounded-2xl border border-white/70 bg-white/65 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-foreground">
                {loading ? "Atualizando seu setup" : `${progress.completed} de ${progress.total} passos concluidos`}
              </span>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                {loading ? "..." : `${progress.percent}%`}
              </span>
            </div>
            <Progress
              value={loading ? Math.max(progress.percent, 12) : progress.percent}
              className="mt-3 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-primary [&_[data-slot=progress-indicator]]:to-teal-500"
            />
          </div>

          {hasLoadWarning && (
            <div className="flex gap-2 rounded-2xl border border-amber-100 bg-amber-50/80 p-3 text-xs leading-5 text-amber-800">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{LOAD_WARNING_MESSAGE}</span>
            </div>
          )}

          {!loading && nextStep && (
            <div className="rounded-3xl border border-primary/10 bg-gradient-to-br from-primary/[0.08] to-teal-50/80 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary/70">Proximo passo recomendado</p>
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-black text-foreground">{nextStep.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{nextStep.description}</p>
                </div>
                <Link
                  href={nextStep.href}
                  className={cn(buttonVariants({ size: "lg" }), "h-11 shrink-0 rounded-2xl px-5")}
                >
                  {nextStep.ctaLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          )}

          {loading && (
            <div className="rounded-3xl border border-primary/10 bg-primary/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary/70">Proximo passo</p>
              <div className="mt-3 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200" />
                <div className="h-3 w-full max-w-sm animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <LoadingRows />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {progress.steps.map((step) => {
              const Icon = stepIcons[step.id];
              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex min-w-0 items-start gap-3 rounded-2xl border p-3 transition-colors",
                    step.completed
                      ? "border-emerald-100 bg-emerald-50/70"
                      : "border-border/70 bg-white/70 hover:border-primary/20"
                  )}
                >
                  <div className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1",
                    step.completed
                      ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                      : "bg-primary/8 text-primary ring-primary/10"
                  )}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold leading-5 text-foreground">{step.title}</p>
                      {step.completed ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      ) : (
                        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/45" />
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {step.description}
                    </p>
                    {!step.completed && (
                      <Link
                        href={step.href}
                        className="mt-2 inline-flex text-xs font-bold text-primary underline-offset-4 hover:underline"
                      >
                        {step.ctaLabel}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
