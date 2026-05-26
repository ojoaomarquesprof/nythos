"use client";

import { useOptimistic, useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  AlertCircle,
  Battery,
  BookHeart,
  BookOpen,
  Brain,
  Calendar,
  CheckSquare,
  Clock,
  Dumbbell,
  Frown,
  Heart,
  ListChecks,
  Loader2,
  LogOut,
  Meh,
  MessageSquare,
  Moon,
  Plus,
  ShieldCheck,
  Smile,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { respondToTask, saveDiaryEntry, saveMoodCheckin, toggleTaskStatus } from "@/app/actions/patient-engagement";
import { logoutPatient } from "@/app/actions/patient-auth";
import type { EmotionDiary, Patient, PatientMoodCheckin, PatientTask } from "@/types/database";

export type PatientPortalTask = Pick<
  PatientTask,
  "id" | "patient_id" | "title" | "description" | "category" | "due_date" | "status" | "completed_at" | "responded_at" | "patient_feedback" | "created_at" | "updated_at"
>;

export type PatientPortalDiary = Pick<
  EmotionDiary,
  "id" | "patient_id" | "emotion" | "intensity" | "notes" | "context" | "created_at"
>;

export type PatientPortalMoodCheckin = Pick<
  PatientMoodCheckin,
  "id" | "patient_id" | "mood_score" | "anxiety_score" | "sleep_quality" | "energy_score" | "notes" | "created_at"
>;

const CATEGORY_META: Record<string, { label: string; icon: ReactNode; color: string }> = {
  general: { label: "Geral", icon: <ListChecks className="w-4 h-4" />, color: "text-violet-500" },
  homework: { label: "Tarefa", icon: <CheckSquare className="w-4 h-4" />, color: "text-blue-500" },
  reading: { label: "Leitura", icon: <BookOpen className="w-4 h-4" />, color: "text-cyan-500" },
  exercise: { label: "Exercício", icon: <Dumbbell className="w-4 h-4" />, color: "text-emerald-500" },
  reflection: { label: "Reflexão", icon: <Brain className="w-4 h-4" />, color: "text-pink-500" },
  behavior_tracking: { label: "Automonitoramento", icon: <TrendingUp className="w-4 h-4" />, color: "text-orange-500" },
};

const CONTEXTS = [
  { value: "morning", label: "Manhã" },
  { value: "afternoon", label: "Tarde" },
  { value: "evening", label: "Noite" },
  { value: "night", label: "Madrugada" },
  { value: "work", label: "Trabalho" },
  { value: "home", label: "Casa" },
  { value: "social", label: "Social" },
  { value: "other", label: "Outro" },
];

const MOOD_FIELDS = [
  { key: "mood_score", label: "Humor", icon: Smile, low: "Difícil", high: "Bem" },
  { key: "anxiety_score", label: "Ansiedade", icon: Brain, low: "Baixa", high: "Alta" },
  { key: "sleep_quality", label: "Sono", icon: Moon, low: "Ruim", high: "Bom" },
  { key: "energy_score", label: "Energia", icon: Battery, low: "Baixa", high: "Alta" },
] as const;

const DISPLAY_REPLACEMENTS: Array<[string, string]> = [
  ["NÃƒÂ£o", "Não"],
  ["nÃƒÂ£o", "não"],
  ["NÃ£o", "Não"],
  ["nÃ£o", "não"],
  ["possÃƒÂ­vel", "possível"],
  ["possÃ­vel", "possível"],
  ["invÃƒÂ¡lido", "inválido"],
  ["invÃ¡lido", "inválido"],
  ["diÃƒÂ¡rio", "diário"],
  ["diÃ¡rio", "diário"],
  ["Sessao invalida", "Sessão inválida"],
  ["emocao", "emoção"],
  ["resposta", "resposta"],
];

function intensityMeta(value: number) {
  if (value <= 3) return { icon: <Smile className="w-5 h-5" />, label: "Leve", color: "text-emerald-500" };
  if (value <= 6) return { icon: <Meh className="w-5 h-5" />, label: "Moderada", color: "text-amber-500" };
  return { icon: <Frown className="w-5 h-5" />, label: "Intensa", color: "text-rose-500" };
}

function relDate(iso: string | null | undefined) {
  if (!iso) return "Hoje";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 7) return `Há ${days} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function dueDateLabel(iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days < 0) return { text: "Atrasada", overdue: true };
  if (days === 0) return { text: "Vence hoje", overdue: false };
  if (days === 1) return { text: "Vence amanhã", overdue: false };
  return { text: `Vence em ${days} dias`, overdue: false };
}

function normalizeDisplayMessage(message: string) {
  return DISPLAY_REPLACEMENTS.reduce((text, [from, to]) => text.replaceAll(from, to), message);
}

function safePatientActionError(message: string | null | undefined, fallback: string) {
  if (!message) return fallback;
  const lower = message.toLowerCase();
  if (
    lower.includes("payload")
    || lower.includes("uuid")
    || lower.includes("cookie")
    || lower.includes("invalid")
    || lower.includes("service_role")
  ) {
    return fallback;
  }
  return normalizeDisplayMessage(message);
}

function scoreText(value: number | null | undefined) {
  return value ? `${value}/5` : "Sem registro";
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-semibold leading-relaxed text-rose-700">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      {message}
    </p>
  );
}

function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="glass-panel rounded-3xl p-7 text-center shadow-lg sm:p-8">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-white/70 text-[oklch(0.55_0.2_280)] shadow-sm">
        {icon}
      </div>
      <p className="font-semibold text-[oklch(0.35_0.03_280)]">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-[oklch(0.55_0.02_280)]">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl gradient-primary px-5 text-sm font-black text-white shadow-lg shadow-violet-500/20 transition-all hover:-translate-y-0.5"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function DiaryForm({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: (entry: PatientPortalDiary) => void;
}) {
  const [form, setForm] = useState({ emotion: "", intensity: 5, context: "", notes: "" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!form.emotion.trim()) {
      setError("Conte em uma palavra como você está se sentindo.");
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await saveDiaryEntry({
        emotion: form.emotion,
        intensity: form.intensity,
        context: form.context || undefined,
        notes: form.notes || undefined,
      });

      if (result.success) {
        onSaved({
          id: result.id ?? crypto.randomUUID(),
          patient_id: patientId,
          emotion: form.emotion,
          intensity: form.intensity,
          notes: form.notes || null,
          context: form.context || null,
          created_at: new Date().toISOString(),
        });
        onClose();
        return;
      }

      setError(safePatientActionError(result.error, "Não foi possível salvar agora. Tente novamente em instantes."));
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => event.target === event.currentTarget && !pending && onClose()}
    >
      <div className="glass-panel max-h-[85dvh] w-full max-w-md space-y-5 overflow-y-auto rounded-[28px] p-4 shadow-2xl shadow-violet-900/20 sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black text-[oklch(0.22_0.02_280)]">
              <BookHeart className="w-5 h-5 text-[oklch(0.55_0.18_340)]" />
              Registrar emoção
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[oklch(0.5_0.02_280)]">
              Um registro breve já ajuda seu terapeuta a acompanhar seu processo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Fechar diário emocional"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-[oklch(0.5_0.02_280)]">
              Como você está se sentindo agora?
            </label>
            <input
              value={form.emotion}
              onChange={(event) => setForm((current) => ({ ...current, emotion: event.target.value }))}
              placeholder="Ex.: ansiosa, tranquila, irritada..."
              disabled={pending}
              className="w-full min-h-12 rounded-2xl border border-[oklch(0.92_0.01_290)] bg-white/70 px-4 py-3 text-sm font-semibold text-[oklch(0.22_0.02_280)] transition-all focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.2_280)]/20 disabled:opacity-70"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-[oklch(0.5_0.02_280)]">
              Intensidade: {form.intensity}/10
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={form.intensity}
              onChange={(event) => setForm((current) => ({ ...current, intensity: Number(event.target.value) }))}
              disabled={pending}
              className="w-full accent-violet-600"
            />
            <div className="mt-1 flex justify-between text-[10px] font-medium text-[oklch(0.6_0.02_280)]">
              <span>1 - Leve</span>
              <span>10 - Muito intenso</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-[oklch(0.5_0.02_280)]">
              Onde ou quando isso apareceu?
            </label>
            <div className="flex flex-wrap gap-2">
              {CONTEXTS.map((context) => (
                <button
                  key={context.value}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, context: current.context === context.value ? "" : context.value }))}
                  disabled={pending}
                  className={`min-h-9 rounded-full px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-60 ${form.context === context.value ? "bg-violet-600 text-white" : "border border-[oklch(0.92_0.01_290)] bg-white/60 text-[oklch(0.5_0.02_280)] hover:border-violet-300"}`}
                >
                  {context.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-[oklch(0.5_0.02_280)]">
              Observações (opcional)
            </label>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              rows={3}
              placeholder="O que aconteceu? O que ajudou ou dificultou?"
              disabled={pending}
              className="w-full resize-none rounded-2xl border border-[oklch(0.92_0.01_290)] bg-white/70 px-4 py-3 text-sm text-[oklch(0.22_0.02_280)] transition-all focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.2_280)]/20 disabled:opacity-70"
            />
          </div>

          {error && <InlineError message={error} />}

          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="h-11 flex-1 rounded-xl border border-[oklch(0.92_0.01_290)] text-sm font-bold text-[oklch(0.5_0.02_280)] transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="flex h-11 flex-[1.5] items-center justify-center gap-2 rounded-xl gradient-primary text-sm font-black text-white shadow-lg shadow-violet-500/25 transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar diário"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface Props {
  patient: Pick<Patient, "id" | "full_name">;
  initialTasks: PatientPortalTask[];
  initialDiary: PatientPortalDiary[];
  initialMoodCheckins: PatientPortalMoodCheckin[];
}

export function InteractivePatientDashboard({ patient, initialTasks, initialDiary, initialMoodCheckins }: Props) {
  const [tasks, setTasks] = useState<PatientPortalTask[]>(initialTasks);
  const [diary, setDiary] = useState<PatientPortalDiary[]>(initialDiary);
  const [moodCheckins, setMoodCheckins] = useState<PatientPortalMoodCheckin[]>(initialMoodCheckins);
  const [showDiaryForm, setShowDiaryForm] = useState(false);
  const [showMoodCheckinForm, setShowMoodCheckinForm] = useState(false);
  const [respondingTask, setRespondingTask] = useState<PatientPortalTask | null>(null);
  const [moodForm, setMoodForm] = useState({ mood_score: 3, anxiety_score: 3, sleep_quality: 3, energy_score: 3, notes: "" });
  const [taskResponse, setTaskResponse] = useState("");
  const [formError, setFormError] = useState("");
  const [taskError, setTaskError] = useState("");
  const [togglingPending, startTransition] = useTransition();
  const [moodPending, startMoodTransition] = useTransition();
  const [responsePending, startResponseTransition] = useTransition();
  const [logoutPending, setLogoutPending] = useState(false);

  const [optimisticTasks, updateOptimistic] = useOptimistic(
    tasks,
    (current, { id, status }: { id: string; status: PatientTask["status"] }) =>
      current.map((task) =>
        task.id === id
          ? { ...task, status, completed_at: status === "completed" ? new Date().toISOString() : null }
          : task
      )
  );

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);
    await logoutPatient();
  }

  function handleToggle(task: PatientPortalTask) {
    if (togglingPending) return;
    const newStatus: PatientTask["status"] = task.status === "completed" ? "pending" : "completed";

    setTaskError("");
    startTransition(async () => {
      updateOptimistic({ id: task.id, status: newStatus });
      const result = await toggleTaskStatus(task.id, task.status);

      if (result.success) {
        setTasks((current) =>
          current.map((item) =>
            item.id === task.id
              ? { ...item, status: newStatus, completed_at: newStatus === "completed" ? new Date().toISOString() : null }
              : item
          )
        );
        return;
      }

      setTaskError(safePatientActionError(result.error, "Não foi possível atualizar a tarefa agora."));
    });
  }

  function handleResponseSaved(taskId: string, response: string) {
    const now = new Date().toISOString();
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              patient_feedback: response,
              responded_at: now,
              status: "completed" as PatientTask["status"],
              completed_at: now,
              updated_at: now,
            }
          : task
      )
    );
  }

  function openMoodCheckin() {
    setFormError("");
    setShowMoodCheckinForm(true);
  }

  function closeMoodCheckin() {
    if (moodPending) return;
    setFormError("");
    setShowMoodCheckinForm(false);
  }

  function openTaskResponse(task: PatientPortalTask) {
    setRespondingTask(task);
    setTaskResponse(task.patient_feedback ?? "");
    setFormError("");
  }

  function closeTaskResponse() {
    if (responsePending) return;
    setRespondingTask(null);
    setTaskResponse("");
    setFormError("");
  }

  function handleMoodSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (moodPending) return;

    setFormError("");
    startMoodTransition(async () => {
      const result = await saveMoodCheckin({
        mood_score: moodForm.mood_score,
        anxiety_score: moodForm.anxiety_score,
        sleep_quality: moodForm.sleep_quality,
        energy_score: moodForm.energy_score,
        notes: moodForm.notes.trim() || undefined,
      });

      if (result.success && result.checkin) {
        const checkin: PatientPortalMoodCheckin = {
          id: result.checkin.id,
          patient_id: patient.id,
          mood_score: result.checkin.mood_score,
          anxiety_score: result.checkin.anxiety_score,
          sleep_quality: result.checkin.sleep_quality,
          energy_score: result.checkin.energy_score,
          notes: result.checkin.notes,
          created_at: result.checkin.created_at,
        };

        setMoodCheckins((current) => [checkin, ...current]);
        setMoodForm({ mood_score: 3, anxiety_score: 3, sleep_quality: 3, energy_score: 3, notes: "" });
        setShowMoodCheckinForm(false);
        return;
      }

      setFormError(safePatientActionError(result.error, "Não foi possível salvar o check-in agora."));
    });
  }

  function handleTaskResponseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!respondingTask || responsePending) return;

    const response = taskResponse.trim();
    if (!response) {
      setFormError("Escreva uma resposta breve antes de enviar.");
      return;
    }

    setFormError("");
    startResponseTransition(async () => {
      const result = await respondToTask({ task_id: respondingTask.id, response });

      if (result.success) {
        handleResponseSaved(respondingTask.id, response);
        setRespondingTask(null);
        setTaskResponse("");
        return;
      }

      setFormError(safePatientActionError(result.error, "Não foi possível enviar sua resposta agora."));
    });
  }

  const firstName = patient.full_name.trim().split(" ")[0] || "olá";
  const pendingTasks = optimisticTasks.filter((task) => task.status !== "completed");
  const completedTasks = optimisticTasks.filter((task) => task.status === "completed");
  const hasTasks = optimisticTasks.length > 0;
  const allTasksDone = hasTasks && pendingTasks.length === 0;
  const progressRate = optimisticTasks.length > 0 ? Math.round((completedTasks.length / optimisticTasks.length) * 100) : 0;

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-[oklch(0.97_0.02_290)] via-[oklch(0.96_0.03_310)] to-[oklch(0.95_0.04_160)]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-[oklch(0.78_0.1_160)]/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-[oklch(0.72_0.18_280)]/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl space-y-6 px-4 py-6 pb-24 sm:py-8">
        <header className="flex items-start justify-between gap-4 sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary shadow-lg shadow-violet-500/30">
                <Heart className="h-6 w-6 fill-white/30 text-white" />
              </div>
              <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[oklch(0.78_0.1_160)]">
                <Sparkles className="h-2.5 w-2.5 text-white" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-[oklch(0.55_0.04_280)]">Área do Paciente - Nythos</p>
              <h1 className="text-xl font-bold text-[oklch(0.22_0.02_280)]">Olá, {firstName}</h1>
              <p className="mt-1 max-w-xs text-sm leading-relaxed text-[oklch(0.5_0.02_280)]">
                Seu espaço para acompanhar tarefas, emoções e check-ins com calma.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={logoutPending}
            title="Sair com segurança"
            aria-label="Sair da área do paciente"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[oklch(0.92_0.01_290)] bg-white/60 text-[oklch(0.5_0.02_280)] transition-all hover:bg-white/90 disabled:opacity-50"
          >
            {logoutPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          </button>
        </header>

        <div className="glass-panel rounded-3xl p-6 shadow-xl shadow-violet-900/5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[oklch(0.55_0.04_280)]">Seu caminho</p>
              <p className="mt-0.5 text-2xl font-bold text-[oklch(0.22_0.02_280)]">{progressRate}%</p>
              <p className="mt-0.5 text-xs text-[oklch(0.55_0.02_280)]">
                {hasTasks
                  ? allTasksDone
                    ? "Tudo em dia por aqui."
                    : `${completedTasks.length} de ${optimisticTasks.length} tarefas concluídas`
                  : "Sem tarefas ativas por enquanto."}
              </p>
            </div>
            <div className="relative h-20 w-20">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="oklch(0.92 0.02 280)" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="oklch(0.55 0.2 280)"
                  strokeLinecap="round"
                  strokeDasharray={`${(progressRate / 100) * 88} 88`}
                  strokeWidth="3"
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <CheckSquare className="h-6 w-6 text-[oklch(0.55_0.2_280)]" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-[oklch(0.92_0.01_290)]/60 pt-3">
            {[
              { label: "Pendentes", value: pendingTasks.filter((task) => task.status === "pending").length, color: "text-[oklch(0.55_0.18_60)]" },
              { label: "Em andamento", value: pendingTasks.filter((task) => task.status === "in_progress").length, color: "text-[oklch(0.55_0.2_280)]" },
              { label: "Concluídas", value: completedTasks.length, color: "text-[oklch(0.55_0.18_160)]" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="mt-0.5 text-[10px] font-medium leading-tight text-[oklch(0.6_0.02_280)]">{stat.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-2xl bg-white/55 px-3 py-2 text-xs leading-relaxed text-[oklch(0.48_0.03_280)]">
            Suas respostas ajudam seu terapeuta a acompanhar como o processo está chegando no seu dia a dia.
          </p>
        </div>

        <section>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3 px-1">
            <div>
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-[oklch(0.55_0.2_280)]" />
                <h2 className="text-base font-bold text-[oklch(0.22_0.02_280)]">Minhas tarefas</h2>
                {pendingTasks.length > 0 && (
                  <span className="rounded-full bg-[oklch(0.55_0.2_280)]/10 px-2 py-0.5 text-[10px] font-bold text-[oklch(0.45_0.2_280)]">
                    {pendingTasks.length} pendente{pendingTasks.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[oklch(0.52_0.02_280)]">
                Pequenos passos combinados com seu terapeuta.
              </p>
            </div>
          </div>

          {taskError && <div className="mb-3"><InlineError message={taskError} /></div>}

          {!hasTasks ? (
            <EmptyState
              icon={<CheckSquare className="h-6 w-6" />}
              title="Nenhuma tarefa por enquanto"
              description="Quando seu terapeuta enviar uma atividade, ela aparecerá aqui de forma simples."
            />
          ) : (
            <div className="space-y-3">
              {allTasksDone && (
                <div className="glass-panel rounded-2xl border border-emerald-200/60 bg-emerald-50/40 p-4 shadow-md">
                  <p className="flex items-center gap-2 text-sm font-black text-emerald-700">
                    <CheckSquare className="h-4 w-4" />
                    Tudo concluído por enquanto
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800/70">
                    Você já respondeu ou marcou as tarefas abertas. Novas atividades aparecerão aqui.
                  </p>
                </div>
              )}

              {[...pendingTasks, ...completedTasks].map((task) => {
                const categoryKey = task.category ?? "general";
                const meta = CATEGORY_META[categoryKey] ?? CATEGORY_META.general;
                const due = dueDateLabel(task.due_date);
                const isCompleted = task.status === "completed";

                return (
                  <div
                    key={task.id}
                    className={`glass-panel rounded-2xl border p-4 shadow-md transition-all duration-300 ${isCompleted ? "border-[oklch(0.92_0.01_290)]/40 opacity-70" : "border-[oklch(0.92_0.01_290)]/60 hover:border-[oklch(0.78_0.12_280)]/40"}`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggle(task)}
                        disabled={togglingPending}
                        aria-label={isCompleted ? "Marcar tarefa como pendente" : "Marcar tarefa como concluída"}
                        aria-busy={togglingPending}
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all disabled:opacity-50 ${isCompleted ? "border-[oklch(0.55_0.18_160)] bg-[oklch(0.55_0.18_160)]" : "border-[oklch(0.78_0.12_280)] hover:border-[oklch(0.55_0.2_280)]"}`}
                      >
                        {isCompleted ? <span className="text-xs font-black text-white">✓</span> : null}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold leading-snug ${isCompleted ? "line-through text-[oklch(0.5_0.02_280)]" : "text-[oklch(0.22_0.02_280)]"}`}>
                          {task.title}
                        </p>
                        {task.description && !isCompleted && (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[oklch(0.5_0.02_280)]">{task.description}</p>
                        )}
                        {task.patient_feedback && (
                          <p className="mt-2 line-clamp-2 rounded-2xl bg-emerald-50/70 px-3 py-2 text-xs leading-relaxed text-[oklch(0.45_0.14_160)]">
                            Resposta enviada: {task.patient_feedback}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <span className={`flex items-center gap-1 text-[10px] font-medium ${meta.color}`}>
                            {meta.icon}
                            {meta.label}
                          </span>
                          {due && !isCompleted && (
                            <span className={`flex items-center gap-1 text-[10px] font-medium ${due.overdue ? "text-rose-500" : "text-[oklch(0.55_0.02_280)]"}`}>
                              {due.overdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                              {due.text}
                            </span>
                          )}
                        </div>
                        {!isCompleted && (
                          <button
                            type="button"
                            onClick={() => openTaskResponse(task)}
                            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[oklch(0.55_0.2_280)]/10 px-3 py-1.5 text-xs font-black text-[oklch(0.45_0.2_280)]"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Responder com calma
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-start justify-between gap-3 px-1">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[oklch(0.55_0.2_280)]" />
                <h2 className="text-base font-bold text-[oklch(0.22_0.02_280)]">Check-in de humor</h2>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[oklch(0.52_0.02_280)]">
                Registre sinais simples do dia para acompanhar padrões ao longo do tempo.
              </p>
            </div>
            <button
              type="button"
              onClick={openMoodCheckin}
              className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full gradient-primary px-3 py-1.5 text-xs font-black text-white shadow-lg shadow-violet-500/25 transition-all hover:-translate-y-0.5 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Check-in
            </button>
          </div>

          {moodCheckins.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="h-6 w-6" />}
              title="Nenhum check-in ainda"
              description="Quando quiser, registre como estão humor, ansiedade, sono e energia. Isso ajuda seu terapeuta a perceber padrões."
              actionLabel="Fazer primeiro check-in"
              onAction={openMoodCheckin}
            />
          ) : (
            <div className="space-y-3">
              {moodCheckins.slice(0, 3).map((entry) => (
                <div key={entry.id} className="glass-panel rounded-2xl border border-[oklch(0.92_0.01_290)]/60 p-4 shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-xs text-[oklch(0.6_0.02_280)]">
                      <Calendar className="h-3 w-3" />
                      {relDate(entry.created_at)}
                    </span>
                    <span className="rounded-full bg-[oklch(0.55_0.2_280)]/10 px-2 py-0.5 text-[10px] font-bold text-[oklch(0.45_0.2_280)]">
                      Registrado
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    {[
                      ["Humor", entry.mood_score],
                      ["Ansiedade", entry.anxiety_score],
                      ["Sono", entry.sleep_quality],
                      ["Energia", entry.energy_score],
                    ].map(([label, value]) => (
                      <div key={label as string} className="rounded-2xl bg-white/50 p-2">
                        <p className="text-[10px] font-medium text-[oklch(0.55_0.02_280)]">{label}</p>
                        <p className="text-sm font-black text-[oklch(0.22_0.02_280)]">{scoreText(value as number | null)}</p>
                      </div>
                    ))}
                  </div>
                  {entry.notes && (
                    <p className="mt-2 line-clamp-2 rounded-2xl bg-white/45 px-3 py-2 text-xs leading-relaxed text-[oklch(0.5_0.02_280)]">
                      {entry.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-start justify-between gap-3 px-1">
            <div>
              <div className="flex items-center gap-2">
                <BookHeart className="h-4 w-4 text-[oklch(0.55_0.18_340)]" />
                <h2 className="text-base font-bold text-[oklch(0.22_0.02_280)]">Diário emocional</h2>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[oklch(0.52_0.02_280)]">
                Um espaço breve para nomear emoções e levar mais contexto para a terapia.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDiaryForm(true)}
              className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full gradient-primary px-3 py-1.5 text-xs font-black text-white shadow-lg shadow-violet-500/25 transition-all hover:-translate-y-0.5 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Registrar
            </button>
          </div>

          {diary.length === 0 ? (
            <EmptyState
              icon={<BookHeart className="h-6 w-6" />}
              title="Diário vazio por enquanto"
              description="Você pode registrar uma emoção em poucos segundos, sem precisar escrever muito."
              actionLabel="Registrar emoção"
              onAction={() => setShowDiaryForm(true)}
            />
          ) : (
            <div className="space-y-3">
              {diary.map((entry) => {
                const intensity = intensityMeta(entry.intensity);

                return (
                  <div key={entry.id} className="glass-panel rounded-2xl border border-[oklch(0.92_0.01_290)]/60 p-4 shadow-md">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.97_0.01_280)] ${intensity.color}`}>
                        {intensity.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold capitalize text-[oklch(0.22_0.02_280)]">{entry.emotion}</p>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full bg-current/10 px-2 py-0.5 text-[10px] font-bold ${intensity.color}`}>
                              {intensity.label}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-[oklch(0.6_0.02_280)]">
                              <Calendar className="h-3 w-3" />
                              {relDate(entry.created_at)}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-[oklch(0.92_0.02_280)]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[oklch(0.78_0.1_160)] to-[oklch(0.55_0.18_340)] transition-all duration-500"
                              style={{ width: `${(entry.intensity / 10) * 100}%` }}
                            />
                          </div>
                          <span className="w-6 text-right text-[10px] font-bold text-[oklch(0.5_0.02_280)]">{entry.intensity}/10</span>
                        </div>
                        {entry.notes && (
                          <p className="mt-2 line-clamp-2 rounded-2xl bg-white/45 px-3 py-2 text-xs leading-relaxed text-[oklch(0.5_0.02_280)]">
                            {entry.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer className="flex items-center justify-center gap-2 pt-2 text-xs text-[oklch(0.6_0.01_290)]">
          <ShieldCheck className="h-3.5 w-3.5 text-[oklch(0.55_0.18_160)]" />
          <span>Dados protegidos pela LGPD - Nythos</span>
        </footer>
      </div>

      {showDiaryForm && (
        <DiaryForm
          patientId={patient.id}
          onClose={() => setShowDiaryForm(false)}
          onSaved={(entry) => setDiary((current) => [entry, ...current])}
        />
      )}

      {showMoodCheckinForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(event) => event.target === event.currentTarget && closeMoodCheckin()}
        >
          <div className="glass-panel max-h-[85dvh] w-full max-w-md space-y-5 overflow-y-auto rounded-[28px] p-4 shadow-2xl shadow-violet-900/20 sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-black text-[oklch(0.22_0.02_280)]">
                  <TrendingUp className="h-5 w-5 text-[oklch(0.55_0.2_280)]" />
                  Check-in de hoje
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-[oklch(0.5_0.02_280)]">
                  Use notas rápidas. Não precisa estar perfeito.
                </p>
              </div>
              <button
                type="button"
                onClick={closeMoodCheckin}
                disabled={moodPending}
                aria-label="Fechar check-in"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleMoodSubmit} className="space-y-4">
              {MOOD_FIELDS.map(({ key, label, icon: Icon, low, high }) => (
                <div key={key}>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[oklch(0.5_0.02_280)]">
                    <Icon className="h-3.5 w-3.5" />
                    {label}: {moodForm[key]}/5
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={moodForm[key]}
                    onChange={(event) => setMoodForm((current) => ({ ...current, [key]: Number(event.target.value) }))}
                    disabled={moodPending}
                    className="w-full accent-violet-600"
                  />
                  <div className="mt-1 flex justify-between text-[10px] font-medium text-[oklch(0.6_0.02_280)]">
                    <span>{low}</span>
                    <span>{high}</span>
                  </div>
                </div>
              ))}

              <textarea
                value={moodForm.notes}
                onChange={(event) => setMoodForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                placeholder="Algo importante sobre hoje? Pode ser uma frase curta."
                disabled={moodPending}
                className="w-full resize-none rounded-2xl border border-[oklch(0.92_0.01_290)] bg-white/70 px-4 py-3 text-sm text-[oklch(0.22_0.02_280)] transition-all focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.2_280)]/20 disabled:opacity-70"
              />
              {formError && <InlineError message={formError} />}
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={closeMoodCheckin}
                  disabled={moodPending}
                  className="h-11 flex-1 rounded-xl border border-[oklch(0.92_0.01_290)] text-sm font-bold text-[oklch(0.5_0.02_280)] transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={moodPending}
                  aria-busy={moodPending}
                  className="flex h-11 flex-[1.5] items-center justify-center gap-2 rounded-xl gradient-primary text-sm font-black text-white shadow-lg shadow-violet-500/25 transition-all hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {moodPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar check-in"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {respondingTask && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(event) => event.target === event.currentTarget && closeTaskResponse()}
        >
          <div className="glass-panel max-h-[85dvh] w-full max-w-md space-y-5 overflow-y-auto rounded-[28px] p-4 shadow-2xl shadow-violet-900/20 sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-black text-[oklch(0.22_0.02_280)]">
                  <MessageSquare className="h-5 w-5 text-[oklch(0.55_0.2_280)]" />
                  Responder tarefa
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-[oklch(0.5_0.02_280)]">
                  Seu terapeuta verá essa resposta para acompanhar seu processo.
                </p>
              </div>
              <button
                type="button"
                onClick={closeTaskResponse}
                disabled={responsePending}
                aria-label="Fechar resposta da tarefa"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="rounded-2xl bg-white/55 px-3 py-2 text-sm font-semibold text-[oklch(0.22_0.02_280)]">{respondingTask.title}</p>
            <form onSubmit={handleTaskResponseSubmit} className="space-y-4">
              <textarea
                value={taskResponse}
                onChange={(event) => setTaskResponse(event.target.value)}
                rows={5}
                placeholder="Escreva do seu jeito. Pode ser breve."
                disabled={responsePending}
                className="w-full resize-none rounded-2xl border border-[oklch(0.92_0.01_290)] bg-white/70 px-4 py-3 text-sm text-[oklch(0.22_0.02_280)] transition-all focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.2_280)]/20 disabled:opacity-70"
              />
              {formError && <InlineError message={formError} />}
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={closeTaskResponse}
                  disabled={responsePending}
                  className="h-11 flex-1 rounded-xl border border-[oklch(0.92_0.01_290)] text-sm font-bold text-[oklch(0.5_0.02_280)] transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={responsePending || !taskResponse.trim()}
                  aria-busy={responsePending}
                  className="flex h-11 flex-[1.5] items-center justify-center gap-2 rounded-xl gradient-primary text-sm font-black text-white shadow-lg shadow-violet-500/25 transition-all hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {responsePending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    "Enviar resposta"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
