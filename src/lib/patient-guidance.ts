export type GuidanceState = "success" | "attention" | "pending" | "suggested";
export type NextActionPriority = "high" | "medium" | "low" | "success";
export type PatientGuidanceActionTarget =
  | "anamnesis"
  | "archive"
  | "finance"
  | "notes"
  | "plan"
  | "profile"
  | "schedule"
  | "sessions"
  | "tasks"
  | "team";

export type PatientGuidanceKind =
  | "alerts"
  | "anamnesis"
  | "checkin"
  | "consent"
  | "emergency-contact"
  | "evolution"
  | "finance"
  | "next-session"
  | "portal"
  | "profile"
  | "session-status"
  | "summary"
  | "tasks"
  | "treatment-plan";

export type PatientGuidanceItem = {
  kind: PatientGuidanceKind;
  title: string;
  detail: string;
  state: GuidanceState;
  actionLabel?: string;
  actionTarget?: PatientGuidanceActionTarget;
};

export type PatientNextActionItem = {
  kind: PatientGuidanceKind;
  title: string;
  reason: string;
  priority: NextActionPriority;
  actionLabel: string;
  actionTarget: PatientGuidanceActionTarget;
};

export type PatientGuidanceInput = {
  nextSessionLabel?: string | null;
  hasNextSessionIn24h: boolean;
  latestEvolutionLabel?: string | null;
  lastSessionNeedsEvolutionLabel?: string | null;
  hasTreatmentPlan: boolean;
  treatmentPlanFocusSummary?: string | null;
  treatmentPlanReviewDue: boolean;
  treatmentPlanReviewLabel?: string | null;
  activeTreatmentGoalsCount: number;
  latestRespondedTaskTitle?: string | null;
  pendingTasksCount: number;
  overdueTasksCount: number;
  latestMoodCheckinSummary?: string | null;
  preSessionAlerts: string[];
  hasSignedGeneralConsent: boolean;
  hasEmergencySupportContact: boolean;
  pendingPatientIncome: number;
  pendingPatientIncomeLabel?: string | null;
  needsAccessLinkUpdate: boolean;
  portalStateLabel: string;
  missingEssentialFields: string[];
  hasAnsweredAnamnesis: boolean;
  hasPendingAnamnesis: boolean;
  hasTodayScheduledNeedsStatus: boolean;
};

