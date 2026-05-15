"use client";

import { useState, useOptimistic, useTransition, useRef, useEffect } from "react";

import {
  Plus, Trash2, CheckSquare, Square, BookOpen, Brain,
  Dumbbell, ListChecks, TrendingUp, AlertCircle, Clock,
  Calendar, Loader2, ChevronDown, ChevronUp, Wind, Route,
  MessageSquare, CheckCircle2, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createPatientTask, deletePatientTask, updatePatientTaskStatus } from "@/app/actions/therapist-tasks";
import type { PatientTask } from "@/types/database";
import type { TaskCategory, TaskPriority } from "@/app/actions/therapist-tasks";

// ─── Meta ─────────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<TaskCategory, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  general:           { label: "Geral",             icon: <ListChecks className="w-3.5 h-3.5" />, color: "text-violet-600", bg: "bg-violet-50" },
  homework:          { label: "Tarefa",            icon: <CheckSquare className="w-3.5 h-3.5" />, color: "text-blue-600", bg: "bg-blue-50" },
  reading:           { label: "Leitura",           icon: <BookOpen className="w-3.5 h-3.5" />, color: "text-cyan-600", bg: "bg-cyan-50" },
  exercise:          { label: "Exercício",         icon: <Dumbbell className="w-3.5 h-3.5" />, color: "text-emerald-600", bg: "bg-emerald-50" },
  reflection:        { label: "Reflexão",          icon: <Brain className="w-3.5 h-3.5" />, color: "text-pink-600", bg: "bg-pink-50" },
  behavior_tracking: { label: "Automonitoramento", icon: <TrendingUp className="w-3.5 h-3.5" />, color: "text-orange-600", bg: "bg-orange-50" },
  thought_record:    { label: "Registro",          icon: <Brain className="w-3.5 h-3.5" />, color: "text-indigo-600", bg: "bg-indigo-50" },
  breathing:         { label: "RespiraÃ§Ã£o",        icon: <Wind className="w-3.5 h-3.5" />, color: "text-sky-600", bg: "bg-sky-50" },
  exposure:          { label: "ExposiÃ§Ã£o",         icon: <Route className="w-3.5 h-3.5" />, color: "text-amber-700", bg: "bg-amber-50" },
  other:             { label: "Outro",             icon: <ListChecks className="w-3.5 h-3.5" />, color: "text-slate-600", bg: "bg-slate-100" },
};

const PRIORITY_META: Record<TaskPriority, { label: string; color: string; bg: string; dot: string }> = {
  low:    { label: "Baixa",  color: "text-slate-600",   bg: "bg-slate-100",   dot: "bg-slate-400" },
  medium: { label: "Média",  color: "text-amber-700",   bg: "bg-amber-100",   dot: "bg-amber-500" },
  high:   { label: "Alta",   color: "text-rose-700",    bg: "bg-rose-100",    dot: "bg-rose-500" },
};

