"use server";

import { revalidatePath } from "next/cache";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/audit-events";
import { recordAuditEvent } from "@/lib/audit/server";
import { createClient } from "@/lib/supabase/server";
import {
  hasOnlyAllowedKeys,
  isPlainObject,
  isValidIsoDate,
  isValidUuid,
  toFiniteNumber,
  toInteger,
} from "@/lib/validation/input";
import {
  calculateSessionPackageReservableSessions,
  calculateSessionPackageReservedSessions,
  calculateSessionPackageUnitAmount,
  isManageableSessionPackageStatus,
} from "@/services/session-package-rules";
import type { Json, SessionPackageManageStatus, SessionPackageWithBalance } from "@/types/database";

const GENERIC_PACKAGE_ERROR = safeClientError("Nao foi possivel concluir a operacao do pacote.");
const CREATE_ALLOWED_KEYS = [
  "patient_id",
  "name",
  "total_sessions",
  "total_amount",
  "start_date",
  "expires_at",
  "guardian_id",
  "allow_use_before_payment",
] as const;
const UPDATE_ALLOWED_KEYS = [
  "name",
  "total_sessions",
  "total_amount",
  "expires_at",
  "guardian_id",
  "allow_use_before_payment",
] as const;

export interface CreateSessionPackagePayload {
  patient_id: string;
  name: string;
  total_sessions: number;
  total_amount: number;
  start_date?: string | null;
  expires_at?: string | null;
  guardian_id?: string | null;
  allow_use_before_payment?: boolean;
}

export interface UpdateSessionPackagePayload {
  name?: string;
  total_sessions?: number;
  total_amount?: number;
  expires_at?: string | null;
  guardian_id?: string | null;
  allow_use_before_payment?: boolean;
}

export interface SessionPackageActionResult<T = SessionPackageWithBalance> {
  success: boolean;
  data?: T;
  error?: string;
}

function getRpcErrorMessage(error: unknown): string {
  const message = typeof error === "object" && error !== null && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : "";

  if (message.includes("not_authorized")) return "Voce nao tem permissao para gerenciar este pacote.";
  if (message.includes("invalid_package_name")) return "Informe um nome valido para o pacote.";
  if (message.includes("invalid_total_sessions")) return "A quantidade de sessoes deve ser um inteiro maior que zero.";
  if (message.includes("invalid_total_amount")) return "O valor total do pacote deve ser maior que zero.";
  if (message.includes("invalid_package_dates")) return "A validade do pacote deve ser posterior ao inicio.";
  if (message.includes("invalid_guardian")) return "Responsavel financeiro invalido para este paciente.";
  if (message.includes("total_sessions_below_usage")) {
    return "Nao e possivel reduzir o pacote abaixo das sessoes ja usadas.";
  }
  if (message.includes("package_billing_locked")) {
    return "Nao e possivel alterar o valor de um pacote com cobranca ja baixada ou cancelada.";
  }
  if (message.includes("package_billing_not_found")) return "A cobranca principal do pacote nao foi encontrada.";
  if (message.includes("cancelled_package_cannot_reactivate")) {
    return "Pacotes cancelados nao podem ser reativados.";
  }
  if (message.includes("invalid_package_status")) return "Status de pacote invalido.";

  return GENERIC_PACKAGE_ERROR;
}

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || user.user_metadata?.user_type === "patient") {
    return { supabase, user: null, error: "Sessao profissional invalida." };
  }

  return { supabase, user, error: null };
}

function normalizeDate(value: string | null | undefined, fieldName: string): { value?: string | null; error?: string } {
  if (value === undefined) return {};
  if (value === null) return { value: null };
  if (!isValidIsoDate(value)) return { error: `${fieldName} invalida.` };
  return { value };
}

function normalizeGuardianId(value: string | null | undefined): { value?: string | null; error?: string } {
  if (value === undefined) return {};
  if (value === null) return { value: null };
  if (!isValidUuid(value)) return { error: "Responsavel financeiro invalido." };
  return { value };
}

function castPackage(data: Json | null): SessionPackageWithBalance | null {
  if (!data || !isPlainObject(data)) return null;
  return data as unknown as SessionPackageWithBalance;
}

function castPackageList(data: Json | null): SessionPackageWithBalance[] {
  if (!Array.isArray(data)) return [];
  return data as unknown as SessionPackageWithBalance[];
}

