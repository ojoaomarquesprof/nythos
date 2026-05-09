import { createClient } from "@/lib/supabase/client";
import type { ServiceResponse } from "./types";

const supabase = createClient() as any;

export const AnamnesisService = {
  async getResponsesByPatient(patientId: string): Promise<ServiceResponse<any[]>> {
    try {
      const { data, error } = await supabase
        .rpc("get_anamnesis_responses_decrypted", { p_patient_id: patientId });

      if (error) throw error;
      const completed = (data || []).filter((response: any) => response.status === "completed");
      return { data: completed, error: null };
    } catch (err: any) {
      console.error(`Error in AnamnesisService.getResponsesByPatient(${patientId}):`, err);
      return { data: null, error: err.message || "Erro ao carregar anamneses completadas." };
    }
  }
};
