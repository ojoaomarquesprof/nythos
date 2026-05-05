import { createClient } from "@/lib/supabase/client";
import type { Patient, PatientTask } from "@/types/database";
import type { ServiceResponse } from "./types";

const supabase = createClient() as any;

export const PatientService = {
  async getById(id: string): Promise<ServiceResponse<Patient>> {
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (err: any) {
      console.error(`Error in PatientService.getById(${id}):`, err);
      return { data: null, error: err.message || "Erro ao carregar o paciente." };
    }
  },

  async getGuardian(patientId: string): Promise<ServiceResponse<any>> {
    try {
      const { data, error } = await supabase
        .from("patient_guardians")
        .select("*")
        .eq("patient_id", patientId)
        .maybeSingle();

      if (error) throw error;
      return { data, error: null };
    } catch (err: any) {
      console.error(`Error in PatientService.getGuardian(${patientId}):`, err);
      return { data: null, error: err.message || "Erro ao carregar o responsável." };
    }
  },

  async getTasks(patientId: string): Promise<ServiceResponse<PatientTask[]>> {
    try {
      const { data, error } = await supabase
        .from("patient_tasks")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return { data, error: null };
    } catch (err: any) {
      console.error(`Error in PatientService.getTasks(${patientId}):`, err);
      return { data: null, error: err.message || "Erro ao carregar as tarefas." };
    }
  },

  async updatePatientNotes(id: string, updatedNotes: string): Promise<ServiceResponse<Patient>> {
    try {
      const { data, error } = await supabase
        .from("patients")
        .update({ notes_encrypted: updatedNotes })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (err: any) {
      console.error(`Error in PatientService.updatePatientNotes(${id}):`, err);
      return { data: null, error: err.message || "Erro ao atualizar o prontuário." };
    }
  },

  async updatePatient(id: string, data: Partial<Patient>): Promise<ServiceResponse<Patient>> {
    try {
      const { data: updated, error } = await supabase
        .from("patients")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { data: updated, error: null };
    } catch (err: any) {
      console.error(`Error in PatientService.updatePatient(${id}):`, err);
      return { data: null, error: err.message || "Erro ao salvar as alterações do paciente." };
    }
  },

  async createOrUpdateGuardian(
    patientId: string,
    guardianId: string | undefined,
    guardianData: any
  ): Promise<ServiceResponse<any>> {
    try {
      if (guardianId) {
        const { data, error } = await supabase
          .from("patient_guardians")
          .update(guardianData)
          .eq("id", guardianId)
          .select()
          .single();

        if (error) throw error;
        return { data, error: null };
      } else {
        const { data, error } = await supabase
          .from("patient_guardians")
          .insert({ ...guardianData, patient_id: patientId })
          .select()
          .single();

        if (error) throw error;
        return { data, error: null };
      }
    } catch (err: any) {
      console.error(`Error in PatientService.createOrUpdateGuardian(${patientId}):`, err);
      return { data: null, error: err.message || "Erro ao salvar o responsável." };
    }
  },

  async archivePatient(id: string): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase
        .from("patients")
        .update({ status: "archived" })
        .eq("id", id);

      if (error) throw error;
      return { data: true, error: null };
    } catch (err: any) {
      console.error(`Error in PatientService.archivePatient(${id}):`, err);
      return { data: false, error: err.message || "Erro ao arquivar o paciente." };
    }
  },
  
  async getFullRecordData(patientId: string): Promise<ServiceResponse<{
    network: any[];
    protocols: any[];
    behavior: any[];
  }>> {
    try {
      const [networkRes, protocolsRes, behaviorRes] = await Promise.all([
        supabase.from("care_network").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }),
        supabase.from("patient_evaluations").select("*").eq("patient_id", patientId).order("evaluation_date", { ascending: false }),
        supabase.from("abc_records").select("*").eq("patient_id", patientId).order("occurrence_date", { ascending: false })
      ]);

      if (networkRes.error) throw networkRes.error;
      if (protocolsRes.error) throw protocolsRes.error;
      if (behaviorRes.error) throw behaviorRes.error;

      return {
        data: {
          network: networkRes.data || [],
          protocols: protocolsRes.data || [],
          behavior: behaviorRes.data || [],
        },
        error: null
      };
    } catch (err: any) {
      console.error(`Error in PatientService.getFullRecordData(${patientId}):`, err);
      return { data: null, error: err.message || "Erro ao exportar os dados do prontuário." };
    }
  }
};
