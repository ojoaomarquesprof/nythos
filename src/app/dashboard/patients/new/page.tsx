"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  HeartPulse,
  IdCard,
  Loader2,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type CreatePatientApiResponse = {
  patient_id?: unknown;
  error?: unknown;
};

type FormState = {
  full_name: string;
  email: string;
  phone: string;
  cpf: string;
  date_of_birth: string;
  gender: "male" | "female" | "other" | "prefer_not_to_say";
  emergency_contact_name: string;
  emergency_contact_phone: string;
  address: string;
  session_price: string;
  insurance_provider: string;
  insurance_number: string;
  has_guardian: boolean;
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string;
  guardian_cpf: string;
  guardian_relationship: "mother" | "father" | "grandparent" | "other";
  guardian_is_financial: boolean;
};

const initialForm: FormState = {
  full_name: "",
  email: "",
  phone: "",
  cpf: "",
  date_of_birth: "",
  gender: "prefer_not_to_say",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  address: "",
  session_price: "",
  insurance_provider: "",
  insurance_number: "",
  has_guardian: false,
  guardian_name: "",
  guardian_email: "",
  guardian_phone: "",
  guardian_cpf: "",
  guardian_relationship: "mother",
  guardian_is_financial: true,
};

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-xs leading-5 text-muted-foreground">
      {children}
    </p>
  );
}

function RequiredMark() {
  return <span className="text-primary" aria-label="obrigatorio">*</span>;
}

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description: string;
  icon: typeof UserRound;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden rounded-[28px] border-0 bg-white/72 shadow-sm ring-1 ring-white/80", className)}>
      <CardHeader className="border-b border-white/60 pb-4">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-lg font-black tracking-tight text-foreground">
              {title}
            </CardTitle>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 md:p-6">
        {children}
      </CardContent>
    </Card>
  );
}