export function buildPreSessionGuidance(input: PatientGuidanceInput): PatientGuidanceItem[] {
  return [
    input.nextSessionLabel
      ? {
          kind: "next-session",
          title: input.hasNextSessionIn24h ? "Proxima sessao em destaque" : "Proxima sessao",
          detail: input.nextSessionLabel,
          state: input.hasNextSessionIn24h ? "success" : "suggested",
          actionLabel: "Ver sessoes",
          actionTarget: "sessions",
        }
      : {
          kind: "next-session",
          title: "Sem sessao futura",
          detail: "Nao ha proxima sessao agendada para este paciente.",
          state: "pending",
          actionLabel: "Agendar",
          actionTarget: "schedule",
        },
    input.latestEvolutionLabel
      ? {
          kind: "evolution",
          title: "Ultima evolucao",
          detail: input.latestEvolutionLabel,
          state: "success",
          actionLabel: "Abrir",
          actionTarget: "notes",
        }
      : input.lastSessionNeedsEvolutionLabel
        ? {
            kind: "evolution",
            title: "Evolucao pendente",
            detail: `A sessao de ${input.lastSessionNeedsEvolutionLabel} ainda nao tem evolucao registrada.`,
            state: "attention",
            actionLabel: "Registrar",
            actionTarget: "notes",
          }
        : {
            kind: "evolution",
            title: "Sem evolucao recente",
            detail: "Registros de evolucao aparecerao aqui antes do atendimento.",
            state: "suggested",
            actionLabel: "Prontuario",
            actionTarget: "notes",
          },
    input.hasTreatmentPlan
      ? {
          kind: "treatment-plan",
          title: "Plano terapeutico",
          detail:
            input.treatmentPlanFocusSummary ||
            "Foco atual registrado.",
          state: input.treatmentPlanReviewDue ? "attention" : "success",
          actionLabel: "Ver plano",
          actionTarget: "plan",
        }
      : {
          kind: "treatment-plan",
          title: "Plano terapeutico ausente",
          detail: "Ainda nao ha foco atual e objetivos estruturados para revisao pre-sessao.",
          state: "suggested",
          actionLabel: "Criar plano",
          actionTarget: "plan",
        },
    input.latestRespondedTaskTitle
      ? {
          kind: "tasks",
          title: "Tarefa respondida",
          detail: input.latestRespondedTaskTitle,
          state: "pending",
          actionLabel: "Revisar",
          actionTarget: "tasks",
        }
      : input.pendingTasksCount > 0
        ? {
            kind: "tasks",
            title: "Tarefas em aberto",
            detail:
              input.overdueTasksCount > 0
                ? `${input.overdueTasksCount} atrasada(s) de ${input.pendingTasksCount} em aberto.`
                : `${input.pendingTasksCount} tarefa(s) em aberto.`,
            state: input.overdueTasksCount > 0 ? "attention" : "suggested",
            actionLabel: "Ver tarefas",
            actionTarget: "tasks",
          }
        : {
            kind: "tasks",
            title: "Tarefas",
            detail: "Nenhuma tarefa terapeutica em aberto.",
            state: "success",
            actionLabel: "Abrir",
            actionTarget: "tasks",
          },
    input.latestMoodCheckinSummary
      ? {
          kind: "checkin",
          title: "Check-in recente",
          detail: input.latestMoodCheckinSummary,
          state: "success",
          actionLabel: "Ver",
          actionTarget: "tasks",
        }
      : {
          kind: "checkin",
          title: "Sem check-in recente",
          detail: "Quando o paciente registrar humor/sintomas, o resumo aparecera aqui.",
          state: "suggested",
          actionLabel: "Tarefas",
          actionTarget: "tasks",
        },
    input.preSessionAlerts.length > 0
      ? {
          kind: "alerts",
          title: "Atencoes antes da sessao",
          detail: input.preSessionAlerts.slice(0, 4).join(" · "),
          state: "attention",
          actionLabel: "Revisar",
          actionTarget: !input.hasSignedGeneralConsent
            ? "archive"
            : !input.hasEmergencySupportContact
              ? "team"
              : input.pendingPatientIncome > 0
                ? "finance"
                : "tasks",
        }
      : {
          kind: "alerts",
          title: "Alertas principais",
          detail: "Consentimento, emergencia, financeiro e portal sem alerta imediato.",
          state: "success",
        },
  ];
}

