"use server";

import { revalidatePath } from "next/cache";
import { getPatientAccessErrorMessage, getPatientAccessState } from "@/lib/auth/patient-access";
import { clearPatientSession, getPatientSessionDetails } from "@/lib/auth/patient-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logSafeError } from "@/lib/errors/safe-error";
import type { EmotionDiary, PatientTask } from "@/types/database";
import {
  recordEmotionDiaryEntryCreated,
  recordPatientCheckinCreated,
  recordPatientTaskAnswered,
} from "@/lib/audit/server";
import {
  hasOnlyAllowedKeys,
  isPlainObject,
  isValidUuid,
  toFiniteNumber,
} from "@/lib/validation/input";

export interface ToggleTaskResult {
  success: boolean;
  newStatus?: "completed" | "pending" | "in_progress";
  error?: string;
}

export interface SaveDiaryResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface SaveMoodCheckinResult {
  success: boolean;
  checkin?: {
    id: string;
    patient_id: string;
    therapist_id: string;
    mood_score: number | null;
    anxiety_score: number | null;
    sleep_quality: number | null;
    energy_score: number | null;
    notes: string | null;
    created_at: string;
  };
  error?: string;
}

export interface RespondTaskResult {
  success: boolean;
  error?: string;
}

export interface PatientEngagementStats {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  lastEmotion: string | null;
  lastEmotionIntensity: number | null;
  lastEmotionDate: string | null;
  diaryEntriesCount: number;
  moodCheckinsList: any[];
  tasksList: PatientTask[];
  diaryList: EmotionDiary[];
}

export interface EngagementResult {
  success: boolean;
  data?: PatientEngagementStats;
  error?: string;
}

const EMOTION_MAP: Record<string, string> = {
  feliz: "happy",
  alegre: "happy",
  contente: "happy",
  felizao: "happy",
  radiante: "happy",
  animado: "happy",
  triste: "sad",
  chateado: "sad",
  chateada: "sad",
  deprimido: "sad",
  deprimida: "sad",
  desanimado: "sad",
  desanimada: "sad",
  melancolico: "sad",
  melancolica: "sad",
  ansioso: "anxious",
  ansiosa: "anxious",
  preocupado: "anxious",
  preocupada: "anxious",
  nervoso: "anxious",
  nervosa: "anxious",
  tenso: "anxious",
  tensa: "anxious",
  raiva: "angry",
  irritado: "angry",
  irritada: "angry",
  bravo: "angry",
  brava: "angry",
  furioso: "angry",
  furiosa: "angry",
  comraiva: "angry",
  medo: "fearful",
  assustado: "fearful",
  assustada: "fearful",
  commedo: "fearful",
  pavor: "fearful",
  surpreso: "surprised",
  surpresa: "surprised",
  chocado: "surprised",
  chocada: "surprised",
  espantado: "surprised",
  espantada: "surprised",
  nojo: "disgusted",
  enojado: "disgusted",
  enojada: "disgusted",
  desgostoso: "disgusted",
  desgostosa: "disgusted",
  calmo: "calm",
  calma: "calm",
  tranquilo: "calm",
  tranquila: "calm",
  relaxado: "calm",
  relaxada: "calm",
  sereno: "calm",
  serena: "calm",
  empaz: "calm",
  confuso: "confused",
  confusa: "confused",
  perdido: "confused",
  perdida: "confused",
  indeciso: "confused",
  indecisa: "confused",
  esperancoso: "hopeful",
  esperancosa: "hopeful",
  otimista: "hopeful",
  confiante: "hopeful",
  grato: "grateful",
  grata: "grateful",
  agradecido: "grateful",
  agradecida: "grateful",
  gratidao: "grateful",
  solitario: "lonely",
  solitaria: "lonely",
  sozinho: "lonely",
  sozinha: "lonely",
  abandonado: "lonely",
  abandonada: "lonely",
  frustrado: "frustrated",
  frustrada: "frustrated",
  impotente: "frustrated",
  sobrecarregado: "overwhelmed",
  sobrecarregada: "overwhelmed",
  exausto: "overwhelmed",
  exausta: "overwhelmed",
  cansado: "overwhelmed",
  cansada: "overwhelmed",
  estressado: "overwhelmed",
  estressada: "overwhelmed",
  satisfeito: "content",
  satisfeita: "content",
};