async function addReservableBalances(
  supabase: Awaited<ReturnType<typeof createClient>>,
  packages: SessionPackageWithBalance[]
): Promise<SessionPackageWithBalance[]> {
  const packageIds = packages.map((sessionPackage) => sessionPackage.id).filter(Boolean);
  if (packageIds.length === 0) return packages;

  const [sessionRows, usageRows] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, package_id, status")
      .in("package_id", packageIds)
      .eq("billing_mode", "package")
      .neq("status", "cancelled"),
    supabase
      .from("session_package_usages")
      .select("package_id, session_id")
      .in("package_id", packageIds)
      .eq("status", "active")
      .not("session_id", "is", null),
  ]);

  if (sessionRows.error || usageRows.error) {
    logSafeError("[addReservableBalances] Failed to load package reservations", sessionRows.error || usageRows.error);
    return packages.map((sessionPackage) => ({
      ...sessionPackage,
      reserved_sessions: 0,
      reservable_sessions: sessionPackage.remaining_sessions,
    }));
  }

  const activeUsageSessionIdsByPackage = new Map<string, string[]>();
  for (const usage of usageRows.data ?? []) {
    if (!usage.package_id || !usage.session_id) continue;
    const existing = activeUsageSessionIdsByPackage.get(usage.package_id) ?? [];
    existing.push(usage.session_id);
    activeUsageSessionIdsByPackage.set(usage.package_id, existing);
  }

  const sessionsByPackage = new Map<string, Array<{ id: string | null; status: string | null }>>();
  for (const session of sessionRows.data ?? []) {
    if (!session.package_id) continue;
    const existing = sessionsByPackage.get(session.package_id) ?? [];
    existing.push({ id: session.id, status: session.status });
    sessionsByPackage.set(session.package_id, existing);
  }

  return packages.map((sessionPackage) => {
    const reservedSessions = calculateSessionPackageReservedSessions(
      sessionsByPackage.get(sessionPackage.id) ?? [],
      activeUsageSessionIdsByPackage.get(sessionPackage.id) ?? []
    );
    const reservableSessions = calculateSessionPackageReservableSessions(
      sessionPackage.total_sessions,
      sessionPackage.used_sessions,
      reservedSessions
    );

    return {
      ...sessionPackage,
      reserved_sessions: reservedSessions,
      reservable_sessions: reservableSessions,
    };
  });
}

function revalidatePackagePaths(patientId: string | null | undefined): void {
  if (patientId) {
    revalidatePath(`/dashboard/patients/${patientId}`);
  }
  revalidatePath("/dashboard/finances");
}

