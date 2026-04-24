import jsPDF from "jspdf";
import autoTable, { UserOptions } from "jspdf-autotable";
import type { Profile } from "@/types/database";

// Helper to convert image URL to base64
async function getBase64ImageFromUrl(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as string), false);
    reader.addEventListener("error", () => reject(new Error("Failed to load image")));
    reader.readAsDataURL(blob);
  });
}

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

  // 1. Render Logo
  if (profile.clinic_logo_url) {
    try {
      const logoBase64 = await getBase64ImageFromUrl(profile.clinic_logo_url);
      // Try to maintain aspect ratio - assuming standard max 40x40
      doc.addImage(logoBase64, "PNG", margin, yPos - 5, 30, 30);
    } catch (e) {
      console.warn("Failed to load clinic logo for PDF", e);
    }
  }

  // 2. Render Clinic/Psychologist Info (Right Aligned or Centered next to logo)
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

  // 3. Document Title
  yPos += 30; // Move down below header
  doc.setDrawColor(200);
  doc.line(margin, yPos, 210 - margin, yPos); // Horizontal line

  yPos += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(40);
  doc.text(title, margin, yPos);

  if (subtitle) {
    yPos += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(120);
    doc.text(subtitle, margin, yPos);
  }

  yPos += 15;

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
    // Add date on left
    doc.text(`Gerado em: ${dateStr}`, 14, 285);
    // Add page number on right
    doc.text(`Página ${i} de ${pageCount}`, 196, 285, { align: "right" });
  }
}

// Wrapper for autoTable to make it easier to import
export function addTableToPdf(doc: jsPDF, options: UserOptions) {
  autoTable(doc, options);
}
