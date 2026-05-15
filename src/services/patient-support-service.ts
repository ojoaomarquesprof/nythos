import { createClient } from "@/lib/supabase/client";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import type { PatientConsent, PatientDocument, SupportContact } from "@/types/database";
import type { ServiceResponse } from "./types";

const supabase = createClient() as any;
const GENERIC_SERVICE_ERROR = safeClientError("Nao foi possivel concluir a operacao.");

export type SupportContactPayload = {
  patientId: string;
  name: string;
  contactType: string;
  relationship?: string | null;
  specialty?: string | null;
  phone?: string | null;
  email?: string | null;
  organization?: string | null;
  notes?: string | null;
  canContact?: boolean;
  consentDate?: string | null;
  isPrimary?: boolean;
  isActive?: boolean;
};

export type PatientConsentPayload = {
  patientId: string;
  consentType: string;
  status: string;
  signedAt?: string | null;
  expiresAt?: string | null;
  relatedPersonName?: string | null;
  documentFileId?: string | null;
  version?: string | null;
  notes?: string | null;
};

export type PatientDocumentPayload = {
  patientId: string;
  category: string;
  title: string;
  description?: string | null;
  documentDate?: string | null;
  file?: File | null;
};

export const PatientSupportService = {
  async getContacts(patientId: string): Promise<ServiceResponse<SupportContact[]>> {
    try {
      const { data, error } = await supabase.rpc("get_patient_care_network_decrypted", {
        p_patient_id: patientId,
      });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: unknown) {
      logSafeError(`Error in PatientSupportService.getContacts(${patientId})`, err);
      return { data: [], error: GENERIC_SERVICE_ERROR };
    }
  },

  async createContact(payload: SupportContactPayload): Promise<ServiceResponse<SupportContact[]>> {
    try {
      const { data, error } = await supabase.rpc("create_patient_support_contact_secure", {
        p_patient_id: payload.patientId,
        p_name: payload.name,
        p_contact_type: payload.contactType,
        p_relationship: payload.relationship || null,
        p_specialty: payload.specialty || null,
        p_phone: payload.phone || null,
        p_email: payload.email || null,
        p_organization: payload.organization || null,
        p_notes: payload.notes || null,
        p_can_contact: !!payload.canContact,
        p_consent_date: payload.consentDate || null,
        p_is_primary: !!payload.isPrimary,
        p_is_active: payload.isActive ?? true,
      });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: unknown) {
      logSafeError(`Error in PatientSupportService.createContact(${payload.patientId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async deleteContact(contactId: string): Promise<ServiceResponse<SupportContact[]>> {
    try {
      const { data, error } = await supabase.rpc("delete_patient_support_contact_secure", {
        p_contact_id: contactId,
      });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: unknown) {
      logSafeError(`Error in PatientSupportService.deleteContact(${contactId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async getConsents(patientId: string): Promise<ServiceResponse<PatientConsent[]>> {
    try {
      const { data, error } = await supabase.rpc("get_patient_consents_decrypted", {
        p_patient_id: patientId,
      });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: unknown) {
      logSafeError(`Error in PatientSupportService.getConsents(${patientId})`, err);
      return { data: [], error: GENERIC_SERVICE_ERROR };
    }
  },

  async createConsent(payload: PatientConsentPayload): Promise<ServiceResponse<PatientConsent[]>> {
    try {
      const { data, error } = await supabase.rpc("create_patient_consent_secure", {
        p_patient_id: payload.patientId,
        p_consent_type: payload.consentType,
        p_status: payload.status,
        p_signed_at: payload.signedAt || null,
        p_expires_at: payload.expiresAt || null,
        p_related_person_name: payload.relatedPersonName || null,
        p_document_file_id: payload.documentFileId || null,
        p_version: payload.version || null,
        p_notes: payload.notes || null,
      });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: unknown) {
      logSafeError(`Error in PatientSupportService.createConsent(${payload.patientId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async deleteConsent(consentId: string): Promise<ServiceResponse<PatientConsent[]>> {
    try {
      const { data, error } = await supabase.rpc("delete_patient_consent_secure", {
        p_consent_id: consentId,
      });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: unknown) {
      logSafeError(`Error in PatientSupportService.deleteConsent(${consentId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async getDocuments(patientId: string): Promise<ServiceResponse<PatientDocument[]>> {
    try {
      const { data, error } = await supabase.rpc("get_patient_documents_decrypted", {
        p_patient_id: patientId,
      });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err: unknown) {
      logSafeError(`Error in PatientSupportService.getDocuments(${patientId})`, err);
      return { data: [], error: GENERIC_SERVICE_ERROR };
    }
  },

  async createDocument(payload: PatientDocumentPayload): Promise<ServiceResponse<PatientDocument[]>> {
    try {
      const formData = new FormData();
      formData.append("patientId", payload.patientId);
      formData.append("category", payload.category);
      formData.append("title", payload.title);
      formData.append("description", payload.description || "");
      formData.append("documentDate", payload.documentDate || "");
      if (payload.file) {
        formData.append("file", payload.file);
      }

      const response = await fetch("/api/patient-documents", {
        method: "POST",
        body: formData,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { data: null, error: result.error || "Nao foi possivel registrar o documento." };
      }

      return { data: result.documents || [], error: null };
    } catch (err: unknown) {
      logSafeError(`Error in PatientSupportService.createDocument(${payload.patientId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async deleteDocument(documentId: string): Promise<ServiceResponse<PatientDocument[]>> {
    try {
      const response = await fetch(`/api/patient-documents/${documentId}`, {
        method: "DELETE",
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { data: null, error: result.error || "Nao foi possivel remover o documento." };
      }

      return {
        data: result.documents || [],
        error: result.warning || null,
      };
    } catch (err: unknown) {
      logSafeError(`Error in PatientSupportService.deleteDocument(${documentId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },

  async getDocumentDownloadUrl(documentId: string): Promise<ServiceResponse<{ url: string; expiresIn: number }>> {
    try {
      const response = await fetch(`/api/patient-documents/${documentId}/download`, {
        method: "GET",
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) {
        return { data: null, error: result.error || "Nao foi possivel preparar o download." };
      }

      return { data: { url: result.url, expiresIn: result.expiresIn || 60 }, error: null };
    } catch (err: unknown) {
      logSafeError(`Error in PatientSupportService.getDocumentDownloadUrl(${documentId})`, err);
      return { data: null, error: GENERIC_SERVICE_ERROR };
    }
  },
};
