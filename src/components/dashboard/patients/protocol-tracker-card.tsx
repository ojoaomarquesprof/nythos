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
import { createPdfDocument, addPdfFooter, addTableToPdf } from "@/lib/pdf-generator";
import type { Profile, Patient } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
      .from("patient_evaluations")
      .select("*")
      .eq("patient_id", patientId)
      .order("evaluation_date", { ascending: false });

    if (!error && data) {
      setEvaluations(data);
    }
    setLoading(false);
  }

  async function handleAddEvaluation(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("patient_evaluations").insert({
      patient_id: patientId,
      user_id: user.id,
      protocol_name: formData.protocol,
      evaluation_date: formData.date,
      score: formData.score || null,
      status: formData.status,
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

    const { doc, startY } = await createPdfDocument({
      title: "Relatório de Protocolos e Avaliações",
      subtitle: patientDetails,
      profile
    });

    addTableToPdf(doc, {
      startY,
      head: [["Protocolo", "Data", "Score / Resultado", "Status"]],
      body: evaluations.map((e: any) => [
        e.protocol_name,
        formatDate(e.evaluation_date),
        e.score || "—",
        e.status === "completed" ? "Concluído" : "Em andamento"
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [200, 200, 200], textColor: [40, 40, 40], fontStyle: "bold" },
    });

    addPdfFooter(doc);
    doc.save(`protocolos_${patient.full_name.toLowerCase().replace(/\s+/g, "_")}.pdf`);
  }

  return (
    <Card className="glass-panel border-0 shadow-lg overflow-hidden rounded-[32px] animate-fade-in">
      <CardHeader className="pb-4 bg-white/30 backdrop-blur-sm border-b border-white/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal- flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-teal-" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-teal-">Protocolos e Avaliações</CardTitle>
              <CardDescription className="text-xs">
                Rastreamento de testes e avaliações aplicadas.
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              className="h-9 px-4 rounded-full border-teal- text-teal- hover:bg-teal- transition-all"
              onClick={handleExportPdf}
              disabled={evaluations.length === 0 || !profile || !patient}
            >
              <Download className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">PDF</span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
              <Button 
                size="sm" 
                className="bg-teal- hover:bg-teal- text-white h-9 px-5 rounded-full shadow-lg shadow-teal- transition-all active:scale-95" 
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
                  <DialogTitle className="text-xl font-bold text-teal-">Registrar Avaliação</DialogTitle>
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
                              ? "bg-white text-teal- shadow-sm"
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
                      className="flex-1 bg-teal- hover:bg-teal- text-white rounded-full h-12 font-bold shadow-lg shadow-teal-"
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
        <Table>
          <TableHeader className="bg-teal-/30">
            <TableRow className="border-b border-teal-/50 hover:bg-transparent">
              <TableHead className="text-[10px] font-bold text-teal-/60 uppercase tracking-widest py-4 pl-8">Protocolo</TableHead>
              <TableHead className="text-[10px] font-bold text-teal-/60 uppercase tracking-widest py-4">Data</TableHead>
              <TableHead className="text-[10px] font-bold text-teal-/60 uppercase tracking-widest py-4">Score</TableHead>
              <TableHead className="text-[10px] font-bold text-teal-/60 uppercase tracking-widest py-4">Status</TableHead>
              <TableHead className="text-[10px] font-bold text-teal-/60 uppercase tracking-widest py-4 text-right pr-8">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5} className="py-8 text-center">
                    <div className="animate-pulse h-4 bg-teal-/20 rounded-full w-3/4 mx-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : evaluations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-teal- flex items-center justify-center mx-auto mb-3">
                    <ClipboardCheck className="w-6 h-6 text-teal-" />
                  </div>
                  <p className="text-sm text-slate-400 font-medium">Nenhum protocolo registrado.</p>
                </TableCell>
              </TableRow>
            ) : (
              evaluations.map((e: any) => (
                <TableRow key={e.id} className="group hover:bg-white/40 transition-colors border-b border-white/20 last:border-0">
                  <TableCell className="text-sm font-bold text-teal-/80 py-5 pl-8">
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
      </CardContent>
    </Card>
  );
}
