"use server";

import { revalidatePath } from "next/cache";
import { getPatientSession } from "@/lib/auth/patient-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PatientTask, EmotionDiary } from "@/types/database";

// ─── Tipos ────────────────────────────────────────────────────────────────────

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


// ─── Mapas de Emoções para compatibilidade com CHECK Constraint ─────────────

const EMOTION_MAP: Record<string, string> = {
  feliz: "happy", alegre: "happy", contente: "happy", felizao: "happy", radiante: "happy", animado: "happy",
  triste: "sad", chateado: "sad", chateada: "sad", deprimido: "sad", deprimida: "sad", desanimado: "sad", desanimada: "sad", melancolico: "sad", melancolica: "sad",
  ansioso: "anxious", ansiosa: "anxious", preocupado: "anxious", preocupada: "anxious", nervoso: "anxious", nervosa: "anxious", tenso: "anxious", tensa: "anxious",
  raiva: "angry", irritado: "angry", irritada: "angry", bravo: "angry", brava: "angry", furioso: "angry", furiosa: "angry", comraiva: "angry",
  medo: "fearful", assustado: "fearful", assustada: "fearful", commedo: "fearful", pavor: "fearful",
  surpreso: "surprised", surpresa: "surprised", chocado: "surprised", chocada: "surprised", espantado: "surprised", espantada: "surprised",
  nojo: "disgusted", enojado: "disgusted", enojada: "disgusted", desgostoso: "disgusted", desgostosa: "disgusted",
  calmo: "calm", calma: "calm", tranquilo: "calm", tranquila: "calm", relaxado: "calm", relaxada: "calm", sereno: "calm", serena: "calm", empaz: "calm",
  confuso: "confused", confusa: "confused", perdido: "confused", perdida: "confused", indeciso: "confused", indecisa: "confused",
  esperancoso: "hopeful", esperancosa: "hopeful", otimista: "hopeful", confiante: "hopeful",
  grato: "grateful", grata: "grateful", agradecido: "grateful", agradecida: "grateful", gratidao: "grateful",
  solitario: "lonely", solitaria: "lonely", sozinho: "lonely", sozinha: "lonely", abandonado: "lonely", abandonada: "lonely",
  frustrado: "frustrated", frustrada: "frustrated", impotente: "frustrated",
  sobrecarregado: "overwhelmed", sobrecarregada: "overwhelmed", exausto: "overwhelmed", exausta: "overwhelmed", cansado: "overwhelmed", cansada: "overwhelmed", estressado: "overwhelmed", estressada: "overwhelmed",
  satisfeito: "content", satisfeita: "content",
};

const ALLOWED_EMOTIONS = [
  "happy", "sad", "anxious", "angry", "fearful", "surprised",
  "disgusted", "calm", "confused", "hopeful", "grateful",
  "lonely", "frustrated", "overwhelmed", "content", "other"
];

function normalizeEmotion(input: string): { emotion: string; notesPrefix: string | null } {
  const trimmed = input.trim();
  const normalized = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/\s+/g, ""); // remove espaços

  if (ALLOWED_EMOTIONS.includes(normalized)) {
    return { emotion: normalized, notesPrefix: null };
  }

  const mapped = EMOTION_MAP[normalized];
  if (mapped) {
    return { emotion: mapped, notesPrefix: null };
  }

  return { emotion: "other", notesPrefix: trimmed };
}


// ─── Helper: extrai e valida o patient_id do cookie HMAC ──────────────────────

/**
 * Lê e valida o cookie nythos_patient_session.
 * Retorna o patient_id (UUID) ou lança erro descritivo.
 */
async function requirePatientId(): Promise<string> {
  const patientId = await getPatientSession();

  if (!patientId) {
    throw new Error(
      "UNAUTHORIZED: Cookie de sessão ausente ou inválido. " +
        "Abra o link de acesso novamente."
    );
  }

  // Validação básica de formato UUID
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(patientId)) {
    throw new Error(`INVALID_SESSION: patient_id inválido no cookie: "${patientId}"`);
  }

  return patientId;
}

// ─── Actions do Paciente ─────────────────────────────────────────────────────
// Usam createAdminClient() (service_role) que bypassa o RLS completamente.
// A segurança é garantida em camada de aplicação:
//   1. patientId vem do cookie HMAC assinado — não é controlável pelo cliente
//   2. Todos os INSERTs/UPDATEs forçam patient_id = [cookie] como filtro
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Salva uma nova entrada no diário de emoções.
 *
 * Segurança:
 *   • patient_id é SEMPRE extraído do cookie HTTP-only assinado com HMAC-SHA256
 *   • O cliente nunca controla o campo patient_id — mesmo se manipular o form
 *   • createAdminClient() usa service_role key — bypassa todas as RLS policies
 */
