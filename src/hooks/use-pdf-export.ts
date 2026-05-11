"use client";

import { useState } from "react";
import { generateClinicalPdf, PdfOptions } from "@/lib/pdf-generator";
import { toast } from "sonner";

export function usePdfExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const exportPdf = async (options: PdfOptions, successMessage: string = "PDF gerado com sucesso!") => {
    setIsExporting(true);
    setError(null);
    
    // Pequeno delay intencional para permitir que o React renderize o estado de loading
    // já que o Dynamic Import e processamento bloqueiam parcialmente a UI no navegador.
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      await generateClinicalPdf(options);
      toast.success(successMessage);
    } catch (err: any) {
      console.error("[use-pdf-export] Failed to generate PDF");
      setError(err);
      toast.error("Falha ao gerar o arquivo PDF. Tente novamente.");
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportPdf,
    isExporting,
    error
  };
}