export default function NewPatientPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/patients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: optionalText(form.phone),
          cpf: optionalText(form.cpf),
          date_of_birth: form.date_of_birth || undefined,
          gender: form.gender,
          emergency_contact_name: optionalText(form.emergency_contact_name),
          emergency_contact_phone: optionalText(form.emergency_contact_phone),
          address: optionalText(form.address),
          session_price: form.session_price ? Number(form.session_price) : undefined,
          insurance_provider: optionalText(form.insurance_provider),
          insurance_number: optionalText(form.insurance_number),
          guardian: form.has_guardian
            ? {
                full_name: form.guardian_name.trim(),
                email: optionalText(form.guardian_email),
                phone: optionalText(form.guardian_phone),
                cpf: optionalText(form.guardian_cpf),
                relationship: form.guardian_relationship,
                is_financial_responsible: form.guardian_is_financial,
              }
            : undefined,
        }),
      });

      const result = await response.json().catch(() => null) as CreatePatientApiResponse | null;

      if (!response.ok) {
        setError(
          typeof result?.error === "string"
            ? result.error
            : "Nao foi possivel salvar este cadastro agora."
        );
        setIsLoading(false);
        return;
      }

      const patientId = typeof result?.patient_id === "string" ? result.patient_id : null;
      router.push(patientId ? `/dashboard/patients/${encodeURIComponent(patientId)}` : "/dashboard/patients");
      router.refresh();
    } catch {
      setError("Nao foi possivel concluir o cadastro. Verifique sua conexao e tente novamente.");
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <div className="rounded-[32px] border border-white/50 bg-white/58 p-5 shadow-sm ring-1 ring-white/70 backdrop-blur md:p-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="mb-4 -ml-2 rounded-2xl text-muted-foreground hover:bg-white/55 hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para pacientes
        </Button>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              <UserRound className="size-3.5" />
              Novo paciente
            </div>
            <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
              Crie a base de um novo acompanhamento
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base">
              Este cadastro organiza os dados iniciais para prontuario, agenda, portal do paciente e financeiro clinico.
            </p>
          </div>

          <div className="rounded-2xl border border-teal-100 bg-teal-50/80 p-4 text-sm leading-6 text-teal-800 lg:max-w-sm">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" />
              <p>
                Acesso do paciente: token seguro + data de nascimento. Preencha a data com atencao.
              </p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" aria-busy={isLoading}>
        {error && (
          <div className="rounded-[24px] border border-amber-100 bg-amber-50/90 p-4 text-amber-900 shadow-sm" role="alert">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-black text-foreground">Nao conseguimos salvar ainda</p>
                <p className="mt-1 text-sm leading-6">{error}</p>
              </div>
            </div>
          </div>
        )}

        <SectionCard
          title="Dados essenciais"
          description="Comece pelo minimo necessario para identificar o paciente e liberar um acesso seguro no futuro."
          icon={UserRound}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="full_name" className="text-sm font-bold">
                Nome completo <RequiredMark />
              </Label>
              <Input
                id="full_name"
                name="full_name"
                placeholder="Nome completo do paciente"
                className="h-12 rounded-2xl bg-white/80 px-4"
                value={form.full_name}
                onChange={handleChange}
                autoComplete="name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-bold">
                E-mail de acesso <RequiredMark />
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="paciente ou responsavel@email.com"
                className="h-12 rounded-2xl bg-white/80 px-4"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                aria-describedby="email-help"
                required
              />
              <FieldHint id="email-help">
                Pode ser o e-mail do paciente ou do responsavel que cuidara do acesso.
              </FieldHint>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date_of_birth" className="text-sm font-bold">
                Data de nascimento <RequiredMark />
              </Label>
              <Input
                id="date_of_birth"
                name="date_of_birth"
                type="date"
                className="h-12 rounded-2xl bg-white/80 px-4"
                value={form.date_of_birth}
                onChange={handleChange}
                aria-describedby="date-of-birth-help"
                required
              />
              <FieldHint id="date-of-birth-help">
                Usada junto ao token para confirmar o acesso seguro do paciente ao portal.
              </FieldHint>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Contato e identificacao"
          description="Informacoes complementares para localizar, contatar e organizar o registro administrativo."
          icon={IdCard}
        >
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-bold">Telefone</Label>
              <Input
                id="phone"
                name="phone"
                placeholder="(11) 99999-9999"
                className="h-12 rounded-2xl bg-white/80 px-4"
                value={form.phone}
                onChange={handleChange}
                autoComplete="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf" className="text-sm font-bold">CPF</Label>
              <Input
                id="cpf"
                name="cpf"
                placeholder="000.000.000-00"
                className="h-12 rounded-2xl bg-white/80 px-4"
                value={form.cpf}
                onChange={handleChange}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender" className="text-sm font-bold">Genero</Label>
              <select
                id="gender"
                name="gender"
                className="flex h-12 w-full rounded-2xl border border-input bg-white/80 px-4 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={form.gender}
                onChange={handleChange}
              >
                <option value="prefer_not_to_say">Nao informado</option>
                <option value="female">Feminino</option>
                <option value="male">Masculino</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2 lg:col-span-3">
              <Label htmlFor="address" className="text-sm font-bold">Endereco</Label>
              <Input
                id="address"
                name="address"
                placeholder="Rua, numero, bairro, cidade"
                className="h-12 rounded-2xl bg-white/80 px-4"
                value={form.address}
                onChange={handleChange}
                autoComplete="street-address"
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Responsavel legal e financeiro"
          description="Use quando o paciente for menor de idade ou quando outra pessoa acompanhar comunicacao e pagamentos."
          icon={Users}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/70 bg-white/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">Adicionar responsavel</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  O responsavel pode receber comunicacoes e ser marcado como responsavel financeiro.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="has_guardian"
                  checked={form.has_guardian}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, has_guardian: checked === true }))}
                />
                <Label htmlFor="has_guardian" className="cursor-pointer text-sm font-bold">
                  Incluir responsavel
                </Label>
              </div>
            </div>

            {form.has_guardian && (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="guardian_name" className="text-sm font-bold">
                    Nome do responsavel <RequiredMark />
                  </Label>
                  <Input
                    id="guardian_name"
                    name="guardian_name"
                    placeholder="Nome completo"
                    className="h-12 rounded-2xl bg-white/80 px-4"
                    value={form.guardian_name}
                    onChange={handleChange}
                    required={form.has_guardian}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardian_email" className="text-sm font-bold">E-mail</Label>
                  <Input
                    id="guardian_email"
                    name="guardian_email"
                    type="email"
                    placeholder="responsavel@email.com"
                    className="h-12 rounded-2xl bg-white/80 px-4"
                    value={form.guardian_email}
                    onChange={handleChange}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardian_phone" className="text-sm font-bold">Telefone</Label>
                  <Input
                    id="guardian_phone"
                    name="guardian_phone"
                    placeholder="(11) 99999-9999"
                    className="h-12 rounded-2xl bg-white/80 px-4"
                    value={form.guardian_phone}
                    onChange={handleChange}
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardian_cpf" className="text-sm font-bold">CPF</Label>
                  <Input
                    id="guardian_cpf"
                    name="guardian_cpf"
                    placeholder="000.000.000-00"
                    className="h-12 rounded-2xl bg-white/80 px-4"
                    value={form.guardian_cpf}
                    onChange={handleChange}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardian_relationship" className="text-sm font-bold">Vinculo</Label>
                  <select
                    id="guardian_relationship"
                    name="guardian_relationship"
                    className="flex h-12 w-full rounded-2xl border border-input bg-white/80 px-4 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    value={form.guardian_relationship}
                    onChange={handleChange}
                  >
                    <option value="mother">Mae</option>
                    <option value="father">Pai</option>
                    <option value="grandparent">Avo/avo</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <div className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4">
                    <Checkbox
                      id="guardian_is_financial"
                      checked={form.guardian_is_financial}
                      onCheckedChange={(checked) => setForm((prev) => ({ ...prev, guardian_is_financial: checked === true }))}
                    />
                    <Label htmlFor="guardian_is_financial" className="cursor-pointer text-sm font-bold text-emerald-900">
                      Responsavel financeiro
                    </Label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <SectionCard
            title="Emergencia"
            description="Contato de referencia para situacoes que exigem resposta rapida."
            icon={HeartPulse}
          >
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-2">
                <Label htmlFor="emergency_contact_name" className="text-sm font-bold">Nome do contato</Label>
                <Input
                  id="emergency_contact_name"
                  name="emergency_contact_name"
                  placeholder="Ex.: Maria, esposa"
                  className="h-12 rounded-2xl bg-white/80 px-4"
                  value={form.emergency_contact_name}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergency_contact_phone" className="text-sm font-bold">Telefone de emergencia</Label>
                <Input
                  id="emergency_contact_phone"
                  name="emergency_contact_phone"
                  placeholder="(11) 99999-9999"
                  className="h-12 rounded-2xl bg-white/80 px-4"
                  value={form.emergency_contact_phone}
                  onChange={handleChange}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Financeiro"
            description="Dados iniciais para organizar cobrancas clinicas, recibos e convenio quando houver."
            icon={Wallet}
          >
            <div className="grid gap-5 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="session_price" className="text-sm font-bold">Valor da sessao</Label>
                <Input
                  id="session_price"
                  name="session_price"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="150.00"
                  className="h-12 rounded-2xl bg-white/80 px-4 font-bold text-emerald-700"
                  value={form.session_price}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insurance_provider" className="text-sm font-bold">Convenio</Label>
                <Input
                  id="insurance_provider"
                  name="insurance_provider"
                  placeholder="Nome do convenio"
                  className="h-12 rounded-2xl bg-white/80 px-4"
                  value={form.insurance_provider}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insurance_number" className="text-sm font-bold">Carteirinha</Label>
                <Input
                  id="insurance_number"
                  name="insurance_number"
                  placeholder="Numero da carteirinha"
                  className="h-12 rounded-2xl bg-white/80 px-4"
                  value={form.insurance_number}
                  onChange={handleChange}
                />
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="Observacoes de seguranca"
          description="O cadastro inicial guarda dados administrativos. Conteudo clinico sensivel deve entrar no prontuario depois que o paciente existir."
          icon={ShieldCheck}
        >
          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                icon: Calendar,
                title: "Nascimento e portal",
                text: "A data de nascimento ajuda a confirmar o acesso do paciente pelo link seguro.",
              },
              {
                icon: Mail,
                title: "E-mail compartilhado",
                text: "Quando necessario, use o e-mail do responsavel para organizar o acesso.",
              },
              {
                icon: Phone,
                title: "Dados clinicos",
                text: "Hipoteses, evolucao e observacoes sensiveis devem ser registradas no prontuario.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-white/70 bg-white/60 p-4">
                  <Icon className="size-5 text-primary" />
                  <p className="mt-3 text-sm font-black text-foreground">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <div className="sticky bottom-3 z-10 rounded-[24px] border border-white/70 bg-white/86 p-3 shadow-[0_18px_48px_rgba(41,31,67,0.12)] backdrop-blur md:static md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0">
          <div className="flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="h-12 rounded-2xl px-6 font-bold"
              onClick={() => router.back()}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="h-12 rounded-2xl px-7 font-black shadow-lg shadow-primary/20"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvando cadastro...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Salvar paciente
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
