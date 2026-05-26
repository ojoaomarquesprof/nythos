export type OnboardingStepId =
  | "professional_profile"
  | "default_session_price"
  | "first_patient"
  | "first_session"
  | "google_calendar"
  | "clinic_identity"
  | "patient_portal"
  | "session_package";

export type OnboardingCompletionFlags = Record<OnboardingStepId, boolean>;

export type OnboardingProfileSnapshot = {
  full_name?: string | null;
  crp?: string | null;
  clinic_name?: string | null;
  session_price_default?: number | string | null;
  clinic_logo_url?: string | null;
  signature_url?: string | null;
};

export type OnboardingDataSnapshot = {
  profile?: OnboardingProfileSnapshot | null;
  patientsCount?: number | null;
  sessionsCount?: number | null;
  googleCalendarConnected?: boolean;
  portalConfiguredCount?: number | null;
  sessionPackagesCount?: number | null;
};

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
};

export type OnboardingProgress = {
  total: number;
  completed: number;
  percent: number;
  isComplete: boolean;
  nextStep: (OnboardingStep & { completed: false }) | null;
  steps: Array<OnboardingStep & { completed: boolean }>;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "professional_profile",
    title: "Finalize seu perfil profissional",
    description: "Nome, CRP e clinica deixam documentos, recibos e comunicacoes com acabamento profissional.",
    ctaLabel: "Revisar perfil",
    href: "/dashboard/settings",
  },
  {
    id: "default_session_price",
    title: "Defina o valor padrao de sessao",
    description: "Uma referencia financeira padrao deixa agenda e financeiro mais consistentes.",
    ctaLabel: "Definir valor",
    href: "/dashboard/settings",
  },
  {
    id: "first_patient",
    title: "Cadastre seu primeiro paciente",
    description: "Abra a base para prontuario, agenda, documentos, portal e financeiro.",
    ctaLabel: "Cadastrar paciente",
    href: "/dashboard/patients/new",
  },
  {
    id: "first_session",
    title: "Agende sua primeira sessao",
    description: "Transforme o cadastro em uma rotina clinica clara e acompanhavel.",
    ctaLabel: "Agendar sessao",
    href: "/dashboard/schedule",
  },
  {
    id: "google_calendar",
    title: "Conecte o Google Calendar",
    description: "Importe compromissos externos como bloqueios e reduza conflitos de horario.",
    ctaLabel: "Conectar agenda",
    href: "/dashboard/schedule",
  },
  {
    id: "clinic_identity",
    title: "Ajuste a identidade da clinica",
    description: "Logo ou assinatura dao mais presenca aos documentos gerados no Nythos.",
    ctaLabel: "Ajustar identidade",
    href: "/dashboard/settings",
  },
  {
    id: "patient_portal",
    title: "Prepare o portal do paciente",
    description: "Libere tarefas, check-ins e acompanhamento entre sessoes quando fizer sentido.",
    ctaLabel: "Preparar portal",
    href: "/dashboard/patients",
  },
  {
    id: "session_package",
    title: "Crie um pacote de sessoes",
    description: "Opcional, mas util para organizar planos de acompanhamento recorrente.",
    ctaLabel: "Criar pacote",
    href: "/dashboard/finances",
  },
];

function hasText(value?: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasPositiveNumber(value?: number | string | null): boolean {
  if (value === null || value === undefined || value === "") return false;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0;
}

function hasPositiveCount(value?: number | null): boolean {
  return typeof value === "number" && value > 0;
}

export function getOnboardingCompletionFlags(snapshot: OnboardingDataSnapshot): OnboardingCompletionFlags {
  const profile = snapshot.profile;

  return {
    professional_profile: Boolean(
      hasText(profile?.full_name)
      && hasText(profile?.crp)
      && hasText(profile?.clinic_name)
    ),
    default_session_price: hasPositiveNumber(profile?.session_price_default),
    first_patient: hasPositiveCount(snapshot.patientsCount),
    first_session: hasPositiveCount(snapshot.sessionsCount),
    google_calendar: snapshot.googleCalendarConnected === true,
    clinic_identity: Boolean(hasText(profile?.clinic_logo_url) || hasText(profile?.signature_url)),
    patient_portal: hasPositiveCount(snapshot.portalConfiguredCount),
    session_package: hasPositiveCount(snapshot.sessionPackagesCount),
  };
}

export function buildOnboardingProgress(flags: OnboardingCompletionFlags): OnboardingProgress {
  const steps = ONBOARDING_STEPS.map((step) => ({
    ...step,
    completed: flags[step.id] === true,
  }));
  const completed = steps.filter((step) => step.completed).length;
  const total = steps.length;
  const nextStep = steps.find((step) => !step.completed) as OnboardingProgress["nextStep"] | undefined;

  return {
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    isComplete: total > 0 && completed === total,
    nextStep: nextStep ?? null,
    steps,
  };
}
