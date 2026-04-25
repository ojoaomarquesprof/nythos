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
  Download
} from "lucide-react";
import { createPdfDocument, addPdfFooter, addTableToPdf } from "@/lib/pdf-generator";
import type { Profile, Patient } from "@/types/database";
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
  profile 
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
  const supabase = createClient();
  const router = useRouter();
  const { hasSubscription, loading: subLoading } = useSubscription();

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
    const { data, error } = await supabase
      .from("abc_records")
      .select("*")
      .eq("patient_id", patientId)
      .order("occurrence_date", { ascending: false });

    if (!error && data) {
      setRecords(data);
    }
    setLoading(false);
  }

  async function handleAddRecord(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("abc_records").insert({
      patient_id: patientId,
      user_id: user.id,
      occurrence_date: formData.date,
      antecedent: formData.antecedent,
      behavior: formData.behavior,
      consequence: formData.consequence,
      intensity: formData.intensity,
      duration_minutes: formData.duration ? parseInt(formData.duration) : null,
    });

    if (!error) {
      setOpen(false);
      setFormData({ 
        date: new Date().toISOString().split("T")[0], 
        antecedent: "", 
        behavior: "", 
        consequence: "", 
        intensity: 5, 
        duration: "" 
      });
      fetchAbcRecords();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este registro?")) return;
    
    const { error } = await supabase
      .from("abc_records")
      .delete()
      .eq("id", id);

    if (!error) {
      setRecords(records.filter(r => r.id !== id));
    }
  }

  async function handleExportPdf() {
    if (!profile || !records.length || !patient) return;
    
    const patientDetails = [
      `Paciente: ${patient.full_name}`,
      patient.cpf ? `CPF: ${patient.cpf}` : null,
      patient.date_of_birth ? `Data de Nasc.: ${formatDate(patient.date_of_birth)}` : null,
      `Data do Relatório: ${new Date().toLocaleDateString("pt-BR")}`
    ].filter(Boolean).join(" | ");

    const { doc, startY } = await createPdfDocument({
      title: "Registro de Análise do Comportamento (ABC)",
      subtitle: patientDetails,
      profile
    });

    addTableToPdf(doc, {
      startY,
      head: [["Data", "Comportamento", "Antecedente (A)", "Consequência (C)", "Intensidade"]],
      body: records.map((r: any) => [
        formatDate(r.occurrence_date),
        r.behavior,
        r.antecedent,
        r.consequence,
        r.intensity.toString()
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [200, 200, 200], textColor: [40, 40, 40], fontStyle: "bold" },
      columnStyles: {
        1: { cellWidth: 40 },
        2: { cellWidth: 45 },
        3: { cellWidth: 45 },
      }
    });

    addPdfFooter(doc);
    doc.save(`abc_${patient.full_name.toLowerCase().replace(/\s+/g, "_")}.pdf`);
  }

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
            <Activity className="w-4 h-4 text-rose-600" />
          </div>
          <CardTitle className="text-base font-bold">Registro Comportamental (ABC)</CardTitle>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            className="h-8 gap-1.5 text-muted-foreground hover:text-rose-600"
            onClick={handleExportPdf}
            disabled={records.length === 0 || !profile || !patient}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-8 gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            onClick={() => {
              if (!hasSubscription && !subLoading) {
                router.push("/dashboard/settings/billing");
              } else {
                setOpen(true);
              }
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Registro</span>
          </Button>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Novo Registro ABC</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddRecord} className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Data da Ocorrência *</Label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duração (minutos)</Label>
                    <Input
                      type="number"
                      placeholder="Ex: 5"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label>Intensidade (1 a 10)</Label>
                    <span className="text-xs font-bold text-rose-600">{formData.intensity}</span>
                  </div>
                  <Slider
                    value={[formData.intensity]}
                    onValueChange={(val: number[]) => setFormData({ ...formData, intensity: val[0] })}
                    max={10}
                    min={1}
                    step={1}
                    className="py-2"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Antecedente (A)</Label>
                  <Textarea
                    placeholder="O que aconteceu imediatamente antes?"
                    className="min-h-[80px] resize-none"
                    value={formData.antecedent}
                    onChange={(e) => setFormData({ ...formData, antecedent: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Comportamento (B)</Label>
                  <Textarea
                    placeholder="Descrição clara do que o paciente fez"
                    className="min-h-[80px] resize-none"
                    value={formData.behavior}
                    onChange={(e) => setFormData({ ...formData, behavior: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Consequência (C)</Label>
                  <Textarea
                    placeholder="O que aconteceu após / Qual foi a intervenção?"
                    className="min-h-[80px] resize-none"
                    value={formData.consequence}
                    onChange={(e) => setFormData({ ...formData, consequence: e.target.value })}
                    required
                  />
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
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
                    disabled={saving}
                  >
                    {saving ? "Salvando..." : "Salvar Registro"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent className="p-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i: number) => (
              <div key={i} className="animate-pulse h-16 bg-muted rounded-xl" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="py-10 text-center bg-muted/20 rounded-xl border border-dashed border-muted">
            <History className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-30" />
            <p className="text-sm text-muted-foreground font-medium">Nenhum registro comportamental.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((r: any) => {
              const isExpanded = expandedId === r.id;
              return (
                <div 
                  key={r.id} 
                  className={cn(
                    "rounded-xl border border-muted overflow-hidden transition-all",
                    isExpanded ? "bg-muted/30 ring-1 ring-rose-200" : "hover:bg-muted/10"
                  )}
                >
                  <div 
                    className="p-3 flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                        r.intensity >= 8 ? "bg-red-100 text-red-600" : 
                        r.intensity >= 5 ? "bg-amber-100 text-amber-600" : 
                        "bg-green-100 text-green-600"
                      )}>
                        {r.intensity}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate leading-tight">{r.behavior}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider">
                            {formatDate(r.occurrence_date)}
                          </span>
                          {r.duration_minutes && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                              · <Clock className="w-2.5 h-2.5" /> {r.duration_minutes} min
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="w-8 h-8 text-muted-foreground hover:text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(r.id);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 space-y-3 animate-in slide-in-from-top-1 duration-200">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg bg-background border border-muted">
                          <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mb-1.5">Antecedente (A)</p>
                          <p className="text-sm leading-relaxed">{r.antecedent}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-background border border-muted ring-1 ring-rose-100">
                          <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mb-1.5">Comportamento (B)</p>
                          <p className="text-sm leading-relaxed">{r.behavior}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-background border border-muted">
                          <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mb-1.5">Consequência (C)</p>
                          <p className="text-sm leading-relaxed">{r.consequence}</p>
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
