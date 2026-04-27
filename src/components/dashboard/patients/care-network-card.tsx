"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubscription } from "@/hooks/use-subscription";
import { 
  Users, 
  Plus, 
  Phone, 
  Stethoscope, 
  GraduationCap, 
  MoreVertical, 
  Trash2,
  AlertCircle,
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
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SPECIALTIES, formatDate } from "@/lib/constants";

interface Professional {
  id: string;
  patient_id: string;
  name: string;
  specialty: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

const specialties = SPECIALTIES;

export function CareNetworkCard({ 
  patientId, 
  patient, 
  profile 
}: { 
  patientId: string;
  patient?: Patient | null;
  profile?: Profile | null;
}) {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient() as any;
  const router = useRouter();
  const { hasSubscription, loading: subLoading } = useSubscription();

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    specialty: "Fonoaudiologia",
    phone: "",
    notes: "",
  });

  useEffect(() => {
    fetchCareNetwork();
  }, [patientId]);

  async function fetchCareNetwork() {
    setLoading(true);
    const { data, error } = await supabase
      .from("care_network")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setProfessionals(data);
    }
    setLoading(false);
  }

  async function handleAddProfessional(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("care_network").insert({
      patient_id: patientId,
      user_id: user.id,
      name: formData.name,
      specialty: formData.specialty,
      phone: formData.phone || null,
      notes: formData.notes || null,
    });

    if (!error) {
      setOpen(false);
      setFormData({ name: "", specialty: "fono", phone: "", notes: "" });
      fetchCareNetwork();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase
      .from("care_network")
      .delete()
      .eq("id", id);

    if (!error) {
      setProfessionals(professionals.filter(p => p.id !== id));
    }
  }

  async function handleExportPdf() {
    if (!profile || !professionals.length || !patient) return;
    
    const patientDetails = [
      `Paciente: ${patient.full_name}`,
      patient.cpf ? `CPF: ${patient.cpf}` : null,
      patient.date_of_birth ? `Data de Nasc.: ${formatDate(patient.date_of_birth)}` : null,
      `Data do Relatório: ${new Date().toLocaleDateString("pt-BR")}`
    ].filter(Boolean).join(" | ");

    const { doc, startY } = await createPdfDocument({
      title: "Rede de Apoio Multidisciplinar",
      subtitle: patientDetails,
      profile
    });

    addTableToPdf(doc, {
      startY,
      head: [["Nome do Profissional", "Especialidade", "Contato"]],
      body: professionals.map((contact: Professional) => {
        const specLabel = specialties.find(s => s.value === contact.specialty)?.label || contact.specialty;
        return [contact.name, specLabel, contact.phone || "—"];
      }),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [229, 231, 235], textColor: [40, 40, 40], fontStyle: "bold" },
    });

    addPdfFooter(doc);
    doc.save(`rede_apoio_${patient.full_name.toLowerCase().replace(/\s+/g, "_")}.pdf`);
  }

  return (
    <Card className="glass-panel border-0 shadow-lg overflow-hidden rounded-[32px] animate-fade-in">
      <CardHeader className="pb-4 bg-white/30 backdrop-blur-sm border-b border-white/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-primary">Rede de Apoio</CardTitle>
              <CardDescription className="text-xs">
                Contatos dos profissionais que atendem o paciente.
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              className="h-9 px-4 rounded-full border-primary/20 text-primary hover:bg-primary/5 transition-all"
              onClick={handleExportPdf}
              disabled={professionals.length === 0 || !profile || !patient}
            >
              <Download className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">PDF</span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
              <Button 
                size="sm" 
                className="gradient-primary text-white h-9 px-5 rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-95" 
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
                  <DialogTitle className="text-xl font-bold text-primary">Novo Profissional</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddProfessional} className="space-y-5 p-4 pt-0">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-sm font-bold text-slate-700">Nome do Profissional *</Label>
                    <Input
                      id="name"
                      placeholder="Ex: Dra. Ana Souza"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="glass-input-field h-12 bg-slate-50/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="specialty" className="text-sm font-bold text-slate-700">Especialidade *</Label>
                    <Select
                      value={formData.specialty}
                      onValueChange={(val: any) => setFormData({ ...formData, specialty: val || "" })}
                    >
                      <SelectTrigger id="specialty" className="glass-input-field h-12 bg-slate-50/50 w-full">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-white/40 backdrop-blur-xl">
                        {specialties.map((s: { value: string; label: string }) => (
                          <SelectItem key={s.value} value={s.value} className="rounded-lg">
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-sm font-bold text-slate-700">Telefone / WhatsApp</Label>
                    <Input
                      id="phone"
                      placeholder="(00) 00000-0000"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="glass-input-field h-12 bg-slate-50/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="notes" className="text-sm font-bold text-slate-700">Observações</Label>
                    <Textarea
                      id="notes"
                      placeholder="Ex: Atendimento nas quartas pela manhã"
                      className="rounded-2xl border-slate-200 focus:border-primary transition-all shadow-sm bg-slate-50/50 min-h-[80px] py-4"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
                      className="flex-1 gradient-primary text-white rounded-full h-12 font-bold shadow-lg shadow-primary/20"
                      disabled={saving}
                    >
                      {saving ? "Salvando..." : "Cadastrar"}
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
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-4 p-4 rounded-2xl bg-white/40 border border-white/60">
                <div className="w-12 h-12 rounded-xl bg-muted/20" />
                <div className="flex-1 space-y-2">
                  <div className="w-32 h-4 bg-muted/20 rounded" />
                  <div className="w-20 h-3 bg-muted/20 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : professionals.length === 0 ? (
          <div className="py-12 text-center border border-dashed rounded-[32px] bg-white/5 flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center mb-3">
              <Users className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">Nenhum profissional na rede de apoio deste paciente.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {professionals.map((contact: any) => {
              const OLD_MAPPING: Record<string, string> = {
                fono: "Fonoaudiologia",
                to: "Terapia Ocupacional",
                at: "Acompanhamento Terapêutico",
                neuro: "Neuropediatria",
                psico: "Psicopedagogia"
              };
              const specLabel = specialties.find(s => s.value === contact.specialty)?.label || OLD_MAPPING[contact.specialty] || contact.specialty;
              const isSchool = contact.specialty === "escola";

              return (
                <div 
                  key={contact.id} 
                  className="flex items-center justify-between p-4 rounded-[24px] border border-white/40 bg-white/40 hover:bg-white/60 transition-all group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm",
                      isSchool ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"
                    )}>
                      {isSchool ? <GraduationCap className="w-6 h-6" /> : <Stethoscope className="w-6 h-6" />}
                    </div>
                    
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-primary/80 truncate leading-none mb-1.5">{contact.name}</p>
                      <p className="text-xs text-muted-foreground font-bold">{specLabel}</p>
                      {contact.phone && (
                        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground font-medium">
                          <Phone className="w-3 h-3" />
                          {contact.phone}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-9 h-9 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(contact.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
