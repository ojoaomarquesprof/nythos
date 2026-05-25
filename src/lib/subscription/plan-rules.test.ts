import { describe, expect, it } from "vitest";
import {
  canCreatePackage,
  canCreatePatient,
  canInviteTeamMember,
  canManageSubscription,
  canUploadDocument,
  getEffectiveSubscriptionPlanId,
  getFeatureAccess,
  getNythosProAnnualSavings,
  getPlanCtaState,
  getPlanLabel,
  getPlanLimits,
  getPlanStatusLabel,
  getSubscriptionStateLabel,
  getUsageAgainstLimits,
  getUsagePercent,
  getUsageTone,
  isPlanPublic,
  isTrialExpired,
  normalizePlanId,
  PLAN_DEFINITIONS,
} from "./plan-rules";

describe("subscription plan rules", () => {
  it("normalizes unknown plans as legacy to preserve current access", () => {
    expect(normalizePlanId(null)).toBe("legacy");
    expect(normalizePlanId("monthly")).toBe("legacy");
    expect(getPlanLabel("legacy")).toBe("Acesso legado");
    expect(getPlanLimits("legacy").max_active_patients).toBeNull();
    expect(isPlanPublic("legacy")).toBe(false);
  });

  it("uses the new public plan names", () => {
    expect(PLAN_DEFINITIONS.free.name).toBe("Trial gratuito");
    expect(PLAN_DEFINITIONS.professional.name).toBe("Nythos PRO");
    expect(PLAN_DEFINITIONS.clinic.name).toBe("Nythos Clinic");
  });

  it("keeps trial/free and PRO on the same core limits and features", () => {
    expect(getFeatureAccess("free", "google_calendar_enabled")).toBe(true);
    expect(getFeatureAccess("professional", "google_calendar_enabled")).toBe(true);
    expect(canCreatePackage("free")).toBe(true);
    expect(canCreatePackage("professional")).toBe(true);
    expect(getPlanLimits("free")).toMatchObject(getPlanLimits("professional"));
    expect(getEffectiveSubscriptionPlanId({ planId: "free", status: "trialing" })).toBe("professional");
  });

  it("detects usage near and over limits", () => {
    const states = getUsageAgainstLimits(
      { activePatients: 100, documents: 450, teamMembers: 2, storageMb: 10_241 },
      getPlanLimits("professional")
    );

    expect(states.find((state) => state.key === "activePatients")).toMatchObject({
      used: 100,
      limit: 100,
      percent: 100,
      isNearLimit: true,
      isOverLimit: false,
      tone: "near",
    });
    expect(states.find((state) => state.key === "documents")).toMatchObject({
      percent: 90,
      isNearLimit: true,
    });
    expect(states.find((state) => state.key === "teamMembers")).toMatchObject({
      limit: 1,
      percent: 100,
      isOverLimit: true,
      tone: "over",
    });
    expect(states.find((state) => state.key === "storageMb")).toMatchObject({
      percent: 100,
      isOverLimit: true,
      tone: "over",
    });
  });

  it("calculates usage tone for normal, near, over and unlimited limits", () => {
    expect(getUsagePercent(2, 10)).toBe(20);
    expect(getUsagePercent(12, 10)).toBe(100);
    expect(getUsagePercent(2, null)).toBeNull();
    expect(getUsageTone(2, 10)).toBe("normal");
    expect(getUsageTone(8, 10)).toBe("near");
    expect(getUsageTone(11, 10)).toBe("over");
    expect(getUsageTone(999, null)).toBe("unlimited");
  });

  it("checks soft limits for creation actions", () => {
    expect(canCreatePatient("professional", { activePatients: 99 })).toBe(true);
    expect(canCreatePatient("professional", { activePatients: 100 })).toBe(false);
    expect(canInviteTeamMember("professional", { teamMembers: 0 })).toBe(true);
    expect(canInviteTeamMember("professional", { teamMembers: 1 })).toBe(false);
    expect(canInviteTeamMember("clinic", { teamMembers: 99 })).toBe(true);
    expect(canUploadDocument("free", { documents: 500, storageMb: 100 })).toBe(false);
    expect(canUploadDocument("legacy", { documents: 9999, storageMb: 999999 })).toBe(true);
  });

  it("keeps Clinic as a consultation plan for higher volume", () => {
    expect(PLAN_DEFINITIONS.clinic.monthlyPrice).toBeNull();
    expect(PLAN_DEFINITIONS.clinic.yearlyPrice).toBeNull();
    expect(PLAN_DEFINITIONS.clinic.features).toContain("Acima de 100 pacientes ativos");
    expect(getPlanLimits("clinic").max_active_patients).toBeNull();
  });

  it("calculates the annual Nythos PRO economy", () => {
    expect(getNythosProAnnualSavings()).toMatchObject({
      monthlyAnnualized: 1068,
      yearly: 899,
      savings: 169,
    });
  });

  it("detects expired trials", () => {
    const now = new Date("2026-05-21T12:00:00.000Z");

    expect(isTrialExpired({ status: "trialing", trialEndsAt: "2026-05-20T12:00:00.000Z" }, now)).toBe(true);
    expect(isTrialExpired({ status: "trialing", trialEndsAt: "2026-05-22T12:00:00.000Z" }, now)).toBe(false);
    expect(isTrialExpired({ status: "active", trialEndsAt: "2026-05-20T12:00:00.000Z" }, now)).toBe(false);
  });

  it("labels known and legacy subscription states", () => {
    expect(getSubscriptionStateLabel("active")).toBe("Ativo");
    expect(getSubscriptionStateLabel("trialing")).toBe("Teste gratis PRO");
    expect(getSubscriptionStateLabel("canceled")).toBe("Cancelado");
    expect(getSubscriptionStateLabel(undefined)).toBe("Acesso legado");
    expect(getPlanStatusLabel("past_due")).toBe("Pagamento pendente");
    expect(getEffectiveSubscriptionPlanId({ planId: "professional", status: "legacy" })).toBe("legacy");
  });

  it("allows only owners to manage subscription changes", () => {
    expect(canManageSubscription({ role: "therapist", userId: "owner", ownerUserId: "owner" })).toBe(true);
    expect(canManageSubscription({ role: "admin", userId: "owner", ownerUserId: "owner" })).toBe(true);
    expect(canManageSubscription({ role: "secretary", userId: "team", ownerUserId: "owner" })).toBe(false);
    expect(canManageSubscription({ isSecretary: true, userId: "team", ownerUserId: "owner" })).toBe(false);
    expect(canManageSubscription({ role: "therapist", userId: "team", ownerUserId: "owner" })).toBe(false);
    expect(canManageSubscription({ role: null, userId: null, ownerUserId: null })).toBe(false);
  });

  it("builds plan CTA state without real checkout side effects", () => {
    expect(getPlanCtaState({
      currentPlanId: "professional",
      targetPlanId: "professional",
      canManage: true,
    })).toMatchObject({
      label: "Plano atual",
      disabled: true,
      reason: "current_plan",
    });

    expect(getPlanCtaState({
      currentPlanId: "free",
      targetPlanId: "professional",
      canManage: false,
    })).toMatchObject({
      disabled: true,
      reason: "managed_by_owner",
    });

    expect(getPlanCtaState({
      currentPlanId: "free",
      targetPlanId: "professional",
      canManage: true,
    })).toMatchObject({
      label: "Solicitar alteracao",
      disabled: false,
      reason: "can_request_change",
    });
  });
});
