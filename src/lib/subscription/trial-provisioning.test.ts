import { describe, expect, it } from "vitest";
import {
  buildTrialSubscriptionInsert,
  canProvisionTrialForProfile,
  NYTHOS_TRIAL_DAYS,
} from "./trial-provisioning";

describe("trial provisioning", () => {
  it("creates a 14 day Nythos PRO trial for a new owner", () => {
    const now = new Date("2026-05-22T12:00:00.000Z");
    const trial = buildTrialSubscriptionInsert("owner-1", now);

    expect(NYTHOS_TRIAL_DAYS).toBe(14);
    expect(trial).toMatchObject({
      owner_user_id: "owner-1",
      plan_id: "professional",
      status: "trialing",
      trial_started_at: "2026-05-22T12:00:00.000Z",
      trial_ends_at: "2026-06-05T12:00:00.000Z",
      provider: null,
      provider_customer_id: null,
      provider_subscription_id: null,
    });
  });

  it("provisions trial only for account owners", () => {
    expect(canProvisionTrialForProfile({ role: "therapist", employer_id: null })).toBe(true);
    expect(canProvisionTrialForProfile({ role: "admin", employer_id: null })).toBe(true);
    expect(canProvisionTrialForProfile({ role: "secretary", employer_id: null })).toBe(false);
    expect(canProvisionTrialForProfile({ role: "therapist", employer_id: "owner-1" })).toBe(false);
    expect(canProvisionTrialForProfile(null)).toBe(false);
  });
});
