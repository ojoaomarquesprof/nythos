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
  const supabase = createClient() as any;
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
    <Card className="glass-panel border-0 shadow-lg overflow-hidden rounded-[32px] animate-fade-in">
      <CardHeader className="pb-4 bg-white/30 backdrop-blur-sm border-b border-white/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center">
              <Activity className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-rose-900">Registro Comportamental (ABC)</CardTitle>
              <CardDescription className="text-xs">
                Análise de Antecedentes, Comportamentos e Consequências.
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              className="h-9 px-4 rounded-full border-rose-200 text-rose-600 hover:bg-rose-50 transition-all"
              onClick={handleExportPdf}
              disabled={records.length === 0 || !profile || !patient}
            >
              <Download className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">PDF</span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
              <Button 
                size="sm" 
                className="bg-rose-600 hover:bg-rose-700 text-white h-9 px-5 rounded-full shadow-lg shadow-rose-200 transition-all active:scale-95" 
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
              <DialogContent className="sm:max-w-lg rounded-[32px] border-0 shadow-2xl">
                <DialogHeader className="p-4">
                  <DialogTitle className="text-xl font-bold text-rose-900">Novo Registro ABC</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddRecord} className="space-y-5 p-4 pt-0">
                  <div className="grid grid-cols-2 gap-4">
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
                      <Label className="text-sm font-bold text-slate-700">Duração (min)</Label>
                      <Input
                        type="number"
                        placeholder="Ex: 5"
                        value={formData.duration}
                        onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                        className="glass-input-field h-12 bg-slate-50/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center mb-2">
                      <Label className="text-sm font-bold text-slate-700">Intensidade (1 a 10)</Label>
                      <span className="text-sm font-black text-rose-600 bg-rose-50 px-3 py-1 rounded-full">{formData.intensity}</span>
                    </div>
                    <Slider
                      value={[formData.intensity]}
                      onValueChange={(val: any) => setFormData({ ...formData, intensity: Array.isArray(val) ? val[0] : val })}
                      max={10}
                      min={1}
                      step={1}
                      className="py-4"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-bold text-slate-700">Antecedente (A)</Label>
                    <Textarea
                      placeholder="O que aconteceu imediatamente antes?"
                      className="rounded-2xl border-slate-200 focus:border-primary transition-all shadow-sm bg-slate-50/50 min-h-[80px] py-4"
                      value={formData.antecedent}
                      onChange={(e) => setFormData({ ...formData, antecedent: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-bold text-slate-700">Comportamento (B)</Label>
                    <Textarea
                      placeholder="Descrição clara do que o paciente fez"
                      className="rounded-2xl border-rose-100 focus:border-rose-300 transition-all shadow-sm bg-rose-50/30 min-h-[80px] py-4"
                      value={formData.behavior}
                      onChange={(e) => setFormData({ ...formData, behavior: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-bold text-slate-700">Consequência (C)</Label>
                    <Textarea
                      placeholder="O que aconteceu após / Qual foi a intervenção?"
                      className="rounded-2xl border-slate-200 focus:border-primary transition-all shadow-sm bg-slate-50/50 min-h-[80px] py-4"
                      value={formData.consequence}
                      onChange={(e) => setFormData({ ...formData, consequence: e.target.value })}
                      required
                    />
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
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded-full h-12 font-bold shadow-lg shadow-rose-200"
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
      
      <CardContent className="p-8">
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i: number) => (
              <div key={i} className="animate-pulse h-20 bg-white/40 rounded-[24px] border border-white/60" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="py-12 text-center border border-dashed rounded-[32px] bg-white/5 flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-3">
              <History className="w-6 h-6 text-rose-200" />
            </div>
            <p className="text-sm text-slate-400 font-medium">Nenhum registro comportamental.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map((r: any) => {
              const isExpanded = expandedId === r.id;
              return (
                <div 
                  key={r.id} 
                  className={cn(
                    "rounded-[24px] border transition-all overflow-hidden",
                    isExpanded ? "bg-white/60 border-rose-200 shadow-md" : "bg-white/40 border-white/60 hover:bg-white/60"
                  )}
                >
                  <div 
                    className="p-5 flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black shadow-sm",
                        r.intensity >= 8 ? "bg-red-100 text-red-600" : 
                        r.intensity >= 5 ? "bg-amber-100 text-amber-600" : 
                        "bg-emerald-100 text-emerald-600"
                      )}>
                        {r.intensity}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate leading-tight mb-1">{r.behavior}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                            {formatDate(r.occurrence_date)}
                          </span>
                          {r.duration_minutes && (
                            <span className="flex items-center gap-1 text-[10px] text-slate-400 font-black tracking-widest">
                              · <Clock className="w-3 h-3" /> {r.duration_minutes} MIN
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="w-9 h-9 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(r.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="w-9 h-9 rounded-full bg-slate-100/50 flex items-center justify-center">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-5 pb-5 pt-0 space-y-4 animate-in slide-in-from-top-1 duration-200">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="p-4 rounded-2xl bg-white/50 border border-white/60">
                          <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2 opacity-60">Antecedente (A)</p>
                          <p className="text-xs leading-relaxed font-medium text-slate-700">{r.antecedent}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-100">
                          <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2">Comportamento (B)</p>
                          <p className="text-xs leading-relaxed font-bold text-slate-800">{r.behavior}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-white/50 border border-white/60">
                          <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2 opacity-60">Consequência (C)</p>
                          <p className="text-xs leading-relaxed font-medium text-slate-700">{r.consequence}</p>
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
