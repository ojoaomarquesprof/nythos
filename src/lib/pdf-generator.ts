import type { Profile } from "@/types/database";

// ============================================================================
// NOVA ESTRATÉGIA CLIENT-SIDE (pdfmake)
// ============================================================================

export interface PdfOptions {
  title: string;
  subtitle?: string;
  profile: Profile;
  content: any[]; // Array estruturado do pdfmake
  fileName?: string;
}

// Helper to convert image URL to base64
export async function getBase64ImageFromUrl(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as string), false);
    reader.addEventListener("error", () => reject(new Error("Failed to load image")));
    reader.readAsDataURL(blob);
  });
}

/**
 * Função utilitária que renderiza um PDF de forma declarativa e 100% Client-Side.
 * Utiliza Dynamic Imports para garantir que o 'pdfmake' nunca seja carregado no SSR.
 */
export async function generateClinicalPdf(options: PdfOptions): Promise<void> {
  // 1. Dynamic Imports para evitar erros Node.js/Serverless
  const pdfMakeModule = await import("pdfmake/build/pdfmake");
  const pdfMake: any = pdfMakeModule.default || pdfMakeModule;
  const pdfFontsModule = await import("pdfmake/build/vfs_fonts");
  const pdfFonts: any = pdfFontsModule.default || pdfFontsModule;
  
  if (pdfFonts && pdfFonts.pdfMake) {
    pdfMake.vfs = pdfFonts.pdfMake.vfs;
  } else if (pdfFonts && (pdfFonts as any).vfs) {
    pdfMake.vfs = (pdfFonts as any).vfs;
  }

  const { title, subtitle, profile, content, fileName = "relatorio_clinico.pdf" } = options;

  // 2. Extrair Logo
  let logoBase64 = null;
  if (profile.clinic_logo_url) {
    try {
      logoBase64 = await getBase64ImageFromUrl(profile.clinic_logo_url);
    } catch (e) {
      console.warn("Failed to load clinic logo for PDF", e);
    }
  }

  // 3. Montar o layout declarativo (Document Definition)
  const docDefinition: any = {
    pageSize: 'A4',
    pageMargins: [40, 100, 40, 60], // Left, Top, Right, Bottom
    header: function(currentPage: number) {
      return {
        margin: [40, 20, 40, 0],
        columns: [
          logoBase64 ? { image: logoBase64, width: 50, height: 50, fit: [50, 50] } : { text: '', width: 50 },
          {
            stack: [
              { text: profile.clinic_name || "Clínica de Psicologia", fontSize: 14, bold: true, color: '#0f172a' },
              { text: `Psicóloga(o): ${profile.full_name || "Não informado"}`, fontSize: 10, color: '#475569' },
              profile.crp ? { text: `CRP: ${profile.crp}`, fontSize: 10, color: '#475569' } : null,
              profile.phone ? { text: `Contato: ${profile.phone}`, fontSize: 10, color: '#475569' } : null,
            ].filter(Boolean),
            margin: [10, 0, 0, 0],
            width: '*'
          }
        ]
      };
    },
    footer: function(currentPage: number, pageCount: number) {
      const dateStr = new Date().toLocaleDateString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
      return {
        margin: [40, 0, 40, 0],
        columns: [
          { text: `Gerado em: ${dateStr}`, fontSize: 8, color: '#94a3b8' },
          { text: `Página ${currentPage} de ${pageCount}`, fontSize: 8, color: '#94a3b8', alignment: 'right' }
        ]
      };
    },
    content: [
      { text: title, fontSize: 20, bold: true, color: '#0f172a', margin: [0, 0, 0, subtitle ? 4 : 20] },
      subtitle ? { text: subtitle, fontSize: 12, color: '#64748b', margin: [0, 0, 0, 20] } : null,
      
      // Linha separadora
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#e2e8f0' }], margin: [0, 0, 0, 20] },

      ...content
    ].filter(Boolean),
    styles: {
      header: { fontSize: 14, bold: true, margin: [0, 10, 0, 5], color: '#1e293b' },
      subheader: { fontSize: 12, bold: true, margin: [0, 10, 0, 5], color: '#334155' },
      normalText: { fontSize: 10, color: '#475569', leadingIndent: 4 }
    },
    defaultStyle: {
      fontSize: 10,
      color: '#334155'
    }
  };

  // 4. Gerar e baixar no browser diretamente
  pdfMake.createPdf(docDefinition).download(fileName);
}

// ============================================================================
// MÉTODOS LEGADOS (jsPDF) - Mantidos temporariamente para compatibilidade
// ============================================================================
import jsPDF from "jspdf";
import autoTable, { UserOptions } from "jspdf-autotable";

export interface PdfHeaderOptions {
  title: string;
  subtitle?: string;
  profile: Profile;
}

export async function createPdfDocument(options: PdfHeaderOptions) {
  const doc = new jsPDF();
  const { title, subtitle, profile } = options;

  let yPos = 20;
  const margin = 14;

  if (profile.clinic_logo_url) {
    try {
      const logoBase64 = await getBase64ImageFromUrl(profile.clinic_logo_url);
      doc.addImage(logoBase64, "PNG", margin, yPos - 5, 30, 30);
    } catch (e) {
      console.warn("Failed to load clinic logo for PDF", e);
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const textX = profile.clinic_logo_url ? 50 : margin;
  
  doc.text(profile.clinic_name || "Clínica de Psicologia", textX, yPos);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Psicóloga(o): ${profile.full_name || "Não informado"}`, textX, yPos + 6);
  if (profile.crp) {
    doc.text(`CRP: ${profile.crp}`, textX, yPos + 11);
  }
  if (profile.phone) {
    doc.text(`Contato: ${profile.phone}`, textX, yPos + 16);
  }

  yPos += 30;
  doc.setDrawColor(200);
  doc.line(margin, yPos, 210 - margin, yPos);

  yPos += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(40);
  doc.text(title, margin, yPos);

  if (subtitle) {
    yPos += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(120);
    const splitSubtitle = doc.splitTextToSize(subtitle, 182);
    doc.text(splitSubtitle, margin, yPos);
    yPos += (splitSubtitle.length * 6);
  }

  yPos += 10;

  return { doc, startY: yPos };
}

export function addPdfFooter(doc: jsPDF) {
  const pageCount = (doc.internal as any).getNumberOfPages();
  const dateStr = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(150);

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(`Gerado em: ${dateStr}`, 14, 285);
    doc.text(`Página ${i} de ${pageCount}`, 196, 285, { align: "right" });
  }
}

export function addTableToPdf(doc: jsPDF, options: UserOptions) {
  autoTable(doc, options);
}