const ALLOWED_EMOTIONS = [
  "happy",
  "sad",
  "anxious",
  "angry",
  "fearful",
  "surprised",
  "disgusted",
  "calm",
  "confused",
  "hopeful",
  "grateful",
  "lonely",
  "frustrated",
  "overwhelmed",
  "content",
  "other",
];

const ALLOWED_DIARY_KEYS = [
  "emotion",
  "intensity",
  "context",
  "notes",
  "triggers",
  "coping_strategy",
] as const;

const ALLOWED_MOOD_CHECKIN_KEYS = [
  "mood_score",
  "anxiety_score",
  "sleep_quality",
  "energy_score",
  "notes",
] as const;

const ALLOWED_TASK_RESPONSE_KEYS = ["task_id", "response"] as const;

function clampText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeEmotion(input: string): { emotion: string; notesPrefix: string | null } {
  const trimmed = input.trim();
  const normalized = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");

  if (ALLOWED_EMOTIONS.includes(normalized)) {
    return { emotion: normalized, notesPrefix: null };
  }

  const mapped = EMOTION_MAP[normalized];
  if (mapped) {
    return { emotion: mapped, notesPrefix: null };
  }

  return { emotion: "other", notesPrefix: trimmed };
}

async function requirePatientId(): Promise<string> {
  const session = await getPatientSessionDetails();
  if (!session) {
    throw new Error("UNAUTHORIZED: Cookie de sessao ausente ou invalido.");
  }

  if (!isValidUuid(session.patientId)) {
    throw new Error("INVALID_SESSION: patient_id invalido no cookie.");
  }

  // service_role is scoped by the signed patient HMAC cookie; no Supabase auth session exists here.
  const admin = createAdminClient();
  const { data: patient, error } = await admin
    .from("patients")
    .select("id, status, access_token_issued_at, access_token_expires_at, access_token_revoked_at")
    .eq("id", session.patientId)
    .maybeSingle();

  const accessState = error ? "not_found" : getPatientAccessState(patient, session.issuedAt);
  if (accessState !== "active") {
    await clearPatientSession();
    throw new Error(`UNAUTHORIZED: ${getPatientAccessErrorMessage(accessState, "session")}`);
  }

  return session.patientId;
}

export async function saveDiaryEntry(formData: {
  emotion: string;
  intensity: number;
  context?: string;
  notes?: string;
  triggers?: string;
  coping_strategy?: string;
}): Promise<SaveDiaryResult> {
  if (!isPlainObject(formData) || !hasOnlyAllowedKeys(formData, ALLOWED_DIARY_KEYS)) {
    return { success: false, error: "Payload inválido do diário." };
  }

  let patientId: string;
  try {
    patientId = await requirePatientId();
  } catch (authErr: unknown) {
    logSafeError("[saveDiaryEntry] Auth error", authErr);
    return { success: false, error: "Sessao invalida. Abra seu link de acesso." };
  }

  const rawEmotion = String(formData.emotion ?? "").trim();
  if (!rawEmotion) return { success: false, error: "Informe a emocao." };

  const { emotion, notesPrefix } = normalizeEmotion(rawEmotion);
  const intensityRaw = toFiniteNumber(formData.intensity);
  if (intensityRaw === null || intensityRaw < 1 || intensityRaw > 10) {
    return { success: false, error: "Intensidade inválida." };
  }
  const intensity = Math.round(intensityRaw);

  let notes = formData.notes?.trim() || null;
  if (notesPrefix) {
    notes = notes
      ? `[Sentimento original: ${notesPrefix}] ${notes}`
      : `Sentimento original: ${notesPrefix}`;
  }

  try {
    // service_role write is constrained to the patient_id from the signed HMAC cookie.
    const admin = createAdminClient();
    const { data: entry, error } = await admin
      .from("emotion_diary")
      .insert({
        patient_id: patientId,
        emotion,
        intensity,
        context: formData.context?.trim() || null,
        notes,
        triggers: formData.triggers?.trim() || null,
        coping_strategy: formData.coping_strategy?.trim() || null,
      })
      .select("id,created_at")
      .single();

    if (error) {
      logSafeError("[saveDiaryEntry] Supabase error", error);
      return { success: false, error: "Não foi possível salvar o diário agora." };
    }

    revalidatePath("/patient/dashboard");
    await recordEmotionDiaryEntryCreated({
      actorId: null,
      actorRole: "patient_portal",
      patientId,
      diaryEntryId: entry?.id ?? null,
      hasEmotionLabel: true,
      hasText: Boolean(formData.context?.trim() || notes || formData.triggers?.trim() || formData.coping_strategy?.trim()),
      createdAt: entry?.created_at ?? null,
    });
    return { success: true, id: entry?.id };
  } catch (err: unknown) {
    logSafeError("[saveDiaryEntry] Exception", err);
    return { success: false, error: "Erro inesperado ao salvar." };
  }
}

