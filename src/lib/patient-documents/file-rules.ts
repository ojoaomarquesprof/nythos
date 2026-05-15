export const PATIENT_DOCUMENT_BUCKET = "patient-documents";
export const PATIENT_DOCUMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;
export const PATIENT_DOCUMENT_SIGNED_URL_TTL_SECONDS = 60;

export const PATIENT_DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const PATIENT_DOCUMENT_ACCEPT = PATIENT_DOCUMENT_ALLOWED_MIME_TYPES.join(",");

export const PATIENT_DOCUMENT_ALLOWED_EXTENSIONS: Record<string, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

export function formatPatientDocumentFileSize(sizeBytes?: number | null) {
  if (!sizeBytes || sizeBytes <= 0) return "";
  if (sizeBytes < 1024 * 1024) return `${Math.ceil(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
