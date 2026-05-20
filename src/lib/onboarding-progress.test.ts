import { describe, expect, it } from "vitest";
import {
  buildOnboardingProgress,
  getOnboardingCompletionFlags,
  type OnboardingCompletionFlags,
} from "./onboarding-progress";

const emptyFlags: OnboardingCompletionFlags = {
  professional_profile: false,
  default_session_price: false,
  first_patient: false,
  first_session: false,
  google_calendar: false,
  clinic_identity: false,
  patient_portal: false,
  session_package: false,
};

describe("onboarding progress", () => {
  it("handles no completed items", () => {
    const progress = buildOnboardingProgress(emptyFlags);

    expect(progress.completed).toBe(0);
    expect(progress.total).toBe(8);
    expect(progress.percent).toBe(0);
    expect(progress.isComplete).toBe(false);
    expect(progress.nextStep?.id).toBe("professional_profile");
  });

  it("handles some completed items and recommends the next incomplete step", () => {
    const progress = buildOnboardingProgress({
      ...emptyFlags,
      professional_profile: true,
      default_session_price: true,
      first_patient: true,
    });

    expect(progress.completed).toBe(3);
    expect(progress.percent).toBe(38);
    expect(progress.nextStep?.id).toBe("first_session");
  });

  it("handles all completed items", () => {
    const progress = buildOnboardingProgress({
      professional_profile: true,
      default_session_price: true,
      first_patient: true,
      first_session: true,
      google_calendar: true,
      clinic_identity: true,
      patient_portal: true,
      session_package: true,
    });

    expect(progress.completed).toBe(8);
    expect(progress.percent).toBe(100);
    expect(progress.isComplete).toBe(true);
    expect(progress.nextStep).toBeNull();
  });

  it("derives completion flags from operational snapshots", () => {
    const flags = getOnboardingCompletionFlags({
      profile: {
        full_name: "Dra. Ana",
        crp: "06/123456",
        clinic_name: "Clinica Centro",
        session_price_default: 180,
        clinic_logo_url: "",
        signature_url: "https://cdn.test/signature.png",
      },
      patientsCount: 1,
      sessionsCount: 0,
      googleCalendarConnected: false,
      portalConfiguredCount: 2,
      sessionPackagesCount: 1,
    });

    expect(flags).toEqual({
      professional_profile: true,
      default_session_price: true,
      first_patient: true,
      first_session: false,
      google_calendar: false,
      clinic_identity: true,
      patient_portal: true,
      session_package: true,
    });
  });
});
