"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TaskCategory =
  | "general"
  | "homework"
  | "reading"
  | "exercise"
  | "reflection"
  | "behavior_tracking";

export type TaskPriority = "low" | "medium" | "high";

export interface CreateTaskPayload {
  patient_id: string;
  title: string;
  description?: string;
  category: TaskCategory;
  priority: TaskPriority;
  due_date?: string; // YYYY-MM-DD
}

export interface TaskActionResult {
  success: boolean;
  taskId?: string;
  error?: string;
}

function getExpectedTaskErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== "object" || !("message" in err)) {
    return null;
  }

  const message = typeof (err as { message?: unknown }).message === "string"
    ? (err as { message: string }).message
    : "";

  if (message.startsWith("UNAUTHORIZED: ")) {
    return message.replace("UNAUTHORIZED: ", "");
  }

  if (message.startsWith("FORBIDDEN: ")) {
    return message.replace("FORBIDDEN: ", "");
  }

  return null;
}

// ─── Helper: resolve terapeuta logado ────────────────────────────────────────

async function requireTherapist() {
  const supabase = (await createClient());
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("UNAUTHORIZED: Sessão do terapeuta inválida.");
  }

  // Bloqueia pacientes tentando chamar esta action
  if (user.user_metadata?.user_type === "patient") {
    throw new Error("FORBIDDEN: Pacientes não podem gerenciar tarefas.");
  }

  return { supabase, user };
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Cria uma nova tarefa para um paciente.
 * RLS garante que o terapeuta só consegue criar tarefas para seus pacientes.
 */
export async function createPatientTask(
  payload: CreateTaskPayload
): Promise<TaskActionResult> {
  // Validações básicas
  if (!payload.title?.trim()) {
    return { success: false, error: "O título da tarefa é obrigatório." };
  }
  if (!payload.patient_id) {
    return { success: false, error: "ID do paciente inválido." };
  }

  try {
    const { supabase, user } = await requireTherapist();

    // Confirma que o paciente pertence ao terapeuta (segurança em camada de app)
    const { data: patientCheck } = await supabase
      .from("patients")
      .select("id")
      .eq("id", payload.patient_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!patientCheck) {
      return {
        success: false,
        error: "Paciente não encontrado ou não pertence a você.",
      };
    }


    const { data: task, error: insertErr } = await supabase
      .from("patient_tasks")
      .insert({
        patient_id: payload.patient_id,
        user_id: user.id,           // required field: therapist who created
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        category: payload.category || "general",
        priority: payload.priority || "medium",
        due_date: payload.due_date || null,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertErr) {
      logSafeError("[createPatientTask] Supabase error", insertErr);
      return { success: false, error: safeClientError("Não foi possível concluir a operação.") };
    }

    revalidatePath(`/dashboard/patients/${payload.patient_id}`);
    return { success: true, taskId: task?.id };
  } catch (err: any) {
    logSafeError("[createPatientTask] Exception", err);
    return {
      success: false,
      error: getExpectedTaskErrorMessage(err) || safeClientError("Não foi possível concluir a operação."),
    };
  }
}

/**
 * Exclui uma tarefa de um paciente.
 * RLS garante que o terapeuta só apaga tarefas dos seus pacientes.
 */
export async function deletePatientTask(
  taskId: string,
  patientId: string
): Promise<TaskActionResult> {
  if (!taskId) return { success: false, error: "ID de tarefa inválido." };

  try {
    const { supabase, user } = await requireTherapist();

    // Filtro extra de segurança: paciente deve pertencer ao terapeuta logado
    const { data: patientCheck } = await supabase
      .from("patients")
      .select("id")
      .eq("id", patientId)
      .eq("user_id", user.id)
      .maybeSingle();


    if (!patientCheck) {
      return { success: false, error: "Acesso negado." };
    }

    const { error: deleteErr } = await supabase
      .from("patient_tasks")
      .delete()
      .eq("id", taskId)
      .eq("patient_id", patientId);

    if (deleteErr) {
      logSafeError("[deletePatientTask] Supabase error", deleteErr);
      return { success: false, error: safeClientError("Não foi possível concluir a operação.") };
    }

    revalidatePath(`/dashboard/patients/${patientId}`);
    return { success: true };
  } catch (err: any) {
    logSafeError("[deletePatientTask] Exception", err);
    return {
      success: false,
      error: getExpectedTaskErrorMessage(err) || safeClientError("Não foi possível concluir a operação."),
    };
  }
}

