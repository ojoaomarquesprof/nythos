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
  const supabase = createClient();
  const router = useRouter();
  const { hasSubscription, loading: subLoading } = useSubscription();

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    specialty: "fono",
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
    <Card className="border-0 shadow-sm overflow-hidden h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <CardTitle className="text-base font-bold">Rede de Apoio</CardTitle>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            className="h-8 gap-1.5 text-muted-foreground hover:text-primary"
            onClick={handleExportPdf}
            disabled={professionals.length === 0 || !profile || !patient}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-8 gap-1.5 text-primary hover:text-primary hover:bg-primary/5"
            onClick={() => {
              if (!hasSubscription && !subLoading) {
                router.push("/dashboard/settings/billing");
              } else {
                setOpen(true);
              }
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar</span>
          </Button>
          <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Novo Profissional</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddProfessional} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nome do Profissional *</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Dra. Ana Souza"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="specialty">Especialidade *</Label>
                  <Select
                    value={formData.specialty}
                    onValueChange={(val: any) => setFormData({ ...formData, specialty: val || "" })}
                  >
                    <SelectTrigger id="specialty" className="h-10">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {specialties.map((s: { value: string; label: string }) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">Telefone / WhatsApp</Label>
                  <Input
                    id="phone"
                    placeholder="(00) 00000-0000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    placeholder="Ex: Atendimento nas quartas pela manhã"
                    className="min-h-[80px] resize-none"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
                    className="flex-1 gradient-primary text-white"
                    disabled={saving}
                  >
                    {saving ? "Salvando..." : "Cadastrar"}
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
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="w-32 h-4 bg-muted rounded" />
                  <div className="w-20 h-3 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : professionals.length === 0 ? (
          <div className="py-8 text-center bg-muted/20 rounded-xl border border-dashed border-muted">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">Nenhum profissional na rede.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {professionals.map((contact: any) => {
              const specLabel = specialties.find(s => s.value === contact.specialty)?.label || contact.specialty;
              const isSchool = contact.specialty === "escola";

              return (
                <div 
                  key={contact.id} 
                  className="flex items-center gap-3 p-3 rounded-xl border border-muted hover:bg-muted/30 transition-colors group"
                >
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                    isSchool ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"
                  )}>
                    {isSchool ? <GraduationCap className="w-5 h-5" /> : <Stethoscope className="w-5 h-5" />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate leading-none mb-1">{contact.name}</p>
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{specLabel}</p>
                    {contact.phone && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        {contact.phone}
                      </div>
                    )}
                  </div>

                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-50"
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
