"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPatientSession } from "@/lib/auth/patient-session";
import { clearPatientSession } from "@/lib/auth/patient-session";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerifyTokenResult {
  success: boolean;
  firstName?: string;
  error?: string;
}

export interface ValidateResult {
  success: boolean;
  error?: string;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Verifica se o token é válido e retorna o primeiro nome do paciente.
 * Chamado ao carregar a página /p/[token] para exibir uma saudação.
 */
export async function getPatientByToken(token: string): Promise<VerifyTokenResult> {
  if (!token || token.length < 8) {
    return { success: false, error: "Link de acesso inválido." };
  }

  try {
    const admin = createAdminClient() as any;
    const { data, error } = await admin
      .from("patients")
      .select("id, full_name, status")
      .eq("access_token", token.trim())
      .single();

    if (error || !data) {
      return { success: false, error: "Link de acesso não encontrado ou expirado." };
    }

    if (data.status === "archived") {
      return { success: false, error: "Este link foi desativado. Entre em contato com seu terapeuta." };
    }

    const firstName = (data.full_name as string).split(" ")[0];
    return { success: true, firstName };
  } catch (err: any) {
    console.error("getPatientByToken:", err);
    return { success: false, error: "Erro ao verificar link. Tente novamente." };
  }
}

/**
 * Valida o token + data de nascimento.
 * Se corretos, cria o cookie de sessão e redireciona para o dashboard.
 * Se inválidos, retorna mensagem de erro sem criar sessão.
 */
export async function verifyPatientToken(
  token: string,
  dateOfBirth: string // formato YYYY-MM-DD
): Promise<ValidateResult> {
  if (!token || !dateOfBirth) {
    return { success: false, error: "Preencha todos os campos." };
  }

  // Validação básica do formato da data
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return { success: false, error: "Formato de data inválido." };
  }

  try {
    const admin = createAdminClient() as any;

    const { data: patient, error } = await admin
      .from("patients")
      .select("id, date_of_birth, status")
      .eq("access_token", token.trim())
      .single();

    if (error || !patient) {
      return { success: false, error: "Link de acesso não encontrado." };
    }

    if (patient.status === "archived") {
      return { success: false, error: "Este link foi desativado." };
    }

    if (!patient.date_of_birth) {
      return {
        success: false,
        error: "Data de nascimento não cadastrada. Contate seu terapeuta.",
      };
    }

    // Comparação segura: apenas a parte YYYY-MM-DD
    const stored = (patient.date_of_birth as string).slice(0, 10);
    const provided = dateOfBirth.trim();

    if (stored !== provided) {
      return { success: false, error: "Data de nascimento incorreta. Verifique e tente novamente." };
    }

    // Tudo certo — cria sessão e redireciona
    await createPatientSession(patient.id);
  } catch (err: any) {
    console.error("verifyPatientToken:", err);
    return { success: false, error: "Erro interno. Tente novamente em instantes." };
  }

  // redirect() deve ser chamado fora do try/catch
  redirect("/patient/dashboard");
}

/**
 * Logout do paciente: remove o cookie e redireciona.
 */
export async function logoutPatient(): Promise<void> {
  await clearPatientSession();
  redirect("/patient/login");
}
