"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";

export default function NewPatientPage() {
  const router = useRouter();
  const supabase = createClient();
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
          // Não vamos travar o processo todo, pois o paciente já foi criado.
          // Mas vamos avisar.
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
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Voltar
        </Button>
        <div>
          <h1 className="text-xl font-bold">Novo Paciente</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre um novo paciente
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Dados Pessoais */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="full_name">Nome Completo *</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  placeholder="Nome do paciente"
                  className="h-10"
                  value={form.full_name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="paciente@email.com"
                  className="h-10"
                  value={form.email}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  name="phone"
                  placeholder="(11) 99999-9999"
                  className="h-10"
                  value={form.phone}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  name="cpf"
                  placeholder="000.000.000-00"
                  className="h-10"
                  value={form.cpf}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date_of_birth">Data de Nascimento</Label>
                <Input
                  id="date_of_birth"
                  name="date_of_birth"
                  type="date"
                  className="h-10"
                  value={form.date_of_birth}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gender">Gênero</Label>
                <select
                  id="gender"
                  name="gender"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.gender}
                  onChange={handleChange}
                >
                  <option value="prefer_not_to_say">Prefiro não dizer</option>
                  <option value="female">Feminino</option>
                  <option value="male">Masculino</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="address">Endereço</Label>
                <Input
                  id="address"
                  name="address"
                  placeholder="Rua, número, bairro"
                  className="h-10"
                  value={form.address}
                  onChange={handleChange}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Responsável (Opcional) */}
        <div className="flex items-center space-x-2 bg-muted/30 p-4 rounded-xl border border-muted/50">
          <Checkbox 
            id="has_guardian" 
            checked={form.has_guardian}
            onCheckedChange={(checked) => setForm(prev => ({ ...prev, has_guardian: !!checked }))}
          />
          <Label htmlFor="has_guardian" className="text-sm font-medium leading-none cursor-pointer">
            Adicionar Responsável (Para pacientes menores de idade)
          </Label>
        </div>

        {form.has_guardian && (
          <Card className="border-0 shadow-sm bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-primary">Dados do Responsável</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="guardian_name">Nome Completo do Responsável *</Label>
                  <Input
                    id="guardian_name"
                    name="guardian_name"
                    placeholder="Nome completo do pai, mãe ou guardião"
                    className="h-10 border-primary/20 focus-visible:ring-primary"
                    value={form.guardian_name}
                    onChange={handleChange}
                    required={form.has_guardian}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="guardian_email">E-mail</Label>
                  <Input
                    id="guardian_email"
                    name="guardian_email"
                    type="email"
                    className="h-10 border-primary/20 focus-visible:ring-primary"
                    value={form.guardian_email}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="guardian_phone">Telefone</Label>
                  <Input
                    id="guardian_phone"
                    name="guardian_phone"
                    placeholder="(11) 99999-9999"
                    className="h-10 border-primary/20 focus-visible:ring-primary"
                    value={form.guardian_phone}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="guardian_cpf">CPF do Responsável</Label>
                  <Input
                    id="guardian_cpf"
                    name="guardian_cpf"
                    placeholder="000.000.000-00"
                    className="h-10 border-primary/20 focus-visible:ring-primary"
                    value={form.guardian_cpf}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="guardian_relationship">Parentesco</Label>
                  <select
                    id="guardian_relationship"
                    name="guardian_relationship"
                    className="flex h-10 w-full rounded-md border border-primary/20 bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    value={form.guardian_relationship}
                    onChange={handleChange}
                  >
                    <option value="mother">Mãe</option>
                    <option value="father">Pai</option>
                    <option value="grandparent">Avô/Avó</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2 md:col-span-2 pt-2">
                  <Checkbox 
                    id="guardian_is_financial" 
                    checked={form.guardian_is_financial}
                    onCheckedChange={(checked) => setForm(prev => ({ ...prev, guardian_is_financial: !!checked }))}
                  />
                  <Label htmlFor="guardian_is_financial" className="text-sm font-medium leading-none cursor-pointer">
                    É o responsável financeiro pelas sessões?
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contato de Emergência */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Contato de Emergência</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="emergency_contact_name">Nome</Label>
                <Input
                  id="emergency_contact_name"
                  name="emergency_contact_name"
                  placeholder="Nome do contato"
                  className="h-10"
                  value={form.emergency_contact_name}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emergency_contact_phone">Telefone</Label>
                <Input
                  id="emergency_contact_phone"
                  name="emergency_contact_phone"
                  placeholder="(11) 99999-9999"
                  className="h-10"
                  value={form.emergency_contact_phone}
                  onChange={handleChange}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dados Clínicos */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados Clínicos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="session_price">Valor da Sessão (R$)</Label>
                <Input
                  id="session_price"
                  name="session_price"
                  type="number"
                  step="0.01"
                  placeholder="150.00"
                  className="h-10"
                  value={form.session_price}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="insurance_provider">Convênio</Label>
                <Input
                  id="insurance_provider"
                  name="insurance_provider"
                  placeholder="Nome do convênio"
                  className="h-10"
                  value={form.insurance_provider}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="insurance_number">Número do Convênio</Label>
                <Input
                  id="insurance_number"
                  name="insurance_number"
                  placeholder="Número da carteirinha"
                  className="h-10"
                  value={form.insurance_number}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações Iniciais</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Anotações sobre o paciente, queixa principal, encaminhamento..."
                className="min-h-[100px] resize-none"
                value={form.notes}
                onChange={handleChange}
              />
              <p className="text-[11px] text-muted-foreground">
                🔒 Este campo será criptografado para proteção dos dados sensíveis.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end pb-8">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="gradient-primary text-white shadow-sm"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar Paciente
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
