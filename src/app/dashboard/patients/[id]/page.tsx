"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  Shield,
  FileText,
  Clock,
  Edit,
  Trash2,
  User,
  AlertCircle,
  Download,
  Users,
  Activity,
  ClipboardList,
  Wallet,
  Bell,
  Archive,
  ChevronRight,
  ChevronLeft,
  Check,
  CheckCircle2,
  History,
  Smile,
  Frown,
  Zap,
  Waves,
  ListChecks,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SESSION_STATUS, SESSION_TYPES, formatCurrency, formatDate, formatTime } from "@/lib/constants";
import { CareNetworkCard } from "@/components/dashboard/patients/care-network-card";
import { ProtocolTrackerCard } from "@/components/dashboard/patients/protocol-tracker-card";
import { AbcRecordCard } from "@/components/dashboard/patients/abc-record-card";
import { AnamnesisRequestCard } from "@/components/dashboard/patients/anamnesis-request-card";
import { PatientEngagementCard } from "@/components/dashboard/patients/patient-engagement-card";
import { PatientTasksManager } from "@/components/dashboard/patients/patient-tasks-manager";

import type { Session, Patient } from "@/types/database";

import { usePatientData } from "./_hooks/use-patient-data";
import { PatientProfile } from "./_components/patient-profile";
import { SessionList } from "./_components/session-list";
import { EvolutionNotesForm } from "./_components/evolution-notes-form";
import { PatientFinances } from "./_components/patient-finances";
import { TreatmentPlanManager, TreatmentPlanOverviewCard } from "./_components/treatment-plan-manager";
import { PatientRecordsManager } from "./_components/patient-records-manager";

const patientStatusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: "Ativo",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  inactive: {
    label: "Inativo",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  archived: {
    label: "Arquivado",
    className: "border-slate-200 bg-slate-50 text-slate-600",
  },
};

const consentStatusLabels: Record<string, string> = {
  pending: "Pendente",
  signed: "Assinado",
  revoked: "Revogado",
  expired: "Expirado",
};