function dueDays(iso: string | null): { label: string; overdue: boolean } | null {
  if (!iso) return null;
  const diff = Math.floor((new Date(iso).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
  if (diff < 0) return { label: `Atrasada ${Math.abs(diff)}d`, overdue: true };
  if (diff === 0) return { label: "Vence hoje", overdue: false };
  if (diff === 1) return { label: "Vence amanhã", overdue: false };
  return { label: `${diff} dias`, overdue: false };
}

// ─── Form Default ─────────────────────────────────────────────────────────────

const defaultForm = {
  title: "",
  description: "",
  category: "general" as TaskCategory,
  priority: "medium" as TaskPriority,
  due_date: "",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  patientId: string;
  initialTasks: PatientTask[];
}

export function PatientTasksManager({ patientId, initialTasks }: Props) {
  const [tasks, setTasks] = useState<PatientTask[]>(initialTasks);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Sync state with server side data updates from revalidatePath
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const [optimisticTasks, updateOptimistic] = useOptimistic(
    tasks,
    (current: PatientTask[], action: { type: "add"; task: PatientTask } | { type: "remove"; id: string }) => {
      if (action.type === "add") return [action.task, ...current];
      if (action.type === "remove") return current.filter(t => t.id !== action.id);
      return current;
    }
  );

  const pending  = optimisticTasks.filter(t => t.status !== "completed" && t.status !== "cancelled");
  const completed = optimisticTasks.filter(t => t.status === "completed");

  // ── Criar tarefa ──────────────────────────────────────────────────────────

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setFormError("O título é obrigatório."); return; }
    setFormError("");

    const tempTask: PatientTask = {
      id: `temp-${Date.now()}`,
      user_id: "",             // filled by server; optimistic placeholder
      patient_id: patientId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category as PatientTask["category"],
      priority: form.priority as PatientTask["priority"],
      due_date: form.due_date || null,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      responded_at: null,
      viewed_at: null,
      therapist_notes: null,
      patient_feedback: null,
    };

    startTransition(async () => {
      updateOptimistic({ type: "add", task: tempTask });
      setOpen(false);
      setForm(defaultForm);

      const result = await createPatientTask({ patient_id: patientId, ...form });

      if (result.success && result.taskId) {
        // Substituir o temp pelo ID real de forma simples e livre de duplicatas
        setTasks(prev => [
          { ...tempTask, id: result.taskId! },
          ...prev.filter(t => t.id !== tempTask.id)
        ]);
      } else {
        // Rollback
        setTasks(prev => prev.filter(t => t.id !== tempTask.id));
        setFormError(result.error ?? "Erro ao criar tarefa.");
        setOpen(true);
      }
    });
  }


  // ── Excluir tarefa ────────────────────────────────────────────────────────

  function handleDelete(taskId: string) {
    setDeletingId(taskId);
    startTransition(async () => {
      updateOptimistic({ type: "remove", id: taskId });
      const result = await deletePatientTask(taskId, patientId);
      if (result.success) {
        setTasks(prev => prev.filter(t => t.id !== taskId));
      } else {
        // Rollback: rebusca o estado anterior
        setTasks(prev => {
          const task = optimisticTasks.find(t => t.id === taskId);
          if (!task) return prev;
          return [task, ...prev.filter(t => t.id !== taskId)];
        });
      }
      setDeletingId(null);
    });
  }

  // ── Task Card ─────────────────────────────────────────────────────────────

  function handleStatus(task: PatientTask, status: "pending" | "in_progress" | "completed" | "cancelled") {
    startTransition(async () => {
      const previous = tasks;
      setTasks(prev => prev.map(t => t.id === task.id ? {
        ...t,
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      } : t));

      const result = await updatePatientTaskStatus({
        task_id: task.id,
        patient_id: patientId,
        status,
      });

      if (!result.success) {
        setTasks(previous);
      }
    });
  }

  function TaskCard({ task, showDelete = true }: { task: PatientTask; showDelete?: boolean }) {
    const cat = CATEGORY_META[task.category as TaskCategory] ?? CATEGORY_META.general;
    const pri = PRIORITY_META[task.priority as TaskPriority] ?? PRIORITY_META.medium;
    const due = dueDays(task.due_date);
    const isDeleting = deletingId === task.id;

    return (
      <div className={cn(
        "group flex items-start gap-3 p-4 rounded-2xl border transition-all duration-200",
        task.status === "completed"
          ? "bg-white/30 border-white/30 opacity-60"
          : "bg-white/60 border-white/50 hover:border-primary/20 hover:shadow-md hover:shadow-primary/5"
      )}>
        {/* Icon */}
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5", cat.bg, cat.color)}>
          {cat.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold leading-snug", task.status === "completed" && "line-through text-muted-foreground")}>
            {task.title}
          </p>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
              {task.description}
            </p>
          )}
          {task.patient_feedback && (
            <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                <MessageSquare className="w-3.5 h-3.5" />
                Resposta do paciente
              </p>
              <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-emerald-950/80">
                {task.patient_feedback}
              </p>
              {task.responded_at && (
                <p className="mt-1 text-[10px] font-medium text-emerald-700/70">
                  Respondida em {new Date(task.responded_at).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {/* Category */}
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider", cat.color)}>
              {cat.icon}{cat.label}
            </span>
            {/* Priority */}
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-full", pri.bg, pri.color)}>
              <span className={cn("w-1.5 h-1.5 rounded-full", pri.dot)} />
              {pri.label}
            </span>
            {/* Due */}
            {due && (
              <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium", due.overdue ? "text-rose-600" : "text-muted-foreground")}>
                {due.overdue ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {due.label}
              </span>
            )}
          </div>
        </div>

        {/* Delete */}
        {showDelete && (
          <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            {task.status !== "completed" && task.status !== "cancelled" && (
              <button
                onClick={() => handleStatus(task, "completed")}
                disabled={isPending}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600 transition-all disabled:opacity-50"
                title="Marcar como concluÃ­da"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
            )}
            {task.status !== "cancelled" && (
              <button
                onClick={() => handleStatus(task, "cancelled")}
                disabled={isPending}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-amber-50 hover:text-amber-700 transition-all disabled:opacity-50"
                title="Cancelar tarefa"
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => handleDelete(task.id)}
              disabled={isDeleting || isPending}
              className="w-7 h-7 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition-all disabled:opacity-50"
              title="Excluir tarefa"
            >
              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/20 p-5 rounded-[28px] border border-white/40 backdrop-blur-md">
          <div>
            <h2 className="text-xl font-bold text-primary tracking-tight flex items-center gap-2">
              <ListChecks className="w-5 h-5" />
              Tarefas do Paciente
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gerencie as atividades que aparecerão no portal do paciente.
            </p>
          </div>
          <Button
            onClick={() => setOpen(true)}
            className="gradient-primary text-white rounded-full px-6 h-10 font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nova Tarefa
          </Button>
        </div>

        {/* Pending tasks */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Square className="w-3.5 h-3.5 text-primary" />
            <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">
              Pendentes e Em andamento
            </p>
            <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {pending.length}
            </span>
          </div>

          {pending.length === 0 ? (
            <div className="text-center py-10 rounded-2xl border border-dashed border-white/40 bg-white/20">
              <ListChecks className="w-7 h-7 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Clique em "Nova Tarefa" para criar uma.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pending.map(t => <TaskCard key={t.id} task={t} />)}
            </div>
          )}
        </div>

        {/* Completed tasks */}
        {completed.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => setShowCompleted(s => !s)}
              className="flex items-center gap-2 px-1 w-full group"
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600/60">
                Concluídas
              </p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                {completed.length}
              </span>
              {showCompleted
                ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground ml-auto group-hover:text-foreground transition-colors" />
                : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto group-hover:text-foreground transition-colors" />
              }
            </button>

            {showCompleted && (
              <div className="space-y-2">
                {completed.map(t => <TaskCard key={t.id} task={t} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── New Task Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(defaultForm); setFormError(""); } }}>
        <DialogContent className="sm:max-w-lg rounded-[32px] glass-panel border-white/40 shadow-2xl shadow-violet-900/10 p-0 overflow-hidden">
          <DialogHeader className="bg-gradient-to-br from-primary/10 to-transparent px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
            <DialogTitle className="text-xl font-bold text-primary flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Nova tarefa terapeutica
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Defina uma atividade clara para o paciente acompanhar no portal.
            </p>
          </DialogHeader>

          <form ref={formRef} onSubmit={handleCreate} className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-6">
            {/* Título */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
                Título *
              </Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Ler o capítulo 3 do livro..."
                className="rounded-2xl border-white/40 bg-white/60 h-11 font-medium focus:border-primary/40"
                autoFocus
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
                Descrição (opcional)
              </Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Instruções adicionais para o paciente..."
                className="rounded-2xl border-white/40 bg-white/60 resize-none text-sm focus:border-primary/40"
                rows={2}
              />
            </div>

            {/* Categoria + Prioridade */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
                  Categoria
                </Label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as TaskCategory }))}
                  className="w-full h-11 px-3 rounded-2xl border border-white/40 bg-white/60 text-sm font-medium focus:outline-none focus:border-primary/40 transition-colors"
                >
                  {(Object.entries(CATEGORY_META) as [TaskCategory, typeof CATEGORY_META[TaskCategory]][]).map(([val, meta]) => (
                    <option key={val} value={val}>{meta.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
                  Prioridade
                </Label>
                <select
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                  className="w-full h-11 px-3 rounded-2xl border border-white/40 bg-white/60 text-sm font-medium focus:outline-none focus:border-primary/40 transition-colors"
                >
                  {(Object.entries(PRIORITY_META) as [TaskPriority, typeof PRIORITY_META[TaskPriority]][]).map(([val, meta]) => (
                    <option key={val} value={val}>{meta.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Prazo */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                Prazo (opcional)
              </Label>
              <Input
                type="date"
                value={form.due_date}
                min={new Date().toISOString().split("T")[0]}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="rounded-2xl border-white/40 bg-white/60 h-11 font-medium focus:border-primary/40"
              />
            </div>

            {/* Preview de prioridade */}
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-white/40 border border-white/30">
              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", CATEGORY_META[form.category].bg, CATEGORY_META[form.category].color)}>
                {CATEGORY_META[form.category].icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{form.title || "Título da tarefa..."}</p>
                <p className="text-[10px] text-muted-foreground">{CATEGORY_META[form.category].label}</p>
              </div>
              <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full", PRIORITY_META[form.priority].bg, PRIORITY_META[form.priority].color)}>
                {PRIORITY_META[form.priority].label}
              </span>
            </div>

            {/* Error */}
            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {formError}
              </div>
            )}

            <DialogFooter className="gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                className="rounded-full px-6 font-bold text-muted-foreground"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending || !form.title.trim()}
                className="gradient-primary text-white rounded-full px-8 font-black shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-60 disabled:transform-none flex items-center gap-2"
              >
                {isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>
                ) : (
                  <><Plus className="w-4 h-4" /> Criar tarefa</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