export function buildPostSessionGuidance(input: PatientGuidanceInput): PatientGuidanceItem[] {
  return [
    input.lastSessionNeedsEvolutionLabel
      ? {
          kind: "evolution",
          title: "Registrar evolucao",
          detail: `Fechamento pendente para ${input.lastSessionNeedsEvolutionLabel}.`,
          state: "attention",
          actionLabel: "Registrar",
          actionTarget: "notes",
        }
      : input.latestEvolutionLabel
        ? {
            kind: "evolution",
            title: "Evolucao recente",
            detail: `Ultimo registro em ${input.latestEvolutionLabel}.`,
            state: "success",
            actionLabel: "Prontuario",
            actionTarget: "notes",
          }
        : {
            kind: "evolution",
            title: "Evolucao",
            detail: "Nenhuma evolucao registrada ainda neste prontuario.",
            state: "suggested",
            actionLabel: "Registrar",
            actionTarget: "notes",
          },
    input.nextSessionLabel
      ? {
          kind: "next-session",
          title: "Proxima sessao agendada",
          detail: input.nextSessionLabel,
          state: "success",
          actionLabel: "Agenda",
          actionTarget: "sessions",
        }
      : {
          kind: "next-session",
          title: "Agendar continuidade",
          detail: "Nao ha sessao futura registrada apos o atendimento.",
          state: "pending",
          actionLabel: "Agendar",
          actionTarget: "schedule",
        },
    input.latestRespondedTaskTitle
      ? {
          kind: "tasks",
          title: "Revisar tarefa respondida",
          detail: `${input.latestRespondedTaskTitle}. Se fizer sentido, crie a proxima tarefa.`,
          state: "pending",
          actionLabel: "Abrir tarefas",
          actionTarget: "tasks",
        }
      : {
          kind: "tasks",
          title: "Tarefas terapeuticas",
          detail:
            input.pendingTasksCount > 0
              ? `${input.pendingTasksCount} tarefa(s) ainda em aberto.`
              : "Nenhuma tarefa aberta para fechamento.",
          state: input.pendingTasksCount > 0 ? "suggested" : "success",
          actionLabel: "Tarefas",
          actionTarget: "tasks",
        },
    input.treatmentPlanReviewDue
      ? {
          kind: "treatment-plan",
          title: "Revisar plano",
          detail: input.treatmentPlanReviewLabel
            ? `Revisao prevista para ${input.treatmentPlanReviewLabel}.`
            : "Revisao do plano esta pendente.",
          state: "attention",
          actionLabel: "Ver plano",
          actionTarget: "plan",
        }
      : input.hasTreatmentPlan
        ? {
            kind: "treatment-plan",
            title: "Plano atualizado",
            detail:
              input.activeTreatmentGoalsCount > 0
                ? `${input.activeTreatmentGoalsCount} objetivo(s) ativo(s) em acompanhamento.`
                : "Plano terapeutico disponivel para consulta.",
            state: "success",
            actionLabel: "Ver plano",
            actionTarget: "plan",
          }
        : {
            kind: "treatment-plan",
            title: "Plano terapeutico",
            detail: "Criar ou revisar plano pode ajudar no fechamento do caso.",
            state: "suggested",
            actionLabel: "Abrir plano",
            actionTarget: "plan",
          },
    input.pendingPatientIncome > 0
      ? {
          kind: "finance",
          title: "Financeiro pendente",
          detail: `${input.pendingPatientIncomeLabel || "Ha"} em lancamentos pendentes.`,
          state: "pending",
          actionLabel: "Financeiro",
          actionTarget: "finance",
        }
      : {
          kind: "finance",
          title: "Financeiro",
          detail: "Sem pendencia financeira identificada nos dados carregados.",
          state: "success",
          actionLabel: "Abrir",
          actionTarget: "finance",
        },
    input.hasTodayScheduledNeedsStatus
      ? {
          kind: "session-status",
          title: "Conferir status da sessao",
          detail: "Ha uma sessao de hoje ainda agendada; revise antes de encerrar o atendimento.",
          state: "suggested",
          actionLabel: "Sessoes",
          actionTarget: "sessions",
        }
      : {
          kind: "summary",
          title: "Fechamento",
          detail: "Nenhuma acao automatica foi aplicada; use o checklist conforme necessario.",
          state: "success",
        },
  ];
}

