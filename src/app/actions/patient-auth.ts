"use server";

import { redirect } from "next/navigation";
import {
  getPatientAccessErrorMessage,
  getPatientAccessState,
} from "@/lib/auth/patient-access";
import { clearPatientSession, createPatientSession } from "@/lib/auth/patient-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSafeError } from "@/lib/errors/safe-error";
import { isValidIsoDate, isValidPublicToken } from "@/lib/validation/input";

export interface VerifyTokenResult {
  success: boolean;
  firstName?: string;
  error?: string;
}

export interface ValidateResult {
  success: boolean;
  error?: string;
}

const PATIENT_ACCESS_SELECT =
  "id, full_name, date_of_birth, status, access_token_issued_at, access_token_expires_at, access_token_revoked_at";

/**
 * Verifies that the public patient token is still active and, when valid,
 * returns the patient's first name for the greeting on /p/[token].
 */
export async function getPatientByToken(token: string): Promise<VerifyTokenResult> {
  if (!isValidPublicToken(token)) {
    return { success: false, error: "Link de acesso invalido." };
  }

  try {
    // service_role is needed for public token lookup before a Supabase auth session exists.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("patients")
      .select(PATIENT_ACCESS_SELECT)
      .eq("access_token", token.trim())
      .maybeSingle();

    if (error || !data) {
      return { success: false, error: getPatientAccessErrorMessage("not_found", "lookup") };
    }

    const accessState = getPatientAccessState(data);
    if (accessState !== "active") {
      return { success: false, error: getPatientAccessErrorMessage(accessState, "lookup") };
    }

    const firstName = String(data.full_name ?? "").trim().split(" ")[0];
    return { success: true, firstName: firstName || undefined };
  } catch (err: unknown) {
    logSafeError("getPatientByToken", err);
    return { success: false, error: "Erro ao verificar link. Tente novamente." };
  }
}

/**
 * Validates the patient token plus date of birth and then creates the HMAC
 * session cookie consumed by /patient/dashboard.
 */
export async function verifyPatientToken(
  token: string,
  dateOfBirth: string
): Promise<ValidateResult> {
  if (!token || !dateOfBirth) {
    return { success: false, error: "Preencha todos os campos." };
  }

  if (!isValidPublicToken(token) || !isValidIsoDate(dateOfBirth)) {
    return { success: false, error: "Dados de acesso invalidos." };
  }

  try {
    // service_role is needed for public token + DOB verification before a Supabase auth session exists.
    const admin = createAdminClient();
    const { data: patient, error } = await admin
      .from("patients")
      .select(PATIENT_ACCESS_SELECT)
      .eq("access_token", token.trim())
      .maybeSingle();

    if (error || !patient) {
      return { success: false, error: getPatientAccessErrorMessage("not_found", "verify") };
    }

    const accessState = getPatientAccessState(patient);
    if (accessState !== "active") {
      return { success: false, error: getPatientAccessErrorMessage(accessState, "verify") };
    }

    if (!patient.date_of_birth) {
      return { success: false, error: "Dados de acesso invalidos." };
    }

    const stored = String(patient.date_of_birth).slice(0, 10);
    const provided = dateOfBirth.trim();

    if (stored !== provided) {
      return { success: false, error: "Dados de acesso invalidos." };
    }

    await admin
      .from("patients")
      .update({ access_token_last_used_at: new Date().toISOString() })
      .eq("id", patient.id);

    await createPatientSession(patient.id);
  } catch (err: unknown) {
    logSafeError("verifyPatientToken", err);
    return { success: false, error: "Erro interno. Tente novamente em instantes." };
  }

  redirect("/patient/dashboard");
}

export async function logoutPatient(): Promise<void> {
  await clearPatientSession();
  redirect("/patient/login");
}
