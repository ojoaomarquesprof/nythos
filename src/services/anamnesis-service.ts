import { createClient } from "@/lib/supabase/client";
import { logSafeError } from "@/lib/errors/safe-error";
import type { ServiceResponse } from "./types";
import { isValidUuid } from "@/lib/validation/input";
import type { Database } from "@/types/database";

const supabase = createClient() as any;
type DecryptedAnamnesisResponse = {
  status: string | null;
  [key: string]: unknown;
};
type RevokePublicAnamnesisLinkResult =
  Database["public"]["Functions"]["revoke_public_anamnesis_link_secure"]["Returns"];
type RegeneratePublicAnamnesisLinkResult =
  Database["public"]["Functions"]["regenerate_public_anamnesis_link_secure"]["Returns"];

export const AnamnesisService = {
  async getResponsesByPatient(patientId: string): Promise<ServiceResponse<DecryptedAnamnesisResponse[]>> {
    if (!isValidUuid(patientId)) {
      return { data: null, error: "Paciente invalido." };
    }

    try {
      const { data, error } = await supabase
        .rpc("get_anamnesis_responses_decrypted", { p_patient_id: patientId });

      if (error) throw error;
      const completed = (data || []).filter(
        (response: DecryptedAnamnesisResponse) => response.status === "completed"
      );
      return { data: completed, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in AnamnesisService.getResponsesByPatient(${patientId})`, err);
      return { data: null, error: "Erro ao carregar anamneses completadas." };
    }
  },

  async revokePublicLink(responseId: string): Promise<ServiceResponse<RevokePublicAnamnesisLinkResult>> {
    if (!isValidUuid(responseId)) {
      return { data: null, error: "Solicitacao invalida para revogar link." };
    }

    try {
      const { data, error } = await supabase.rpc("revoke_public_anamnesis_link_secure", {
        p_response_id: responseId,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in AnamnesisService.revokePublicLink(${responseId})`, err);
      return { data: null, error: "Erro ao revogar o link da anamnese." };
    }
  },

  async regeneratePublicLink(responseId: string): Promise<ServiceResponse<RegeneratePublicAnamnesisLinkResult>> {
    if (!isValidUuid(responseId)) {
      return { data: null, error: "Solicitacao invalida para regenerar link." };
    }

    try {
      const { data, error } = await supabase.rpc("regenerate_public_anamnesis_link_secure", {
        p_response_id: responseId,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in AnamnesisService.regeneratePublicLink(${responseId})`, err);
      return { data: null, error: "Erro ao regenerar o link da anamnese." };
    }
  },
};
