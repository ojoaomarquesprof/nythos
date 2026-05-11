"use server";

import { revalidatePath } from "next/cache";
import { getPatientAccessErrorMessage, getPatientAccessState } from "@/lib/auth/patient-access";
import { clearPatientSession, getPatientSessionDetails } from "@/lib/auth/patient-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { EmotionDiary, PatientTask } from "@/types/database";
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

export interface PatientEngagementStats {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  lastEmotion: string | null;
  lastEmotionIntensity: number | null;
  lastEmotionDate: string | null;
  diaryEntriesCount: number;
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
    throw new Error(`INVALID_SESSION: patient_id invalido no cookie: "${session.patientId}"`);
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
  } catch (authErr: any) {
    console.error("[saveDiaryEntry] Auth error:", authErr.message);
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
      .select("id")
      .single();

    if (error) {
      console.error("[saveDiaryEntry] Supabase error:", error);
      return { success: false, error: "Não foi possível salvar o diário agora." };
    }

    revalidatePath("/patient/dashboard");
    return { success: true, id: entry?.id };
  } catch (err: any) {
    console.error("[saveDiaryEntry] Exception:", err);
    return { success: false, error: "Erro inesperado ao salvar." };
  }
}

export async function toggleTaskStatus(
  taskId: string,
  currentStatus: string
): Promise<ToggleTaskResult> {
  let patientId: string;
  try {
    patientId = await requirePatientId();
  } catch (authErr: any) {
    console.error("[toggleTaskStatus] Auth error:", authErr.message);
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
      console.error("[toggleTaskStatus] Supabase error:", error);
      return { success: false, error: "Não foi possível atualizar a tarefa." };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: "Tarefa nao encontrada." };
    }

    revalidatePath("/patient/dashboard");
    return { success: true, newStatus };
  } catch (err: any) {
    console.error("[toggleTaskStatus] Exception:", err);
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

    const [tasksRes, diaryRes] = await Promise.all([
      supabase
        .from("patient_tasks")
        .select("*")
        .eq("patient_id", patientId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false }),
      supabase
        .from("emotion_diary")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
    ]);

    const tasks = tasksRes.data || [];
    const diary = diaryRes.data || [];
    const lastEntry = diary[0] ?? null;
    const completedTasks = tasks.filter((task: any) => task.status === "completed").length;

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
        tasksList: tasks,
        diaryList: diary,
      },
    };
  } catch (err: any) {
    console.error("[getPatientEngagement] Exception:", err);
    return { success: false, error: "Erro ao buscar dados." };
  }
}