export async function createSessionPackage(
  payload: CreateSessionPackagePayload
): Promise<SessionPackageActionResult> {
  if (!isPlainObject(payload as unknown as Record<string, unknown>)) {
    return { success: false, error: "Dados do pacote invalidos." };
  }

  if (!hasOnlyAllowedKeys(payload as unknown as Record<string, unknown>, [...CREATE_ALLOWED_KEYS])) {
    return { success: false, error: "Dados do pacote contem campos invalidos." };
  }

  if (!isValidUuid(payload.patient_id)) {
    return { success: false, error: "Paciente invalido." };
  }

  const name = String(payload.name ?? "").trim();
  if (!name) {
    return { success: false, error: "Informe um nome para o pacote." };
  }

  const totalSessions = toInteger(payload.total_sessions);
  if (totalSessions === null || totalSessions <= 0) {
    return { success: false, error: "A quantidade de sessoes deve ser maior que zero." };
  }

  const totalAmount = toFiniteNumber(payload.total_amount);
  if (totalAmount === null || totalAmount <= 0) {
    return { success: false, error: "O valor total do pacote deve ser maior que zero." };
  }

  try {
    calculateSessionPackageUnitAmount(totalAmount, totalSessions);
  } catch {
    return { success: false, error: "Dados financeiros do pacote invalidos." };
  }

  const startDate = normalizeDate(payload.start_date, "Data de inicio");
  if (startDate.error) return { success: false, error: startDate.error };

  const expiresAt = normalizeDate(payload.expires_at, "Validade");
  if (expiresAt.error) return { success: false, error: expiresAt.error };

  const guardianId = normalizeGuardianId(payload.guardian_id);
  if (guardianId.error) return { success: false, error: guardianId.error };

  if (
    payload.allow_use_before_payment !== undefined
    && typeof payload.allow_use_before_payment !== "boolean"
  ) {
    return { success: false, error: "Permissao de uso antes do pagamento invalida." };
  }

  try {
    const { supabase, user, error: authError } = await getAuthenticatedClient();
    if (authError) return { success: false, error: authError };

    const { data, error } = await supabase.rpc("create_session_package_with_billing", {
      p_patient_id: payload.patient_id,
      p_name: name,
      p_total_sessions: totalSessions,
      p_total_amount: totalAmount,
      p_start_date: startDate.value ?? null,
      p_expires_at: expiresAt.value ?? null,
      p_guardian_id: guardianId.value ?? null,
      p_allow_use_before_payment: payload.allow_use_before_payment ?? true,
    });

    if (error) {
      logSafeError("[createSessionPackage] RPC error", error);
      return { success: false, error: getRpcErrorMessage(error) };
    }

    const sessionPackage = castPackage(data);
    if (!sessionPackage) return { success: false, error: GENERIC_PACKAGE_ERROR };

    await recordAuditEvent({
      actorId: user?.id ?? null,
      action: AUDIT_ACTIONS.CREATE_SESSION_PACKAGE,
      entityType: AUDIT_ENTITY_TYPES.SESSION_PACKAGE,
      entityId: sessionPackage.id,
      patientId: sessionPackage.patient_id,
      packageId: sessionPackage.id,
      cashFlowId: sessionPackage.cash_flow_id,
      metadata: {
        total_sessions: sessionPackage.total_sessions,
        total_amount: sessionPackage.total_amount,
        payment_status: sessionPackage.payment_status,
        cash_flow_status: sessionPackage.cash_flow_status,
        allow_use_before_payment: sessionPackage.allow_use_before_payment,
      },
    });

    revalidatePackagePaths(sessionPackage.patient_id);
    return { success: true, data: sessionPackage };
  } catch (err: unknown) {
    logSafeError("[createSessionPackage] Exception", err);
    return { success: false, error: GENERIC_PACKAGE_ERROR };
  }
}

export async function listPatientSessionPackages(
  patientId: string
): Promise<SessionPackageActionResult<SessionPackageWithBalance[]>> {
  if (!isValidUuid(patientId)) {
    return { success: false, error: "Paciente invalido." };
  }

  try {
    const { supabase, error: authError } = await getAuthenticatedClient();
    if (authError) return { success: false, error: authError };

    const { data, error } = await supabase.rpc("get_patient_session_packages", {
      p_patient_id: patientId,
    });

    if (error) {
      logSafeError("[listPatientSessionPackages] RPC error", error);
      return { success: false, error: getRpcErrorMessage(error) };
    }

    const packages = await addReservableBalances(supabase, castPackageList(data));
    return { success: true, data: packages };
  } catch (err: unknown) {
    logSafeError("[listPatientSessionPackages] Exception", err);
    return { success: false, error: GENERIC_PACKAGE_ERROR };
  }
}

