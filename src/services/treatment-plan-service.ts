import { createClient } from "@/lib/supabase/client";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import type {
  PatientTreatmentGoalStatus,
  PatientTreatmentPlan,
  PatientTreatmentPlanStatus,
} from "@/types/database";
import type { ServiceResponse } from "./types";

const supabase = createClient() as any;
const GENERIC_SERVICE_ERROR = safeClientError("Nao foi possivel concluir a operacao.");

export type TreatmentPlanPayload = {
  patientId: string;
  mainGoal: string;
  currentFocus: string;
  strategies?: string | null;
  reviewDate?: string | null;
  status: PatientTreatmentPlanStatus;
};

export type TreatmentGoalPayload = {
  patientId?: string;
  goalId?: string;
  title: string;
  description?: string | null;
  status: PatientTreatmentGoalStatus;
  targetDate?: string | null;
};

export const TreatmentPlanService = {
  async getByPatient(patientId: string): Promise<ServiceResponse<PatientTreatmentPlan | null>> {
    try {
      const { data, error } = await supabase.rpc("get_patient_treatment_plan_decrypted", {
        p_patient_id: patientId,
      });

      if (error) throw error;
      return { data: data || null, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in TreatmentPlanService.getByPatient(${patientId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async upsertPlan(payload: TreatmentPlanPayload): Promise<ServiceResponse<PatientTreatmentPlan>> {
    try {
      const { data, error } = await supabase.rpc("upsert_patient_treatment_plan_secure", {
        p_patient_id: payload.patientId,
        p_main_goal: payload.mainGoal,
        p_current_focus: payload.currentFocus,
        p_strategies: payload.strategies || null,
        p_review_date: payload.reviewDate || null,
        p_status: payload.status,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in TreatmentPlanService.upsertPlan(${payload.patientId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async createGoal(payload: TreatmentGoalPayload): Promise<ServiceResponse<PatientTreatmentPlan>> {
    try {
      const { data, error } = await supabase.rpc("create_patient_treatment_goal_secure", {
        p_patient_id: payload.patientId,
        p_title: payload.title,
        p_description: payload.description || null,
        p_status: payload.status,
        p_target_date: payload.targetDate || null,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in TreatmentPlanService.createGoal(${payload.patientId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async updateGoal(payload: TreatmentGoalPayload): Promise<ServiceResponse<PatientTreatmentPlan>> {
    try {
      const { data, error } = await supabase.rpc("update_patient_treatment_goal_secure", {
        p_goal_id: payload.goalId,
        p_title: payload.title,
        p_description: payload.description || null,
        p_status: payload.status,
        p_target_date: payload.targetDate || null,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in TreatmentPlanService.updateGoal(${payload.goalId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },
};
