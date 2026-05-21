export type SubscriptionPlanId = "free" | "professional" | "clinic" | "legacy";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired"
  | "free"
  | "legacy";

export type PlanFeatureKey =
  | "google_calendar_enabled"
  | "patient_portal_enabled"
  | "packages_enabled"
  | "receipts_enabled"
  | "audit_log_enabled"
  | "advanced_reports_enabled";

export type PlanLimits = Record<PlanFeatureKey, boolean> & {
  max_active_patients: number | null;
  max_team_members: number | null;
  max_documents: number | null;
  max_storage_mb: number | null;
};

export type SubscriptionUsage = {
  activePatients?: number;
  teamMembers?: number;
  documents?: number;
  storageMb?: number;
};

export type UsageLimitState = {
  key: keyof SubscriptionUsage;
  label: string;
  used: number;
  limit: number | null;
  percent: number | null;
  isNearLimit: boolean;
  isOverLimit: boolean;
  tone: UsageTone;
};

export type SubscriptionSnapshot = {
  planId?: string | null;
  status?: string | null;
  trialEndsAt?: string | null;
  currentPeriodEndsAt?: string | null;
};

export type UsageTone = "normal" | "near" | "over" | "unlimited";

export type SubscriptionActor = {
  role?: string | null;
  isSecretary?: boolean | null;
  userId?: string | null;
  ownerUserId?: string | null;
};

export type PlanCtaState = {
  label: string;
  disabled: boolean;
  reason: "current_plan" | "managed_by_owner" | "can_request_change";
};

export const PLAN_DEFINITIONS: Record<
  SubscriptionPlanId,
  {
    id: SubscriptionPlanId;
    name: string;
    description: string;
    monthlyPrice: number | null;
    yearlyPrice: number | null;
    limits: PlanLimits;
    features: string[];
  }
> = {
  free: {
    id: "free",
    name: "Starter",
    description: "Para experimentar o essencial da rotina clinica.",
    monthlyPrice: 0,
    yearlyPrice: 0,
    limits: {
      max_active_patients: 5,
      max_team_members: 0,
      max_documents: 20,
      max_storage_mb: 250,
      google_calendar_enabled: false,
      patient_portal_enabled: false,
      packages_enabled: false,
      receipts_enabled: true,
      audit_log_enabled: true,
      advanced_reports_enabled: false,
    },
    features: [
      "Ate 5 pacientes ativos",
      "Agenda e prontuario basicos",
      "Financeiro simples",
      "Recibos e historico de acoes criticas",
    ],
  },
  professional: {
    id: "professional",
    name: "Professional",
    description: "Para psicologos que querem operar a clinica com clareza.",
    monthlyPrice: 89,
    yearlyPrice: 890,
    limits: {
      max_active_patients: 100,
      max_team_members: 0,
      max_documents: 500,
      max_storage_mb: 10_240,
      google_calendar_enabled: true,
      patient_portal_enabled: true,
      packages_enabled: true,
      receipts_enabled: true,
      audit_log_enabled: true,
      advanced_reports_enabled: false,
    },
    features: [
      "Ate 100 pacientes ativos",
      "Agenda, prontuario, financeiro e pacotes",
      "Portal do paciente e documentos privados",
      "Google Calendar, recibos e audit log",
    ],
  },
  clinic: {
    id: "clinic",
    name: "Clinic",
    description: "Para clinicas pequenas que precisam de equipe e escala.",
    monthlyPrice: null,
    yearlyPrice: null,
    limits: {
      max_active_patients: 500,
      max_team_members: 10,
      max_documents: 5_000,
      max_storage_mb: 102_400,
      google_calendar_enabled: true,
      patient_portal_enabled: true,
      packages_enabled: true,
      receipts_enabled: true,
      audit_log_enabled: true,
      advanced_reports_enabled: true,
    },
    features: [
      "Limites ampliados para pacientes e documentos",
      "Equipe e secretaria",
      "Rotina clinica com rastreabilidade",
      "Preparado para relatorios avancados",
    ],
  },
  legacy: {
    id: "legacy",
    name: "Legacy",
    description: "Acesso preservado para contas existentes durante a transicao.",
    monthlyPrice: null,
    yearlyPrice: null,
    limits: {
      max_active_patients: null,
      max_team_members: null,
      max_documents: null,
      max_storage_mb: null,
      google_calendar_enabled: true,
      patient_portal_enabled: true,
      packages_enabled: true,
      receipts_enabled: true,
      audit_log_enabled: true,
      advanced_reports_enabled: true,
    },
    features: [
      "Acesso preservado para contas atuais",
      "Sem bloqueio de dados clinicos existentes",
      "Recursos profissionais mantidos",
    ],
  },
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Ativo",
  trialing: "Periodo de teste",
  past_due: "Pagamento pendente",
  cancelled: "Cancelado",
  expired: "Expirado",
  free: "Gratuito",
  legacy: "Legado",
};

export function normalizePlanId(planId?: string | null): SubscriptionPlanId {
  if (planId === "free" || planId === "professional" || planId === "clinic") {
    return planId;
  }
  return "legacy";
}

