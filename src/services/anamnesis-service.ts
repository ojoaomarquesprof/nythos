import { createClient } from "@/lib/supabase/client";
import type { ServiceResponse } from "./types";

const supabase = createClient();

export const AnamnesisService = {
  async getResponsesByPatient(patientId: string): Promise<ServiceResponse<any[]>> {
    try {
      const { data, error } = await supabase
        .from("anamnesis_responses")
        .select("*, anamnesis_templates(*)")
        .eq("patient_id", patientId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: any) {
      console.error(`Error in AnamnesisService.getResponsesByPatient(${patientId}):`, err);
      return { data: null, error: err.message || "Erro ao carregar anamneses completadas." };
    }
  }
};
