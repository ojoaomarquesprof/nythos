"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubscription } from "@/hooks/use-subscription";
import { 
  ClipboardCheck, 
  Plus, 
  Calendar, 
  Trophy, 
  Trash2,
  ExternalLink,
  ChevronRight,
  Download
} from "lucide-react";
import { usePdfExport } from "@/hooks/use-pdf-export";
import type { Profile, Patient } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/constants";

interface Evaluation {
  id: string;
  patient_id: string;
  protocol_name: string;
  evaluation_date: string;
  score: string | null;
  status: "in_progress" | "completed";
  created_at: string;
}

const protocols = [
  "M-CHAT-R",
  "Denver II",
  "VB-MAPP",
  "CARS-2",
  "PEP-3",
  "IDADI",
  "PROTEA-R",
  "VABS-3",
  "Outro",
];

export function ProtocolTrackerCard({ 
  patientId, 
  patient, 
  profile 
}: { 
  patientId: string;
  patient?: Patient | null;
  profile?: Profile | null;
}) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient() as any;
  const router = useRouter();
  const { hasSubscription, loading: subLoading } = useSubscription();
  const { exportPdf, isExporting: isExportingPdf } = usePdfExport();

  // Form State
  const [formData, setFormData] = useState({
    protocol: "M-CHAT-R",
    date: new Date().toISOString().split("T")[0],
    score: "",
    status: "completed" as Evaluation["status"],
  });

  useEffect(() => {
    fetchEvaluations();
  }, [patientId]);

  async function fetchEvaluations() {
    setLoading(true);
    const { data, error } = await supabase
      .rpc("get_patient_evaluations_decrypted", { p_patient_id: patientId });

    if (!error && data) {
      setEvaluations(data);
    }
    setLoading(false);
  }

  async function handleAddEvaluation(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.rpc("create_patient_evaluation_secure", {
      p_patient_id: patientId,
      p_protocol_name: formData.protocol,
      p_evaluation_date: formData.date,
      p_score: formData.score || null,
      p_status: formData.status,
      p_notes: null,
    });

    if (!error) {
      setOpen(false);
      setFormData({ 
        protocol: "M-CHAT-R", 
        date: new Date().toISOString().split("T")[0], 
        score: "", 
        status: "completed" 
      });
      fetchEvaluations();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este registro?")) return;
    
    const { error } = await supabase
      .from("patient_evaluations")
      .delete()
      .eq("id", id);

    if (!error) {
      setEvaluations(evaluations.filter(e => e.id !== id));
    }
  }
  
  async function handleExportPdf() {
    if (!profile || !evaluations.length || !patient) return;
    
    const patientDetails = [
      `Paciente: ${patient.full_name}`,
      patient.cpf ? `CPF: ${patient.cpf}` : null,
      patient.date_of_birth ? `Data de Nasc.: ${formatDate(patient.date_of_birth)}` : null,
      `Data do Relatório: ${new Date().toLocaleDateString("pt-BR")}`
    ].filter(Boolean).join(" | ");

    const tableBody = evaluations.map((e: any) => [
      e.protocol_name,
      formatDate(e.evaluation_date),
      e.score || "—",
      e.status === "completed" ? "Concluído" : "Em andamento"
    ]);

    await exportPdf({
      title: "Relatório de Protocolos e Avaliações",
      subtitle: patientDetails,
      profile,
      fileName: `protocolos_${patient.full_name.toLowerCase().replace(/\s+/g, "_")}.pdf`,
      content: [
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto'],
            body: [
              [
                { text: 'Protocolo', bold: true, fillColor: '#e2e8f0', color: '#1e293b', margin: [5, 5] },
                { text: 'Data', bold: true, fillColor: '#e2e8f0', color: '#1e293b', margin: [5, 5] },
                { text: 'Score / Resultado', bold: true, fillColor: '#e2e8f0', color: '#1e293b', margin: [5, 5] },
                { text: 'Status', bold: true, fillColor: '#e2e8f0', color: '#1e293b', margin: [5, 5] }
              ],
              ...tableBody.map(row => row.map(cell => ({ text: cell, margin: [5, 5] })))
            ]
          },
          layout: {
            fillColor: function (rowIndex: number) {
              return (rowIndex % 2 === 0 && rowIndex > 0) ? '#f8fafc' : null;
            },
            hLineColor: '#cbd5e1',
            vLineColor: '#cbd5e1'
          }
        }
      ]
    });
  }

  return (
    <Card className="glass-panel border-0 shadow-lg overflow-hidden rounded-[32px] animate-fade-in">
      <CardHeader className="pb-4 bg-white/30 backdrop-blur-sm border-b border-white/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-100 flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-teal-800 leading-tight">Protocolos e Avaliações</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Rastreamento de testes e avaliações aplicadas.
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button 
              size="sm" 
              variant="outline" 
              className="h-9 px-4 rounded-full border-teal-200 text-teal-600 hover:bg-teal-50 transition-all"
              onClick={handleExportPdf}
              disabled={evaluations.length === 0 || !profile || !patient || isExportingPdf}
            >
              <Download className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">PDF</span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
              <Button 
                size="sm" 
                className="bg-teal-600 hover:bg-teal-700 text-white h-9 px-5 rounded-full shadow-lg shadow-teal-200 transition-all active:scale-95" 
                onClick={() => {
                  if (!hasSubscription && !subLoading) {
                    router.push("/dashboard/settings/billing");
                  } else {
                    setOpen(true);
                  }
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                <span>Novo</span>
              </Button>
              <DialogContent className="sm:max-w-md rounded-[32px] border-0 shadow-2xl">
                <DialogHeader className="p-4">
                  <DialogTitle className="text-xl font-bold text-teal-800">Registrar Avaliação</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddEvaluation} className="space-y-5 p-4 pt-0">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-bold text-slate-700">Protocolo / Teste *</Label>
                    <Select
                      value={formData.protocol}
                      onValueChange={(val: any) => setFormData({ ...formData, protocol: val || "" })}
                    >
                      <SelectTrigger className="glass-input-field h-12 bg-slate-50/50">
                        <SelectValue placeholder="Selecione o protocolo" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-white/40 backdrop-blur-xl">
                        {protocols.map((p: string) => (
                          <SelectItem key={p} value={p} className="rounded-lg">
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-bold text-slate-700">Data *</Label>
                      <Input
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                        className="glass-input-field h-12 bg-slate-50/50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-bold text-slate-700">Score</Label>
                      <Input
                        placeholder="Ex: 15/20"
                        value={formData.score}
                        onChange={(e) => setFormData({ ...formData, score: e.target.value })}
                        className="glass-input-field h-12 bg-slate-50/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-bold text-slate-700">Status</Label>
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                      {(["completed", "in_progress"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setFormData({ ...formData, status: s })}
                          className={cn(
                            "flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all",
                            formData.status === s
                              ? "bg-white text-teal-600 shadow-sm"
                              : "text-slate-500 hover:bg-white/50"
                          )}
                        >
                          {s === "completed" ? "Concluído" : "Andamento"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1 rounded-full h-12"
                      onClick={() => setOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-full h-12 font-bold shadow-lg shadow-teal-200"
                      disabled={saving}
                    >
                      {saving ? "Salvando..." : "Registrar"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="overflow-x-auto w-full">
          <Table>
            <TableHeader className="bg-teal-50/30">
              <TableRow className="border-b border-teal-100/50 hover:bg-transparent">
                <TableHead className="text-[10px] font-bold text-teal-600/60 uppercase tracking-widest py-4 pl-8">Protocolo</TableHead>
                <TableHead className="text-[10px] font-bold text-teal-600/60 uppercase tracking-widest py-4">Data</TableHead>
                <TableHead className="text-[10px] font-bold text-teal-600/60 uppercase tracking-widest py-4">Score</TableHead>
                <TableHead className="text-[10px] font-bold text-teal-600/60 uppercase tracking-widest py-4">Status</TableHead>
                <TableHead className="text-[10px] font-bold text-teal-600/60 uppercase tracking-widest py-4 text-right pr-8">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {loading ? (
              [1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5} className="py-8 text-center">
                    <div className="animate-pulse h-4 bg-teal-100/20 rounded-full w-3/4 mx-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : evaluations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-3">
                    <ClipboardCheck className="w-6 h-6 text-teal-600" />
                  </div>
                  <p className="text-sm text-slate-400 font-medium">Nenhum protocolo registrado.</p>
                </TableCell>
              </TableRow>
            ) : (
              evaluations.map((e: any) => (
                <TableRow key={e.id} className="group hover:bg-white/40 transition-colors border-b border-white/20 last:border-0">
                  <TableCell className="text-sm font-bold text-teal-700/80 py-5 pl-8">
                    {e.protocol_name}
                  </TableCell>
                  <TableCell className="text-[11px] text-slate-500 font-medium">
                    {formatDate(e.evaluation_date)}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                      {e.score || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[9px] h-5 font-bold uppercase tracking-widest px-2 rounded-full border-0 shadow-sm",
                        e.status === "completed" 
                          ? "bg-emerald-100 text-emerald-700" 
                          : "bg-amber-100 text-amber-700"
                      )}
                    >
                      {e.status === "completed" ? "Concluído" : "Em andamento"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-9 h-9 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(e.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