export function buildNextActions(input: PatientGuidanceInput): PatientNextActionItem[] {
  const nextActions: PatientNextActionItem[] = [];

  if (!input.nextSessionLabel) {
    nextActions.push({
      kind: "next-session",
      title: "Agendar proxima sessao",
      reason: "Nao ha sessao futura registrada para este paciente.",
      priority: "high",
      actionLabel: "Agendar",
      actionTarget: "schedule",
    });
  }

  if (!input.hasAnsweredAnamnesis) {
    nextActions.push({
      kind: "anamnesis",
      title: input.hasPendingAnamnesis ? "Acompanhar anamnese pendente" : "Solicitar anamnese",
      reason: input.hasPendingAnamnesis
        ? "Ha uma solicitacao aberta, mas ainda sem resposta concluida."
        : "Ainda nao ha anamnese respondida para este paciente.",
      priority: "medium",
      actionLabel: "Ver anamnese",
      actionTarget: "anamnesis",
    });
  }

  if (input.pendingTasksCount > 0) {
    nextActions.push({
      kind: "tasks",
      title: "Revisar tarefas pendentes",
      reason:
        input.overdueTasksCount > 0
          ? `${input.overdueTasksCount} tarefa(s) atrasada(s) entre ${input.pendingTasksCount} em aberto.`
          : `${input.pendingTasksCount} tarefa(s) em aberto no portal do paciente.`,
      priority: input.overdueTasksCount > 0 ? "high" : "medium",
      actionLabel: "Abrir tarefas",
      actionTarget: "tasks",
    });
  }

  if (input.lastSessionNeedsEvolutionLabel) {
    nextActions.push({
      kind: "evolution",
      title: "Registrar evolucao da ultima sessao",
      reason: `A sessao de ${input.lastSessionNeedsEvolutionLabel} ainda nao tem evolucao registrada.`,
      priority: "high",
      actionLabel: "Registrar",
      actionTarget: "notes",
    });
  }

  if (!input.hasTreatmentPlan) {
    nextActions.push({
      kind: "treatment-plan",
      title: "Criar plano terapeutico",
      reason: "Ainda nao ha objetivo principal e foco atual estruturados para este caso.",
      priority: "low",
      actionLabel: "Abrir plano",
      actionTarget: "plan",
    });
  }

  if (input.pendingPatientIncome > 0) {
    nextActions.push({
      kind: "finance",
      title: "Ver pendencia financeira",
      reason: `${input.pendingPatientIncomeLabel || "Ha valores"} em lancamentos pendentes para este paciente.`,
      priority: "medium",
      actionLabel: "Ver financeiro",
      actionTarget: "finance",
    });
  }

  if (input.needsAccessLinkUpdate) {
    nextActions.push({
      kind: "portal",
      title: "Atualizar link do paciente",
      reason: `O portal esta com status: ${input.portalStateLabel.toLowerCase()}.`,
      priority: "medium",
      actionLabel: "Gerenciar link",
      actionTarget: "tasks",
    });
  }

  if (input.missingEssentialFields.length > 0) {
    nextActions.push({
      kind: "profile",
      title: "Completar cadastro",
      reason: `Faltam dados essenciais: ${input.missingEssentialFields.join(", ")}.`,
      priority: "low",
      actionLabel: "Abrir cadastro",
      actionTarget: "profile",
    });
  }

  if (!input.hasEmergencySupportContact) {
    nextActions.push({
      kind: "emergency-contact",
      title: "Cadastrar contato de emergencia",
      reason: "A rede de apoio ainda nao tem um contato de emergencia identificado.",
      priority: "medium",
      actionLabel: "Abrir rede",
      actionTarget: "team",
    });
  }

  if (!input.hasSignedGeneralConsent) {
    nextActions.push({
      kind: "consent",
      title: "Registrar consentimento geral",
      reason: "Nao ha termo de consentimento geral assinado registrado para este paciente.",
      priority: "medium",
      actionLabel: "Ver termos",
      actionTarget: "archive",
    });
  }

  if (nextActions.length === 0) {
    nextActions.push({
      kind: "summary",
      title: "Acompanhamento em ordem",
      reason: "Sessao futura, anamnese respondida e pendencias principais estao sem alerta.",
      priority: "success",
      actionLabel: "Ver sessoes",
      actionTarget: "sessions",
    });
  }

  return nextActions;
}

export function finalizeClinicalTimelineEvents<T extends { date: Date }>(events: T[], limit = 6) {
  return [...events].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}