export function normalizeSubscriptionStatus(status?: string | null): SubscriptionStatus {
  if (
    status === "trialing"
    || status === "active"
    || status === "past_due"
    || status === "cancelled"
    || status === "expired"
    || status === "free"
    || status === "legacy"
  ) {
    return status;
  }

  if (status === "canceled" || status === "unpaid") return status === "canceled" ? "cancelled" : "past_due";
  return "legacy";
}

export function getPlanLimits(planId?: string | null): PlanLimits {
  return PLAN_DEFINITIONS[normalizePlanId(planId)].limits;
}

export function getPlanLabel(planId?: string | null): string {
  return PLAN_DEFINITIONS[normalizePlanId(planId)].name;
}

export function getFeatureAccess(planId: string | null | undefined, feature: PlanFeatureKey): boolean {
  return getPlanLimits(planId)[feature];
}

export function isTrialExpired(
  subscription: Pick<SubscriptionSnapshot, "status" | "trialEndsAt" | "currentPeriodEndsAt">,
  now: Date = new Date()
): boolean {
  if (normalizeSubscriptionStatus(subscription.status) !== "trialing") return false;

  const endsAt = subscription.trialEndsAt ?? subscription.currentPeriodEndsAt;
  if (!endsAt) return false;

  return new Date(endsAt).getTime() < now.getTime();
}

export function getEffectiveSubscriptionStatus(
  subscription: SubscriptionSnapshot,
  now: Date = new Date()
): SubscriptionStatus {
  const status = normalizeSubscriptionStatus(subscription.status);
  return isTrialExpired(subscription, now) ? "expired" : status;
}

export function getSubscriptionStateLabel(status?: string | null): string {
  return STATUS_LABELS[normalizeSubscriptionStatus(status)];
}

export function getPlanStatusLabel(status?: string | null): string {
  return getSubscriptionStateLabel(status);
}

export function getUsagePercent(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function getUsageTone(used: number, limit: number | null): UsageTone {
  if (limit === null) return "unlimited";
  if (used > limit) return "over";
  if (limit > 0 && used / limit >= 0.8) return "near";
  return "normal";
}

export function canManageSubscription(actor: SubscriptionActor): boolean {
  if (actor.isSecretary || actor.role === "secretary") return false;
  if (actor.userId && actor.ownerUserId) return actor.userId === actor.ownerUserId;
  return true;
}

export function getPlanCtaState(input: {
  currentPlanId?: string | null;
  targetPlanId: SubscriptionPlanId;
  canManage: boolean;
}): PlanCtaState {
  if (normalizePlanId(input.currentPlanId) === input.targetPlanId) {
    return {
      label: "Plano atual",
      disabled: true,
      reason: "current_plan",
    };
  }

  if (!input.canManage) {
    return {
      label: "Gerenciado pelo responsavel",
      disabled: true,
      reason: "managed_by_owner",
    };
  }

  return {
    label: "Solicitar alteracao",
    disabled: false,
    reason: "can_request_change",
  };
}

function buildUsageLimitState(
  key: keyof SubscriptionUsage,
  label: string,
  used: number,
  limit: number | null
): UsageLimitState {
  const percent = getUsagePercent(used, limit);
  const tone = getUsageTone(used, limit);

  return {
    key,
    label,
    used,
    limit,
    percent,
    isNearLimit: tone === "near",
    isOverLimit: tone === "over",
    tone,
  };
}

export function getUsageAgainstLimits(
  usage: SubscriptionUsage,
  limits: PlanLimits
): UsageLimitState[] {
  return [
    buildUsageLimitState(
      "activePatients",
      "Pacientes ativos",
      usage.activePatients ?? 0,
      limits.max_active_patients
    ),
    buildUsageLimitState(
      "teamMembers",
      "Equipe",
      usage.teamMembers ?? 0,
      limits.max_team_members
    ),
    buildUsageLimitState(
      "documents",
      "Documentos",
      usage.documents ?? 0,
      limits.max_documents
    ),
    buildUsageLimitState(
      "storageMb",
      "Armazenamento",
      usage.storageMb ?? 0,
      limits.max_storage_mb
    ),
  ];
}

export function canCreatePatient(planId: string | null | undefined, usage: SubscriptionUsage): boolean {
  const limit = getPlanLimits(planId).max_active_patients;
  return limit === null || (usage.activePatients ?? 0) < limit;
}

export function canInviteTeamMember(planId: string | null | undefined, usage: SubscriptionUsage): boolean {
  const limit = getPlanLimits(planId).max_team_members;
  return limit === null || (usage.teamMembers ?? 0) < limit;
}

export function canUploadDocument(planId: string | null | undefined, usage: SubscriptionUsage): boolean {
  const limits = getPlanLimits(planId);
  const withinDocumentLimit = limits.max_documents === null || (usage.documents ?? 0) < limits.max_documents;
  const withinStorageLimit = limits.max_storage_mb === null || (usage.storageMb ?? 0) < limits.max_storage_mb;
  return withinDocumentLimit && withinStorageLimit;
}

export function canCreatePackage(planId: string | null | undefined): boolean {
  return getFeatureAccess(planId, "packages_enabled");
}
