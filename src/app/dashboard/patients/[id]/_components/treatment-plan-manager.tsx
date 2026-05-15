"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Edit,
  Flag,
  Pause,
  Plus,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/constants";
import { TreatmentPlanService } from "@/services/treatment-plan-service";
import type {
  PatientTreatmentGoal,
  PatientTreatmentGoalStatus,
  PatientTreatmentPlan,
  PatientTreatmentPlanStatus,
} from "@/types/database";

type PlanFormState = {
  mainGoal: string;
  currentFocus: string;
  strategies: string;
  reviewDate: string;
  status: PatientTreatmentPlanStatus;
};

type GoalFormState = {
  id?: string;
  title: string;
  description: string;
  targetDate: string;
  status: PatientTreatmentGoalStatus;
};

const emptyPlanForm: PlanFormState = {
  mainGoal: "",
  currentFocus: "",
  strategies: "",
  reviewDate: "",
  status: "active",
};

const emptyGoalForm: GoalFormState = {
  title: "",
  description: "",
  targetDate: "",
  status: "active",
};

const modalLabelClassName = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const modalInputClassName = "h-11 rounded-2xl border-border/70 bg-white shadow-sm focus-visible:ring-primary/15";
const modalTextareaClassName = "resize-none rounded-2xl border-border/70 bg-white shadow-sm focus-visible:ring-primary/15";

