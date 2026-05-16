import { describe, expect, it } from "vitest";
import {
  getDocumentCategoryLabel,
  getConsentStatusLabel,
  labelForOption,
  DOCUMENT_CATEGORY_OPTIONS,
  toPatientDocumentListMeta,
} from "./presentation";

describe("patient document presentation", () => {
  it("returns friendly labels instead of raw technical values", () => {
    expect(getDocumentCategoryLabel("report")).toBe("Relatorio");
    expect(getConsentStatusLabel("signed")).toBe("Assinado");
    expect(labelForOption(DOCUMENT_CATEGORY_OPTIONS, "missing", "Documento")).toBe("Documento");
  });

  it("builds list metadata without exposing storage_path", () => {
    const meta = toPatientDocumentListMeta({
      title: "Relatorio escolar",
      category: "report",
      file_name: "relatorio.pdf",
      has_file: true,
      document_date: "2026-05-10",
      description: "Resumo para a equipe",
      // @ts-expect-error validating omission of technical field
      storage_path: "patients/abc/private.pdf",
    });

    expect(meta).toEqual({
      title: "Relatorio escolar",
      categoryLabel: "Relatorio",
      fileName: "relatorio.pdf",
      hasFile: true,
      statusLabel: "Arquivo anexado",
      documentDate: "2026-05-10",
      description: "Resumo para a equipe",
    });
    expect("storage_path" in meta).toBe(false);
  });
});
