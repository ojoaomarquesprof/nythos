export type LabeledOption = {
  value: string;
  label: string;
};

export const CONSENT_TYPE_OPTIONS = [
  { value: "general_consent", label: "Consentimento geral" },
  { value: "online_care", label: "Atendimento online" },
  { value: "legal_guardian", label: "Autorizacao do responsavel" },
  { value: "school_contact", label: "Contato com escola" },
  { value: "multidisciplinary_contact", label: "Contato com equipe multidisciplinar" },
  { value: "patient_portal", label: "Acesso ao portal do paciente" },
  { value: "third_party_sharing", label: "Compartilhamento com terceiros" },
  { value: "other", label: "Outro" },
] as const satisfies readonly LabeledOption[];

export const CONSENT_STATUS_OPTIONS = [
  { value: "pending", label: "Pendente" },
  { value: "signed", label: "Assinado" },
  { value: "revoked", label: "Revogado" },
  { value: "expired", label: "Expirado" },
] as const satisfies readonly LabeledOption[];

export const DOCUMENT_CATEGORY_OPTIONS = [
  { value: "consent", label: "Termo" },
  { value: "report", label: "Relatorio" },
  { value: "assessment", label: "Laudo/avaliacao" },
  { value: "certificate", label: "Atestado" },
  { value: "referral", label: "Encaminhamento" },
  { value: "school_document", label: "Documento escolar" },
  { value: "receipt", label: "Recibo" },
  { value: "image", label: "Imagem" },
  { value: "other", label: "Outro" },
] as const satisfies readonly LabeledOption[];

export function labelForOption(
  options: readonly LabeledOption[],
  value?: string | null,
  fallback = "Registro",
) {
  return options.find((item) => item.value === value)?.label || fallback;
}

export function getConsentStatusClass(status: string) {
  if (status === "signed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "expired") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function getConsentStatusLabel(status?: string | null) {
  return labelForOption(CONSENT_STATUS_OPTIONS, status, "Registro");
}

export function getDocumentCategoryLabel(category?: string | null) {
  return labelForOption(DOCUMENT_CATEGORY_OPTIONS, category, "Documento");
}

export type PatientDocumentListMeta = {
  title: string;
  categoryLabel: string;
  fileName: string | null;
  hasFile: boolean;
  statusLabel: string;
  documentDate: string | null;
  description: string | null;
};

export function toPatientDocumentListMeta(document: {
  title: string;
  category?: string | null;
  file_name?: string | null;
  has_file?: boolean | null;
  document_date?: string | null;
  description?: string | null;
}) : PatientDocumentListMeta {
  return {
    title: document.title,
    categoryLabel: getDocumentCategoryLabel(document.category),
    fileName: document.file_name || null,
    hasFile: Boolean(document.has_file),
    statusLabel: document.has_file ? "Arquivo anexado" : "Somente metadados",
    documentDate: document.document_date || null,
    description: document.description || null,
  };
}
