"use server";

import { revalidatePath } from "next/cache";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import { recordGeneralNoteAppended, recordSessionEvolutionSaved } from "@/lib/audit/server";
import { createClient } from "@/lib/supabase/server";
import {
  hasOnlyAllowedKeys,
  isPlainObject,
  isValidUuid,
  toInteger,
} from "@/lib/validation/input";
import type { Patient, Session } from "@/types/database";

const GENERIC_ACTION_ERROR = safeClientError("Nao foi possivel concluir a operacao.");

type ServiceActionResponse<T> = {
  data: T | null;
  error: string | null;
};

type SaveSessionEvolutionPayload = {
  sessionId: string;
  notes: string;
  moodHappy: number;
  moodAnxious: number;
  source?: "schedule" | "patient";
};

type AppendGeneralNotePayload = {
  patientId: string;
  note: string;
  source?: "schedule" | "patient";
};

const ALLOWED_SAVE_SESSION_EVOLUTION_KEYS = [
  "sessionId",
  "notes",
  "moodHappy",
  "moodAnxious",
  "source",
] as const;
const ALLOWED_APPEND_GENERAL_NOTE_KEYS = ["patientId", "note", "source"] as const;

function lengthBucket(value: string): "short" | "medium" | "long" {
  if (value.length <= 500) return "short";
  if (value.length <= 2000) return "medium";
  return "long";
}

function parseSaveSessionEvolutionPayload(
  payload: SaveSessionEvolutionPayload
): {
  ok: true;
  sessionId: string;
  notes: string;
  moodHappy: number;
  moodAnxious: number;
  source: "schedule" | "patient";
} | { ok: false; error: string } {
  if (!isPlainObject(payload) || !hasOnlyAllowedKeys(payload, ALLOWED_SAVE_SESSION_EVOLUTION_KEYS)) {
    return { ok: false, error: "Payload inválido para evolução." };
  }

  if (!isValidUuid(payload.sessionId)) {
    return { ok: false, error: "Sessão inválida." };
  }

  const notes = String(payload.notes ?? "").trim();
  if (!notes) {
    return { ok: false, error: "Registre a evolução antes de salvar." };
  }

  const moodHappy = toInteger(payload.moodHappy);
  const moodAnxious = toInteger(payload.moodAnxious);
  if (moodHappy === null || moodAnxious === null) {
    return { ok: false, error: "Escalas inválidas." };
  }

  return {
    ok: true,
    sessionId: payload.sessionId.trim(),
    notes,
    moodHappy,
    moodAnxious,
    source: payload.source === "schedule" ? "schedule" : "patient",
  };
}

function parseAppendGeneralNotePayload(
  payload: AppendGeneralNotePayload
): { ok: true; patientId: string; note: string; source: "schedule" | "patient" } | { ok: false; error: string } {
  if (!isPlainObject(payload) || !hasOnlyAllowedKeys(payload, ALLOWED_APPEND_GENERAL_NOTE_KEYS)) {
    return { ok: false, error: "Payload inválido para nota." };
  }

  if (!isValidUuid(payload.patientId)) {
    return { ok: false, error: "Paciente inválido." };
  }

  const note = String(payload.note ?? "").trim();
  if (!note) {
    return { ok: false, error: "Informe uma nota antes de salvar." };
  }

  return {
    ok: true,
    patientId: payload.patientId.trim(),
    note,
    source: payload.source === "schedule" ? "schedule" : "patient",
  };
}

export async function saveSessionEvolution(
  payload: SaveSessionEvolutionPayload
): Promise<ServiceActionResponse<Session>> {
  try {
    const parsedPayload = parseSaveSessionEvolutionPayload(payload);
    if (!parsedPayload.ok) {
      return { data: null, error: parsedPayload.error };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Sessão inválida." };

    const { data: existingSession, error: existingSessionError } = await supabase
      .from("sessions")
      .select("id, patient_id, session_notes_encrypted, package_id")
      .eq("id", parsedPayload.sessionId)
      .maybeSingle();

    if (existingSessionError) {
      logSafeError("[saveSessionEvolution] Failed to load previous session state", existingSessionError);
    }

    const { data, error } = await supabase.rpc("update_session_evolution_secure", {
      p_session_id: parsedPayload.sessionId,
      p_notes: parsedPayload.notes,
      p_mood_happy_sad: parsedPayload.moodHappy,
      p_mood_anxious_calm: parsedPayload.moodAnxious,
    });

    if (error) throw error;

    const updatedSession = data as Session | null;
    const patientId = existingSession?.patient_id ?? updatedSession?.patient_id ?? null;
    const hadPreviousEvolution = Boolean(existingSession?.session_notes_encrypted);

    if (patientId) {
      revalidatePath(`/dashboard/patients/${patientId}`);
    }
    revalidatePath("/dashboard/schedule");

    await recordSessionEvolutionSaved({
      actorId: user.id,
      sessionId: parsedPayload.sessionId,
      patientId,
      packageId: existingSession?.package_id ?? updatedSession?.package_id ?? null,
      hadPreviousEvolution,
      hasScales: true,
      scaleFields: ["mood_happy_sad", "mood_anxious_calm"],
      source: parsedPayload.source,
    });

    return { data: updatedSession, error: null };
  } catch (err: unknown) {
    logSafeError("[saveSessionEvolution] Unexpected error", err);
    return { data: null, error: GENERIC_ACTION_ERROR };
  }
}

export async function appendGeneralNote(
  payload: AppendGeneralNotePayload
): Promise<ServiceActionResponse<Patient>> {
  try {
    const parsedPayload = parseAppendGeneralNotePayload(payload);
    if (!parsedPayload.ok) {
      return { data: null, error: parsedPayload.error };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Sessão inválida." };

    const { data, error } = await supabase.rpc("append_patient_clinical_note", {
      p_patient_id: parsedPayload.patientId,
      p_note: parsedPayload.note,
    });

    if (error) throw error;

    revalidatePath(`/dashboard/patients/${parsedPayload.patientId}`);

    await recordGeneralNoteAppended({
      actorId: user.id,
      patientId: parsedPayload.patientId,
      source: parsedPayload.source,
      lengthBucket: lengthBucket(parsedPayload.note),
      createdBy: user.id,
    });

    return { data: data as Patient | null, error: null };
  } catch (err: unknown) {
    logSafeError("[appendGeneralNote] Unexpected error", err);
    return { data: null, error: GENERIC_ACTION_ERROR };
  }
}
