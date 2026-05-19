import { createClient } from "@/lib/supabase/client";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import type { CashFlow, ExternalCalendarEvent, Session } from "@/types/database";
import type { ServiceResponse } from "./types";

const supabase = createClient() as any;
const GENERIC_SERVICE_ERROR = safeClientError("Nao foi possivel concluir a operacao.");
export type FinancialTransaction = CashFlow & {
  patient?: { id: string; full_name: string | null } | null;
  session_package?: { id: string; name: string | null; total_sessions: number | null } | null;
  session?: { id: string; scheduled_at: string | null; billing_mode: string | null } | null;
};
export type TherapistSessionInRange = {
  id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  patient: { full_name?: string } | null;
};
type ExternalCalendarRangeEvent = Pick<ExternalCalendarEvent, "id" | "starts_at" | "ends_at">;
type FinancialEvolutionPoint = {
  month: string;
  monthIndex: number;
  year: number;
  income: number;
  expense: number;
};

export const BillingService = {
  async getSessionsByPatient(patientId: string): Promise<ServiceResponse<Session[]>> {
    try {
      const { data, error } = await supabase.rpc("get_patient_sessions_decrypted", {
        p_patient_id: patientId,
      });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: unknown) {
      logSafeError(`Error in BillingService.getSessionsByPatient(${patientId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async getTherapistSessionsInRange(
    userId: string,
    start: Date,
    end: Date
  ): Promise<ServiceResponse<TherapistSessionInRange[]>> {
    try {
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select("id, scheduled_at, duration_minutes, patient:patients(full_name)")
        .eq("user_id", userId)
        .gte("scheduled_at", start.toISOString())
        .lte("scheduled_at", end.toISOString())
        .not("status", "eq", "cancelled");

      if (sessionsError) throw sessionsError;

      const { data: externalData, error: externalError } = await supabase
        .from("external_calendar_events")
        .select("id, starts_at, ends_at")
        .eq("user_id", userId)
        .lt("starts_at", end.toISOString())
        .gt("ends_at", start.toISOString());

      if (externalError) throw externalError;

      const externalAsSessions = (externalData || []).map((event: ExternalCalendarRangeEvent) => ({
        id: `external:${event.id}`,
        scheduled_at: event.starts_at,
        duration_minutes: Math.max(
          15,
          Math.round((new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60000) || 50
        ),
        patient: null,
      }));

      return { data: [...(sessionsData || []), ...externalAsSessions], error: null };
    } catch (err: unknown) {
      logSafeError(`Error in BillingService.getTherapistSessionsInRange(${userId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async getCashFlowBySessions(sessionIds: string[]): Promise<ServiceResponse<CashFlow[]>> {
    try {
      const { data, error } = await supabase
        .from("cash_flow")
        .select("*")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: unknown) {
      logSafeError("Error in BillingService.getCashFlowBySessions()", err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async updateSessionStatus(sessionId: string, status: Session["status"]): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ status })
        .eq("id", sessionId);

      if (error) throw error;
      return { data: true, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in BillingService.updateSessionStatus(${sessionId})`, err);
      return { data: false, error: GENERIC_SERVICE_ERROR };
    }
  },

  async updateSessionEvolution(
    sessionId: string,
    notes: string,
    moodHappy: number,
    moodAnxious: number
  ): Promise<ServiceResponse<Session>> {
    try {
      const { data, error } = await supabase.rpc("update_session_evolution_secure", {
        p_session_id: sessionId,
        p_notes: notes,
        p_mood_happy_sad: moodHappy,
        p_mood_anxious_calm: moodAnxious,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in BillingService.updateSessionEvolution(${sessionId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async checkRescheduleConflicts(
    userId: string,
    sessionId: string,
    scheduledAt: Date,
    durationMinutes: number
  ): Promise<ServiceResponse<boolean>> {
    try {
      const startRange = new Date(scheduledAt.getTime() - 4 * 60 * 60 * 1000).toISOString();
      const endRange = new Date(scheduledAt.getTime() + 4 * 60 * 60 * 1000).toISOString();

      const { data: conflicts, error } = await supabase
        .from("sessions")
        .select("id, scheduled_at, duration_minutes")
        .eq("user_id", userId)
        .neq("id", sessionId)
        .gte("scheduled_at", startRange)
        .lte("scheduled_at", endRange)
        .not("status", "eq", "cancelled");

      if (error) throw error;

      const hasConflict = conflicts?.some((s: { scheduled_at: string; duration_minutes: number | null }) => {
        const start = new Date(s.scheduled_at);
        const end = new Date(start.getTime() + (s.duration_minutes ?? 50) * 60000);
        const newStart = scheduledAt;
        const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);
        return newStart < end && newEnd > start;
      });

      if (hasConflict) return { data: true, error: null };

      const newStartIso = scheduledAt.toISOString();
      const newEndIso = new Date(scheduledAt.getTime() + durationMinutes * 60000).toISOString();
      const { data: externalConflicts, error: externalConflictError } = await supabase
        .from("external_calendar_events")
        .select("id")
        .eq("user_id", userId)
        .lt("starts_at", newEndIso)
        .gt("ends_at", newStartIso);

      if (externalConflictError) throw externalConflictError;
      return { data: (externalConflicts?.length ?? 0) > 0, error: null };
    } catch (err: unknown) {
      logSafeError("Error in BillingService.checkRescheduleConflicts()", err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async rescheduleSession(sessionId: string, scheduledAt: Date): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase
        .from("sessions")
        .update({
          scheduled_at: scheduledAt.toISOString(),
          status: "scheduled",
        })
        .eq("id", sessionId);

      if (error) throw error;
      return { data: true, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in BillingService.rescheduleSession(${sessionId})`, err);
      return { data: false, error: GENERIC_SERVICE_ERROR };
    }
  },

  async cancelSession(
    sessionId: string,
    recurrenceRule?: string | null,
    scheduledAt?: string | null,
    allFollowing: boolean = false
  ): Promise<ServiceResponse<boolean>> {
    try {
      let query = supabase.from("sessions").update({ status: "cancelled" });

      if (allFollowing && recurrenceRule && scheduledAt) {
        query = query.eq("recurrence_rule", recurrenceRule).gte("scheduled_at", scheduledAt);
      } else {
        query = query.eq("id", sessionId);
      }

      const { error } = await query;
      if (error) throw error;
      return { data: true, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in BillingService.cancelSession(${sessionId})`, err);
      return { data: false, error: GENERIC_SERVICE_ERROR };
    }
  },

  async getTransactions(userId: string): Promise<ServiceResponse<FinancialTransaction[]>> {
    try {
      const { data, error } = await supabase
        .from("cash_flow")
        .select(`
          *,
          patient:patients(id, full_name),
          session_package:session_packages(id, name, total_sessions),
          session:sessions(id, scheduled_at, billing_mode)
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return { data: (data || []) as FinancialTransaction[], error: null };
    } catch (err: unknown) {
      logSafeError("Error in BillingService.getTransactions()", err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async confirmPayment(id: string, method: string): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase
        .from("cash_flow")
        .update({
          status: "confirmed",
          paid_at: new Date().toISOString(),
          payment_method: method,
        })
        .eq("id", id)
        .eq("status", "pending")
        .eq("type", "income");

      if (error) throw error;
      return { data: true, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in BillingService.confirmPayment(${id})`, err);
      return { data: false, error: GENERIC_SERVICE_ERROR };
    }
  },

  async addExpense(expense: {
    user_id: string;
    amount: number;
    description: string;
    category: string;
    notes?: string | null;
  }): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase.from("cash_flow").insert({
        ...expense,
        type: "expense",
        status: "confirmed",
        paid_at: new Date().toISOString(),
      });

      if (error) throw error;
      return { data: true, error: null };
    } catch (err: unknown) {
      logSafeError("Error in BillingService.addExpense()", err);
      return { data: false, error: GENERIC_SERVICE_ERROR };
    }
  },

  async getFinancialEvolution(userId: string): Promise<ServiceResponse<FinancialEvolutionPoint[]>> {
    try {
      const { data, error } = await supabase
        .from("cash_flow")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const last6Months: FinancialEvolutionPoint[] = [];
      const now = new Date();

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = d.toLocaleDateString("pt-BR", { month: "short" });
        const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

        last6Months.push({
          month: capitalizedMonth,
          monthIndex: d.getMonth(),
          year: d.getFullYear(),
          income: 0,
          expense: 0,
        });
      }

      data?.forEach((tx: CashFlow) => {
        const txDate = new Date(tx.due_date || tx.paid_at || tx.created_at || new Date().toISOString());
        const txMonth = txDate.getMonth();
        const txYear = txDate.getFullYear();

        const monthData = last6Months.find((m) => m.monthIndex === txMonth && m.year === txYear);
        if (monthData) {
          const amount = Number(tx.amount) || 0;
          if (tx.type === "income" && tx.status === "confirmed") {
            monthData.income += amount;
          } else if (tx.type === "expense" && tx.status === "confirmed") {
            monthData.expense += amount;
          }
        }
      });

      return { data: last6Months, error: null };
    } catch (err: unknown) {
      logSafeError("Error in BillingService.getFinancialEvolution()", err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async cancelTransaction(id: string): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase
        .from("cash_flow")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("status", "pending");
      if (error) throw error;
      return { data: true, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in BillingService.cancelTransaction(${id})`, err);
      return { data: false, error: GENERIC_SERVICE_ERROR };
    }
  },
};
