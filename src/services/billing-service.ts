import { createClient } from "@/lib/supabase/client";
import type { Session, CashFlow } from "@/types/database";
import type { ServiceResponse } from "./types";

const supabase = createClient() as any;

export const BillingService = {
  async getSessionsByPatient(patientId: string): Promise<ServiceResponse<Session[]>> {
    try {
      const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .eq("patient_id", patientId)
        .order("scheduled_at", { ascending: false });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: any) {
      console.error(`Error in BillingService.getSessionsByPatient(${patientId}):`, err);
      return { data: null, error: err.message || "Erro ao carregar sessões." };
    }
  },

  async getTherapistSessionsInRange(userId: string, start: Date, end: Date): Promise<ServiceResponse<any[]>> {
    try {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, scheduled_at, duration_minutes, patient:patients(full_name)")
        .eq("user_id", userId)
        .gte("scheduled_at", start.toISOString())
        .lte("scheduled_at", end.toISOString())
        .not("status", "eq", "cancelled");

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: any) {
      console.error(`Error in BillingService.getTherapistSessionsInRange(${userId}):`, err);
      return { data: null, error: err.message || "Erro ao carregar agenda do terapeuta." };
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
    } catch (err: any) {
      console.error(`Error in BillingService.getCashFlowBySessions():`, err);
      return { data: null, error: err.message || "Erro ao carregar transações financeiras." };
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
    } catch (err: any) {
      console.error(`Error in BillingService.updateSessionStatus(${sessionId}):`, err);
      return { data: false, error: err.message || "Erro ao atualizar status da sessão." };
    }
  },

  async updateSessionEvolution(
    sessionId: string,
    notes: string,
    moodHappy: number,
    moodAnxious: number
  ): Promise<ServiceResponse<boolean>> {
    try {
      const evolutionData = {
        notes,
        mood_happy_sad: moodHappy,
        mood_anxious_calm: moodAnxious,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from("sessions")
        .update({
          status: "completed",
          session_notes_encrypted: JSON.stringify(evolutionData)
        })
        .eq("id", sessionId);

      if (error) throw error;
      return { data: true, error: null };
    } catch (err: any) {
      console.error(`Error in BillingService.updateSessionEvolution(${sessionId}):`, err);
      return { data: false, error: err.message || "Erro ao salvar evolução da sessão." };
    }
  },

  async checkRescheduleConflicts(
    userId: string,
    sessionId: string,
    scheduledAt: Date,
    durationMinutes: number
  ): Promise<ServiceResponse<boolean>> {
    try {
      // Fetch +/- 4 hours around scheduledAt
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

      const hasConflict = conflicts?.some((s: { scheduled_at: string; duration_minutes: number }) => {
        const start = new Date(s.scheduled_at);
        const end = new Date(start.getTime() + s.duration_minutes * 60000);
        const newStart = scheduledAt;
        const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);
        return (newStart < end && newEnd > start);
      });

      return { data: !!hasConflict, error: null };
    } catch (err: any) {
      console.error(`Error in BillingService.checkRescheduleConflicts():`, err);
      return { data: null, error: err.message || "Erro ao checar conflitos de horários." };
    }
  },

  async rescheduleSession(sessionId: string, scheduledAt: Date): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase
        .from("sessions")
        .update({
          scheduled_at: scheduledAt.toISOString(),
          status: "scheduled"
        })
        .eq("id", sessionId);

      if (error) throw error;
      return { data: true, error: null };
    } catch (err: any) {
      console.error(`Error in BillingService.rescheduleSession(${sessionId}):`, err);
      return { data: false, error: err.message || "Erro ao reagendar sessão." };
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
        query = query
          .eq("recurrence_rule", recurrenceRule)
          .gte("scheduled_at", scheduledAt);
      } else {
        query = query.eq("id", sessionId);
      }

      const { error } = await query;
      if (error) throw error;
      return { data: true, error: null };
    } catch (err: any) {
      console.error(`Error in BillingService.cancelSession(${sessionId}):`, err);
      return { data: false, error: err.message || "Erro ao cancelar sessão." };
    }
  },

  async getTransactions(userId: string): Promise<ServiceResponse<CashFlow[]>> {
    try {
      const { data, error } = await supabase
        .from("cash_flow")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: any) {
      console.error("Error in BillingService.getTransactions:", err);
      return { data: null, error: err.message || "Erro ao carregar transações." };
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
        .eq("id", id);

      if (error) throw error;
      return { data: true, error: null };
    } catch (err: any) {
      console.error(`Error in BillingService.confirmPayment(${id}):`, err);
      return { data: false, error: err.message || "Erro ao confirmar pagamento." };
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
    } catch (err: any) {
      console.error("Error in BillingService.addExpense:", err);
      return { data: false, error: err.message || "Erro ao registrar despesa." };
    }
  },

  async getFinancialEvolution(userId: string): Promise<ServiceResponse<any[]>> {
    try {
      const { data, error } = await supabase
        .from("cash_flow")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const last6Months: any[] = [];
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

      data?.forEach((tx: any) => {
        const txDate = new Date(tx.due_date || tx.paid_at || tx.created_at);
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
    } catch (err: any) {
      console.error("Error in BillingService.getFinancialEvolution:", err);
      return { data: null, error: err.message || "Erro ao carregar evolução financeira." };
    }
  },

  async deleteTransaction(id: string): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase
        .from("cash_flow")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { data: true, error: null };
    } catch (err: any) {
      console.error(`Error in BillingService.deleteTransaction(${id}):`, err);
      return { data: false, error: err.message || "Erro ao excluir transação." };
    }
  }
};
