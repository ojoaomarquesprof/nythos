"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Save, 
  User, 
  Phone, 
  Mail, 
  Calendar, 
  MapPin, 
  Heart, 
  Shield, 
  Wallet,
  ClipboardList,
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export default function NewPatientPage() {
  const router = useRouter();
  const supabase = createClient() as any;
  const { therapistId } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    cpf: "",
    date_of_birth: "",
    gender: "prefer_not_to_say",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    address: "",
    notes: "",
    session_price: "",
    insurance_provider: "",
    insurance_number: "",
    // Campos do Responsável
    has_guardian: false,
    guardian_name: "",
    guardian_email: "",
    guardian_phone: "",
    guardian_cpf: "",
    guardian_relationship: "mother",
    guardian_is_financial: true,
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Você precisa estar logado.");
      setIsLoading(false);
      return;
    }

    try {
      const { data: patientData, error: insertError } = await supabase
        .from("patients")
        .insert({
          user_id: therapistId || user.id,
          full_name: form.full_name,
          email: form.email || null,
          phone: form.phone || null,
          cpf: form.cpf || null,
          date_of_birth: form.date_of_birth || null,
          gender: form.gender,
          emergency_contact_name: form.emergency_contact_name || null,
          emergency_contact_phone: form.emergency_contact_phone || null,
          address: form.address || null,
          notes_encrypted: form.notes || null,
          session_price: form.session_price ? parseFloat(form.session_price) : null,
          insurance_provider: form.insurance_provider || null,
          insurance_number: form.insurance_number || null,
          status: "active",
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Supabase error (patient):", insertError);
        setError(insertError.message);
        setIsLoading(false);
        return;
      }

      // Se tiver responsável, insere agora
      if (form.has_guardian && patientData) {
        const { error: guardianError } = await supabase
          .from("patient_guardians")
          .insert({
            patient_id: patientData.id,
            full_name: form.guardian_name,
            email: form.guardian_email || null,
            phone: form.guardian_phone || null,
            cpf: form.guardian_cpf || null,
            relationship: form.guardian_relationship,
            is_financial_responsible: form.guardian_is_financial,
          });

        if (guardianError) {
          console.error("Supabase error (guardian):", guardianError);
          alert("Paciente criado, mas houve um erro ao salvar o responsável: " + guardianError.message);
        }
      }

      router.push("/dashboard/patients");
      router.refresh();
    } catch (err: any) {
      console.error("Caught error:", err);
      setError(err?.message || "Erro desconhecido ao salvar o paciente.");
      setIsLoading(false);
    }
  };

  return (
    <div className="px-4 py-8 md:px-8 md:py-10 max-w-5xl mx-auto w-full space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="text-muted-foreground hover:bg-white/40 mb-2 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Pacientes
          </Button>
          <h1 className="text-4xl font-black text-primary tracking-tight">Novo Paciente</h1>
          <p className="text-base font-bold text-muted-foreground/80">Inicie o cadastro de um novo acompanhamento clínico</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            className="rounded-full px-8 h-12 font-bold"
            onClick={() => router.back()}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            className="gradient-primary text-white rounded-full px-10 h-12 font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                SALVAR PACIENTE
              </>
            )}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="p-4 rounded-[20px] bg-red-50 border border-red-100 flex items-center gap-3 text-red-600 animate-slide-up">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-bold">{error}</p>
          </div>
        )}

        {/* Dados Pessoais Section */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-primary ml-2 flex items-center gap-2">
            <div className="w-2 h-8 bg-primary rounded-full" />
            Dados Pessoais
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-md">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="full_name" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Nome Completo *</Label>
              <Input
                id="full_name"
                name="full_name"
                placeholder="Nome do paciente"
                className="glass-input-field h-14 text-base font-bold px-6"
                value={form.full_name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date_of_birth" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Data de Nascimento</Label>
              <Input
                id="date_of_birth"
                name="date_of_birth"
                type="date"
                className="glass-input-field h-14 text-base font-bold px-6"
                value={form.date_of_birth}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="exemplo@email.com"
                className="glass-input-field h-14 text-base font-bold px-6"
                value={form.email}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Telefone</Label>
              <Input
                id="phone"
                name="phone"
                placeholder="(11) 99999-9999"
                className="glass-input-field h-14 text-base font-bold px-6"
                value={form.phone}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpf" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">CPF</Label>
              <Input
                id="cpf"
                name="cpf"
                placeholder="000.000.000-00"
                className="glass-input-field h-14 text-base font-bold px-6"
                value={form.cpf}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gender" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Gênero</Label>
              <select
                id="gender"
                name="gender"
                className="flex h-14 w-full rounded-full border border-white/40 bg-white/50 px-6 py-2 text-base font-bold focus:ring-primary/20 transition-all"
                value={form.gender}
                onChange={handleChange}
              >
                <option value="prefer_not_to_say">Não informado</option>
                <option value="female">Feminino</option>
                <option value="male">Masculino</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="address" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Endereço</Label>
              <Input
                id="address"
                name="address"
                placeholder="Rua, número, bairro..."
                className="glass-input-field h-14 text-base font-bold px-6"
                value={form.address}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        {/* Responsável Legal Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between ml-2">
            <h3 className="text-xl font-bold text-primary flex items-center gap-2">
              <div className="w-2 h-8 bg-indigo-400 rounded-full" />
              Responsável Legal
            </h3>
            <div className="flex items-center gap-2 bg-white/40 px-4 py-2 rounded-full border border-white/60 shadow-sm">
              <Checkbox 
                id="has_guardian" 
                checked={form.has_guardian} 
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, has_guardian: !!checked }))}
              />
              <Label htmlFor="has_guardian" className="text-xs font-black text-primary cursor-pointer uppercase tracking-widest">Adicionar Responsável?</Label>
            </div>
          </div>

          {form.has_guardian ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-md animate-slide-up">
              <div className="md:col-span-2 lg:col-span-1 space-y-1.5">
                <Label htmlFor="guardian_name" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Nome do Responsável *</Label>
                <Input
                  id="guardian_name"
                  name="guardian_name"
                  placeholder="Nome completo"
                  className="glass-input-field h-14 text-base font-bold px-6"
                  value={form.guardian_name}
                  onChange={handleChange}
                  required={form.has_guardian}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guardian_cpf" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">CPF do Responsável</Label>
                <Input
                  id="guardian_cpf"
                  name="guardian_cpf"
                  placeholder="000.000.000-00"
                  className="glass-input-field h-14 text-base font-bold px-6"
                  value={form.guardian_cpf}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guardian_phone" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Telefone</Label>
                <Input
                  id="guardian_phone"
                  name="guardian_phone"
                  placeholder="(11) 99999-9999"
                  className="glass-input-field h-14 text-base font-bold px-6"
                  value={form.guardian_phone}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guardian_email" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Email</Label>
                <Input
                  id="guardian_email"
                  name="guardian_email"
                  type="email"
                  placeholder="exemplo@email.com"
                  className="glass-input-field h-14 text-base font-bold px-6"
                  value={form.guardian_email}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guardian_relationship" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Parentesco</Label>
                <select
                  id="guardian_relationship"
                  name="guardian_relationship"
                  className="flex h-14 w-full rounded-full border border-white/40 bg-white/50 px-6 py-2 text-base font-bold focus:ring-primary/20"
                  value={form.guardian_relationship}
                  onChange={handleChange}
                >
                  <option value="mother">Mãe</option>
                  <option value="father">Pai</option>
                  <option value="grandparent">Avô/Avó</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div className="flex flex-col justify-end pb-2">
                <div className={cn(
                  "flex items-center gap-3 px-6 h-14 rounded-full border transition-all",
                  form.guardian_is_financial ? "bg-emerald-50 border-emerald-200" : "bg-white/40 border-white/60"
                )}>
                  <Checkbox 
                    id="guardian_is_financial" 
                    checked={form.guardian_is_financial} 
                    onCheckedChange={(checked) => setForm(prev => ({ ...prev, guardian_is_financial: !!checked }))}
                  />
                  <Label htmlFor="guardian_is_financial" className="text-sm font-black text-primary cursor-pointer uppercase tracking-tighter">Responsável Financeiro?</Label>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white/20 p-8 rounded-[32px] border border-white/40 border-dashed text-center">
              <p className="text-sm text-muted-foreground italic font-medium">Nenhum responsável legal selecionado para este paciente.</p>
            </div>
          )}
        </div>

        {/* Contato de Emergência Section */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-primary ml-2 flex items-center gap-2">
            <div className="w-2 h-8 bg-red-400 rounded-full" />
            Contato de Emergência
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-md">
            <div className="space-y-1.5">
              <Label htmlFor="emergency_contact_name" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Nome do Contato</Label>
              <Input
                id="emergency_contact_name"
                name="emergency_contact_name"
                placeholder="Ex: Maria (Esposa)"
                className="glass-input-field h-14 text-base font-bold px-6"
                value={form.emergency_contact_name}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emergency_contact_phone" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Telefone de Emergência</Label>
              <Input
                id="emergency_contact_phone"
                name="emergency_contact_phone"
                placeholder="(11) 99999-9999"
                className="glass-input-field h-14 text-base font-bold px-6"
                value={form.emergency_contact_phone}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        {/* Dados Clínicos Section */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-primary ml-2 flex items-center gap-2">
            <div className="w-2 h-8 bg-emerald-400 rounded-full" />
            Dados Clínicos e Financeiros
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-md">
            <div className="space-y-1.5">
              <Label htmlFor="session_price" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Valor da Sessão (R$)</Label>
              <Input
                id="session_price"
                name="session_price"
                type="number"
                step="0.01"
                placeholder="150.00"
                className="glass-input-field h-14 text-xl font-black px-6 text-emerald-600"
                value={form.session_price}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insurance_provider" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Convênio</Label>
              <Input
                id="insurance_provider"
                name="insurance_provider"
                placeholder="Nome do convênio"
                className="glass-input-field h-14 text-base font-bold px-6"
                value={form.insurance_provider}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insurance_number" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Número da Carteirinha</Label>
              <Input
                id="insurance_number"
                name="insurance_number"
                placeholder="0000000000"
                className="glass-input-field h-14 text-base font-bold px-6"
                value={form.insurance_number}
                onChange={handleChange}
              />
            </div>
            <div className="md:col-span-3 space-y-1.5">
              <Label htmlFor="notes" className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Observações Iniciais</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Anotações sobre o paciente, queixa principal, encaminhamento..."
                className="rounded-[24px] border-white/40 bg-white/50 p-6 text-base font-medium min-h-[120px] focus:ring-primary/20 transition-all"
                value={form.notes}
                onChange={handleChange}
              />
              <div className="flex items-center gap-2 ml-4 mt-2">
                <Shield className="w-3 h-3 text-emerald-500" />
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                  Este campo será criptografado ponta-a-ponta
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions - Mobile Bottom */}
        <div className="flex flex-col md:flex-row items-center gap-4 justify-end pt-8 pb-12 border-t border-white/20">
          <Button
            type="button"
            variant="ghost"
            className="w-full md:w-auto rounded-full px-12 h-12 font-bold"
            onClick={() => router.back()}
          >
            CANCELAR
          </Button>
          <Button
            type="submit"
            className="w-full md:w-auto gradient-primary text-white rounded-full px-16 h-14 font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5 mr-3" />
                SALVAR CADASTRO
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
