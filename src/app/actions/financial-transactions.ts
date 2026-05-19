"use server";

import { revalidatePath } from "next/cache";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import { createClient } from "@/lib/supabase/server";
import { hasOnlyAllowedKeys, isPlainObject, isValidIsoDate, isValidUuid } from "@/lib/validation/input";
import {
  canCancelCashFlow,
  canConfirmCashFlowPayment,
  isManualPaymentMethod,
  type ManualPaymentMethod,
} from "@/services/financial-transaction-rules";
import type { CashFlow } from "@/types/database";

const GENERIC_FINANCIAL_ERROR = safeClientError("Não foi possível atualizar o lançamento financeiro.");
const CONFIRM_ALLOWED_KEYS = ["payment_method", "paid_at"] as const;

export interface ConfirmCashFlowPaymentPayload {
  payment_method: ManualPaymentMethod;
  paid_at?: string | null;
}

export interface FinancialTransactionActionResult<T = CashFlow> {
  success: boolean;
  data?: T;
  error?: string;
}

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || user.user_metadata?.user_type === "patient") {
    return { supabase, error: "Sessão profissional inválida." };
  }

  return { supabase, error: null };
}

function normalizePaidAt(value: string | null | undefined): { value?: string; error?: string } {
  if (!value) return { value: new Date().toISOString() };

  const trimmed = value.trim();
  if (!isValidIsoDate(trimmed)) {
    return { error: "Data de pagamento inválida." };
  }

  return { value: new Date(`${trimmed}T12:00:00.000Z`).toISOString() };
}

function getTransitionError(transaction: CashFlow, action: "confirm" | "cancel"): string | null {
  if (action === "confirm") {
    if (transaction.status === "cancelled") return "Lançamento cancelado não pode receber baixa.";
    if (transaction.status === "confirmed") return "Pagamento já registrado.";
    if (transaction.type !== "income") return "Apenas cobranças de receita podem receber baixa manual.";
    if (!canConfirmCashFlowPayment(transaction)) return "Este lançamento não pode receber baixa manual.";
    return null;
  }

  if (transaction.status === "confirmed") return "Lançamento confirmado não pode ser cancelado nesta fase.";
  if (transaction.status === "cancelled") return "Lançamento já está cancelado.";
  if (!canCancelCashFlow(transaction)) return "Apenas lançamentos pendentes podem ser cancelados.";
  return null;
}

function revalidateFinancialPaths(transaction: Pick<CashFlow, "patient_id"> | null | undefined): void {
  revalidatePath("/dashboard/finances");
  if (transaction?.patient_id) {
    revalidatePath(`/dashboard/patients/${transaction.patient_id}`);
  }
}

export async function confirmCashFlowPayment(
  cashFlowId: string,
  payload: ConfirmCashFlowPaymentPayload
): Promise<FinancialTransactionActionResult> {
  if (!isValidUuid(cashFlowId)) {
    return { success: false, error: "Lançamento financeiro inválido." };
  }

  if (!isPlainObject(payload as unknown as Record<string, unknown>)) {
    return { success: false, error: "Dados de pagamento inválidos." };
  }

  const rawPayload = payload as unknown as Record<string, unknown>;
  if (!hasOnlyAllowedKeys(rawPayload, [...CONFIRM_ALLOWED_KEYS])) {
    return { success: false, error: "Dados de pagamento contêm campos inválidos." };
  }

  const method = typeof payload.payment_method === "string" ? payload.payment_method.trim() : "";
  if (!isManualPaymentMethod(method)) {
    return { success: false, error: "Método de pagamento inválido." };
  }

  const paidAt = normalizePaidAt(payload.paid_at);
  if (paidAt.error || !paidAt.value) {
    return { success: false, error: paidAt.error || "Data de pagamento inválida." };
  }

  try {
    const { supabase, error: authError } = await getAuthenticatedClient();
    if (authError) return { success: false, error: authError };

    const { data: transaction, error: loadError } = await supabase
      .from("cash_flow")
      .select("*")
      .eq("id", cashFlowId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!transaction) return { success: false, error: "Lançamento financeiro não encontrado." };

    const transitionError = getTransitionError(transaction, "confirm");
    if (transitionError) return { success: false, error: transitionError };

    const { data, error } = await supabase
      .from("cash_flow")
      .update({
        status: "confirmed",
        paid_at: paidAt.value,
        payment_method: method,
      })
      .eq("id", cashFlowId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return { success: false, error: "Lançamento financeiro já foi atualizado." };

    revalidateFinancialPaths(data);
    return { success: true, data };
  } catch (err: unknown) {
    logSafeError("[confirmCashFlowPayment] Exception", err, { cashFlowId });
    return { success: false, error: GENERIC_FINANCIAL_ERROR };
  }
}

export async function cancelPendingCashFlow(
  cashFlowId: string
): Promise<FinancialTransactionActionResult> {
  if (!isValidUuid(cashFlowId)) {
    return { success: false, error: "Lançamento financeiro inválido." };
  }

  try {
    const { supabase, error: authError } = await getAuthenticatedClient();
    if (authError) return { success: false, error: authError };

    const { data: transaction, error: loadError } = await supabase
      .from("cash_flow")
      .select("*")
      .eq("id", cashFlowId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!transaction) return { success: false, error: "Lançamento financeiro não encontrado." };

    const transitionError = getTransitionError(transaction, "cancel");
    if (transitionError) return { success: false, error: transitionError };

    const { data, error } = await supabase
      .from("cash_flow")
      .update({ status: "cancelled" })
      .eq("id", cashFlowId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return { success: false, error: "Lançamento financeiro já foi atualizado." };

    revalidateFinancialPaths(data);
    return { success: true, data };
  } catch (err: unknown) {
    logSafeError("[cancelPendingCashFlow] Exception", err, { cashFlowId });
    return { success: false, error: GENERIC_FINANCIAL_ERROR };
  }
}
