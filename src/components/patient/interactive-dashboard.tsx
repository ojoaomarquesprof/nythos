"use client";

import { useState, useTransition, useOptimistic } from "react";
import {
  Heart, Sparkles, ShieldCheck, LogOut, CheckSquare, Square,
  BookHeart, Smile, Meh, Frown, Clock, AlertCircle, Brain,
  Dumbbell, BookOpen, ListChecks, TrendingUp, Calendar, Plus, X, Loader2,
} from "lucide-react";
import type { Patient, PatientTask, EmotionDiary } from "@/types/database";
import { toggleTaskStatus, saveDiaryEntry } from "@/app/actions/patient-engagement";
import { logoutPatient } from "@/app/actions/patient-auth";

type PatientPortalTask = Pick<
  PatientTask,
  "id" | "patient_id" | "title" | "description" | "category" | "due_date" | "status" | "completed_at" | "created_at" | "updated_at"
>;

type PatientPortalDiary = Pick<
  EmotionDiary,
  "id" | "patient_id" | "emotion" | "intensity" | "notes" | "context" | "created_at"
>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  general:           { label: "Geral",              icon: <ListChecks className="w-4 h-4" />, color: "text-violet-500" },
  homework:          { label: "Tarefa",             icon: <CheckSquare className="w-4 h-4" />, color: "text-blue-500" },
  reading:           { label: "Leitura",            icon: <BookOpen className="w-4 h-4" />, color: "text-cyan-500" },
  exercise:          { label: "Exercício",          icon: <Dumbbell className="w-4 h-4" />, color: "text-emerald-500" },
  reflection:        { label: "Reflexão",           icon: <Brain className="w-4 h-4" />, color: "text-pink-500" },
  behavior_tracking: { label: "Automonitoramento",  icon: <TrendingUp className="w-4 h-4" />, color: "text-orange-500" },
};

const CONTEXTS = [
  { value: "morning", label: "Manhã" }, { value: "afternoon", label: "Tarde" },
  { value: "evening", label: "Noite" }, { value: "night", label: "Madrugada" },
  { value: "work", label: "Trabalho" }, { value: "home", label: "Casa" },
  { value: "social", label: "Social" }, { value: "other", label: "Outro" },
];

function intensityMeta(v: number) {
  if (v <= 3) return { icon: <Smile className="w-5 h-5" />, label: "Leve", color: "text-emerald-500" };
  if (v <= 6) return { icon: <Meh className="w-5 h-5" />, label: "Moderada", color: "text-amber-500" };
  return { icon: <Frown className="w-5 h-5" />, label: "Intensa", color: "text-rose-500" };
}