const planStatusMeta: Record<PatientTreatmentPlanStatus, { label: string; className: string }> = {
  active: { label: "Ativo", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  paused: { label: "Pausado", className: "border-amber-200 bg-amber-50 text-amber-700" },
  completed: { label: "Concluído", className: "border-sky-200 bg-sky-50 text-sky-700" },
  archived: { label: "Arquivado", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

const goalStatusMeta: Record<PatientTreatmentGoalStatus, { label: string; className: string; icon: typeof Flag }> = {
  active: { label: "Ativo", className: "border-violet-200 bg-violet-50 text-violet-700", icon: Flag },
  in_progress: { label: "Em andamento", className: "border-sky-200 bg-sky-50 text-sky-700", icon: Target },
  completed: { label: "Concluído", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  paused: { label: "Pausado", className: "border-amber-200 bg-amber-50 text-amber-700", icon: Pause },
};

function StatusBadge({
  status,
  type,
}: {
  status: PatientTreatmentPlanStatus | PatientTreatmentGoalStatus;
  type: "plan" | "goal";
}) {
  const meta = type === "plan"
    ? planStatusMeta[status as PatientTreatmentPlanStatus]
    : goalStatusMeta[status as PatientTreatmentGoalStatus];

  return (
    <Badge variant="outline" className={cn("h-6 rounded-full px-2.5 text-[10px] font-semibold", meta.className)}>
      {meta.label}
    </Badge>
  );
}

export function TreatmentPlanOverviewCard({
  treatmentPlan,
  onOpenPlan,
}: {
  treatmentPlan: PatientTreatmentPlan | null;
  onOpenPlan: () => void;
}) {
  const goals = treatmentPlan?.goals || [];
  const completedGoals = goals.filter((goal) => goal.status === "completed").length;
  const visibleGoals = goals.slice(0, 3);

  return (
    <Card className="rounded-3xl border border-border/70 bg-white/85 shadow-[0_12px_32px_rgba(41,31,67,0.05)]">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
            <Target className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold text-foreground">Plano terapêutico</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Mapa atual do tratamento e objetivos.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 shrink-0 rounded-2xl bg-white text-xs" onClick={onOpenPlan}>
          {treatmentPlan ? "Abrir plano" : "Criar plano"}
        </Button>
      </CardHeader>
      <CardContent className="p-5">
        {treatmentPlan ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={treatmentPlan.status as PatientTreatmentPlanStatus} type="plan" />
              <span className="text-xs font-medium text-muted-foreground">
                {goals.length > 0
                  ? `${completedGoals} de ${goals.length} objetivos concluídos`
                  : "Sem objetivos adicionados"}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-white/75 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Objetivo principal</p>
                <p className="mt-1 line-clamp-3 text-sm font-semibold leading-relaxed text-foreground">
                  {treatmentPlan.main_goal}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-white/75 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Foco atual</p>
                <p className="mt-1 line-clamp-3 text-sm font-semibold leading-relaxed text-foreground">
                  {treatmentPlan.current_focus}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <CalendarClock className="size-4" />
              <span>
                Revisão: {treatmentPlan.review_date ? formatDate(treatmentPlan.review_date) : "sem data definida"}
              </span>
            </div>

            {visibleGoals.length > 0 && (
              <div className="space-y-2">
                {visibleGoals.map((goal) => (
                  <div key={goal.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50/80 px-3 py-2">
                    <span className="line-clamp-1 text-xs font-semibold text-foreground">{goal.title}</span>
                    <StatusBadge status={goal.status as PatientTreatmentGoalStatus} type="goal" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/80 bg-white/65 p-5 text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <Target className="size-5" />
            </div>
            <p className="text-sm font-semibold text-foreground">Nenhum plano terapêutico definido ainda.</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Crie um mapa simples com objetivo, foco atual e metas do tratamento.
            </p>
            <Button size="sm" className="mt-4 h-8 rounded-2xl" onClick={onOpenPlan}>
              Criar plano
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TreatmentPlanManager({
  patientId,
  treatmentPlan,
  onChanged,
  isSecretary,
}: {
  patientId: string;
  treatmentPlan: PatientTreatmentPlan | null;
  onChanged: (plan: PatientTreatmentPlan | null) => void;
  isSecretary?: boolean;
}) {
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlanForm);
  const [goalForm, setGoalForm] = useState<GoalFormState>(emptyGoalForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const goals = treatmentPlan?.goals || [];
  const completedGoals = goals.filter((goal) => goal.status === "completed").length;
  const progress = goals.length > 0 ? Math.round((completedGoals / goals.length) * 100) : 0;
  const canEdit = !isSecretary;

  const orderedGoals = useMemo(() => {
    const order: Record<string, number> = { in_progress: 0, active: 1, paused: 2, completed: 3 };
    return [...goals].sort((a, b) => {
      const statusDiff = (order[a.status] ?? 4) - (order[b.status] ?? 4);
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [goals]);

  function openPlanDialog() {
    setError("");
    setPlanForm(
      treatmentPlan
        ? {
            mainGoal: treatmentPlan.main_goal || "",
            currentFocus: treatmentPlan.current_focus || "",
            strategies: treatmentPlan.strategies || "",
            reviewDate: treatmentPlan.review_date || "",
            status: (treatmentPlan.status as PatientTreatmentPlanStatus) || "active",
          }
        : emptyPlanForm
    );
    setPlanDialogOpen(true);
  }

  function openGoalDialog(goal?: PatientTreatmentGoal) {
    setError("");
    setGoalForm(
      goal
        ? {
            id: goal.id,
            title: goal.title || "",
            description: goal.description || "",
            targetDate: goal.target_date || "",
            status: (goal.status as PatientTreatmentGoalStatus) || "active",
          }
        : emptyGoalForm
    );
    setGoalDialogOpen(true);
  }

  async function handleSavePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planForm.mainGoal.trim() || !planForm.currentFocus.trim()) {
      setError("Objetivo principal e foco atual são obrigatórios.");
      return;
    }

    setSaving(true);
    const { data, error: serviceError } = await TreatmentPlanService.upsertPlan({
      patientId,
      mainGoal: planForm.mainGoal.trim(),
      currentFocus: planForm.currentFocus.trim(),
      strategies: planForm.strategies.trim() || null,
      reviewDate: planForm.reviewDate || null,
      status: planForm.status,
    });
    setSaving(false);

    if (serviceError || !data) {
      setError(serviceError || "Não foi possível salvar o plano.");
      return;
    }

    onChanged(data);
    setPlanDialogOpen(false);
  }

  async function handleSaveGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goalForm.title.trim()) {
      setError("Título do objetivo é obrigatório.");
      return;
    }

    setSaving(true);
    const request = goalForm.id
      ? TreatmentPlanService.updateGoal({
          goalId: goalForm.id,
          title: goalForm.title.trim(),
          description: goalForm.description.trim() || null,
          targetDate: goalForm.targetDate || null,
          status: goalForm.status,
        })
      : TreatmentPlanService.createGoal({
          patientId,
          title: goalForm.title.trim(),
          description: goalForm.description.trim() || null,
          targetDate: goalForm.targetDate || null,
          status: goalForm.status,
        });

    const { data, error: serviceError } = await request;
    setSaving(false);

    if (serviceError || !data) {
      setError(serviceError || "Não foi possível salvar o objetivo.");
      return;
    }

    onChanged(data);
    setGoalDialogOpen(false);
  }

  async function handleGoalStatus(goal: PatientTreatmentGoal, status: PatientTreatmentGoalStatus) {
    setSaving(true);
    const { data, error: serviceError } = await TreatmentPlanService.updateGoal({
      goalId: goal.id,
      title: goal.title,
      description: goal.description,
      targetDate: goal.target_date,
      status,
    });
    setSaving(false);

    if (serviceError || !data) {
      setError(serviceError || "Não foi possível atualizar o objetivo.");
      return;
    }

    onChanged(data);
  }

  return (
    <>
      <Card className="overflow-hidden rounded-[32px] border border-border/70 bg-white/90 shadow-[0_18px_50px_rgba(41,31,67,0.08)]">
        <CardHeader className="border-b border-border/60 bg-slate-50/70 px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                <Target className="size-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">Plano terapêutico</CardTitle>
                <p className="text-xs text-muted-foreground">Objetivos, foco atual e estratégias do tratamento.</p>
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Button variant="outline" className="h-9 rounded-2xl bg-white" onClick={openPlanDialog}>
                  <Edit className="mr-2 size-4" />
                  {treatmentPlan ? "Editar plano" : "Criar plano"}
                </Button>
                <Button
                  className="h-9 rounded-2xl"
                  disabled={!treatmentPlan}
                  onClick={() => openGoalDialog()}
                >
                  <Plus className="mr-2 size-4" />
                  Objetivo
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {error && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {error}
            </div>
          )}

          {treatmentPlan ? (
            <div className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-border/70 bg-white/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Objetivo principal
                      </p>
                      <StatusBadge status={treatmentPlan.status as PatientTreatmentPlanStatus} type="plan" />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {treatmentPlan.main_goal}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Foco atual</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {treatmentPlan.current_focus}
                    </p>
                  </div>

                  {treatmentPlan.strategies && (
                    <div className="rounded-2xl border border-border/70 bg-white/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Estratégias e intervenções
                      </p>
                      <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {treatmentPlan.strategies}
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border/70 bg-slate-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Acompanhamento</p>
                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                        <span>Progresso dos objetivos</span>
                        <span>{goals.length ? `${completedGoals}/${goals.length}` : "0/0"}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-foreground">
                      <CalendarClock className="mt-0.5 size-4 text-muted-foreground" />
                      <div>
                        <p className="font-semibold">Próxima revisão</p>
                        <p className="text-xs text-muted-foreground">
                          {treatmentPlan.review_date ? formatDate(treatmentPlan.review_date) : "Sem data definida"}
                        </p>
                      </div>
                    </div>
                    {!canEdit && (
                      <p className="rounded-2xl bg-white/80 p-3 text-xs leading-relaxed text-muted-foreground">
                        Edição restrita ao terapeuta responsável ou equipe clínica autorizada.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Objetivos terapêuticos</h3>
                  <span className="text-xs text-muted-foreground">{goals.length} objetivo(s)</span>
                </div>

                {orderedGoals.length > 0 ? (
                  <div className="grid gap-3">
                    {orderedGoals.map((goal) => {
                      const meta = goalStatusMeta[goal.status as PatientTreatmentGoalStatus] || goalStatusMeta.active;
                      const Icon = meta.icon;
                      return (
                        <div key={goal.id} className="rounded-2xl border border-border/70 bg-white/80 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="flex min-w-0 gap-3">
                              <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-2xl", meta.className)}>
                                <Icon className="size-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-foreground">{goal.title}</p>
                                  <StatusBadge status={goal.status as PatientTreatmentGoalStatus} type="goal" />
                                </div>
                                {goal.description && (
                                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                                    {goal.description}
                                  </p>
                                )}
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Prazo: {goal.target_date ? formatDate(goal.target_date) : "sem prazo"}
                                </p>
                              </div>
                            </div>

                            {canEdit && (
                              <div className="flex flex-wrap gap-2 md:justify-end">
                                {goal.status !== "completed" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-2xl bg-white text-xs"
                                    disabled={saving}
                                    onClick={() => handleGoalStatus(goal, "completed")}
                                  >
                                    Concluir
                                  </Button>
                                )}
                                {goal.status !== "paused" && goal.status !== "completed" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-2xl bg-white text-xs"
                                    disabled={saving}
                                    onClick={() => handleGoalStatus(goal, "paused")}
                                  >
                                    Pausar
                                  </Button>
                                )}
                                {goal.status !== "active" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-2xl bg-white text-xs"
                                    disabled={saving}
                                    onClick={() => handleGoalStatus(goal, "active")}
                                  >
                                    Reativar
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 rounded-2xl px-2 text-xs text-primary"
                                  onClick={() => openGoalDialog(goal)}
                                >
                                  <Edit className="size-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-white/65 p-6 text-center">
                    <Flag className="mx-auto mb-3 size-8 text-muted-foreground/50" />
                    <p className="text-sm font-semibold text-foreground">Nenhum objetivo terapêutico registrado.</p>
                    <p className="mt-1 text-sm text-muted-foreground">Adicione metas simples para acompanhar o plano.</p>
                    {canEdit && (
                      <Button size="sm" className="mt-4 h-8 rounded-2xl" onClick={() => openGoalDialog()}>
                        Adicionar objetivo
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border/80 bg-white/65 p-8 text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                <Target className="size-6" />
              </div>
              <p className="text-base font-semibold text-foreground">Nenhum plano terapêutico definido ainda.</p>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                Registre objetivo principal, foco atual, estratégias e metas para transformar esta aba em um mapa clínico do tratamento.
              </p>
              {canEdit && (
                <Button className="mt-5 rounded-2xl" onClick={openPlanDialog}>
                  <Plus className="mr-2 size-4" />
                  Criar plano
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl border border-border/70 bg-white p-0 shadow-2xl sm:max-w-2xl">
          <DialogHeader className="border-b border-border/60 bg-[linear-gradient(135deg,rgba(124,58,237,0.09),rgba(20,184,166,0.06))] px-6 py-5">
            <DialogTitle>{treatmentPlan ? "Editar plano terapêutico" : "Criar plano terapêutico"}</DialogTitle>
            <DialogDescription>
              Use campos objetivos. O conteúdo é salvo pelo fluxo clínico seguro do sistema.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4 p-6" onSubmit={handleSavePlan}>
            <div className="space-y-2">
              <Label className={modalLabelClassName}>Objetivo principal *</Label>
              <Textarea
                required
                className={cn("min-h-24", modalTextareaClassName)}
                value={planForm.mainGoal}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, mainGoal: event.target.value }))}
                placeholder="Ex: desenvolver repertório de regulação emocional..."
              />
            </div>
            <div className="space-y-2">
              <Label className={modalLabelClassName}>Foco atual *</Label>
              <Textarea
                required
                className={cn("min-h-20", modalTextareaClassName)}
                value={planForm.currentFocus}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, currentFocus: event.target.value }))}
                placeholder="Ex: manejo de ansiedade em situações sociais..."
              />
            </div>
            <div className="space-y-2">
              <Label className={modalLabelClassName}>Estrategias/intervencoes</Label>
              <Textarea
                className={cn("min-h-24", modalTextareaClassName)}
                value={planForm.strategies}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, strategies: event.target.value }))}
                placeholder="Técnicas, combinados clínicos ou intervenções em uso."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className={modalLabelClassName}>Data de revisao</Label>
                <Input
                  type="date"
                  className={modalInputClassName}
                  value={planForm.reviewDate}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, reviewDate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className={modalLabelClassName}>Status</Label>
                <Select
                  value={planForm.status}
                  onValueChange={(value) => setPlanForm((prev) => ({ ...prev, status: value as PatientTreatmentPlanStatus }))}
                >
                  <SelectTrigger className={modalInputClassName}>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(planStatusMeta).map(([value, meta]) => (
                      <SelectItem key={value} value={value}>
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" className="rounded-2xl px-5 text-muted-foreground" onClick={() => setPlanDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-2xl px-6 shadow-primary/20" disabled={saving}>
                {saving ? "Salvando..." : "Salvar plano"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl border border-border/70 bg-white p-0 shadow-2xl sm:max-w-xl">
          <DialogHeader className="border-b border-border/60 bg-[linear-gradient(135deg,rgba(124,58,237,0.09),rgba(20,184,166,0.06))] px-6 py-5">
            <DialogTitle>{goalForm.id ? "Editar objetivo" : "Novo objetivo terapêutico"}</DialogTitle>
            <DialogDescription>
              Registre uma meta simples e acompanhável dentro do plano.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4 p-6" onSubmit={handleSaveGoal}>
            <div className="space-y-2">
              <Label className={modalLabelClassName}>Titulo *</Label>
              <Input
                required
                className={modalInputClassName}
                value={goalForm.title}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Ex: praticar estratégia de respiração antes de provas"
              />
            </div>
            <div className="space-y-2">
              <Label className={modalLabelClassName}>Descricao</Label>
              <Textarea
                className={cn("min-h-24", modalTextareaClassName)}
                value={goalForm.description}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Detalhe breve da meta, se necessário."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className={modalLabelClassName}>Prazo</Label>
                <Input
                  type="date"
                  className={modalInputClassName}
                  value={goalForm.targetDate}
                  onChange={(event) => setGoalForm((prev) => ({ ...prev, targetDate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className={modalLabelClassName}>Status</Label>
                <Select
                  value={goalForm.status}
                  onValueChange={(value) => setGoalForm((prev) => ({ ...prev, status: value as PatientTreatmentGoalStatus }))}
                >
                  <SelectTrigger className={modalInputClassName}>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(goalStatusMeta).map(([value, meta]) => (
                      <SelectItem key={value} value={value}>
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" className="rounded-2xl px-5 text-muted-foreground" onClick={() => setGoalDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-2xl px-6 shadow-primary/20" disabled={saving}>
                {saving ? "Salvando..." : "Salvar objetivo"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
