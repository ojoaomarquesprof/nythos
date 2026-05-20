"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-events";
import { recordPatientTaskEvent } from "@/lib/audit/server";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TaskCategory =
  | "general"
  | "homework"
  | "reading"
  | "exercise"
  | "reflection"
  | "behavior_tracking"
  | "thought_record"
  | "breathing"
  | "exposure"
  | "other";

export type TaskPriority = "low" | "medium" | "high";
export type TherapistTaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

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

export interface UpdateTaskStatusPayload {
  task_id: string;
  patient_id: string;
  status: TherapistTaskStatus;
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
    await recordPatientTaskEvent({
      actorId: user.id,
      action: AUDIT_ACTIONS.CREATE_PATIENT_TASK,
      patientId: payload.patient_id,
      taskId: task?.id ?? null,
      category: payload.category || "general",
      newStatus: "pending",
      dueDate: payload.due_date || null,
      priority: payload.priority || "medium",
    });

    return { success: true, taskId: task?.id };
  } catch (err: unknown) {
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
  } catch (err: unknown) {
    logSafeError("[deletePatientTask] Exception", err);
    return {
      success: false,
      error: getExpectedTaskErrorMessage(err) || safeClientError("Não foi possível concluir a operação."),
    };
  }
}

export async function updatePatientTaskStatus(
  payload: UpdateTaskStatusPayload
): Promise<TaskActionResult> {
  if (!payload.task_id || !payload.patient_id) {
    return { success: false, error: "Dados da tarefa invÃ¡lidos." };
  }

  if (!["pending", "in_progress", "completed", "cancelled"].includes(payload.status)) {
    return { success: false, error: "Status invÃ¡lido." };
  }

  try {
    const { supabase, user } = await requireTherapist();

    const { data: patientCheck } = await supabase
      .from("patients")
      .select("id")
      .eq("id", payload.patient_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!patientCheck) {
      return { success: false, error: "Acesso negado." };
    }

    const { data: existingTask } = await supabase
      .from("patient_tasks")
      .select("id, status, category, due_date, priority")
      .eq("id", payload.task_id)
      .eq("patient_id", payload.patient_id)
      .maybeSingle();

    const { error: updateErr } = await supabase
      .from("patient_tasks")
      .update({
        status: payload.status,
        completed_at: payload.status === "completed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.task_id)
      .eq("patient_id", payload.patient_id);

    if (updateErr) {
      logSafeError("[updatePatientTaskStatus] Supabase error", updateErr);
      return { success: false, error: safeClientError("NÃ£o foi possÃ­vel concluir a operaÃ§Ã£o.") };
    }

    revalidatePath(`/dashboard/patients/${payload.patient_id}`);
    await recordPatientTaskEvent({
      actorId: user.id,
      action: payload.status === "completed"
        ? AUDIT_ACTIONS.COMPLETE_PATIENT_TASK_BY_THERAPIST
        : payload.status === "cancelled"
          ? AUDIT_ACTIONS.CANCEL_PATIENT_TASK
          : AUDIT_ACTIONS.UPDATE_PATIENT_TASK,
      patientId: payload.patient_id,
      taskId: payload.task_id,
      category: existingTask?.category ?? null,
      oldStatus: existingTask?.status ?? null,
      newStatus: payload.status,
      dueDate: existingTask?.due_date ?? null,
      priority: existingTask?.priority ?? null,
    });

    return { success: true, taskId: payload.task_id };
  } catch (err: unknown) {
    logSafeError("[updatePatientTaskStatus] Exception", err);
    return {
      success: false,
      error: getExpectedTaskErrorMessage(err) || safeClientError("NÃ£o foi possÃ­vel concluir a operaÃ§Ã£o."),
    };
  }
}