export async function saveMoodCheckin(formData: {
  mood_score?: number;
  anxiety_score?: number;
  sleep_quality?: number;
  energy_score?: number;
  notes?: string;
}): Promise<SaveMoodCheckinResult> {
  if (!isPlainObject(formData) || !hasOnlyAllowedKeys(formData, ALLOWED_MOOD_CHECKIN_KEYS)) {
    return { success: false, error: "Payload invÃ¡lido do check-in." };
  }

  let patientId: string;
  try {
    patientId = await requirePatientId();
  } catch (authErr: unknown) {
    logSafeError("[saveMoodCheckin] Auth error", authErr);
    return { success: false, error: "Sessao invalida. Abra seu link de acesso." };
  }

  const scores = {
    mood_score: toFiniteNumber(formData.mood_score),
    anxiety_score: toFiniteNumber(formData.anxiety_score),
    sleep_quality: toFiniteNumber(formData.sleep_quality),
    energy_score: toFiniteNumber(formData.energy_score),
  };

  if (Object.values(scores).every((value) => value === null)) {
    return { success: false, error: "Informe pelo menos um indicador." };
  }

  for (const value of Object.values(scores)) {
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 5)) {
      return { success: false, error: "Indicadores devem estar entre 1 e 5." };
    }
  }

  try {
    const admin = createAdminClient();
    const { data: patient } = await admin
      .from("patients")
      .select("id,user_id")
      .eq("id", patientId)
      .maybeSingle();

    if (!patient?.user_id) {
      return { success: false, error: "Paciente nÃ£o encontrado." };
    }

    const { data: checkin, error } = await admin
      .from("patient_mood_checkins")
      .insert({
        patient_id: patientId,
        therapist_id: patient.user_id,
        mood_score: scores.mood_score,
        anxiety_score: scores.anxiety_score,
        sleep_quality: scores.sleep_quality,
        energy_score: scores.energy_score,
        notes_encrypted: clampText(formData.notes, 2000),
      })
      .select("id,patient_id,therapist_id,mood_score,anxiety_score,sleep_quality,energy_score,created_at")
      .single();

    if (error || !checkin) {
      logSafeError("[saveMoodCheckin] Supabase error", error);
      return { success: false, error: "NÃ£o foi possÃ­vel salvar o check-in agora." };
    }

    revalidatePath("/patient/dashboard");
    await recordPatientCheckinCreated({
      actorId: null,
      actorRole: "patient_portal",
      patientId,
      checkinId: checkin.id,
      hasMood: scores.mood_score !== null,
      hasAnxiety: scores.anxiety_score !== null,
      hasSleep: scores.sleep_quality !== null,
      hasEnergy: scores.energy_score !== null,
      createdAt: checkin.created_at,
    });
    return {
      success: true,
      checkin: {
        ...checkin,
        notes: clampText(formData.notes, 2000),
      },
    };
  } catch (err: unknown) {
    logSafeError("[saveMoodCheckin] Exception", err);
    return { success: false, error: "Erro inesperado ao salvar." };
  }
}