function relDate(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Hoje"; if (d === 1) return "Ontem";
  if (d < 7) return `Há ${d} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function dueDateLabel(iso: string | null) {
  if (!iso) return null;
  const d = Math.floor((new Date(iso).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
  if (d < 0) return { text: "Atrasada", overdue: true };
  if (d === 0) return { text: "Vence hoje", overdue: false };
  if (d === 1) return { text: "Vence amanhã", overdue: false };
  return { text: `Vence em ${d} dias`, overdue: false };
}

// ─── Diary Form ───────────────────────────────────────────────────────────────

function DiaryForm({ patientId, onClose, onSaved }: { patientId: string; onClose: () => void; onSaved: (e: PatientPortalDiary) => void }) {
  const [form, setForm] = useState({ emotion: "", intensity: 5, context: "", notes: "" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.emotion.trim()) { setError("Informe a emoção."); return; }
    setError("");
    startTransition(async () => {
      const r = await saveDiaryEntry({ emotion: form.emotion, intensity: form.intensity, context: form.context || undefined, notes: form.notes || undefined });
      if (r.success) {
        onSaved({ id: r.id ?? crypto.randomUUID(), patient_id: patientId, emotion: form.emotion, intensity: form.intensity, notes: form.notes || null, context: form.context || null, created_at: new Date().toISOString() });
        onClose();
      } else { setError(r.error ?? "Erro ao salvar."); }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md glass-panel rounded-3xl p-6 shadow-2xl shadow-violet-900/20 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-[oklch(0.22_0.02_280)] flex items-center gap-2">
            <BookHeart className="w-5 h-5 text-[oklch(0.55_0.18_340)]" /> Nova Entrada
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[oklch(0.5_0.02_280)] block mb-1.5">Como você está se sentindo?</label>
            <input value={form.emotion} onChange={e => setForm(f => ({...f, emotion: e.target.value}))} placeholder="Ex: ansioso, feliz, triste..." className="w-full px-4 py-3 rounded-2xl bg-white/70 border border-[oklch(0.92_0.01_290)] text-sm font-semibold text-[oklch(0.22_0.02_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.2_280)]/20 transition-all" />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[oklch(0.5_0.02_280)] block mb-1.5">Intensidade: {form.intensity}/10</label>
            <input type="range" min="1" max="10" value={form.intensity} onChange={e => setForm(f => ({...f, intensity: +e.target.value}))} className="w-full accent-violet-600" />
            <div className="flex justify-between text-[10px] text-[oklch(0.6_0.02_280)] mt-1 font-medium">
              <span>1 · Leve</span><span>10 · Muito intenso</span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[oklch(0.5_0.02_280)] block mb-1.5">Contexto</label>
            <div className="flex flex-wrap gap-2">
              {CONTEXTS.map(c => (
                <button key={c.value} type="button" onClick={() => setForm(f => ({...f, context: f.context === c.value ? "" : c.value}))}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${form.context === c.value ? "bg-violet-600 text-white" : "bg-white/60 border border-[oklch(0.92_0.01_290)] text-[oklch(0.5_0.02_280)] hover:border-violet-300"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[oklch(0.5_0.02_280)] block mb-1.5">Observações (opcional)</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={2} placeholder="O que estava acontecendo?" className="w-full px-4 py-3 rounded-2xl bg-white/70 border border-[oklch(0.92_0.01_290)] text-sm text-[oklch(0.22_0.02_280)] resize-none focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.2_280)]/20 transition-all" />
          </div>

          {error && <p className="text-xs text-rose-600 font-semibold bg-rose-50 px-3 py-2 rounded-xl">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-[oklch(0.92_0.01_290)] text-sm font-bold text-[oklch(0.5_0.02_280)] hover:bg-slate-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={pending} className="flex-[1.5] h-11 rounded-xl gradient-primary text-white font-black text-sm shadow-lg shadow-violet-500/25 hover:-translate-y-0.5 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</> : "Salvar Registro"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { patient: Pick<Patient, "id" | "full_name">; initialTasks: PatientPortalTask[]; initialDiary: PatientPortalDiary[]; }

export function InteractivePatientDashboard({ patient, initialTasks, initialDiary }: Props) {
  const [tasks, setTasks] = useState<PatientPortalTask[]>(initialTasks);
  const [diary, setDiary] = useState<PatientPortalDiary[]>(initialDiary);
  const [showDiaryForm, setShowDiaryForm] = useState(false);
  const [togglingPending, startTransition] = useTransition();
  const [logoutPending, setLogoutPending] = useState(false);

  const [optimisticTasks, updateOptimistic] = useOptimistic(
    tasks,
    (current, { id, status }: { id: string; status: string }) =>
      current.map(t => t.id === id ? { ...t, status: status as PatientTask["status"], completed_at: status === "completed" ? new Date().toISOString() : null } : t)
  );

  async function handleLogout() {
    setLogoutPending(true);
    await logoutPatient(); // server action: apaga cookie e redireciona
  }

  function handleToggle(task: PatientPortalTask) {
    if (togglingPending) return;
    const newStatus = task.status === "completed" ? "pending" : "completed";
    startTransition(async () => {
      updateOptimistic({ id: task.id, status: newStatus });
      const r = await toggleTaskStatus(task.id, task.status);
      if (r.success) {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus as PatientTask["status"], completed_at: newStatus === "completed" ? new Date().toISOString() : null } : t));
      }
    });
  }


  const firstName = patient.full_name.split(" ")[0];
  const pending = optimisticTasks.filter(t => t.status !== "completed");
  const completed = optimisticTasks.filter(t => t.status === "completed");
  const rate = optimisticTasks.length > 0 ? Math.round((completed.length / optimisticTasks.length) * 100) : 0;

  return (
    <main className="min-h-screen relative overflow-x-hidden bg-gradient-to-br from-[oklch(0.97_0.02_290)] via-[oklch(0.96_0.03_310)] to-[oklch(0.95_0.04_160)]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-[oklch(0.78_0.1_160)]/20 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-[oklch(0.72_0.18_280)]/15 blur-3xl animate-pulse [animation-delay:1.5s]" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 pb-20 space-y-6">

        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Heart className="w-6 h-6 text-white fill-white/30" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-[oklch(0.78_0.1_160)] rounded-full flex items-center justify-center">
                <Sparkles className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[oklch(0.55_0.04_280)] uppercase tracking-wider">Área do Paciente · Nythos</p>
              <h1 className="text-xl font-bold text-[oklch(0.22_0.02_280)]">Olá, {firstName} 👋</h1>
            </div>
          </div>
          <button onClick={handleLogout} disabled={logoutPending} title="Sair"
            className="w-10 h-10 rounded-xl bg-white/60 border border-[oklch(0.92_0.01_290)] text-[oklch(0.5_0.02_280)] hover:bg-white/90 transition-all flex items-center justify-center disabled:opacity-50">
            {logoutPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          </button>
        </header>

        {/* Progress */}
        <div className="glass-panel rounded-3xl p-6 shadow-xl shadow-violet-900/5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-[oklch(0.55_0.04_280)] uppercase tracking-wider">Progresso Geral</p>
              <p className="text-2xl font-bold text-[oklch(0.22_0.02_280)] mt-0.5">{rate}%</p>
              <p className="text-xs text-[oklch(0.55_0.02_280)] mt-0.5">{completed.length} de {optimisticTasks.length} tarefas concluídas</p>
            </div>
            <div className="relative w-20 h-20">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="oklch(0.92 0.02 280)" strokeWidth="3" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="oklch(0.55 0.2 280)" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${(rate / 100) * 88} 88`} className="transition-all duration-700" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <CheckSquare className="w-6 h-6 text-[oklch(0.55_0.2_280)]" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[oklch(0.92_0.01_290)]/60">
            {[
              { label: "Pendentes", value: pending.filter(t => t.status === "pending").length, color: "text-[oklch(0.55_0.18_60)]" },
              { label: "Em andamento", value: pending.filter(t => t.status === "in_progress").length, color: "text-[oklch(0.55_0.2_280)]" },
              { label: "Concluídas", value: completed.length, color: "text-[oklch(0.55_0.18_160)]" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] font-medium text-[oklch(0.6_0.02_280)] mt-0.5 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tasks */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <ListChecks className="w-4 h-4 text-[oklch(0.55_0.2_280)]" />
            <h2 className="text-base font-bold text-[oklch(0.22_0.02_280)]">Minhas Tarefas</h2>
            {pending.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[oklch(0.55_0.2_280)]/10 text-[oklch(0.45_0.2_280)]">
                {pending.length} pendente{pending.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {optimisticTasks.length === 0 ? (
            <div className="glass-panel rounded-3xl p-10 text-center shadow-lg">
              <CheckSquare className="w-7 h-7 text-[oklch(0.55_0.2_280)] mx-auto mb-3" />
              <p className="font-semibold text-[oklch(0.35_0.03_280)]">Nenhuma tarefa ainda</p>
              <p className="text-sm text-[oklch(0.55_0.02_280)] mt-1">Seu terapeuta atribuirá atividades em breve.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...pending, ...completed].map(task => {
                const categoryKey = (task.category ?? "general") as keyof typeof CATEGORY_META;
                const meta = CATEGORY_META[categoryKey] ?? CATEGORY_META.general;
                const due = dueDateLabel(task.due_date);
                const isCompleted = task.status === "completed";

                return (
                  <div key={task.id} className={`glass-panel rounded-2xl p-4 shadow-md border transition-all duration-300 ${isCompleted ? "opacity-60 border-[oklch(0.92_0.01_290)]/40" : "border-[oklch(0.92_0.01_290)]/60 hover:border-[oklch(0.78_0.12_280)]/40"}`}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => handleToggle(task)} disabled={togglingPending}
                        className={`mt-0.5 shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isCompleted ? "bg-[oklch(0.55_0.18_160)] border-[oklch(0.55_0.18_160)]" : "border-[oklch(0.78_0.12_280)] hover:border-[oklch(0.55_0.2_280)]"}`}>
                        {isCompleted ? <span className="text-white text-xs font-black">✓</span> : null}
                      </button>


                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm leading-snug ${isCompleted ? "line-through text-[oklch(0.5_0.02_280)]" : "text-[oklch(0.22_0.02_280)]"}`}>{task.title}</p>
                        {task.description && !isCompleted && (
                          <p className="text-xs text-[oklch(0.5_0.02_280)] mt-1 leading-relaxed line-clamp-2">{task.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className={`text-[10px] font-medium ${meta.color} flex items-center gap-1`}>{meta.icon}{meta.label}</span>
                          {due && !isCompleted && (
                            <span className={`flex items-center gap-1 text-[10px] font-medium ${due.overdue ? "text-rose-500" : "text-[oklch(0.55_0.02_280)]"}`}>
                              {due.overdue ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}{due.text}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Diary */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <BookHeart className="w-4 h-4 text-[oklch(0.55_0.18_340)]" />
              <h2 className="text-base font-bold text-[oklch(0.22_0.02_280)]">Meu Diário de Emoções</h2>
            </div>
            <button onClick={() => setShowDiaryForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full gradient-primary text-white text-xs font-black shadow-lg shadow-violet-500/25 hover:-translate-y-0.5 transition-all active:scale-95">
              <Plus className="w-3.5 h-3.5" /> Nova Entrada
            </button>
          </div>

          {diary.length === 0 ? (
            <div className="glass-panel rounded-3xl p-8 text-center shadow-lg">
              <BookHeart className="w-7 h-7 text-[oklch(0.55_0.18_340)] mx-auto mb-3" />
              <p className="font-semibold text-[oklch(0.35_0.03_280)]">Diário vazio por enquanto</p>
              <p className="text-sm text-[oklch(0.55_0.02_280)] mt-1">Registre sua primeira emoção!</p>
              <button onClick={() => setShowDiaryForm(true)} className="mt-4 px-6 py-2.5 rounded-xl gradient-primary text-white text-sm font-black shadow-lg shadow-violet-500/20 hover:-translate-y-0.5 transition-all">
                Registrar Emoção
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {diary.map(entry => {
                const im = intensityMeta(entry.intensity);
                return (
                  <div key={entry.id} className="glass-panel rounded-2xl p-4 shadow-md border border-[oklch(0.92_0.01_290)]/60">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-8 h-8 rounded-xl bg-[oklch(0.97_0.01_280)] flex items-center justify-center shrink-0 ${im.color}`}>{im.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="font-semibold text-sm text-[oklch(0.22_0.02_280)] capitalize">{entry.emotion}</p>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-current/10 ${im.color}`}>{im.label}</span>
                            <span className="text-[10px] text-[oklch(0.6_0.02_280)] flex items-center gap-1">
                              <Calendar className="w-3 h-3" />{relDate(entry.created_at ?? new Date().toISOString())}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-[oklch(0.92_0.02_280)]">
                            <div className="h-full rounded-full bg-gradient-to-r from-[oklch(0.78_0.1_160)] to-[oklch(0.55_0.18_340)] transition-all duration-500" style={{ width: `${(entry.intensity / 10) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-[oklch(0.5_0.02_280)] w-6 text-right">{entry.intensity}/10</span>
                        </div>
                        {entry.notes && <p className="text-xs text-[oklch(0.5_0.02_280)] mt-2 leading-relaxed italic line-clamp-2">"{entry.notes}"</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer className="pt-2 flex items-center justify-center gap-2 text-xs text-[oklch(0.6_0.01_290)]">
          <ShieldCheck className="w-3.5 h-3.5 text-[oklch(0.55_0.18_160)]" />
          <span>Dados protegidos pela LGPD · Nythos</span>
        </footer>
      </div>

      {showDiaryForm && (
        <DiaryForm
          patientId={patient.id}
          onClose={() => setShowDiaryForm(false)}
          onSaved={(entry) => setDiary(prev => [entry, ...prev])}
        />
      )}
    </main>
  );
}
