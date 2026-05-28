import type { Profile } from "@/types/database";

// ============================================================================
// NOVA ESTRATÉGIA CLIENT-SIDE (pdfmake)
// ============================================================================

export interface PdfOptions {
  title: string;
  subtitle?: string;
  profile: Profile;
  content: unknown[]; // Array estruturado do pdfmake
  fileName?: string;
  documentKind?: "clinical" | "financial" | "receipt" | "administrative";
}

type PdfMakeInstance = {
  vfs?: unknown;
  createPdf: (docDefinition: unknown) => {
    download: (fileName: string) => void;
  };
};

type PdfFontsModule = {
  pdfMake?: {
    vfs?: unknown;
  };
  vfs?: unknown;
};

const DOCUMENT_KIND_LABELS: Record<NonNullable<PdfOptions["documentKind"]>, string> = {
  clinical: "Documento clinico",
  financial: "Relatorio financeiro",
  receipt: "Recibo de Pagamento",
  administrative: "Documento",
};

function getProfileIdentity(profile: Profile) {
  return {
    clinicName: profile.clinic_name?.trim() || "Clinica de Psicologia",
    professionalName: profile.full_name?.trim() || "Nome profissional nao informado",
    crp: profile.crp?.trim() || null,
    phone: profile.phone?.trim() || null,
  };
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
  const pdfMake = (pdfMakeModule.default || pdfMakeModule) as PdfMakeInstance;
  const pdfFontsModule = await import("pdfmake/build/vfs_fonts");
  const pdfFonts = (pdfFontsModule.default || pdfFontsModule) as PdfFontsModule;
  
  if (pdfFonts.pdfMake?.vfs) {
    pdfMake.vfs = pdfFonts.pdfMake.vfs;
  } else if (pdfFonts.vfs) {
    pdfMake.vfs = pdfFonts.vfs;
  }

  const {
    title,
    subtitle,
    profile,
    content,
    fileName = "relatorio_clinico.pdf",
    documentKind = "clinical",
  } = options;
  const profileIdentity = getProfileIdentity(profile);
  const documentLabel = DOCUMENT_KIND_LABELS[documentKind];

  // 2. Extrair Logo
  let logoBase64 = null;
  if (profile.clinic_logo_url) {
    try {
      logoBase64 = await getBase64ImageFromUrl(profile.clinic_logo_url);
    } catch {
      console.warn("[pdf-generator] Failed to load clinic logo for PDF");
    }
  }

  // 3. Montar o layout declarativo (Document Definition)
  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 112, 40, 66], // Left, Top, Right, Bottom
    header: function() {
      return {
        margin: [40, 20, 40, 0],
        columns: [
          logoBase64 ? { image: logoBase64, width: 50, height: 50, fit: [50, 50] } : { text: '', width: 50 },
          {
            stack: [
              { text: profileIdentity.clinicName, fontSize: 14, bold: true, color: '#0f172a' },
              { text: `Profissional: ${profileIdentity.professionalName}`, fontSize: 10, color: '#475569' },
              profileIdentity.crp ? { text: `CRP: ${profileIdentity.crp}`, fontSize: 10, color: '#475569' } : null,
              profileIdentity.phone ? { text: `Contato: ${profileIdentity.phone}`, fontSize: 10, color: '#475569' } : null,
            ].filter(Boolean),
            margin: [10, 0, 0, 0],
            width: '*'
          },
          {
            text: documentLabel,
            width: 116,
            alignment: 'right',
            color: '#64748b',
            fontSize: 8,
            bold: true,
            margin: [0, 4, 0, 0],
          },
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
          { text: `Nythos | Gerado em: ${dateStr}`, fontSize: 8, color: '#94a3b8' },
          { text: `Página ${currentPage} de ${pageCount}`, fontSize: 8, color: '#94a3b8', alignment: 'right' }
        ]
      };
    },
    content: [
      { text: documentLabel, fontSize: 8, bold: true, color: '#64748b', margin: [0, 0, 0, 6] },
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
  const profileIdentity = getProfileIdentity(profile);

  let yPos = 20;
  const margin = 14;

  if (profile.clinic_logo_url) {
    try {
      const logoBase64 = await getBase64ImageFromUrl(profile.clinic_logo_url);
      doc.addImage(logoBase64, "PNG", margin, yPos - 5, 30, 30);
    } catch {
      console.warn("[pdf-generator] Failed to load clinic logo for PDF");
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const textX = profile.clinic_logo_url ? 50 : margin;
  
  doc.text(profileIdentity.clinicName, textX, yPos);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Profissional: ${profileIdentity.professionalName}`, textX, yPos + 6);
  if (profileIdentity.crp) {
    doc.text(`CRP: ${profileIdentity.crp}`, textX, yPos + 11);
  }
  if (profileIdentity.phone) {
    doc.text(`Contato: ${profileIdentity.phone}`, textX, yPos + 16);
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
  const pageCount = (doc.internal as jsPDF["internal"] & { getNumberOfPages: () => number }).getNumberOfPages();
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
    doc.text(`Nythos | Gerado em: ${dateStr}`, 14, 285);
    doc.text(`Página ${i} de ${pageCount}`, 196, 285, { align: "right" });
  }
}

export function addTableToPdf(doc: jsPDF, options: UserOptions) {
  autoTable(doc, options);
}
