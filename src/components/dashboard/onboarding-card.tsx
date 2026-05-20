"use client";

import { useEffect, useMemo, useState, type ElementType } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  EyeOff,
  FileSignature,
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

const STORAGE_KEY = "nythos:onboarding:v1:hidden";

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

export function OnboardingCard() {
  const { therapistId } = useSubscription();
  const supabase = useMemo(() => createClient() as any, []);
  const [hidden, setHidden] = useState(true);
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState(() => getOnboardingCompletionFlags({}));

  const progress = useMemo(() => buildOnboardingProgress(flags), [flags]);

  useEffect(() => {
    setHidden(window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  useEffect(() => {
    if (!therapistId) return;

    let cancelled = false;

    async function loadOnboardingState() {
      setLoading(true);

      const [profileRes, patientsRes, sessionsRes, packagesRes, portalRes, calendarStatus] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, crp, clinic_name, session_price_default, clinic_logo_url, signature_url")
          .eq("id", therapistId)
          .maybeSingle(),
        supabase
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("user_id", therapistId),
        supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", therapistId),
        supabase
          .from("session_packages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", therapistId),
        supabase
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("user_id", therapistId)
          .not("access_token_issued_at", "is", null)
          .is("access_token_revoked_at", null),
        getCalendarStatus(),
      ]);

      if (cancelled) return;

      setFlags(getOnboardingCompletionFlags({
        profile: profileRes.data ?? null,
        patientsCount: patientsRes.count ?? 0,
        sessionsCount: sessionsRes.count ?? 0,
        googleCalendarConnected: calendarStatus.connected,
        portalConfiguredCount: portalRes.count ?? 0,
        sessionPackagesCount: packagesRes.count ?? 0,
      }));
      setLoading(false);
    }

    loadOnboardingState();

    return () => {
      cancelled = true;
    };
  }, [supabase, therapistId]);

  function hideOnboarding() {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setHidden(true);
  }

  if (hidden || (!loading && progress.isComplete)) return null;

  const nextStep = progress.nextStep ?? ONBOARDING_STEPS[0];

  return (
    <section className="animate-fade-in overflow-hidden rounded-3xl border border-primary/10 bg-card/95 shadow-[0_16px_42px_rgba(41,31,67,0.08)] ring-1 ring-white/80">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(440px,1.1fr)] lg:items-start md:p-5">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <Sparkles className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/70">
                  Primeiros passos
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                  Configure o essencial para comecar bem
                </h2>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
              onClick={hideOnboarding}
              aria-label="Ocultar primeiros passos"
            >
              <EyeOff className="size-4" />
            </Button>
          </div>

          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Configure o essencial para comecar a atender com seguranca e organizacao.
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-foreground">
                {loading ? "Calculando progresso" : `${progress.completed} de ${progress.total} concluidos`}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{loading ? "..." : `${progress.percent}%`}</span>
            </div>
            <Progress value={loading ? 0 : progress.percent} className="gap-2" />
          </div>

          {!loading && nextStep && (
            <div className="rounded-2xl border border-primary/10 bg-primary/[0.04] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary/70">Proximo passo</p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{nextStep.title}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{nextStep.description}</p>
                </div>
                <Link
                  href={nextStep.href}
                  className={cn(buttonVariants({ size: "sm" }), "h-9 shrink-0 rounded-xl")}
                >
                  {nextStep.ctaLabel}
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {progress.steps.map((step) => {
            const Icon = stepIcons[step.id];
            return (
              <div
                key={step.id}
                className={cn(
                  "flex min-w-0 items-center gap-3 rounded-2xl border p-3 transition-colors",
                  step.completed
                    ? "border-emerald-100 bg-emerald-50/65"
                    : "border-border/70 bg-white/70"
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
                  <p className="truncate text-sm font-semibold text-foreground">{step.title}</p>
                  <Link
                    href={step.href}
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {step.ctaLabel}
                  </Link>
                </div>
                {step.completed ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground/45" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
