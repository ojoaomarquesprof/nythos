import {
  PATIENT_DOCUMENT_ALLOWED_EXTENSIONS,
  PATIENT_DOCUMENT_ALLOWED_MIME_TYPES,
  PATIENT_DOCUMENT_MAX_SIZE_BYTES,
} from "./file-rules";

export type PatientDocumentFileLike = {
  name: string;
  size: number;
  type: string;
};

export function sanitizePatientDocumentFilename(filename: string) {
  const withoutPath = filename.split(/[/\\]/).pop() || "documento";
  const dotIndex = withoutPath.lastIndexOf(".");
  const rawBase = dotIndex > 0 ? withoutPath.slice(0, dotIndex) : withoutPath;
  const rawExt = dotIndex > 0 ? withoutPath.slice(dotIndex).toLowerCase() : "";
  const base =
    rawBase
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "documento";
  const ext = rawExt.replace(/[^a-z0-9.]/g, "").slice(0, 12);
  return `${base}${ext}`;
}

export function getPatientDocumentExtension(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

export function hasPatientDocumentMagicBytes(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "application/pdf") {
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }
  if (mimeType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  if (mimeType === "application/msword") {
    return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return bytes[0] === 0x50 && bytes[1] === 0x4b;
  }
  return false;
}

export function validatePatientDocumentSelection(file: PatientDocumentFileLike) {
  if (file.size <= 0) {
    return "O arquivo selecionado esta vazio.";
  }

  if (file.size > PATIENT_DOCUMENT_MAX_SIZE_BYTES) {
    return "O arquivo excede o limite de 20 MB.";
  }

  if (!PATIENT_DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type as (typeof PATIENT_DOCUMENT_ALLOWED_MIME_TYPES)[number])) {
    return "Tipo de arquivo nao permitido. Envie PDF, imagem PNG/JPG/WebP, DOC ou DOCX.";
  }

  const extension = getPatientDocumentExtension(file.name);
  const allowedExtensions = PATIENT_DOCUMENT_ALLOWED_EXTENSIONS[file.type] || [];
  if (!allowedExtensions.includes(extension)) {
    return "A extensao do arquivo nao corresponde ao tipo enviado.";
  }

  return null;
}

export async function validateUploadedPatientDocument(file: File) {
  const fileError = validatePatientDocumentSelection(file);
  if (fileError) {
    return fileError;
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!hasPatientDocumentMagicBytes(header, file.type)) {
    return "O conteudo do arquivo nao corresponde ao tipo informado.";
  }

  return null;
}
