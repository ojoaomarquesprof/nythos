import type { AccountSubscriptionInsert } from "@/types/database";

export const NYTHOS_TRIAL_DAYS = 14;

export type TrialProvisionProfile = {
  role?: string | null;
  employer_id?: string | null;
};

export function canProvisionTrialForProfile(profile: TrialProvisionProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === "secretary") return false;
  if (profile.employer_id) return false;
  return true;
}

export function buildTrialSubscriptionInsert(
  ownerUserId: string,
  now: Date = new Date()
): AccountSubscriptionInsert {
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + NYTHOS_TRIAL_DAYS);

  return {
    owner_user_id: ownerUserId,
    plan_id: "professional",
    status: "trialing",
    trial_started_at: now.toISOString(),
    trial_ends_at: trialEndsAt.toISOString(),
    provider: null,
    provider_customer_id: null,
    provider_subscription_id: null,
    metadata: {
      source: "trial_read_repair",
      billing_effects_enabled: false,
    },
  };
}
