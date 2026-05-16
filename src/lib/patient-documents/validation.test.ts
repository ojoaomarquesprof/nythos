import { describe, expect, it } from "vitest";
import {
  getPatientDocumentExtension,
  hasPatientDocumentMagicBytes,
  sanitizePatientDocumentFilename,
  validatePatientDocumentSelection,
  validateUploadedPatientDocument,
} from "./validation";

describe("patient document validation", () => {
  it("accepts allowed mime, extension and size", () => {
    const error = validatePatientDocumentSelection({
      name: "relatorio.pdf",
      size: 1024,
      type: "application/pdf",
    });

    expect(error).toBeNull();
  });

  it("rejects invalid mime types", () => {
    const error = validatePatientDocumentSelection({
      name: "script.exe",
      size: 1024,
      type: "application/x-msdownload",
    });

    expect(error).toContain("Tipo de arquivo nao permitido");
  });

  it("rejects mismatched file extensions", () => {
    const error = validatePatientDocumentSelection({
      name: "imagem.pdf",
      size: 1024,
      type: "image/png",
    });

    expect(error).toContain("extensao");
  });

  it("rejects files larger than 20 MB", () => {
    const error = validatePatientDocumentSelection({
      name: "relatorio.pdf",
      size: 20 * 1024 * 1024 + 1,
      type: "application/pdf",
    });

    expect(error).toContain("20 MB");
  });

  it("validates uploaded file magic bytes", async () => {
    const badPdf = new File([new Uint8Array([0x00, 0x11, 0x22, 0x33])], "relatorio.pdf", {
      type: "application/pdf",
    });

    await expect(validateUploadedPatientDocument(badPdf)).resolves.toContain("conteudo");
  });

  it("sanitizes filenames and keeps expected extensions", () => {
    expect(sanitizePatientDocumentFilename("Meu Relatório Final 2026.PDF")).toBe("meu-relatorio-final-2026.pdf");
    expect(getPatientDocumentExtension("arquivo.JPEG")).toBe(".jpeg");
  });

  it("checks known magic bytes for common formats", () => {
    expect(hasPatientDocumentMagicBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/pdf")).toBe(true);
    expect(hasPatientDocumentMagicBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "image/png")).toBe(true);
    expect(hasPatientDocumentMagicBytes(new Uint8Array([0x00, 0x00, 0x00, 0x00]), "application/pdf")).toBe(false);
  });
});
