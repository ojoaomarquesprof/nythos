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
import type { Profile } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const supabase = createClient();
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
      body: evaluations.map(e => [
        e.protocol_name,
        formatDate(e.evaluation_date),
        e.score || "—",
        e.status === "completed" ? "Concluído" : "Em andamento"
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillGray: 200, textColor: 40, fontStyle: "bold" },
    });

    addPdfFooter(doc);
    doc.save(`protocolos_${patient.full_name.toLowerCase().replace(/\s+/g, "_")}.pdf`);
  }

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <ClipboardCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <CardTitle className="text-base font-bold">Protocolos e Rastreadores</CardTitle>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            className="h-8 gap-1.5 text-muted-foreground hover:text-indigo-600"
            onClick={handleExportPdf}
            disabled={evaluations.length === 0 || !profile || !patient}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-8 gap-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
            onClick={() => {
              if (!hasSubscription && !subLoading) {
                router.push("/dashboard/settings/billing");
              } else {
                setOpen(true);
              }
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Registrar</span>
          </Button>
          <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Registrar Avaliação</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddEvaluation} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Protocolo / Teste *</Label>
                  <Select
                    value={formData.protocol}
                    onValueChange={(val) => setFormData({ ...formData, protocol: val })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Selecione o protocolo" />
                    </SelectTrigger>
                    <SelectContent>
                      {protocols.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Data da Aplicação *</Label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Score / Resultado</Label>
                    <Input
                      placeholder="Ex: 15/20"
                      value={formData.score}
                      onChange={(e) => setFormData({ ...formData, score: e.target.value })}
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <div className="flex gap-2">
                    {(["completed", "in_progress"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFormData({ ...formData, status: s })}
                        className={cn(
                          "flex-1 py-2 px-3 rounded-md text-xs font-medium border transition-all",
                          formData.status === s
                            ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
                            : "bg-background border-input text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {s === "completed" ? "Concluído" : "Em andamento"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                    disabled={saving}
                  >
                    {saving ? "Salvando..." : "Registrar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/10">
            <TableRow>
              <TableHead className="text-xs font-bold py-3 pl-4">Protocolo</TableHead>
              <TableHead className="text-xs font-bold py-3">Data</TableHead>
              <TableHead className="text-xs font-bold py-3">Score</TableHead>
              <TableHead className="text-xs font-bold py-3">Status</TableHead>
              <TableHead className="text-xs font-bold py-3 text-right pr-4">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5} className="py-4 text-center">
                    <div className="animate-pulse h-4 bg-muted rounded w-3/4 mx-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : evaluations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <ClipboardCheck className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-30" />
                  <p className="text-sm text-muted-foreground font-medium">Nenhum protocolo registrado.</p>
                </TableCell>
              </TableRow>
            ) : (
              evaluations.map((e) => (
                <TableRow key={e.id} className="group hover:bg-muted/10 transition-colors">
                  <TableCell className="text-sm font-bold pl-4">
                    {e.protocol_name}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(e.evaluation_date)}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium text-foreground">
                      {e.score || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] h-5 font-bold uppercase tracking-tight px-1.5",
                        e.status === "completed" 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                          : "bg-amber-50 text-amber-700 border-amber-100"
                      )}
                    >
                      {e.status === "completed" ? "Concluído" : "Andamento"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(e.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
