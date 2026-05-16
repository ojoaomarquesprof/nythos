import { describe, expect, it } from "vitest";
import {
  buildNextActions,
  buildPostSessionGuidance,
  buildPreSessionGuidance,
  finalizeClinicalTimelineEvents,
  type PatientGuidanceInput,
} from "./patient-guidance";

function baseInput(): PatientGuidanceInput {
  return {
    nextSessionLabel: null,
    hasNextSessionIn24h: false,
    latestEvolutionLabel: null,
    lastSessionNeedsEvolutionLabel: null,
    hasTreatmentPlan: false,
    treatmentPlanFocusSummary: null,
    treatmentPlanReviewDue: false,
    treatmentPlanReviewLabel: null,
    activeTreatmentGoalsCount: 0,
    latestRespondedTaskTitle: null,
    pendingTasksCount: 0,
    overdueTasksCount: 0,
    latestMoodCheckinSummary: null,
    preSessionAlerts: [],
    hasSignedGeneralConsent: true,
    hasEmergencySupportContact: true,
    pendingPatientIncome: 0,
    pendingPatientIncomeLabel: "R$ 0,00",
    needsAccessLinkUpdate: false,
    portalStateLabel: "Link ativo",
    missingEssentialFields: [],
    hasAnsweredAnamnesis: true,
    hasPendingAnamnesis: false,
    hasTodayScheduledNeedsStatus: false,
  };
}

describe("patient guidance rules", () => {
  it("prioritizes scheduling when there is no next session", () => {
    const actions = buildNextActions(baseInput());

    expect(actions[0]).toMatchObject({
      kind: "next-session",
      title: "Agendar proxima sessao",
      priority: "high",
      actionTarget: "schedule",
    });
  });

  it("adds task review as high priority when there are overdue tasks", () => {
    const actions = buildNextActions({
      ...baseInput(),
      pendingTasksCount: 3,
      overdueTasksCount: 2,
    });

    expect(actions).toContainEqual(
      expect.objectContaining({
        kind: "tasks",
        priority: "high",
      }),
    );
  });

  it("builds a pre-session checklist with alerts and friendly summaries", () => {
    const items = buildPreSessionGuidance({
      ...baseInput(),
      nextSessionLabel: "16 mai as 14:00 · 50 min",
      latestMoodCheckinSummary: "Humor 4/5 · Ansiedade 2/5 · Sono 5/5.",
      preSessionAlerts: ["consentimento geral pendente", "pendencia financeira"],
      hasSignedGeneralConsent: false,
      pendingPatientIncome: 180,
    });

    expect(items[0]).toMatchObject({
      kind: "next-session",
      title: "Proxima sessao",
    });
    expect(items[5]).toMatchObject({
      kind: "alerts",
      state: "attention",
      actionTarget: "archive",
    });
  });

  it("builds a post-session checklist focused on evolution and closure", () => {
    const items = buildPostSessionGuidance({
      ...baseInput(),
      lastSessionNeedsEvolutionLabel: "15 mai as 10:00",
      pendingPatientIncome: 250,
      pendingPatientIncomeLabel: "R$ 250,00",
      hasTodayScheduledNeedsStatus: true,
    });

    expect(items[0]).toMatchObject({
      kind: "evolution",
      state: "attention",
    });
    expect(items[4]).toMatchObject({
      kind: "finance",
      detail: "R$ 250,00 em lancamentos pendentes.",
    });
    expect(items[5]).toMatchObject({
      kind: "session-status",
      actionTarget: "sessions",
    });
  });

  it("orders the clinical timeline by most recent date and limits the result", () => {
    const events = finalizeClinicalTimelineEvents(
      [
        { id: "1", date: new Date("2026-05-10T10:00:00Z") },
        { id: "2", date: new Date("2026-05-12T10:00:00Z") },
        { id: "3", date: new Date("2026-05-11T10:00:00Z") },
      ],
      2,
    );

    expect(events.map((event) => event.id)).toEqual(["2", "3"]);
  });
});