export async function respondToTask(formData: {
  task_id: string;
  response: string;
}): Promise<RespondTaskResult> {
  if (!isPlainObject(formData) || !hasOnlyAllowedKeys(formData, ALLOWED_TASK_RESPONSE_KEYS)) {
    return { success: false, error: "Payload invÃ¡lido da resposta." };
  }

  let patientId: string;
  try {
    patientId = await requirePatientId();
  } catch (authErr: unknown) {
    logSafeError("[respondToTask] Auth error", authErr);
    return { success: false, error: "Sessao invalida. Abra seu link de acesso." };
  }

  if (!isValidUuid(formData.task_id)) {
    return { success: false, error: "ID de tarefa invÃ¡lido." };
  }

  const response = clampText(formData.response, 4000);
  if (!response) {
    return { success: false, error: "Escreva uma resposta antes de enviar." };
  }

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: existingTask } = await admin
      .from("patient_tasks")
      .select("id,status,viewed_at")
      .eq("id", formData.task_id)
      .eq("patient_id", patientId)
      .maybeSingle();

    const { data: updatedRows, error } = await admin
      .from("patient_tasks")
      .update({
        patient_feedback: response,
        responded_at: now,
        status: "completed",
        completed_at: now,
        updated_at: now,
      })
      .eq("id", formData.task_id)
      .eq("patient_id", patientId)
      .neq("status", "cancelled")
      .select("id,status,responded_at,viewed_at");

    if (error) {
      logSafeError("[respondToTask] Supabase error", error);
      return { success: false, error: "NÃ£o foi possÃ­vel enviar a resposta." };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: "Tarefa nÃ£o encontrada." };
    }

    revalidatePath("/patient/dashboard");
    const updatedTask = updatedRows[0];
    await recordPatientTaskAnswered({
      actorId: null,
      actorRole: "patient_portal",
      patientId,
      taskId: updatedTask.id,
      oldStatus: existingTask?.status ?? null,
      newStatus: updatedTask.status ?? "completed",
      answeredAt: updatedTask.responded_at ?? now,
      viewedAt: updatedTask.viewed_at ?? existingTask?.viewed_at ?? null,
    });
    return { success: true };
  } catch (err: unknown) {
    logSafeError("[respondToTask] Exception", err);
    return { success: false, error: "Erro ao responder tarefa." };
  }
}

export async function toggleTaskStatus(
  taskId: string,
  currentStatus: string
): Promise<ToggleTaskResult> {
  let patientId: string;
  try {
    patientId = await requirePatientId();
  } catch (authErr: unknown) {
    logSafeError("[toggleTaskStatus] Auth error", authErr);
    return { success: false, error: "Sessao invalida. Abra seu link de acesso." };
  }

  if (!isValidUuid(taskId)) return { success: false, error: "ID de tarefa invalido." };
  if (!["pending", "in_progress", "completed"].includes(currentStatus)) {
    return { success: false, error: "Status atual inválido da tarefa." };
  }

  const isNowCompleted = currentStatus !== "completed";
  const newStatus = isNowCompleted ? "completed" : "pending";

  try {
    // service_role update is constrained by both task_id and the signed-cookie patient_id.
    const admin = createAdminClient();
    const { data: updatedRows, error } = await admin
      .from("patient_tasks")
      .update({
        status: newStatus,
        completed_at: isNowCompleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("patient_id", patientId)
      .select("id");

    if (error) {
      logSafeError("[toggleTaskStatus] Supabase error", error);
      return { success: false, error: "Não foi possível atualizar a tarefa." };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: "Tarefa nao encontrada." };
    }

    revalidatePath("/patient/dashboard");
    return { success: true, newStatus };
  } catch (err: unknown) {
    logSafeError("[toggleTaskStatus] Exception", err);
    return { success: false, error: "Erro ao atualizar tarefa." };
  }
}

export async function getPatientEngagement(patientId: string): Promise<EngagementResult> {
  if (!isValidUuid(patientId)) {
    return { success: false, error: "Paciente inválido." };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Sessao do terapeuta invalida." };
    }

    const [tasksRes, diaryRes, moodCheckinsRes] = await Promise.all([
      supabase.rpc("get_patient_tasks_decrypted", { p_patient_id: patientId }),
      supabase.rpc("get_patient_emotion_diary_decrypted", { p_patient_id: patientId }),
      supabase.rpc("get_patient_mood_checkins_decrypted", { p_patient_id: patientId }),
    ]);

    const tasks = Array.isArray(tasksRes.data) ? tasksRes.data as PatientTask[] : [];
    const diary = Array.isArray(diaryRes.data) ? diaryRes.data as EmotionDiary[] : [];
    const moodCheckins = Array.isArray(moodCheckinsRes.data) ? moodCheckinsRes.data as any[] : [];
    const lastEntry = diary[0] ?? null;
    const completedTasks = tasks.filter((task: PatientTask) => task.status === "completed").length;

    return {
      success: true,
      data: {
        totalTasks: tasks.length,
        completedTasks,
        pendingTasks: tasks.length - completedTasks,
        lastEmotion: lastEntry?.emotion ?? null,
        lastEmotionIntensity: lastEntry?.intensity ?? null,
        lastEmotionDate: lastEntry?.created_at ?? null,
        diaryEntriesCount: diary.length,
        moodCheckinsList: moodCheckins,
        tasksList: tasks,
        diaryList: diary,
      },
    };
  } catch (err: unknown) {
    logSafeError("[getPatientEngagement] Exception", err);
    return { success: false, error: "Erro ao buscar dados." };
  }
}
