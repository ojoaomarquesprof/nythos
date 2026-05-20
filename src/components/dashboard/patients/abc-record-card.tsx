"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubscription } from "@/hooks/use-subscription";
import {
  Activity,
  Plus,
  Calendar,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  History,
  Download,
} from "lucide-react";
import { usePdfExport } from "@/hooks/use-pdf-export";
import { auditClinicalPdfExported } from "@/app/actions/clinical-audit";
import type { Profile, Patient } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/constants";

interface AbcRecord {
  id: string;
  patient_id: string;
  occurrence_date: string;
  antecedent: string;
  behavior: string;
  consequence: string;
  intensity: number;
  duration_minutes: number | null;
  created_at: string;
}

export function AbcRecordCard({
  patientId,
  patient,
  profile,
}: {
  patientId: string;
  patient?: Patient | null;
  profile?: Profile | null;
}) {
  const [records, setRecords] = useState<AbcRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const supabase = createClient() as any;
  const router = useRouter();
  const { hasSubscription, loading: subLoading } = useSubscription();
  const { exportPdf, isExporting: isExportingPdf } = usePdfExport();

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    antecedent: "",
    behavior: "",
    consequence: "",
    intensity: 5,
    duration: "",
  });

  useEffect(() => {
    fetchAbcRecords();
  }, [patientId]);

  async function fetchAbcRecords() {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_abc_records_decrypted", { p_patient_id: patientId });

    if (!error && data) {
      setRecords(data);
    }
    setLoading(false);
  }

  async function handleAddRecord(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.rpc("create_abc_record_secure", {
      p_patient_id: patientId,
      p_occurrence_date: formData.date,
      p_antecedent: formData.antecedent,
      p_behavior: formData.behavior,
      p_consequence: formData.consequence,
      p_intensity: formData.intensity,
      p_duration_minutes: formData.duration ? parseInt(formData.duration) : null,
      p_session_id: null,
    });

    if (!error) {
      setOpen(false);
      setFormData({
        date: new Date().toISOString().split("T")[0],
        antecedent: "",
        behavior: "",
        consequence: "",
        intensity: 5,
        duration: "",
      });
      fetchAbcRecords();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este registro?")) return;

    const { error } = await supabase.from("abc_records").delete().eq("id", id);

    if (!error) {
      setRecords(records.filter((r) => r.id !== id));
    }
  }

  async function handleExportPdf() {
    if (!profile || !records.length || !patient) return;

    const patientDetails = [
      `Paciente: ${patient.full_name}`,
      patient.cpf ? `CPF: ${patient.cpf}` : null,
      patient.date_of_birth ? `Data de Nasc.: ${formatDate(patient.date_of_birth)}` : null,
      `Data do RelatÃ³rio: ${new Date().toLocaleDateString("pt-BR")}`,
    ]
      .filter(Boolean)
      .join(" | ");

    const tableBody = records.map((r: any) => [
      formatDate(r.occurrence_date),
      r.behavior,
      r.antecedent,
      r.consequence,
      r.intensity.toString(),
    ]);

    const exported = await exportPdf({
      title: "Registro de AnÃ¡lise do Comportamento (ABC)",
      subtitle: patientDetails,
      profile,
      fileName: `abc_${patient.full_name.toLowerCase().replace(/\s+/g, "_")}.pdf`,
      content: [
        {
          table: {
            headerRows: 1,
            widths: ["auto", "auto", "*", "*", "auto"],
            body: [
              [
                { text: "Data", bold: true, fillColor: "#e2e8f0", color: "#1e293b", margin: [5, 5] },
                { text: "Comportamento", bold: true, fillColor: "#e2e8f0", color: "#1e293b", margin: [5, 5] },
                { text: "Antecedente (A)", bold: true, fillColor: "#e2e8f0", color: "#1e293b", margin: [5, 5] },
                { text: "ConsequÃªncia (C)", bold: true, fillColor: "#e2e8f0", color: "#1e293b", margin: [5, 5] },
                { text: "Intensidade", bold: true, fillColor: "#e2e8f0", color: "#1e293b", margin: [5, 5] },
              ],
              ...tableBody.map((row) => row.map((cell) => ({ text: cell, margin: [5, 5] }))),
            ],
          },
          layout: {
            fillColor: function (rowIndex: number) {
              return rowIndex % 2 === 0 && rowIndex > 0 ? "#f8fafc" : null;
            },
            hLineColor: "#cbd5e1",
            vLineColor: "#cbd5e1",
          },
        },
      ],
    });
    if (exported) {
      await auditClinicalPdfExported({
        action: "clinical",
        patientId,
        exportType: "abc_record",
        source: "patient_dashboard",
        includesSections: ["abc_records"],
        generatedAt: new Date().toISOString(),
      });
    }
  }

  return (
    <Card className="glass-panel animate-fade-in overflow-hidden rounded-[32px] border-0 shadow-lg">
      <CardHeader className="border-b border-white/40 bg-white/30 pb-4 backdrop-blur-sm">
        <div className="flex w-full flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100">
              <Activity className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold leading-tight text-rose-900">Registro Comportamental (ABC)</CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                AnÃ¡lise de Antecedentes, Comportamentos e ConsequÃªncias.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-full border-rose-200 px-4 text-rose-600 transition-all hover:bg-rose-50"
              onClick={handleExportPdf}
              disabled={records.length === 0 || !profile || !patient || isExportingPdf}
            >
              <Download className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">PDF</span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
              <Button
                size="sm"
                className="h-9 rounded-full bg-rose-600 px-5 text-white shadow-lg shadow-rose-200 transition-all active:scale-95 hover:bg-rose-700"
                onClick={() => {
                  if (!hasSubscription && !subLoading) {
                    router.push("/dashboard/settings/billing");
                  } else {
                    setOpen(true);
                  }
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                <span>Novo</span>
              </Button>
              <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[28px] border border-rose-100/70 bg-white p-0 shadow-2xl sm:max-w-2xl sm:rounded-[32px]">
                <DialogHeader className="border-b border-rose-100/70 bg-[linear-gradient(135deg,rgba(251,113,133,0.12),rgba(255,255,255,0.92))] px-4 py-4 sm:px-6 sm:py-5">
                  <div className="flex items-start gap-3 pr-8">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-xl font-bold text-rose-900">Novo Registro ABC</DialogTitle>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        Registre contexto, resposta observada e consequencia de forma clara e objetiva.
                      </p>
                    </div>
                  </div>
                </DialogHeader>

                <form onSubmit={handleAddRecord} className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                    <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-slate-900">Dados do registro</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Defina quando o evento ocorreu e, se fizer sentido, a duracao aproximada.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-semibold text-slate-700">Data *</Label>
                          <Input
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            required
                            className="h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-semibold text-slate-700">Duracao (min)</Label>
                          <Input
                            type="number"
                            placeholder="Ex: 5"
                            value={formData.duration}
                            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                            className="h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                          />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-rose-100 bg-rose-50/60 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">Intensidade</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            Ajuste a intensidade percebida no momento do episodio.
                          </p>
                        </div>
                        <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-white px-3 text-sm font-black text-rose-600 shadow-sm">
                          {formData.intensity}
                        </span>
                      </div>
                      <Slider
                        value={[formData.intensity]}
                        onValueChange={(val: any) =>
                          setFormData({ ...formData, intensity: Array.isArray(val) ? val[0] : val })
                        }
                        max={10}
                        min={1}
                        step={1}
                        className="py-2"
                      />
                    </section>

                    <section className="rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-slate-900">Analise ABC</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Descreva o antes, o comportamento observado e a consequencia imediata.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-semibold text-slate-700">Antecedente (A) *</Label>
                          <Textarea
                            placeholder="O que aconteceu imediatamente antes?"
                            className="min-h-[88px] rounded-2xl border-slate-200 bg-slate-50/70 py-3 shadow-sm transition-all focus:border-rose-300"
                            value={formData.antecedent}
                            onChange={(e) => setFormData({ ...formData, antecedent: e.target.value })}
                            required
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-sm font-semibold text-slate-700">Comportamento (B) *</Label>
                          <Textarea
                            placeholder="Descreva com objetividade o que o paciente fez."
                            className="min-h-[88px] rounded-2xl border-rose-100 bg-rose-50/40 py-3 shadow-sm transition-all focus:border-rose-300"
                            value={formData.behavior}
                            onChange={(e) => setFormData({ ...formData, behavior: e.target.value })}
                            required
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-sm font-semibold text-slate-700">Consequencia (C) *</Label>
                          <Textarea
                            placeholder="O que aconteceu depois? Houve alguma intervencao?"
                            className="min-h-[88px] rounded-2xl border-slate-200 bg-slate-50/70 py-3 shadow-sm transition-all focus:border-rose-300"
                            value={formData.consequence}
                            onChange={(e) => setFormData({ ...formData, consequence: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                    </section>
                  </div>

                  <DialogFooter className="border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 rounded-2xl px-5 text-slate-600 hover:bg-slate-100"
                      onClick={() => setOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      className="h-11 rounded-2xl bg-rose-600 px-6 font-bold text-white shadow-lg shadow-rose-200 hover:bg-rose-700"
                      disabled={saving}
                    >
                      {saving ? "Salvando..." : "Registrar ABC"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-8">
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i: number) => (
              <div key={i} className="h-20 animate-pulse rounded-[24px] border border-white/60 bg-white/40" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center rounded-[32px] border border-dashed bg-white/5 py-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
              <History className="h-6 w-6 text-rose-200" />
            </div>
            <p className="text-sm font-medium text-slate-400">Nenhum registro comportamental.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map((r: any) => {
              const isExpanded = expandedId === r.id;
              return (
                <div
                  key={r.id}
                  className={cn(
                    "overflow-hidden rounded-[24px] border transition-all",
                    isExpanded ? "border-rose-200 bg-white/60 shadow-md" : "border-white/60 bg-white/40 hover:bg-white/60",
                  )}
                >
                  <div
                    className="flex cursor-pointer items-center justify-between p-5"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div
                        className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-black shadow-sm",
                          r.intensity >= 8
                            ? "bg-red-100 text-red-600"
                            : r.intensity >= 5
                              ? "bg-amber-100 text-amber-600"
                              : "bg-emerald-100 text-emerald-600",
                        )}
                      >
                        {r.intensity}
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 truncate text-sm font-bold leading-tight text-slate-800">{r.behavior}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {formatDate(r.occurrence_date)}
                          </span>
                          {r.duration_minutes && (
                            <span className="flex items-center gap-1 text-[10px] font-black tracking-widest text-slate-400">
                              Â· <Clock className="h-3 w-3" /> {r.duration_minutes} MIN
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(r.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100/50">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-slate-500" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="animate-in slide-in-from-top-1 space-y-4 px-5 pb-5 pt-0 duration-200">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/60 bg-white/50 p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-rose-600 opacity-60">
                            Antecedente (A)
                          </p>
                          <p className="text-xs font-medium leading-relaxed text-slate-700">{r.antecedent}</p>
                        </div>
                        <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-rose-600">
                            Comportamento (B)
                          </p>
                          <p className="text-xs font-bold leading-relaxed text-slate-800">{r.behavior}</p>
                        </div>
                        <div className="rounded-2xl border border-white/60 bg-white/50 p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-rose-600 opacity-60">
                            ConsequÃªncia (C)
                          </p>
                          <p className="text-xs font-medium leading-relaxed text-slate-700">{r.consequence}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