export async function updateSessionPackage(
  packageId: string,
  patch: UpdateSessionPackagePayload
): Promise<SessionPackageActionResult> {
  if (!isValidUuid(packageId)) {
    return { success: false, error: "Pacote invalido." };
  }

  if (!isPlainObject(patch as unknown as Record<string, unknown>)) {
    return { success: false, error: "Dados do pacote invalidos." };
  }

  const rawPatch = patch as unknown as Record<string, unknown>;
  if (!hasOnlyAllowedKeys(rawPatch, [...UPDATE_ALLOWED_KEYS])) {
    return { success: false, error: "Dados do pacote contem campos invalidos." };
  }

  const rpcPatch: Record<string, Json> = {};

  if ("name" in rawPatch) {
    const name = String(patch.name ?? "").trim();
    if (!name) return { success: false, error: "Informe um nome valido para o pacote." };
    rpcPatch.name = name;
  }

  if ("total_sessions" in rawPatch) {
    const totalSessions = toInteger(patch.total_sessions);
    if (totalSessions === null || totalSessions <= 0) {
      return { success: false, error: "A quantidade de sessoes deve ser maior que zero." };
    }
    rpcPatch.total_sessions = totalSessions;
  }

  if ("total_amount" in rawPatch) {
    const totalAmount = toFiniteNumber(patch.total_amount);
    if (totalAmount === null || totalAmount <= 0) {
      return { success: false, error: "O valor total do pacote deve ser maior que zero." };
    }
    rpcPatch.total_amount = totalAmount;
  }

  if ("expires_at" in rawPatch) {
    const expiresAt = normalizeDate(patch.expires_at, "Validade");
    if (expiresAt.error) return { success: false, error: expiresAt.error };
    rpcPatch.expires_at = expiresAt.value ?? null;
  }

  if ("guardian_id" in rawPatch) {
    const guardianId = normalizeGuardianId(patch.guardian_id);
    if (guardianId.error) return { success: false, error: guardianId.error };
    rpcPatch.guardian_id = guardianId.value ?? null;
  }

  if ("allow_use_before_payment" in rawPatch) {
    if (typeof patch.allow_use_before_payment !== "boolean") {
      return { success: false, error: "Permissao de uso antes do pagamento invalida." };
    }
    rpcPatch.allow_use_before_payment = Boolean(patch.allow_use_before_payment);
  }

  if (Object.keys(rpcPatch).length === 0) {
    return { success: false, error: "Informe ao menos um campo para atualizar." };
  }

  try {
    const { supabase, error: authError } = await getAuthenticatedClient();
    if (authError) return { success: false, error: authError };

    const { data, error } = await supabase.rpc("update_session_package_secure", {
      p_package_id: packageId,
      p_patch: rpcPatch,
    });

    if (error) {
      logSafeError("[updateSessionPackage] RPC error", error);
      return { success: false, error: getRpcErrorMessage(error) };
    }

    const sessionPackage = castPackage(data);
    if (!sessionPackage) return { success: false, error: GENERIC_PACKAGE_ERROR };

    revalidatePackagePaths(sessionPackage.patient_id);
    return { success: true, data: sessionPackage };
  } catch (err: unknown) {
    logSafeError("[updateSessionPackage] Exception", err);
    return { success: false, error: GENERIC_PACKAGE_ERROR };
  }
}

export async function setSessionPackageStatus(
  packageId: string,
  status: SessionPackageManageStatus
): Promise<SessionPackageActionResult> {
  if (!isValidUuid(packageId)) {
    return { success: false, error: "Pacote invalido." };
  }

  if (!isManageableSessionPackageStatus(status)) {
    return { success: false, error: "Status de pacote invalido." };
  }

  try {
    const { supabase, user, error: authError } = await getAuthenticatedClient();
    if (authError) return { success: false, error: authError };

    const { data, error } = await supabase.rpc("set_session_package_status_secure", {
      p_package_id: packageId,
      p_status: status,
    });

    if (error) {
      logSafeError("[setSessionPackageStatus] RPC error", error);
      return { success: false, error: getRpcErrorMessage(error) };
    }

    const sessionPackage = castPackage(data);
    if (!sessionPackage) return { success: false, error: GENERIC_PACKAGE_ERROR };

    await recordAuditEvent({
      actorId: user?.id ?? null,
      action: AUDIT_ACTIONS.SET_SESSION_PACKAGE_STATUS,
      entityType: AUDIT_ENTITY_TYPES.SESSION_PACKAGE,
      entityId: sessionPackage.id,
      patientId: sessionPackage.patient_id,
      packageId: sessionPackage.id,
      cashFlowId: sessionPackage.cash_flow_id,
      metadata: {
        requested_status: status,
        resulting_status: sessionPackage.status,
        payment_status: sessionPackage.payment_status,
        cash_flow_status: sessionPackage.cash_flow_status,
        warning: sessionPackage.warning ?? null,
      },
    });

    revalidatePackagePaths(sessionPackage.patient_id);
    return { success: true, data: sessionPackage };
  } catch (err: unknown) {
    logSafeError("[setSessionPackageStatus] Exception", err);
    return { success: false, error: GENERIC_PACKAGE_ERROR };
  }
}

export async function pauseSessionPackage(packageId: string): Promise<SessionPackageActionResult> {
  return setSessionPackageStatus(packageId, "paused");
}

export async function reactivateSessionPackage(packageId: string): Promise<SessionPackageActionResult> {
  return setSessionPackageStatus(packageId, "active");
}

export async function cancelSessionPackage(packageId: string): Promise<SessionPackageActionResult> {
  return setSessionPackageStatus(packageId, "cancelled");
}
