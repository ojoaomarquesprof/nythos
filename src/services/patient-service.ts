import { createClient } from "@/lib/supabase/client";
import type { Patient, PatientTask, PatientUpdate } from "@/types/database";
import type { ServiceResponse } from "./types";

const supabase = createClient() as any;

export const PatientService = {
  async getById(id: string): Promise<ServiceResponse<Patient>> {
    try {
      const { data, error } = await supabase
        .rpc("get_patient_decrypted", { p_patient_id: id });

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
        .rpc("append_patient_clinical_note", {
          p_patient_id: id,
          p_note: updatedNotes,
        });

      if (error) throw error;
      return { data, error: null };
    } catch (err: any) {
      console.error(`Error in PatientService.updatePatientNotes(${id}):`, err);
      return { data: null, error: err.message || "Erro ao atualizar o prontuário." };
    }
  },

  async updatePatient(id: string, data: PatientUpdate): Promise<ServiceResponse<Patient>> {
    try {
      const {
        notes_encrypted: _notesEncrypted,
        diagnosis_encrypted: _diagnosisEncrypted,
        ...safeData
      } = data;

      const { error } = await supabase
        .from("patients")
        .update(safeData)
        .eq("id", id);

      if (error) throw error;
      const { data: updated, error: readError } = await supabase
        .rpc("get_patient_decrypted", { p_patient_id: id });

      if (readError) throw readError;
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

  async revokeAccessLink(id: string): Promise<ServiceResponse<Patient>> {
    try {
      const { data, error } = await supabase.rpc("revoke_patient_access_link_secure", {
        p_patient_id: id,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (err: any) {
      console.error(`Error in PatientService.revokeAccessLink(${id}):`, err);
      return { data: null, error: err.message || "Erro ao revogar o link do paciente." };
    }
  },

  async regenerateAccessLink(id: string): Promise<ServiceResponse<Patient>> {
    try {
      const { data, error } = await supabase.rpc("regenerate_patient_access_link_secure", {
        p_patient_id: id,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (err: any) {
      console.error(`Error in PatientService.regenerateAccessLink(${id}):`, err);
      return { data: null, error: err.message || "Erro ao regenerar o link do paciente." };
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
        supabase.rpc("get_patient_evaluations_decrypted", { p_patient_id: patientId }),
        supabase.rpc("get_abc_records_decrypted", { p_patient_id: patientId })
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
