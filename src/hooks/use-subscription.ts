"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  canCreatePatient,
  canInviteTeamMember,
  canManageSubscription,
  getEffectiveSubscriptionPlanId,
  canUploadDocument,
  getEffectiveSubscriptionStatus,
  getPlanLabel,
  getPlanLimits,
  getSubscriptionStateLabel,
  getUsageAgainstLimits,
  type PlanLimits,
  type SubscriptionPlanId,
  type SubscriptionStatus,
  type SubscriptionUsage,
  type UsageLimitState,
} from "@/lib/subscription/plan-rules";

type AccountSubscriptionState = {
  id: string | null;
  ownerUserId: string | null;
  planId: SubscriptionPlanId;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  provider: string | null;
  hasStripeCustomer: boolean;
};

type AccountSubscriptionRow = {
  id: string;
  owner_user_id: string;
  plan_id: string | null;
  status: string | null;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  cancel_at_period_end: boolean | null;
  provider: string | null;
};

const LEGACY_SUBSCRIPTION: AccountSubscriptionState = {
  id: null,
  ownerUserId: null,
  planId: "legacy",
  status: "legacy",
  trialEndsAt: null,
  currentPeriodEndsAt: null,
  cancelAtPeriodEnd: false,
  provider: null,
  hasStripeCustomer: false,
};

function buildTrialFallback(ownerUserId: string): AccountSubscriptionState {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  return {
    id: null,
    ownerUserId,
    planId: "professional",
    status: "trialing",
    trialEndsAt: trialEndsAt.toISOString(),
    currentPeriodEndsAt: null,
    cancelAtPeriodEnd: false,
    provider: null,
    hasStripeCustomer: false,
  };
}

async function ensureOwnerTrialSubscription(): Promise<AccountSubscriptionRow | null> {
  try {
    const response = await fetch("/api/subscription/ensure-trial", {
      method: "POST",
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.subscription) return null;
    return data.subscription as AccountSubscriptionRow;
  } catch {
    return null;
  }
}

function daysUntil(date: string | null): number {
  if (!date) return 0;
  const diffMs = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

async function countRows(
  supabase: ReturnType<typeof createClient>,
  table: "patients" | "profiles" | "patient_documents",
  applyFilters: (query: any) => any
): Promise<number> {
  const query = (supabase as any)
    .from(table)
    .select("id", { count: "exact", head: true });

  const { count, error } = await applyFilters(query);
  if (error) return 0;
  return count ?? 0;
}

export function useSubscription() {
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [isTrial, setIsTrial] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [isSecretary, setIsSecretary] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [therapistId, setTherapistId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<AccountSubscriptionState>(LEGACY_SUBSCRIPTION);
  const [usage, setUsage] = useState<SubscriptionUsage>({});
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadSubscription() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setHasSubscription(false);
            setLoading(false);
          }
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, employer_id")
          .eq("id", user.id)
          .maybeSingle();

        const role = profile?.role || "therapist";
        const employerId = profile?.employer_id ?? null;
        const ownerUserId = employerId || user.id;

        const [
          subscriptionResult,
          activePatients,
          teamMembers,
          documents,
        ] = await Promise.all([
          supabase
            .from("account_subscriptions")
            .select("id, owner_user_id, plan_id, status, trial_ends_at, current_period_ends_at, cancel_at_period_end, provider")
            .eq("owner_user_id", ownerUserId)
            .maybeSingle(),
          countRows(supabase, "patients", (query) =>
            query.eq("user_id", ownerUserId).eq("status", "active")
          ),
          countRows(supabase, "profiles", (query) =>
            query.eq("employer_id", ownerUserId).eq("role", "secretary")
          ),
          countRows(supabase, "patient_documents", (query) =>
            query.eq("therapist_id", ownerUserId)
          ),
        ]);

        let row = subscriptionResult.error ? null : subscriptionResult.data as AccountSubscriptionRow | null;

        if (!row && !employerId && role !== "secretary") {
          row = await ensureOwnerTrialSubscription();
        }

        const effectiveStatus = getEffectiveSubscriptionStatus({
          status: row?.status,
          planId: row?.plan_id,
          trialEndsAt: row?.trial_ends_at,
          currentPeriodEndsAt: row?.current_period_ends_at,
        });
        const planId = getEffectiveSubscriptionPlanId({
          planId: row?.plan_id,
          status: effectiveStatus,
          trialEndsAt: row?.trial_ends_at,
          currentPeriodEndsAt: row?.current_period_ends_at,
        });
        const nextSubscription: AccountSubscriptionState = row
          ? {
              id: row.id,
              ownerUserId: row.owner_user_id,
              planId,
              status: effectiveStatus,
              trialEndsAt: row.trial_ends_at,
              currentPeriodEndsAt: row.current_period_ends_at,
              cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
              provider: row.provider,
              hasStripeCustomer: row.provider === "stripe",
            }
          : !employerId && role !== "secretary"
            ? buildTrialFallback(ownerUserId)
            : { ...LEGACY_SUBSCRIPTION, ownerUserId };

        const nextUsage: SubscriptionUsage = {
          activePatients,
          teamMembers,
          documents,
          storageMb: 0,
        };

        if (!cancelled) {
          setIsSecretary(role === "secretary");
          setUserRole(role);
          setCurrentUserId(user.id);
          setTherapistId(ownerUserId);
          setSubscription(nextSubscription);
          setUsage(nextUsage);
          setIsTrial(nextSubscription.status === "trialing");
          setDaysLeft(daysUntil(nextSubscription.trialEndsAt ?? nextSubscription.currentPeriodEndsAt));

          // Fase fundacional: nao travar dados clinicos existentes por ausencia
          // de assinatura ou billing legado. Bloqueios ficam suaves na UI.
          setHasSubscription(true);
        }
      } catch {
        if (!cancelled) {
          setSubscription(LEGACY_SUBSCRIPTION);
          setUsage({});
          setHasSubscription(true);
          setIsTrial(false);
          setUserRole(null);
          setCurrentUserId(null);
          setDaysLeft(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSubscription();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const planName = getPlanLabel(subscription.planId);
  const statusLabel = getSubscriptionStateLabel(subscription.status);
  const limits: PlanLimits = getPlanLimits(subscription.planId);
  const usageAgainstLimits: UsageLimitState[] = getUsageAgainstLimits(usage, limits);
  const canManagePlan = canManageSubscription({
    role: userRole,
    isSecretary,
    userId: currentUserId,
    ownerUserId: subscription.ownerUserId,
  });

  const gateAction = (action: () => void) => {
    if (loading) return;
    action();
  };

  return {
    hasSubscription,
    isTrial,
    daysLeft,
    loading,
    gateAction,
    isSecretary,
    isTeamMember: Boolean(currentUserId && subscription.ownerUserId && currentUserId !== subscription.ownerUserId),
    userRole,
    therapistId,
    subscription,
    canManagePlan,
    planId: subscription.planId,
    planName,
    subscriptionStatus: subscription.status,
    statusLabel,
    limits,
    usage,
    usageAgainstLimits,
    canCreatePatient: canCreatePatient(subscription.planId, usage),
    canInviteTeamMember: canInviteTeamMember(subscription.planId, usage),
    canUploadDocument: canUploadDocument(subscription.planId, usage),
  };
}