export async function saveDiaryEntry(formData: {
  emotion: string;
  intensity: number;
  context?: string;
  notes?: string;
  triggers?: string;
  coping_strategy?: string;
}): Promise<SaveDiaryResult> {
  // ── 1. Autenticação via cookie ─────────────────────────────────────────────
  let patientId: string;
  try {
    patientId = await requirePatientId();
  } catch (authErr: any) {
    console.error("[saveDiaryEntry] Auth error:", authErr.message);
    return { success: false, error: "Sessão inválida. Abra seu link de acesso." };
  }

  // ── 2. Validação dos dados ─────────────────────────────────────────────────
  const rawEmotion = formData.emotion?.trim();
  if (!rawEmotion) return { success: false, error: "Informe a emoção." };

  const { emotion, notesPrefix } = normalizeEmotion(rawEmotion);
  const intensity = Math.min(10, Math.max(1, Number(formData.intensity) || 5));

  let notes = formData.notes?.trim() || null;
  if (notesPrefix) {
    notes = notes ? `[Sentimento original: ${notesPrefix}] ${notes}` : `Sentimento original: ${notesPrefix}`;
  }

  // ── 3. Insert com admin client (bypassa RLS) ───────────────────────────────
  try {
    // createAdminClient() instancia um novo cliente para cada chamada
    // (evita estado compartilhado entre requisições)
    const admin = createAdminClient();

    const insertPayload = {
      patient_id: patientId,              // ← do cookie, nunca do cliente
      emotion,
      intensity,
      context: formData.context?.trim() || null,
      notes,
      triggers: formData.triggers?.trim() || null,
      coping_strategy: formData.coping_strategy?.trim() || null,
    };


    console.log("[saveDiaryEntry] Inserting for patient:", patientId);

    const { data: entry, error } = await admin
      .from("emotion_diary")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      console.error("[saveDiaryEntry] Supabase error:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return {
        success: false,
        error: `Erro ao salvar: ${error.message}${error.hint ? ` (${error.hint})` : ""}`,
      };
    }

    console.log("[saveDiaryEntry] Success, entry id:", entry?.id);
    revalidatePath("/patient/dashboard");
    return { success: true, id: entry?.id };
  } catch (err: any) {
    console.error("[saveDiaryEntry] Exception:", err);
    return { success: false, error: err?.message || "Erro inesperado ao salvar." };
  }
}

/**
 * Inverte o status de uma tarefa (completed ↔ pending).
 *
 * Segurança:
 *   • patientId do cookie é usado como filtro DUPLO:
 *     .eq("id", taskId)           ← qual tarefa
 *     .eq("patient_id", patientId) ← pertence ao paciente do cookie
 *   • Se a tarefa não pertencer ao paciente, a query afeta 0 linhas (sem erro)
 */
export async function toggleTaskStatus(
  taskId: string,
  currentStatus: string
): Promise<ToggleTaskResult> {
  // ── 1. Autenticação ────────────────────────────────────────────────────────
  let patientId: string;
  try {
    patientId = await requirePatientId();
  } catch (authErr: any) {
    console.error("[toggleTaskStatus] Auth error:", authErr.message);
    return { success: false, error: "Sessão inválida. Abra seu link de acesso." };
  }

  if (!taskId) return { success: false, error: "ID de tarefa inválido." };

  // ── 2. Toggle ──────────────────────────────────────────────────────────────
  const isNowCompleted = currentStatus !== "completed";
  const newStatus = isNowCompleted ? "completed" : "pending";

  try {
    const admin = createAdminClient();

    console.log("[toggleTaskStatus] Updating task:", taskId, "→", newStatus, "for patient:", patientId);

    const { data: updatedRows, error } = await admin
      .from("patient_tasks")
      .update({
        status: newStatus,
        completed_at: isNowCompleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      // Filtro duplo de segurança: ID da tarefa + patient_id do cookie
      .eq("id", taskId)
      .eq("patient_id", patientId)
      .select("id");

    if (error) {
      console.error("[toggleTaskStatus] Supabase error:", {
        code: error.code,
        message: error.message,
        details: error.details,
      });
      return { success: false, error: error.message };
    }

    if (!updatedRows || updatedRows.length === 0) {
      console.warn("[toggleTaskStatus] No rows updated — task not found or wrong patient");
      return { success: false, error: "Tarefa não encontrada." };
    }

    revalidatePath("/patient/dashboard");
    return { success: true, newStatus };
  } catch (err: any) {
    console.error("[toggleTaskStatus] Exception:", err);
    return { success: false, error: err?.message || "Erro ao atualizar tarefa." };
  }
}

// ─── Action do Terapeuta ──────────────────────────────────────────────────────
// Esta action usa Supabase Auth normal (RLS do terapeuta).
// O RLS garante que o terapeuta só vê dados dos seus próprios pacientes.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Busca estatísticas de engajamento de um paciente para o painel do terapeuta.
 */
export async function getPatientEngagement(
  patientId: string
): Promise<EngagementResult> {
  try {
    const supabase = (await createClient());

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Sessão do terapeuta inválida." };

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
    const completedTasks = tasks.filter((t: any) => t.status === "completed").length;

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
    return { success: false, error: err?.message || "Erro ao buscar dados." };
  }
}