const documentCategoryLabels: Record<string, string> = {
  consent: "Termo",
  report: "Relatorio",
  assessment: "Laudo/avaliacao",
  certificate: "Atestado",
  referral: "Encaminhamento",
  school_document: "Documento escolar",
  receipt: "Recibo",
  image: "Imagem",
  other: "Outro",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getAge(dateOfBirth?: string | null) {
  if (!dateOfBirth) return null;
  const birthDate = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hadBirthday =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!hadBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function getSessionDateLabel(session?: Session | null) {
  if (!session) return "Sem registro";
  return `${formatDate(session.scheduled_at, { day: "2-digit", month: "short" })} às ${formatTime(session.scheduled_at)}`;
}

function getSessionTypeLabel(type?: string | null) {
  return SESSION_TYPES[type as keyof typeof SESSION_TYPES]?.label || "Tipo nao informado";
}

function getDocumentCategoryLabel(category?: string | null) {
  return documentCategoryLabels[category || ""] || "Documento";
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "violet",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
  tone?: "violet" | "emerald" | "amber" | "sky";
}) {
  const toneClass = {
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    sky: "bg-sky-50 text-sky-700 border-sky-100",
  }[tone];

  return (
    <Card className="rounded-2xl border border-border/70 bg-white/85 shadow-[0_12px_32px_rgba(41,31,67,0.06)] ring-1 ring-white/80">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl border", toneClass)}>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-base font-semibold text-foreground">{value}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-white/65 p-4 text-center">
      <div className="mx-auto mb-2 flex size-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon className="size-4" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function OverviewPanel({
  title,
  description,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  description?: string;
  icon: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="rounded-3xl border border-border/70 bg-white/85 shadow-[0_12px_32px_rgba(41,31,67,0.05)]">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2.5 last:border-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right text-xs font-semibold text-foreground">{value || "—"}</span>
    </div>
  );
}

function NextActionRow({
  icon: Icon,
  title,
  reason,
  priority,
  actionLabel,
  onAction,
}: {
  icon: React.ElementType;
  title: string;
  reason: string;
  priority: "high" | "medium" | "low" | "success";
  actionLabel: string;
  onAction: () => void;
}) {
  const priorityMeta = {
    high: {
      label: "Atenção",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      icon: "bg-amber-50 text-amber-700",
    },
    medium: {
      label: "Pendente",
      badge: "border-violet-200 bg-violet-50 text-violet-700",
      icon: "bg-violet-50 text-violet-700",
    },
    low: {
      label: "Sugerido",
      badge: "border-slate-200 bg-slate-50 text-slate-600",
      icon: "bg-slate-100 text-slate-600",
    },
    success: {
      label: "Em ordem",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: "bg-emerald-50 text-emerald-700",
    },
  }[priority];

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-white/80 p-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", priorityMeta.icon)}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <Badge variant="outline" className={cn("h-5 rounded-full px-2 text-[10px] font-semibold", priorityMeta.badge)}>
              {priorityMeta.label}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{reason}</p>
        </div>
      </div>
      <Button
        variant={priority === "success" ? "outline" : priority === "high" || priority === "medium" ? "default" : "outline"}
        size="sm"
        className={cn(
          "h-8 shrink-0 rounded-2xl px-3 text-xs",
          priority === "success" && "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50",
          priority === "low" && "bg-white"
        )}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

type GuidanceState = "success" | "attention" | "pending" | "suggested";

type GuidedSessionItem = {
  icon: React.ElementType;
  title: string;
  detail: string;
  state: GuidanceState;
  actionLabel?: string;
  onAction?: () => void;
};

function GuidedSessionCard({
  title,
  description,
  icon: Icon,
  items,
  actions,
  maxItems,
  dense = false,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  items: GuidedSessionItem[];
  actions: Array<{ label: string; icon: React.ElementType; onClick: () => void; variant?: "default" | "outline" }>;
  maxItems?: number;
  dense?: boolean;
}) {
  const stateMeta: Record<GuidanceState, { label: string; className: string; iconClass: string }> = {
    success: {
      label: "Em ordem",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      iconClass: "bg-emerald-50 text-emerald-700",
    },
    attention: {
      label: "Atenção",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      iconClass: "bg-amber-50 text-amber-700",
    },
    pending: {
      label: "Pendente",
      className: "border-violet-200 bg-violet-50 text-violet-700",
      iconClass: "bg-violet-50 text-violet-700",
    },
    suggested: {
      label: "Sugerido",
      className: "border-slate-200 bg-slate-50 text-slate-600",
      iconClass: "bg-slate-100 text-slate-600",
    },
  };

  const visibleItems = items.slice(0, maxItems ?? items.length);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <Card className="rounded-3xl border border-border/70 bg-white/85 shadow-[0_12px_32px_rgba(41,31,67,0.05)]">
      <CardHeader className={cn("border-b border-border/60", dense ? "px-4 py-3" : "px-5 py-4")}>
        <div className="flex items-start gap-3">
          <div className={cn("flex shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary", dense ? "size-9" : "size-10")}>
            <Icon className={dense ? "size-4" : "size-5"} />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-3", dense ? "p-4" : "p-5")}>
        <div className="space-y-2.5">
          {visibleItems.map((item) => {
            const ItemIcon = item.icon;
            const meta = stateMeta[item.state];
            return (
              <div key={`${item.title}-${item.detail}`} className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-white/80 p-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-xl", meta.iconClass)}>
                    <ItemIcon className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <Badge variant="outline" className={cn("h-5 rounded-full px-2 text-[10px] font-semibold", meta.className)}>
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
                {item.onAction && item.actionLabel && (
                  <Button variant="outline" size="sm" className="h-8 shrink-0 rounded-2xl bg-white px-3 text-xs" onClick={item.onAction}>
                    {item.actionLabel}
                  </Button>
                )}
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <p className="px-1 text-xs font-medium text-muted-foreground">
              +{hiddenCount} item(ns) disponíveis nas abas detalhadas.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {actions.map((action) => {
            const ActionIcon = action.icon;
            return (
              <Button
                key={action.label}
                variant={action.variant || "outline"}
                size="sm"
                className={cn("h-8 rounded-2xl px-3 text-xs", action.variant !== "default" && "bg-white")}
                onClick={action.onClick}
              >
                <ActionIcon className="size-4" />
                {action.label}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

type ClinicalTimelineEvent = {
  id: string;
  date: Date;
  icon: React.ElementType;
  type: string;
  title: string;
  description: string;
  badge?: string;
  tone: "violet" | "emerald" | "amber" | "rose" | "sky" | "slate" | "teal";
  includeTime?: boolean;
  onAction?: () => void;
  actionLabel?: string;
};

function TimelineEventRow({ event, isLast }: { event: ClinicalTimelineEvent; isLast: boolean }) {
  const toneClass = {
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
    teal: "bg-teal-50 text-teal-700 ring-teal-100",
  }[event.tone];
  const Icon = event.icon;

  return (
    <div className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3">
      {!isLast && <div className="absolute left-[17px] top-10 h-[calc(100%-1rem)] w-px bg-border/70" />}
      <div className={cn("relative z-10 flex size-9 items-center justify-center rounded-full ring-4", toneClass)}>
        <Icon className="size-4" />
      </div>
      <div className="rounded-2xl border border-border/70 bg-white/82 p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {event.type}
              </span>
              {event.badge && (
                <Badge variant="outline" className="h-5 rounded-full border-border/70 bg-white px-2 text-[10px] font-semibold text-muted-foreground">
                  {event.badge}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">{event.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{event.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
            <span className="text-xs font-medium text-muted-foreground">
              {formatDate(event.date.toISOString(), { day: "2-digit", month: "short" })}
              {event.includeTime !== false && ` às ${formatTime(event.date.toISOString())}`}
            </span>
            {event.onAction && event.actionLabel && (
              <Button variant="ghost" size="sm" className="h-7 rounded-xl px-2 text-xs text-primary hover:bg-primary/5" onClick={event.onAction}>
                {event.actionLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PatientDetailPage() {
  const {
    id,
    router,
    isSecretary,
    patient,
    sessions,
    patientCashFlow,
    patientTasks,
    anamnesisSummaries,
    protocolSummaries,
    abcSummaries,
    treatmentPlan,
    setTreatmentPlan,
    moodCheckins,
    supportContacts,
    setSupportContacts,
    patientConsents,
    setPatientConsents,
    patientDocuments,
    setPatientDocuments,
    profile,
    loading,
    newNote,
    setNewNote,
    savingNote,
    isArchiving,
    isEditing,
    setIsEditing,
    isSaving,
    guardian,
    editForm,
    setEditForm,
    errorDialog,
    setErrorDialog,
    viewingSession,
    setViewingSession,
    showSessionModal,
    setShowSessionModal,
    isEditingSession,
    setIsEditingSession,
    sessionEditForm,
    setSessionEditForm,
    rescheduleSession,
    setRescheduleSession,
    rescheduleDate,
    setRescheduleDate,
    rescheduleTime,
    setRescheduleTime,
    showRescheduleModal,
    setShowRescheduleModal,
    rescheduleWeekOffset,
    setRescheduleWeekOffset,
    therapistSessions,
    showCancelSeriesModal,
    setShowCancelSeriesModal,
    cancellingSession,
    setCancellingSession,
    rescheduleWeekDays,
    handleAddNote,
    handleStatusChange,
    handleStartEditingSession,
    handleSaveSessionEdit,
    handleCancelSession,
    handleReschedule,
    handleSlotClick,
    handleArchive,
    handleUpdatePatient,
    loadData,
    exportPdf,
    isExportingPdf,
  } = usePatientData();

  const PATIENT_TABS = [
    { value: "overview", label: "Visão geral", icon: Activity },
    { value: "sessions", label: "Sessões", icon: Clock },
    { value: "notes", label: "Prontuário", icon: FileText },
    { value: "tasks", label: "Tarefas", icon: ListChecks },
    { value: "plan", label: "Plano", icon: Target },
    { value: "anamnesis", label: "Anamnese", icon: Shield },
    { value: "behavior", label: "ABC", icon: Activity },
    { value: "protocols", label: "Protocolos", icon: ClipboardList },
    { value: "team", label: "Rede", icon: Users },
    { value: "finance", label: "Financeiro", icon: Wallet },
    { value: "archive", label: "Arquivos", icon: Archive },
  ];

  const [activeTab, setActiveTab] = useState("overview");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6 md:py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-40 rounded-2xl bg-muted" />
          <div className="h-44 rounded-3xl bg-muted" />
          <div className="grid gap-3 md:grid-cols-4">
            <div className="h-24 rounded-2xl bg-muted" />
            <div className="h-24 rounded-2xl bg-muted" />
            <div className="h-24 rounded-2xl bg-muted" />
            <div className="h-24 rounded-2xl bg-muted" />
          </div>
          <div className="h-80 rounded-3xl bg-muted" />
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="px-4 py-5 md:px-6 md:py-6 max-w-7xl mx-auto w-full text-center py-20">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold">Paciente não encontrado</h2>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  const scheduledOnlySessions = sessions.filter((s) => s.status === "scheduled");
  const archivedSessions = sessions.filter((s) => s.status !== "scheduled");
  const totalPatientIncome = patientCashFlow
    .filter((f) => f.type === "income")
    .reduce((sum, f) => sum + Number(f.amount), 0);
  const pendingPatientIncome = patientCashFlow
    .filter((f) => f.type === "income" && f.status === "pending")
    .reduce((sum, f) => sum + Number(f.amount), 0);

  const now = new Date();
  const completedSessions = sessions.filter((s) => s.status === "completed");
  const lastSession =
    [...sessions]
      .filter((s) => new Date(s.scheduled_at) <= now && s.status !== "cancelled")
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0] ?? null;
  const nextSession =
    [...sessions]
      .filter((s) => s.status === "scheduled" && new Date(s.scheduled_at) >= now)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null;
  const pendingTasks = patientTasks.filter((task) => task.status !== "completed" && task.status !== "cancelled");
  const overdueTasks = pendingTasks.filter((task) => task.due_date && new Date(`${task.due_date}T23:59:59`) < now);
  const age = getAge(patient.date_of_birth);
  const statusCfg = patientStatusConfig[patient.status] ?? patientStatusConfig.active;
  const hasGeneralNotes = !!patient.notes_encrypted;
  const hasGuardian = !!guardian;
  const portalState = patient.access_token_revoked_at
    ? "Link revogado"
    : patient.access_token_expires_at && new Date(patient.access_token_expires_at) < now
      ? "Link expirado"
      : patient.access_token
        ? "Link ativo"
        : "Sem link";
  const latestEvolutionSession =
    [...sessions]
      .filter((s) => s.status === "completed" && s.session_notes_encrypted)
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0] ?? null;
  let latestEvolutionText = "";
  if (latestEvolutionSession?.session_notes_encrypted) {
    try {
      const parsed = JSON.parse(latestEvolutionSession.session_notes_encrypted);
      latestEvolutionText = parsed.notes || latestEvolutionSession.session_notes_encrypted;
    } catch (e) {
      latestEvolutionText = latestEvolutionSession.session_notes_encrypted;
    }
  }
  const financeState =
    pendingPatientIncome > 0
      ? `${formatCurrency(pendingPatientIncome)} pendente`
      : patientCashFlow.length > 0
        ? "Sem pendências financeiras"
        : "Sem lançamentos";
  const latestAnamnesis = anamnesisSummaries[0] ?? null;
  const completedAnamnesis = anamnesisSummaries.find((item) => item.status === "completed") ?? null;
  const pendingAnamnesis = anamnesisSummaries.find((item) => item.status !== "completed") ?? null;
  const hasAnsweredAnamnesis = !!completedAnamnesis;
  const latestMoodCheckin = moodCheckins[0] ?? null;
  const previousMoodCheckin = moodCheckins[1] ?? null;
  const moodTrend =
    latestMoodCheckin && previousMoodCheckin && latestMoodCheckin.mood_score && previousMoodCheckin.mood_score
      ? latestMoodCheckin.mood_score > previousMoodCheckin.mood_score
        ? "Humor relatado maior que o registro anterior"
        : latestMoodCheckin.mood_score < previousMoodCheckin.mood_score
          ? "Humor relatado menor que o registro anterior"
          : "Humor relatado estável"
      : "Tendência disponível com pelo menos 2 registros";
  const anamnesisState =
    completedAnamnesis
      ? `Respondida em ${formatDate(completedAnamnesis.completed_at || completedAnamnesis.created_at || new Date().toISOString())}`
      : pendingAnamnesis
        ? "Solicitada, aguardando resposta"
        : "Não solicitada";
  const missingEssentialFields = [
    !patient.phone ? "telefone" : null,
    !patient.email ? "e-mail" : null,
    !patient.date_of_birth ? "nascimento" : null,
  ].filter(Boolean) as string[];
  const activeSupportContacts = supportContacts.filter((contact) => contact.is_active !== false);
  const primarySupportContact =
    activeSupportContacts.find((contact) => contact.is_primary) ||
    activeSupportContacts.find((contact) => contact.contact_type === "legal_guardian") ||
    activeSupportContacts.find((contact) => contact.contact_type === "emergency") ||
    null;
  const emergencySupportContact = activeSupportContacts.find((contact) => contact.contact_type === "emergency") || null;
  const activeExternalProfessionals = activeSupportContacts.filter(
    (contact) => !["legal_guardian", "financial_guardian", "emergency"].includes(String(contact.contact_type || ""))
  );
  const signedGeneralConsent = patientConsents.find(
    (consent) => consent.consent_type === "general_consent" && consent.status === "signed"
  ) || null;
  const pendingOrExpiredConsents = patientConsents.filter((consent) => consent.status === "pending" || consent.status === "expired");
  const recentDocuments = patientDocuments.slice(0, 3);
  const needsAccessLinkUpdate =
    !!patient.access_token_revoked_at ||
    (!!patient.access_token_expires_at && new Date(patient.access_token_expires_at) < now);
  const lastSessionNeedsEvolution =
    lastSession?.status === "completed" && !lastSession.session_notes_encrypted ? lastSession : null;
  const clinicalSummaryItems = [
    patient.diagnosis_encrypted
      ? {
          label: "Registro clínico",
          text: patient.diagnosis_encrypted,
          detail: "Campo seguro do cadastro do paciente",
        }
      : null,
    patient.notes_encrypted
      ? {
          label: "Observações gerais",
          text: patient.notes_encrypted,
          detail: "Notas gerais registradas no prontuário",
        }
      : null,
    latestEvolutionText
      ? {
          label: "Última evolução",
          text: latestEvolutionText,
          detail: latestEvolutionSession ? getSessionDateLabel(latestEvolutionSession) : "Sessão concluída",
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; text: string; detail: string }>;
  const toDate = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const clinicalTimelineEvents = [
    ...sessions.flatMap((session): ClinicalTimelineEvent[] => {
      const date = toDate(session.scheduled_at);
      if (!date) return [];
      const statusCfg = SESSION_STATUS[session.status as keyof typeof SESSION_STATUS];
      const hasEvolution = !!session.session_notes_encrypted;
      const isFuture = session.status === "scheduled" && date >= now;
      const eventType =
        session.status === "cancelled"
          ? "Sessão cancelada"
          : isFuture
            ? "Sessão agendada"
            : "Sessão realizada";

      return [{
        id: `session-${session.id}`,
        date,
        icon: Clock,
        type: eventType,
        title: `${formatDate(session.scheduled_at)} às ${formatTime(session.scheduled_at)}`,
        description: hasEvolution
          ? "Sessão com evolução registrada."
          : session.status === "scheduled"
            ? `${session.duration_minutes ?? 50} min · ${getSessionTypeLabel(session.session_type)}`
            : "Sessão sem evolução registrada.",
        badge: hasEvolution ? "Evolução registrada" : statusCfg?.label ?? session.status,
        tone: session.status === "cancelled" ? "rose" : isFuture ? "sky" : hasEvolution ? "emerald" : "violet",
        onAction: () => {
          setViewingSession(session);
          setIsEditingSession(false);
          setShowSessionModal(true);
        },
        actionLabel: "Abrir",
      }];
    }),
    ...anamnesisSummaries.flatMap((item): ClinicalTimelineEvent[] => {
      const created = toDate(item.created_at);
      const completed = toDate(item.completed_at);
      const events: ClinicalTimelineEvent[] = [];

      if (created) {
        events.push({
          id: `anamnesis-requested-${item.id}`,
          date: created,
          icon: Shield,
          type: "Anamnese solicitada",
          title: "Solicitação de anamnese criada",
          description: item.public_revoked_at ? "Link público revogado." : "Aguardando preenchimento ou conclusão.",
          badge: item.status === "completed" ? "Respondida" : "Pendente",
          tone: item.status === "completed" ? "emerald" : "amber",
          onAction: () => setActiveTab("anamnesis"),
          actionLabel: "Ver",
        });
      }

      if (completed) {
        events.push({
          id: `anamnesis-completed-${item.id}`,
          date: completed,
          icon: CheckCircle2,
          type: "Anamnese respondida",
          title: "Anamnese concluída",
          description: "Resposta registrada no fluxo seguro de anamnese.",
          badge: "Concluída",
          tone: "emerald",
          onAction: () => setActiveTab("anamnesis"),
          actionLabel: "Ver",
        });
      }

      return events;
    }),
    ...patientTasks.flatMap((task): ClinicalTimelineEvent[] => {
      const created = toDate(task.created_at);
      const responded = toDate((task as any).responded_at);
      const completed = toDate(task.completed_at);
      const events: ClinicalTimelineEvent[] = [];

      if (created) {
        events.push({
          id: `task-created-${task.id}`,
          date: created,
          icon: ListChecks,
          type: "Tarefa enviada",
          title: task.title,
          description: task.due_date ? `Prazo: ${formatDate(task.due_date)}` : "Tarefa criada para o paciente.",
          badge: task.status === "completed" ? "Concluída" : "Pendente",
          tone: task.status === "completed" ? "emerald" : "amber",
          onAction: () => setActiveTab("tasks"),
          actionLabel: "Abrir",
        });
      }

      if (responded) {
        events.push({
          id: `task-responded-${task.id}`,
          date: responded,
          icon: Bell,
          type: "Tarefa respondida",
          title: task.title,
          description: "Paciente enviou uma resposta pelo portal.",
          badge: "Respondida",
          tone: "sky",
          onAction: () => setActiveTab("tasks"),
          actionLabel: "Abrir",
        });
      }

      if (completed) {
        events.push({
          id: `task-completed-${task.id}`,
          date: completed,
          icon: Check,
          type: "Tarefa concluída",
          title: task.title,
          description: "Paciente concluiu a tarefa registrada.",
          badge: "Concluída",
          tone: "emerald",
          onAction: () => setActiveTab("tasks"),
          actionLabel: "Abrir",
        });
      }

      return events;
    }),
    ...abcSummaries.flatMap((item): ClinicalTimelineEvent[] => {
      const date = toDate(item.occurrence_date || item.created_at);
      if (!date) return [];
      return [{
        id: `abc-${item.id}`,
        date,
        icon: Activity,
        type: "Registro ABC",
        title: "Registro comportamental adicionado",
        description: item.intensity ? `Intensidade registrada: ${item.intensity}/10.` : "Registro ABC disponível na aba correspondente.",
        badge: "ABC",
        tone: "rose",
        includeTime: false,
        onAction: () => setActiveTab("behavior"),
        actionLabel: "Ver ABC",
      }];
    }),
    ...protocolSummaries.flatMap((item): ClinicalTimelineEvent[] => {
      const date = toDate(item.evaluation_date || item.created_at);
      if (!date) return [];
      return [{
        id: `protocol-${item.id}`,
        date,
        icon: ClipboardList,
        type: "Avaliação/protocolo",
        title: item.protocol_name || "Protocolo aplicado",
        description: item.status === "completed" ? "Avaliação concluída." : "Avaliação em acompanhamento.",
        badge: item.status === "completed" ? "Concluído" : "Em andamento",
        tone: "teal",
        includeTime: false,
        onAction: () => setActiveTab("protocols"),
        actionLabel: "Ver",
      }];
    }),
    ...patientCashFlow.flatMap((item): ClinicalTimelineEvent[] => {
      const date = toDate(item.paid_at || item.due_date || item.created_at);
      if (!date) return [];
      const isConfirmed = item.status === "confirmed";
      const includeTime = !!item.paid_at || (!item.due_date && !!item.created_at);
      return [{
        id: `finance-${item.id}`,
        date,
        icon: Wallet,
        type: isConfirmed ? "Pagamento recebido" : "Financeiro",
        title: item.description || "Lançamento financeiro",
        description: `${formatCurrency(Number(item.amount))} · ${isConfirmed ? "confirmado" : item.status}`,
        badge: isConfirmed ? "Recebido" : item.status === "pending" ? "Pendente" : item.status,
        tone: isConfirmed ? "emerald" : "amber",
        includeTime,
        onAction: () => setActiveTab("finance"),
        actionLabel: "Ver",
      }];
    }),
    ...moodCheckins.flatMap((item): ClinicalTimelineEvent[] => {
      const date = toDate(item.created_at);
      if (!date) return [];
      return [{
        id: `mood-checkin-${item.id}`,
        date,
        icon: Activity,
        type: "Check-in realizado",
        title: "Humor/sintomas relatados",
        description: `Humor ${item.mood_score ?? "—"}/5 · Ansiedade ${item.anxiety_score ?? "—"}/5 · Sono ${item.sleep_quality ?? "—"}/5.`,
        badge: "Relatado pelo paciente",
        tone: "sky",
        onAction: () => setActiveTab("tasks"),
        actionLabel: "Ver",
      }];
    }),
    ...((): ClinicalTimelineEvent[] => {
      if (!treatmentPlan) return [];
      const events: ClinicalTimelineEvent[] = [];
      const planUpdated = toDate(treatmentPlan.updated_at);
      const planCreated = toDate(treatmentPlan.created_at);

      if (planUpdated || planCreated) {
        const changed =
          planUpdated &&
          planCreated &&
          Math.abs(planUpdated.getTime() - planCreated.getTime()) > 1000;

        events.push({
          id: `treatment-plan-${treatmentPlan.id}-${changed ? "updated" : "created"}`,
          date: planUpdated || planCreated!,
          icon: Target,
          type: changed ? "Plano terapêutico atualizado" : "Plano terapêutico criado",
          title: "Plano do tratamento registrado",
          description: "Objetivo principal, foco atual e estratégias disponíveis na aba Plano.",
          badge: treatmentPlan.status === "active" ? "Ativo" : treatmentPlan.status,
          tone: "violet",
          onAction: () => setActiveTab("plan"),
          actionLabel: "Ver plano",
        });
      }

      treatmentPlan.goals?.forEach((goal) => {
        const completedAt = toDate(goal.completed_at);
        const createdAt = toDate(goal.created_at);

        if (completedAt) {
          events.push({
            id: `treatment-goal-completed-${goal.id}`,
            date: completedAt,
            icon: CheckCircle2,
            type: "Objetivo concluído",
            title: goal.title,
            description: "Meta do plano terapêutico marcada como concluída.",
            badge: "Concluído",
            tone: "emerald",
            onAction: () => setActiveTab("plan"),
            actionLabel: "Ver plano",
          });
          return;
        }

        if (createdAt) {
          events.push({
            id: `treatment-goal-created-${goal.id}`,
            date: createdAt,
            icon: Target,
            type: "Objetivo terapêutico",
            title: goal.title,
            description: goal.target_date ? `Prazo: ${formatDate(goal.target_date)}.` : "Meta registrada no plano terapêutico.",
            badge: goal.status === "in_progress" ? "Em andamento" : goal.status,
            tone: goal.status === "paused" ? "amber" : "violet",
            onAction: () => setActiveTab("plan"),
            actionLabel: "Ver plano",
          });
        }
      });

      return events;
    })(),
    ...supportContacts.flatMap((contact): ClinicalTimelineEvent[] => {
      const date = toDate(contact.created_at);
      if (!date) return [];
      return [{
        id: `support-contact-${contact.id}`,
        date,
        icon: Users,
        type: "Contato de apoio cadastrado",
        title: contact.name,
        description: contact.contact_type === "emergency"
          ? "Contato de emergencia registrado na rede de apoio."
          : "Contato vinculado ao ecossistema do caso.",
        badge: contact.can_contact ? "Contato autorizado" : "Sem autorizacao",
        tone: contact.can_contact ? "emerald" : "slate",
        onAction: () => setActiveTab("team"),
        actionLabel: "Ver rede",
      }];
    }),
    ...patientConsents.flatMap((consent): ClinicalTimelineEvent[] => {
      const date = toDate(consent.signed_at || consent.created_at);
      if (!date) return [];
      return [{
        id: `consent-${consent.id}`,
        date,
        icon: Shield,
        type: consent.status === "signed" ? "Consentimento assinado" : "Consentimento registrado",
        title: consent.consent_type === "general_consent" ? "Termo de consentimento geral" : "Autorizacao/termo do paciente",
        description: consent.expires_at ? `Validade: ${formatDate(consent.expires_at)}.` : "Registro manual de consentimento ou autorizacao.",
        badge: consentStatusLabels[consent.status] || "Registrado",
        tone: consent.status === "signed" ? "emerald" : consent.status === "expired" ? "rose" : "amber",
        includeTime: false,
        onAction: () => setActiveTab("archive"),
        actionLabel: "Ver termos",
      }];
    }),
    ...patientDocuments.flatMap((document): ClinicalTimelineEvent[] => {
      const date = toDate(document.document_date || document.created_at);
      if (!date) return [];
      return [{
        id: `document-${document.id}`,
        date,
        icon: Archive,
        type: "Documento registrado",
        title: document.title,
        description: document.has_file && document.file_name ? `Arquivo privado: ${document.file_name}.` : "Documento registrado como metadado privado.",
        badge: getDocumentCategoryLabel(document.category),
        tone: "slate",
        includeTime: !document.document_date,
        onAction: () => setActiveTab("archive"),
        actionLabel: "Ver arquivos",
      }];
    }),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 6);

  const nextSessionDate = nextSession ? toDate(nextSession.scheduled_at) : null;
  const lastSessionDate = lastSession ? toDate(lastSession.scheduled_at) : null;
  const hasNextSessionIn24h =
    !!nextSessionDate &&
    nextSessionDate.getTime() >= now.getTime() &&
    nextSessionDate.getTime() - now.getTime() <= 24 * 60 * 60 * 1000;
  const todaySession =
    [...sessions]
      .filter((session) => {
        const date = toDate(session.scheduled_at);
        return !!date && date.toDateString() === now.toDateString() && session.status !== "cancelled";
      })
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0] ?? null;
  const todayScheduledNeedsStatus =
    todaySession?.status === "scheduled" && toDate(todaySession.scheduled_at)! <= now ? todaySession : null;
  const latestRespondedTask =
    [...patientTasks]
      .filter((task) => {
        const respondedAt = toDate((task as any).responded_at);
        if (!respondedAt) return false;
        return !lastSessionDate || respondedAt >= lastSessionDate;
      })
      .sort((a, b) => {
        const aDate = toDate((a as any).responded_at)?.getTime() ?? 0;
        const bDate = toDate((b as any).responded_at)?.getTime() ?? 0;
        return bDate - aDate;
      })[0] ?? null;
  const activeTreatmentGoals = treatmentPlan?.goals?.filter((goal) => goal.status === "active" || goal.status === "in_progress") || [];
  const treatmentPlanReviewDue =
    !!treatmentPlan?.review_date && new Date(`${treatmentPlan.review_date}T23:59:59`).getTime() < now.getTime();
  const preSessionAlerts = [
    !signedGeneralConsent ? "consentimento geral pendente" : null,
    !emergencySupportContact ? "sem contato de emergencia" : null,
    pendingPatientIncome > 0 ? "pendencia financeira" : null,
    needsAccessLinkUpdate ? "link do paciente precisa de revisao" : null,
    overdueTasks.length > 0 ? `${overdueTasks.length} tarefa(s) atrasada(s)` : null,
    lastSessionNeedsEvolution ? "ultima sessao sem evolucao" : null,
  ].filter(Boolean) as string[];

  const preSessionItems: GuidedSessionItem[] = [
    nextSession
      ? {
          icon: Calendar,
          title: hasNextSessionIn24h ? "Proxima sessao em destaque" : "Proxima sessao",
          detail: `${getSessionDateLabel(nextSession)} · ${nextSession.duration_minutes ?? 50} min`,
          state: hasNextSessionIn24h ? "success" : "suggested",
          actionLabel: "Ver sessoes",
          onAction: () => setActiveTab("sessions"),
        }
      : {
          icon: Calendar,
          title: "Sem sessao futura",
          detail: "Nao ha proxima sessao agendada para este paciente.",
          state: "pending",
          actionLabel: "Agendar",
          onAction: () => router.push("/dashboard/schedule"),
        },
    latestEvolutionSession
      ? {
          icon: FileText,
          title: "Ultima evolucao",
          detail: latestEvolutionSession ? getSessionDateLabel(latestEvolutionSession) : "Evolucao registrada.",
          state: "success",
          actionLabel: "Abrir",
          onAction: () => setActiveTab("notes"),
        }
      : lastSessionNeedsEvolution
        ? {
            icon: FileText,
            title: "Evolucao pendente",
            detail: `A sessao de ${getSessionDateLabel(lastSessionNeedsEvolution)} ainda nao tem evolucao registrada.`,
            state: "attention",
            actionLabel: "Registrar",
            onAction: () => setActiveTab("notes"),
          }
        : {
            icon: FileText,
            title: "Sem evolucao recente",
            detail: "Registros de evolucao aparecerao aqui antes do atendimento.",
            state: "suggested",
            actionLabel: "Prontuario",
            onAction: () => setActiveTab("notes"),
          },
    treatmentPlan
      ? {
          icon: Target,
          title: "Plano terapeutico",
          detail: `${treatmentPlan.current_focus || "Foco atual registrado."}${activeTreatmentGoals.length > 0 ? ` · ${activeTreatmentGoals.length} objetivo(s) ativo(s)` : ""}`,
          state: treatmentPlanReviewDue ? "attention" : "success",
          actionLabel: "Ver plano",
          onAction: () => setActiveTab("plan"),
        }
      : {
          icon: Target,
          title: "Plano terapeutico ausente",
          detail: "Ainda nao ha foco atual e objetivos estruturados para revisao pre-sessao.",
          state: "suggested",
          actionLabel: "Criar plano",
          onAction: () => setActiveTab("plan"),
        },
    latestRespondedTask
      ? {
          icon: ListChecks,
          title: "Tarefa respondida",
          detail: latestRespondedTask.title,
          state: "pending",
          actionLabel: "Revisar",
          onAction: () => setActiveTab("tasks"),
        }
      : pendingTasks.length > 0
        ? {
            icon: ListChecks,
            title: "Tarefas em aberto",
            detail: overdueTasks.length > 0 ? `${overdueTasks.length} atrasada(s) de ${pendingTasks.length} em aberto.` : `${pendingTasks.length} tarefa(s) em aberto.`,
            state: overdueTasks.length > 0 ? "attention" : "suggested",
            actionLabel: "Ver tarefas",
            onAction: () => setActiveTab("tasks"),
          }
        : {
            icon: ListChecks,
            title: "Tarefas",
            detail: "Nenhuma tarefa terapeutica em aberto.",
            state: "success",
            actionLabel: "Abrir",
            onAction: () => setActiveTab("tasks"),
          },
    latestMoodCheckin
      ? {
          icon: Activity,
          title: "Check-in recente",
          detail: `Humor ${latestMoodCheckin.mood_score ?? "-"}/5 · Ansiedade ${latestMoodCheckin.anxiety_score ?? "-"}/5 · Sono ${latestMoodCheckin.sleep_quality ?? "-"}/5.`,
          state: "success",
          actionLabel: "Ver",
          onAction: () => setActiveTab("tasks"),
        }
      : {
          icon: Activity,
          title: "Sem check-in recente",
          detail: "Quando o paciente registrar humor/sintomas, o resumo aparecera aqui.",
          state: "suggested",
          actionLabel: "Tarefas",
          onAction: () => setActiveTab("tasks"),
        },
    preSessionAlerts.length > 0
      ? {
          icon: Bell,
          title: "Atencoes antes da sessao",
          detail: preSessionAlerts.slice(0, 4).join(" · "),
          state: "attention",
          actionLabel: "Revisar",
          onAction: () => setActiveTab(!signedGeneralConsent ? "archive" : !emergencySupportContact ? "team" : pendingPatientIncome > 0 ? "finance" : "tasks"),
        }
      : {
          icon: CheckCircle2,
          title: "Alertas principais",
          detail: "Consentimento, emergencia, financeiro e portal sem alerta imediato.",
          state: "success",
        },
  ];

  const postSessionItems: GuidedSessionItem[] = [
    lastSessionNeedsEvolution
      ? {
          icon: FileText,
          title: "Registrar evolucao",
          detail: `Fechamento pendente para ${getSessionDateLabel(lastSessionNeedsEvolution)}.`,
          state: "attention",
          actionLabel: "Registrar",
          onAction: () => setActiveTab("notes"),
        }
      : latestEvolutionSession
        ? {
            icon: CheckCircle2,
            title: "Evolucao recente",
            detail: `Ultimo registro em ${getSessionDateLabel(latestEvolutionSession)}.`,
            state: "success",
            actionLabel: "Prontuario",
            onAction: () => setActiveTab("notes"),
          }
        : {
            icon: FileText,
            title: "Evolucao",
            detail: "Nenhuma evolucao registrada ainda neste prontuario.",
            state: "suggested",
            actionLabel: "Registrar",
            onAction: () => setActiveTab("notes"),
          },
    nextSession
      ? {
          icon: Calendar,
          title: "Proxima sessao agendada",
          detail: getSessionDateLabel(nextSession),
          state: "success",
          actionLabel: "Agenda",
          onAction: () => setActiveTab("sessions"),
        }
      : {
          icon: Calendar,
          title: "Agendar continuidade",
          detail: "Nao ha sessao futura registrada apos o atendimento.",
          state: "pending",
          actionLabel: "Agendar",
          onAction: () => router.push("/dashboard/schedule"),
        },
    latestRespondedTask
      ? {
          icon: ListChecks,
          title: "Revisar tarefa respondida",
          detail: `${latestRespondedTask.title}. Se fizer sentido, crie a proxima tarefa.`,
          state: "pending",
          actionLabel: "Abrir tarefas",
          onAction: () => setActiveTab("tasks"),
        }
      : {
          icon: ListChecks,
          title: "Tarefas terapeuticas",
          detail: pendingTasks.length > 0 ? `${pendingTasks.length} tarefa(s) ainda em aberto.` : "Nenhuma tarefa aberta para fechamento.",
          state: pendingTasks.length > 0 ? "suggested" : "success",
          actionLabel: "Tarefas",
          onAction: () => setActiveTab("tasks"),
        },
    treatmentPlanReviewDue
      ? {
          icon: Target,
          title: "Revisar plano",
          detail: `Revisao prevista para ${formatDate(treatmentPlan!.review_date!)}.`,
          state: "attention",
          actionLabel: "Ver plano",
          onAction: () => setActiveTab("plan"),
        }
      : treatmentPlan
        ? {
            icon: Target,
            title: "Plano atualizado",
            detail: activeTreatmentGoals.length > 0 ? `${activeTreatmentGoals.length} objetivo(s) ativo(s) em acompanhamento.` : "Plano terapeutico disponivel para consulta.",
            state: "success",
            actionLabel: "Ver plano",
            onAction: () => setActiveTab("plan"),
          }
        : {
            icon: Target,
            title: "Plano terapeutico",
            detail: "Criar ou revisar plano pode ajudar no fechamento do caso.",
            state: "suggested",
            actionLabel: "Abrir plano",
            onAction: () => setActiveTab("plan"),
          },
    pendingPatientIncome > 0
      ? {
          icon: Wallet,
          title: "Financeiro pendente",
          detail: `${formatCurrency(pendingPatientIncome)} em lancamentos pendentes.`,
          state: "pending",
          actionLabel: "Financeiro",
          onAction: () => setActiveTab("finance"),
        }
      : {
          icon: Wallet,
          title: "Financeiro",
          detail: "Sem pendencia financeira identificada nos dados carregados.",
          state: "success",
          actionLabel: "Abrir",
          onAction: () => setActiveTab("finance"),
        },
    todayScheduledNeedsStatus
      ? {
          icon: Clock,
          title: "Conferir status da sessao",
          detail: "Ha uma sessao de hoje ainda agendada; revise antes de encerrar o atendimento.",
          state: "suggested",
          actionLabel: "Sessoes",
          onAction: () => setActiveTab("sessions"),
        }
      : {
          icon: CheckCircle2,
          title: "Fechamento",
          detail: "Nenhuma acao automatica foi aplicada; use o checklist conforme necessario.",
          state: "success",
      },
  ];
  const shouldShowPostSessionGuide =
    !!todaySession ||
    !!lastSessionNeedsEvolution ||
    (!!lastSessionDate && now.getTime() - lastSessionDate.getTime() <= 48 * 60 * 60 * 1000);

  const nextActions: Array<{
    icon: React.ElementType;
    title: string;
    reason: string;
    priority: "high" | "medium" | "low" | "success";
    actionLabel: string;
    onAction: () => void;
  }> = [];

  if (!nextSession) {
    nextActions.push({
      icon: Calendar,
      title: "Agendar próxima sessão",
      reason: "Não há sessão futura registrada para este paciente.",
      priority: "high",
      actionLabel: "Agendar",
      onAction: () => router.push("/dashboard/schedule"),
    });
  }

  if (!hasAnsweredAnamnesis) {
    nextActions.push({
      icon: Shield,
      title: pendingAnamnesis ? "Acompanhar anamnese pendente" : "Solicitar anamnese",
      reason: pendingAnamnesis
        ? "Há uma solicitação aberta, mas ainda sem resposta concluída."
        : "Ainda não há anamnese respondida para este paciente.",
      priority: "medium",
      actionLabel: "Ver anamnese",
      onAction: () => setActiveTab("anamnesis"),
    });
  }

  if (pendingTasks.length > 0) {
    nextActions.push({
      icon: ListChecks,
      title: "Revisar tarefas pendentes",
      reason:
        overdueTasks.length > 0
          ? `${overdueTasks.length} tarefa(s) atrasada(s) entre ${pendingTasks.length} em aberto.`
          : `${pendingTasks.length} tarefa(s) em aberto no portal do paciente.`,
      priority: overdueTasks.length > 0 ? "high" : "medium",
      actionLabel: "Abrir tarefas",
      onAction: () => setActiveTab("tasks"),
    });
  }

  if (lastSessionNeedsEvolution) {
    nextActions.push({
      icon: ClipboardList,
      title: "Registrar evolução da última sessão",
      reason: `A sessão de ${getSessionDateLabel(lastSessionNeedsEvolution)} ainda não tem evolução registrada.`,
      priority: "high",
      actionLabel: "Registrar",
      onAction: () => setActiveTab("notes"),
    });
  }

  if (!treatmentPlan) {
    nextActions.push({
      icon: Target,
      title: "Criar plano terapêutico",
      reason: "Ainda não há objetivo principal e foco atual estruturados para este caso.",
      priority: "low",
      actionLabel: "Abrir plano",
      onAction: () => setActiveTab("plan"),
    });
  }

  if (pendingPatientIncome > 0) {
    nextActions.push({
      icon: Wallet,
      title: "Ver pendência financeira",
      reason: `${formatCurrency(pendingPatientIncome)} em lançamentos pendentes para este paciente.`,
      priority: "medium",
      actionLabel: "Ver financeiro",
      onAction: () => setActiveTab("finance"),
    });
  }

  if (needsAccessLinkUpdate) {
    nextActions.push({
      icon: Bell,
      title: "Atualizar link do paciente",
      reason: `O portal está com status: ${portalState.toLowerCase()}.`,
      priority: "medium",
      actionLabel: "Gerenciar link",
      onAction: () => setActiveTab("tasks"),
    });
  }

  if (missingEssentialFields.length > 0) {
    nextActions.push({
      icon: User,
      title: "Completar cadastro",
      reason: `Faltam dados essenciais: ${missingEssentialFields.join(", ")}.`,
      priority: "low",
      actionLabel: "Abrir cadastro",
      onAction: () => setProfileDialogOpen(true),
    });
  }

  if (!emergencySupportContact) {
    nextActions.push({
      icon: Users,
      title: "Cadastrar contato de emergencia",
      reason: "A rede de apoio ainda nao tem um contato de emergencia identificado.",
      priority: "medium",
      actionLabel: "Abrir rede",
      onAction: () => setActiveTab("team"),
    });
  }

  if (!signedGeneralConsent) {
    nextActions.push({
      icon: Shield,
      title: "Registrar consentimento geral",
      reason: "Nao ha termo de consentimento geral assinado registrado para este paciente.",
      priority: "medium",
      actionLabel: "Ver termos",
      onAction: () => setActiveTab("archive"),
    });
  }

  if (nextActions.length === 0) {
    nextActions.push({
      icon: CheckCircle2,
      title: "Acompanhamento em ordem",
      reason: "Sessão futura, anamnese respondida e pendências principais estão sem alerta.",
      priority: "success",
      actionLabel: "Ver sessões",
      onAction: () => setActiveTab("sessions"),
    });
  }
  const priorityNextActions = nextActions.slice(0, 4);
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditForm((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleExportSessions = async () => {
    if (!profile) return;
    const tableBody = sessions.map(s => [
      new Date(s.scheduled_at).toLocaleDateString("pt-BR"),
      formatTime(s.scheduled_at),
      `${s.duration_minutes} min`,
      s.session_type === "online" ? "Online" : "Presencial",
      SESSION_STATUS[s.status as keyof typeof SESSION_STATUS]?.label || ""
    ]);

    await exportPdf({
      title: "Relatório de Sessões",
      subtitle: `Paciente: ${patient.full_name}\nData de Geração: ${new Date().toLocaleDateString("pt-BR")}`,
      profile,
      fileName: `sessoes_${patient.full_name.replace(/\s+/g, '_')}.pdf`,
      content: [
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', 'auto', '*', 'auto'],
            body: [
              [
                { text: 'Data', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] },
                { text: 'Hora', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] },
                { text: 'Duração', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] },
                { text: 'Tipo', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] },
                { text: 'Status', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] }
              ],
              ...tableBody.map(row => row.map(cell => ({ text: cell, margin: [5, 5] })))
            ]
          },
          layout: {
            fillColor: function (rowIndex: number) {
              return (rowIndex % 2 === 0 && rowIndex > 0) ? '#f8fafc' : null;
            },
            hLineColor: '#e2e8f0',
            vLineColor: '#e2e8f0'
          }
        }
      ]
    });
  };

  const handleExportNotes = async () => {
    if (!profile || !patient.notes_encrypted) return;
    const completedSessions = sessions.filter(s => s.status === "completed" && s.session_notes_encrypted);
    const contentBody: any[] = [];
    if (patient.notes_encrypted) {
      contentBody.push({ text: "Notas Gerais", style: "header" });
      contentBody.push({ text: patient.notes_encrypted, style: "normalText", margin: [0, 0, 0, 20] });
    }

    if (completedSessions.length > 0) {
      contentBody.push({ text: "Evoluções por Sessão", style: "header", margin: [0, 10, 0, 10] });
      completedSessions.forEach(session => {
        let evolution: any = null;
        try {
          evolution = JSON.parse(session.session_notes_encrypted || "{}");
        } catch (e) {
          evolution = { notes: session.session_notes_encrypted };
        }
        const dateStr = `${new Date(session.scheduled_at).toLocaleDateString("pt-BR")}`;
        const moodStr = evolution.mood_happy_sad ? ` (Humor: ${evolution.mood_happy_sad}/10)` : "";
        contentBody.push({ text: `${dateStr}${moodStr}`, style: "subheader" });
        contentBody.push({ text: evolution.notes || evolution || "", style: "normalText", margin: [0, 0, 0, 10] });
      });
    }

    await exportPdf({
      title: "Prontuário de Evolução",
      subtitle: `Paciente: ${patient.full_name}\nData: ${new Date().toLocaleDateString("pt-BR")}`,
      profile,
      fileName: `prontuario_evolucao_${patient.full_name.replace(/\s+/g, '_')}.pdf`,
      content: contentBody
    });
  };

  const handleExportFullRecord = async () => {
    // Keep placeholder or existing export
    handleExportNotes();
  };

  const handleExportSingleSession = async (session: Session) => {
    if (!profile) return;
    let evolution: any = null;
    try {
      evolution = JSON.parse(session.session_notes_encrypted || "{}");
    } catch (e) {
      evolution = { notes: session.session_notes_encrypted };
    }

    await exportPdf({
      title: "Relatório de Atendimento Individual",
      subtitle: `Paciente: ${patient.full_name} | Data: ${formatDate(session.scheduled_at)}`,
      profile,
      fileName: `sessao_${patient.full_name.replace(/\s+/g, '_')}_${formatDate(session.scheduled_at).replace(/\//g, '-')}.pdf`,
      content: [
        { text: "Evolução Clínica", style: "header", color: '#4f46e5', margin: [0, 10, 0, 10] },
        { text: evolution.notes || session.session_notes_encrypted || "Nenhuma nota registrada.", style: "normalText" }
      ]
    });
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 md:px-6 md:py-5">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/dashboard/patients")}
        className="rounded-2xl text-muted-foreground transition-colors hover:bg-white/70 hover:text-foreground"
      >
        <ArrowLeft className="mr-1 size-4" />
        Voltar para pacientes
      </Button>

      <section className="animate-fade-in overflow-hidden rounded-3xl border border-primary/10 bg-card/90 shadow-[0_18px_50px_rgba(41,31,67,0.08)] ring-1 ring-white/80">
        <div className="relative grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-56 bg-[radial-gradient(circle_at_22%_20%,rgba(124,58,237,0.18),transparent_42%),radial-gradient(circle_at_45%_90%,rgba(16,185,129,0.14),transparent_36%)]" />

          <div className="relative flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
            <Avatar className="size-16 shrink-0 rounded-3xl ring-4 ring-primary/10 md:size-20">
              <AvatarFallback className="gradient-primary text-lg font-semibold text-white md:text-2xl">
                {getInitials(patient.full_name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusCfg.className)}>
                  {statusCfg.label}
                </Badge>
                {age !== null && (
                  <Badge variant="outline" className="rounded-full border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                    {age} anos
                  </Badge>
                )}
                {hasGuardian && (
                  <Badge variant="outline" className="rounded-full border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                    Responsável cadastrado
                  </Badge>
                )}
              </div>

              <h1 className="mt-3 truncate text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                {patient.full_name}
              </h1>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                {patient.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-4 text-primary/60" />
                    {patient.email}
                  </span>
                )}
                {patient.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-4 text-primary/60" />
                    {patient.phone}
                  </span>
                )}
                {patient.date_of_birth && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-4 text-primary/60" />
                    Nascimento: {formatDate(patient.date_of_birth)}
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="h-9 rounded-2xl" onClick={() => router.push("/dashboard/schedule")}>
                  <Calendar className="size-4" />
                  Agendar sessão
                </Button>
                <Button variant="outline" className="h-9 rounded-2xl bg-white/80" onClick={() => setActiveTab("notes")}>
                  <FileText className="size-4" />
                  Registrar evolução
                </Button>
                <Button variant="outline" className="h-9 rounded-2xl bg-white/80" onClick={() => setActiveTab("anamnesis")}>
                  <Shield className="size-4" />
                  Solicitar anamnese
                </Button>
                <Button variant="outline" className="h-9 rounded-2xl bg-white/80" onClick={() => setActiveTab("tasks")}>
                  <Bell className="size-4" />
                  Link do paciente
                </Button>
                <Button variant="outline" className="h-9 rounded-2xl bg-white/80" onClick={() => setActiveTab("finance")}>
                  <Wallet className="size-4" />
                  Financeiro
                </Button>
                <Button variant="ghost" className="h-9 rounded-2xl text-muted-foreground hover:bg-white/70 hover:text-foreground" onClick={() => setProfileDialogOpen(true)}>
                  <User className="size-4" />
                  Cadastro
                </Button>
              </div>
            </div>
          </div>

          <div className="relative grid gap-3 sm:grid-cols-3 lg:w-[420px] lg:grid-cols-1">
            <div className="rounded-2xl border border-border/70 bg-white/75 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Agora</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {pendingTasks.length > 0
                  ? `${pendingTasks.length} tarefa(s) em aberto`
                  : nextSession
                    ? "Próxima sessão agendada"
                    : "Sem pendências imediatas"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {overdueTasks.length > 0
                  ? `${overdueTasks.length} tarefa(s) atrasada(s)`
                  : nextSession
                    ? getSessionDateLabel(nextSession)
                    : "Revise as abas para manter o caso atualizado."}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-white/75 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Portal</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{portalState}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {patient.auth_user_id ? "Paciente com acesso vinculado." : "Gerencie link e tarefas em Tarefas."}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-white/75 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Clínico</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {hasGeneralNotes ? "Prontuário com notas gerais" : "Sem nota geral registrada"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {completedSessions.length} sessão(ões) realizadas
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={History}
          label="Última sessão"
          value={getSessionDateLabel(lastSession)}
          detail={lastSession ? SESSION_STATUS[lastSession.status as keyof typeof SESSION_STATUS]?.label ?? lastSession.status : "Ainda sem histórico"}
          tone="violet"
        />
        <SummaryCard
          icon={Calendar}
          label="Próxima sessão"
          value={getSessionDateLabel(nextSession)}
          detail={nextSession ? `${nextSession.duration_minutes ?? 50} min` : "Nenhuma sessão futura"}
          tone="emerald"
        />
        <SummaryCard
          icon={Check}
          label="Sessões realizadas"
          value={`${completedSessions.length}`}
          detail={`${scheduledOnlySessions.length} agendada(s)`}
          tone="sky"
        />
        <SummaryCard
          icon={ListChecks}
          label="Pendências"
          value={`${pendingTasks.length}`}
          detail={overdueTasks.length > 0 ? `${overdueTasks.length} atrasada(s)` : "Sem atraso identificado"}
          tone={overdueTasks.length > 0 ? "amber" : "emerald"}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} orientation="horizontal" className="w-full">
        <div className={cn(
          "flex w-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-white/90 shadow-[0_18px_50px_rgba(41,31,67,0.08)] ring-1 ring-white/80"
        )}>
          <div className="overflow-x-auto bg-slate-50/85 px-3 pb-4 pt-3 scrollbar-hide md:overflow-visible">
            <TabsList className="!h-auto w-max min-w-full flex-row flex-nowrap justify-start gap-1 bg-transparent p-1 md:grid md:w-full md:grid-cols-6 md:gap-1.5 2xl:flex 2xl:flex-nowrap">
              {PATIENT_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="h-8 flex-none rounded-2xl px-3 text-xs font-semibold data-active:bg-white data-active:text-primary data-active:shadow-sm md:w-full md:justify-center 2xl:w-auto"
                  >
                    <Icon className="size-4" />
                    <span>{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          <div className="min-w-0 flex-1 overflow-y-auto bg-white/70 p-4 lg:max-h-[calc(100vh-18rem)] lg:p-5">
            <TabsContent value="overview" className="mt-0 w-full animate-fade-in">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <OverviewPanel
                    title="Resumo clínico"
                    description="Registros essenciais do prontuário."
                    icon={FileText}
                    action={
                      <Button variant="outline" size="sm" className="h-8 rounded-2xl bg-white text-xs" onClick={() => setActiveTab("notes")}>
                        Abrir prontuário
                      </Button>
                    }
                  >
                    {clinicalSummaryItems.length > 0 ? (
                      <div className="space-y-3">
                        {clinicalSummaryItems.map((item) => (
                          <div key={item.label} className="rounded-2xl border border-border/70 bg-white/80 p-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary/70">
                                {item.label}
                              </p>
                              <span className="text-[11px] font-medium text-muted-foreground">{item.detail}</span>
                            </div>
                            <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                              {item.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={FileText}
                        title="Nenhum resumo clínico registrado ainda."
                        description="Registre uma evolução para facilitar a leitura rápida do caso."
                        action={
                          <Button size="sm" className="h-8 rounded-2xl" onClick={() => setActiveTab("notes")}>
                            Registrar evolução
                          </Button>
                        }
                      />
                    )}
                  </OverviewPanel>

                  <div className={cn("grid gap-4", shouldShowPostSessionGuide && "lg:grid-cols-2")}>
                    <GuidedSessionCard
                      title="Preparação"
                      description="O essencial para revisar antes do atendimento."
                      icon={Clock}
                      items={preSessionItems}
                      maxItems={4}
                      dense
                      actions={[
                        { label: "Registrar evolucao", icon: FileText, onClick: () => setActiveTab("notes"), variant: "default" },
                        { label: "Ver plano", icon: Target, onClick: () => setActiveTab("plan") },
                        { label: "Ver tarefas", icon: ListChecks, onClick: () => setActiveTab("tasks") },
                      ]}
                    />

                    {shouldShowPostSessionGuide && (
                      <GuidedSessionCard
                        title="Fechamento"
                        description="Checklist pos-atendimento, sem automatizar acoes."
                        icon={CheckCircle2}
                        items={postSessionItems}
                        maxItems={4}
                        dense
                        actions={[
                          { label: "Evolucao", icon: FileText, onClick: () => setActiveTab("notes"), variant: "default" },
                          { label: "Tarefas", icon: ListChecks, onClick: () => setActiveTab("tasks") },
                          { label: "Agenda", icon: Calendar, onClick: () => router.push("/dashboard/schedule") },
                        ]}
                      />
                    )}
                  </div>

                  <OverviewPanel
                    title="Linha do tempo"
                    description="Últimos eventos do caso."
                    icon={History}
                    action={
                      <Button variant="outline" size="sm" className="h-8 rounded-2xl bg-white text-xs" onClick={() => setActiveTab("sessions")}>
                        Ver histórico completo
                      </Button>
                    }
                  >
                    {clinicalTimelineEvents.length > 0 ? (
                      <div className="space-y-3">
                        {clinicalTimelineEvents.map((event, index) => (
                          <TimelineEventRow
                            key={event.id}
                            event={event}
                            isLast={index === clinicalTimelineEvents.length - 1}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={History}
                        title="Ainda não há histórico clínico recente."
                        description="Quando houver sessões, anamnese, tarefas ou outros registros, eles aparecerão aqui."
                        action={
                          <Button size="sm" className="h-8 rounded-2xl" onClick={() => router.push("/dashboard/schedule")}>
                            Agendar sessão
                          </Button>
                        }
                      />
                    )}
                  </OverviewPanel>
                </div>

                <aside className="space-y-4">
                  <OverviewPanel title="Próximas ações" icon={ListChecks}>
                    <div className="space-y-2.5">
                      {priorityNextActions.map((action) => (
                        <NextActionRow
                          key={`${action.title}-${action.priority}`}
                          icon={action.icon}
                          title={action.title}
                          reason={action.reason}
                          priority={action.priority}
                          actionLabel={action.actionLabel}
                          onAction={action.onAction}
                        />
                      ))}
                    </div>
                    {nextActions.length > priorityNextActions.length && (
                      <p className="mt-3 px-1 text-xs font-medium text-muted-foreground">
                        +{nextActions.length - priorityNextActions.length} ação(ões) nas abas específicas.
                      </p>
                    )}
                  </OverviewPanel>

                  <TreatmentPlanOverviewCard
                    treatmentPlan={treatmentPlan}
                    onOpenPlan={() => setActiveTab("plan")}
                  />

                  <OverviewPanel title="Humor e sintomas" icon={Activity}>
                    {latestMoodCheckin ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <DetailRow label="Humor" value={`${latestMoodCheckin.mood_score ?? "—"}/5`} />
                          <DetailRow label="Ansiedade" value={`${latestMoodCheckin.anxiety_score ?? "—"}/5`} />
                          <DetailRow label="Sono" value={`${latestMoodCheckin.sleep_quality ?? "—"}/5`} />
                          <DetailRow label="Energia" value={`${latestMoodCheckin.energy_score ?? "—"}/5`} />
                        </div>
                        <p className="rounded-2xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                          {moodTrend}
                        </p>
                        <Button variant="outline" className="h-9 w-full rounded-2xl bg-white" onClick={() => setActiveTab("tasks")}>
                          Ver registros
                        </Button>
                      </div>
                    ) : (
                      <EmptyState
                        icon={Activity}
                        title="Nenhum check-in registrado ainda."
                        description="Quando o paciente registrar humor, ansiedade, sono ou energia, o resumo aparecerá aqui."
                      />
                    )}
                  </OverviewPanel>

                  <OverviewPanel title="Apoio e documentos" icon={Users}>
                    <div className="space-y-1">
                      <DetailRow
                        label="Responsavel principal"
                        value={primarySupportContact?.name || guardian?.full_name || "Nao cadastrado"}
                      />
                      <DetailRow
                        label="Emergencia"
                        value={emergencySupportContact?.name || patient.emergency_contact_name || "Nao cadastrado"}
                      />
                      <DetailRow label="Profissionais ativos" value={`${activeExternalProfessionals.length}`} />
                      <DetailRow
                        label="Consentimentos"
                        value={
                          signedGeneralConsent
                            ? `Geral assinado${pendingOrExpiredConsents.length > 0 ? ` · ${pendingOrExpiredConsents.length} pendente(s)` : ""}`
                            : "Sem termo geral assinado"
                        }
                      />
                      <DetailRow
                        label="Documentos"
                        value={
                          patientDocuments.length > 0
                            ? `${patientDocuments.length} registrado(s)${recentDocuments[0]?.title ? ` · ultimo: ${recentDocuments[0].title}` : ""}`
                            : "Nenhum registrado"
                        }
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button variant="outline" className="h-9 rounded-2xl bg-white" onClick={() => setActiveTab("team")}>
                        Ver rede
                      </Button>
                      <Button variant="outline" className="h-9 rounded-2xl bg-white" onClick={() => setActiveTab("archive")}>
                        Ver arquivos
                      </Button>
                    </div>
                  </OverviewPanel>

                </aside>
              </div>
            </TabsContent>

            <TabsContent value="sessions" className="mt-0 space-y-3 w-full">
              <SessionList
                sessions={sessions}
                scheduledOnlySessions={scheduledOnlySessions}
                isExportingPdf={isExportingPdf}
                handleExportSessions={handleExportSessions}
                setRescheduleSession={setRescheduleSession}
                setRescheduleDate={setRescheduleDate}
                setRescheduleTime={setRescheduleTime}
                setShowRescheduleModal={setShowRescheduleModal}
                setCancellingSession={setCancellingSession}
                setShowCancelSeriesModal={setShowCancelSeriesModal}
              />
            </TabsContent>

            <TabsContent value="notes" className="mt-0 space-y-6 w-full animate-fade-in">
              <EvolutionNotesForm
                patient={patient}
                sessions={sessions}
                isExportingPdf={isExportingPdf}
                handleExportFullRecord={handleExportFullRecord}
                handleExportNotes={handleExportNotes}
                newNote={newNote}
                setNewNote={setNewNote}
                savingNote={savingNote}
                handleAddNote={handleAddNote}
              />
            </TabsContent>

            <TabsContent value="team" className="mt-0 space-y-6 w-full animate-fade-in">
              <CareNetworkCard
                patientId={id as string}
                patient={patient}
                profile={profile}
                initialContacts={supportContacts}
                onChanged={setSupportContacts}
              />
            </TabsContent>

            <TabsContent value="protocols" className="mt-0 space-y-6 w-full animate-fade-in">
              <ProtocolTrackerCard patientId={id as string} patient={patient} profile={profile} />
            </TabsContent>

            <TabsContent value="behavior" className="mt-0 space-y-6 w-full animate-fade-in">
              <AbcRecordCard patientId={id as string} patient={patient} profile={profile} />
            </TabsContent>

            <TabsContent value="finance" className="mt-0 space-y-6 w-full animate-fade-in">
              <PatientFinances
                totalPatientIncome={totalPatientIncome}
                pendingPatientIncome={pendingPatientIncome}
                patientCashFlow={patientCashFlow}
              />
            </TabsContent>

            <TabsContent value="archive" className="mt-0 space-y-6 w-full animate-fade-in">
              <PatientRecordsManager
                patientId={patient.id}
                consents={patientConsents}
                documents={patientDocuments}
                onConsentsChanged={setPatientConsents}
                onDocumentsChanged={setPatientDocuments}
              />

              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Archive className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Sessoes arquivadas</h3>
                </div>
                {archivedSessions.length === 0 ? (
                  <Card className="glass-panel border-0 shadow-md rounded-[32px] bg-white/10">
                    <CardContent className="py-16 text-center">
                      <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground font-medium">Nenhuma sessão arquivada.</p>
                    </CardContent>
                  </Card>
                ) : (
                  archivedSessions.map((session) => {
                    const statusCfg = SESSION_STATUS[session.status as keyof typeof SESSION_STATUS] || SESSION_STATUS.scheduled;
                    return (
                      <Card key={session.id} className="glass-panel border-0 shadow-sm rounded-[24px] bg-white/40 hover:bg-white/60 transition-all border border-white/20">
                        <CardContent className="p-5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-primary/5 flex flex-col items-center justify-center border border-primary/10">
                                <span className="text-[10px] font-black text-primary leading-none uppercase">{new Date(session.scheduled_at).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
                                <span className="text-lg font-black text-primary leading-none mt-0.5">{new Date(session.scheduled_at).getDate()}</span>
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold text-slate-800">{formatTime(session.scheduled_at)}</p>
                                  <Badge className={cn("text-[9px] font-black uppercase tracking-widest h-5 px-2 border-0 shadow-sm", statusCfg.color)}>{statusCfg.label}</Badge>
                                </div>
                                <p className="text-xs font-medium text-slate-500 mt-0.5">
                                  {session.duration_minutes} MIN · {getSessionTypeLabel(session.session_type)}
                                </p>
                              </div>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="rounded-full text-primary hover:bg-primary/10 transition-all active:scale-95"
                              onClick={() => {
                                setViewingSession(session);
                                setIsEditingSession(false);
                                setShowSessionModal(true);
                              }}
                            >
                              <ChevronRight className="w-5 h-5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="plan" className="mt-0 space-y-6 w-full animate-fade-in">
              <TreatmentPlanManager
                patientId={patient.id}
                treatmentPlan={treatmentPlan}
                onChanged={setTreatmentPlan}
                isSecretary={isSecretary}
              />
            </TabsContent>

            <TabsContent value="anamnesis" className="mt-0 space-y-6 w-full animate-fade-in">
              <AnamnesisRequestCard patientId={patient.id} />
            </TabsContent>

            <TabsContent value="tasks" className="mt-0 space-y-6 w-full animate-fade-in">
              <Card className="rounded-[28px] border border-border/70 bg-white/85 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="size-4 text-primary" />
                    Humor e sintomas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {moodCheckins.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      {moodCheckins.slice(0, 3).map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-border/70 bg-slate-50/70 p-3">
                          <p className="mb-2 text-xs font-semibold text-muted-foreground">
                            {formatDate(entry.created_at, { day: "2-digit", month: "short" })}
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <span>Humor: <strong>{entry.mood_score ?? "—"}/5</strong></span>
                            <span>Ansiedade: <strong>{entry.anxiety_score ?? "—"}/5</strong></span>
                            <span>Sono: <strong>{entry.sleep_quality ?? "—"}/5</strong></span>
                            <span>Energia: <strong>{entry.energy_score ?? "—"}/5</strong></span>
                          </div>
                          {entry.notes && <p className="mt-2 line-clamp-2 text-xs italic text-muted-foreground">{entry.notes}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Activity}
                      title="Nenhum check-in registrado ainda."
                      description="O paciente poderá registrar humor, ansiedade, sono e energia pelo portal."
                    />
                  )}
                </CardContent>
              </Card>
              <PatientEngagementCard
                patientId={patient.id}
                patientEmail={patient.email}
                authUserId={patient.auth_user_id}
                accessToken={(patient as any).access_token ?? null}
                accessTokenExpiresAt={(patient as any).access_token_expires_at ?? null}
                accessTokenRevokedAt={(patient as any).access_token_revoked_at ?? null}
                dateOfBirth={patient.date_of_birth ?? null}
                onAccessLinkChanged={loadData}
              />
              <PatientTasksManager
                patientId={patient.id}
                initialTasks={patientTasks}
              />
            </TabsContent>
          </div>
        </div>
      </Tabs>

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-border/70 bg-white/95 p-0 shadow-2xl sm:max-w-5xl">
          <DialogHeader className="border-b border-border/60 bg-slate-50/80 px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <DialogTitle className="text-xl font-semibold text-foreground">Cadastro do paciente</DialogTitle>
                <DialogDescription>
                  Dados administrativos e responsáveis ficam fora da primeira dobra clínica.
                </DialogDescription>
              </div>
              {!isSecretary && (
                <Button
                  variant="outline"
                  className="h-9 rounded-2xl border-rose-200 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  onClick={handleArchive}
                  disabled={isArchiving}
                >
                  <Trash2 className="size-4" />
                  {isArchiving ? "Arquivando..." : "Arquivar paciente"}
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="overflow-y-auto p-5">
            <PatientProfile
              patient={patient}
              isEditing={isEditing}
              setIsEditing={setIsEditing}
              editForm={editForm}
              setEditForm={setEditForm}
              handleEditChange={handleEditChange}
              guardian={guardian}
              isSaving={isSaving}
              handleUpdatePatient={handleUpdatePatient}
              loadData={loadData}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Reschedule Modal */}
      <Dialog open={showRescheduleModal} onOpenChange={setShowRescheduleModal}>
        <DialogContent className="sm:max-w-[850px] rounded-[32px] glass-panel border-none shadow-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
          <div className="p-6 border-b border-white/20 bg-white/40 flex items-center justify-between shrink-0">
            <div>
              <DialogTitle className="text-xl font-black text-primary uppercase tracking-tight">Remarcar Sessão</DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground/60 mt-1 uppercase tracking-widest">
                Selecione um novo horário livre na sua agenda
              </DialogDescription>
            </div>
            <div className="flex items-center bg-white/60 rounded-full border border-white/80 p-1 shadow-sm">
              <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => setRescheduleWeekOffset(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-[10px] font-black px-3 uppercase tracking-widest text-primary/60">
                {rescheduleWeekDays[0].toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })} - {rescheduleWeekDays[5].toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
              </span>
              <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => setRescheduleWeekOffset(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-4 bg-white/10">
            <div className="grid grid-cols-[60px_repeat(6,1fr)] min-w-[800px] gap-px bg-white/40 border border-primary/20 rounded-2xl overflow-hidden shadow-sm relative">
              <div className="bg-white/60 h-12 border-b border-primary/20 sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.05)]"></div>
              {rescheduleWeekDays.map((day, i) => (
                <div key={i} className={cn(
                  "bg-white/60 h-12 border-b border-primary/20 flex flex-col items-center justify-center",
                  day.toDateString() === new Date().toDateString() && "bg-primary/5"
                )}>
                  <span className="text-[8px] font-black text-primary/40 uppercase tracking-widest">{["SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][i]}</span>
                  <span className="text-sm font-black text-primary">{day.getDate()}</span>
                </div>
              ))}

              {Array.from({ length: 13 }, (_, i) => 8 + i).map((hour) => (
                <React.Fragment key={hour}>
                  <div className="bg-white/60 h-16 flex items-center justify-center border-r border-primary/10 sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                    <span className="text-[10px] font-black text-primary/30">{hour}:00</span>
                  </div>
                  {rescheduleWeekDays.map((day, dayIdx) => {
                    const isOccupied = therapistSessions.some(s => {
                      const sDate = new Date(s.scheduled_at);
                      return sDate.toDateString() === day.toDateString() && sDate.getHours() === hour;
                    });
                    const isSelected = rescheduleDate === day.toISOString().split('T')[0] && parseInt(rescheduleTime.split(':')[0]) === hour;

                    return (
                      <div 
                        key={dayIdx} 
                        onClick={() => !isOccupied && handleSlotClick(day, hour)}
                        className={cn(
                          "h-16 relative border-r border-b border-primary/10 transition-all cursor-pointer",
                          isOccupied ? "bg-red-50/30 cursor-not-allowed" : "hover:bg-primary/5",
                          isSelected && "bg-primary/10 ring-2 ring-primary ring-inset z-10"
                        )}
                      >
                        {isOccupied && (
                          <div className="absolute inset-1 rounded-lg bg-red-100/60 border border-red-200/50 flex flex-col items-center justify-center p-1 overflow-hidden">
                            <span className="text-[7px] font-black text-red-600 uppercase tracking-tighter text-center leading-none">Ocupado</span>
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute inset-1 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                            <Check className="w-4 h-4 text-primary " />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="p-6 bg-white/50 border-t border-white/20 flex justify-between items-center px-8 shrink-0">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Horário Selecionado</span>
              <span className="text-sm font-black text-primary">
                {rescheduleDate ? new Date(rescheduleDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : "Selecione na grade"}
                {rescheduleTime && ` às ${rescheduleTime}`}
              </span>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" className="rounded-full font-bold px-8" onClick={() => setShowRescheduleModal(false)}>
                CANCELAR
              </Button>
              <Button 
                className="gradient-primary text-white rounded-full font-black px-12 h-12 shadow-lg shadow-primary/20 active:scale-95 transition-all"
                onClick={handleReschedule}
                disabled={isSaving || !rescheduleDate || !rescheduleTime}
              >
                {isSaving ? "SALVANDO..." : "CONFIRMAR"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Series Dialog */}
      <Dialog open={showCancelSeriesModal} onOpenChange={setShowCancelSeriesModal}>
        <DialogContent className="sm:max-w-[400px] rounded-[32px] glass-panel border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Confirmar Cancelamento
            </DialogTitle>
            <DialogDescription className="text-sm font-medium pt-2">
              Tem certeza que deseja cancelar esta sessão?
            </DialogDescription>
          </DialogHeader>
          
          {cancellingSession?.recurrence_rule && (
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mt-2">
              <p className="text-xs text-amber-800 font-bold">Esta sessão faz parte de um pacote ou série recorrente.</p>
              <p className="text-[10px] text-amber-700 mt-1">Deseja cancelar apenas esta sessão ou todas as futuras?</p>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4 w-full">
            <Button variant="ghost" className="rounded-full font-bold text-muted-foreground order-3 sm:order-1" onClick={() => setShowCancelSeriesModal(false)}>
              Voltar
            </Button>
            
            {cancellingSession?.recurrence_rule ? (
              <div className="flex flex-col sm:flex-row gap-2 flex-1">
                <Button 
                  variant="outline"
                  className="rounded-full font-bold text-red-600 border-red-200 hover:bg-red-50 flex-1"
                  onClick={() => handleCancelSession(false)}
                  disabled={isSaving}
                >
                  Apenas esta
                </Button>
                <Button 
                  className="rounded-full font-black bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200 flex-1"
                  onClick={() => handleCancelSession(true)}
                  disabled={isSaving}
                >
                  Toda a série
                </Button>
              </div>
            ) : (
              <Button 
                className="rounded-full font-black bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200 flex-1"
                onClick={() => handleCancelSession(false)}
                disabled={isSaving}
              >
                Confirmar Cancelamento
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session Detail Modal */}
      <Dialog open={showSessionModal} onOpenChange={setShowSessionModal}>
        <DialogContent className="sm:max-w-xl rounded-[32px] border-white/40 backdrop-blur-2xl bg-white/90 shadow-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
          {viewingSession && (
            <div className="animate-in fade-in zoom-in-95 duration-200 flex flex-col h-full overflow-hidden">
              <div className="p-8 border-b border-primary/10 bg-white/50 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-2xl font-black text-primary tracking-tight uppercase leading-none">
                    {isEditingSession ? "Editar Sessão" : "Detalhes da Sessão"}
                  </h2>
                  <p className="text-xs font-bold text-muted-foreground/60 mt-1 uppercase tracking-widest">
                    {formatDate(viewingSession.scheduled_at)} às {formatTime(viewingSession.scheduled_at)}
                  </p>
                </div>
                {!isEditingSession && (
                  <div className="flex items-center gap-3">
                    <Badge className={cn("rounded-full px-4 py-1 text-[10px] font-black uppercase tracking-widest border-0", SESSION_STATUS[viewingSession.status as keyof typeof SESSION_STATUS]?.color)}>
                      {SESSION_STATUS[viewingSession.status as keyof typeof SESSION_STATUS]?.label}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-10 h-10 rounded-full bg-primary/5 text-primary hover:bg-primary/10 transition-all"
                      onClick={handleStartEditingSession}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-8 space-y-8 overflow-y-auto flex-1">
                {isEditingSession ? (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <div className="space-y-3">
                      <Label className="text-[11px] font-black text-primary/60 uppercase ml-2 tracking-widest flex items-center gap-2">
                        <Edit className="w-4 h-4" />
                        Evolução Clínica
                      </Label>
                      <Textarea 
                        className="min-h-[180px] rounded-[24px] border-primary/20 bg-white/50 p-6 text-sm leading-relaxed focus:bg-white transition-all shadow-inner resize-none"
                        placeholder="Descreva a evolução do paciente..."
                        value={sessionEditForm.notes}
                        onChange={(e) => setSessionEditForm(p => ({ ...p, notes: e.target.value }))}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                          <Label className="text-[11px] font-black text-primary/60 uppercase tracking-widest">Humor do Paciente</Label>
                          <span className="text-lg font-black text-primary">{sessionEditForm.mood_happy_sad}</span>
                        </div>
                        <div className="bg-white/40 p-6 rounded-3xl border border-primary/20 shadow-sm space-y-4">
                          <div className="flex items-center justify-between px-2">
                            <Frown className={cn("w-6 h-6 transition-all", sessionEditForm.mood_happy_sad <= 3 ? "text-rose-500 scale-110" : "text-muted-foreground/30")} />
                            <Smile className={cn("w-6 h-6 transition-all", sessionEditForm.mood_happy_sad >= 8 ? "text-emerald-500 scale-110" : "text-muted-foreground/30")} />
                          </div>
                          <input 
                            type="range" min="1" max="10" step="1"
                            value={sessionEditForm.mood_happy_sad}
                            onChange={(e) => setSessionEditForm(p => ({ ...p, mood_happy_sad: parseInt(e.target.value) }))}
                            className="w-full h-2 bg-primary/10 rounded-full appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                          <Label className="text-[11px] font-black text-primary/60 uppercase tracking-widest">Nível de Agitação</Label>
                          <span className="text-lg font-black text-primary">{sessionEditForm.mood_anxious_calm}</span>
                        </div>
                        <div className="bg-white/40 p-6 rounded-3xl border border-primary/20 shadow-sm space-y-4">
                          <div className="flex items-center justify-between px-2">
                            <Waves className={cn("w-6 h-6 transition-all", sessionEditForm.mood_anxious_calm <= 3 ? "text-sky-500 scale-110" : "text-muted-foreground/30")} />
                            <Zap className={cn("w-6 h-6 transition-all", sessionEditForm.mood_anxious_calm >= 8 ? "text-amber-500 scale-110" : "text-muted-foreground/30")} />
                          </div>
                          <input 
                            type="range" min="1" max="10" step="1"
                            value={sessionEditForm.mood_anxious_calm}
                            onChange={(e) => setSessionEditForm(p => ({ ...p, mood_anxious_calm: parseInt(e.target.value) }))}
                            className="w-full h-2 bg-primary/10 rounded-full appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <Label className="text-[11px] font-black text-primary/60 uppercase ml-2 tracking-widest flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Evolução Clínica
                      </Label>
                      <div className="bg-white/40 p-6 rounded-3xl border border-white/60 shadow-sm italic text-sm leading-relaxed text-slate-700">
                        {(() => {
                          try {
                            const evolution = JSON.parse(viewingSession.session_notes_encrypted || "{}");
                            return evolution.notes || viewingSession.session_notes_encrypted || "Nenhuma nota registrada.";
                          } catch (e) {
                            return viewingSession.session_notes_encrypted || "Nenhuma nota registrada.";
                          }
                        })()}
                      </div>
                    </div>

                    {(() => {
                      try {
                        const evolution = JSON.parse(viewingSession.session_notes_encrypted || "{}");
                        if (!evolution.mood_happy_sad && !evolution.mood_anxious_calm) return null;
                        
                        return (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 space-y-3">
                              <div className="flex items-center justify-between text-primary">
                                <Label className="text-[9px] font-black uppercase tracking-widest">Humor</Label>
                                {evolution.mood_happy_sad >= 7 ? <Smile className="w-4 h-4" /> : <Frown className="w-4 h-4" />}
                              </div>
                              <p className="text-2xl font-black text-primary">{evolution.mood_happy_sad}/10</p>
                            </div>
                            <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100 space-y-3">
                              <div className="flex items-center justify-between text-amber-600">
                                <Label className="text-[9px] font-black uppercase tracking-widest">Agitação</Label>
                                {evolution.mood_anxious_calm >= 7 ? <Zap className="w-4 h-4" /> : <Waves className="w-4 h-4" />}
                              </div>
                              <p className="text-2xl font-black text-amber-700">{evolution.mood_anxious_calm}/10</p>
                            </div>
                          </div>
                        );
                      } catch (e) {
                        return null;
                      }
                    })()}

                    <div className="grid grid-cols-2 gap-8 bg-white/40 p-6 rounded-3xl border border-white/60">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Duração</p>
                        <p className="text-base font-black text-primary">{viewingSession.duration_minutes} min</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Tipo</p>
                        <p className="text-base font-black text-primary">{getSessionTypeLabel(viewingSession.session_type)}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              <div className="p-6 bg-white/50 border-t border-primary/10 flex justify-between items-center px-8 shrink-0">
                {isEditingSession ? (
                  <>
                    <Button 
                      variant="ghost" 
                      onClick={() => setIsEditingSession(false)}
                      className="rounded-full px-8 font-black text-muted-foreground"
                    >
                      CANCELAR
                    </Button>
                    <Button 
                      onClick={handleSaveSessionEdit}
                      disabled={isSaving}
                      className="rounded-full px-12 h-12 font-black gradient-primary text-white shadow-lg active:scale-95 transition-all"
                    >
                      {isSaving ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => handleExportSingleSession(viewingSession)}
                      disabled={isExportingPdf}
                      className="rounded-full px-6 h-10 font-bold border-primary/20 text-primary hover:bg-primary/5"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      EXPORTAR PDF
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => setShowSessionModal(false)}
                      className="rounded-full px-8 font-black text-primary"
                    >
                      FECHAR
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              {errorDialog.title}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">{errorDialog.message}</p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setErrorDialog(prev => ({ ...prev, open: false }))}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
