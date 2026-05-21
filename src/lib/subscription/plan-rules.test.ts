import { describe, expect, it } from "vitest";
import {
  canCreatePackage,
  canCreatePatient,
  canInviteTeamMember,
  canUploadDocument,
  getFeatureAccess,
  getPlanLabel,
  getPlanLimits,
  getSubscriptionStateLabel,
  getUsageAgainstLimits,
  isTrialExpired,
  normalizePlanId,
} from "./plan-rules";

describe("subscription plan rules", () => {
  it("normalizes unknown plans as legacy to preserve current access", () => {
    expect(normalizePlanId(null)).toBe("legacy");
    expect(normalizePlanId("monthly")).toBe("legacy");
    expect(getPlanLabel("legacy")).toBe("Legacy");
    expect(getPlanLimits("legacy").max_active_patients).toBeNull();
  });

  it("keeps allowed features by plan", () => {
    expect(getFeatureAccess("free", "google_calendar_enabled")).toBe(false);
    expect(getFeatureAccess("professional", "google_calendar_enabled")).toBe(true);
    expect(canCreatePackage("free")).toBe(false);
    expect(canCreatePackage("professional")).toBe(true);
  });

  it("detects usage near and over limits", () => {
    const states = getUsageAgainstLimits(
      { activePatients: 5, documents: 18, teamMembers: 0, storageMb: 200 },
      getPlanLimits("free")
    );

    expect(states.find((state) => state.key === "activePatients")).toMatchObject({
      used: 5,
      limit: 5,
      percent: 100,
      isOverLimit: true,
    });
    expect(states.find((state) => state.key === "documents")).toMatchObject({
      percent: 90,
      isNearLimit: true,
    });
  });

  it("checks soft limits for creation actions", () => {
    expect(canCreatePatient("free", { activePatients: 4 })).toBe(true);
    expect(canCreatePatient("free", { activePatients: 5 })).toBe(false);
    expect(canInviteTeamMember("free", { teamMembers: 0 })).toBe(false);
    expect(canInviteTeamMember("clinic", { teamMembers: 9 })).toBe(true);
    expect(canUploadDocument("free", { documents: 20, storageMb: 100 })).toBe(false);
    expect(canUploadDocument("legacy", { documents: 9999, storageMb: 999999 })).toBe(true);
  });

  it("detects expired trials", () => {
    const now = new Date("2026-05-21T12:00:00.000Z");

    expect(isTrialExpired({ status: "trialing", trialEndsAt: "2026-05-20T12:00:00.000Z" }, now)).toBe(true);
    expect(isTrialExpired({ status: "trialing", trialEndsAt: "2026-05-22T12:00:00.000Z" }, now)).toBe(false);
    expect(isTrialExpired({ status: "active", trialEndsAt: "2026-05-20T12:00:00.000Z" }, now)).toBe(false);
  });

  it("labels known and legacy subscription states", () => {
    expect(getSubscriptionStateLabel("active")).toBe("Ativo");
    expect(getSubscriptionStateLabel("trialing")).toBe("Periodo de teste");
    expect(getSubscriptionStateLabel("canceled")).toBe("Cancelado");
    expect(getSubscriptionStateLabel(undefined)).toBe("Legado");
  });
});
