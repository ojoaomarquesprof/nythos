"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  Download,
  GraduationCap,
  Mail,
  Phone,
  Plus,
  ShieldCheck,
  Star,
  Stethoscope,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
import { usePdfExport } from "@/hooks/use-pdf-export";
import { auditCareContactEvent } from "@/app/actions/clinical-audit";
import { PatientSupportService } from "@/services/patient-support-service";
import type { Patient, Profile, SupportContact } from "@/types/database";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/constants";

const CONTACT_TYPES = [
  { value: "legal_guardian", label: "Responsavel legal" },
  { value: "financial_guardian", label: "Responsavel financeiro" },
  { value: "emergency", label: "Contato de emergencia" },
  { value: "psychiatrist", label: "Psiquiatra" },
  { value: "speech_therapist", label: "Fonoaudiologo" },
  { value: "occupational_therapist", label: "Terapeuta ocupacional" },
  { value: "doctor", label: "Medico" },
  { value: "school", label: "Escola" },
  { value: "teacher", label: "Professor" },
  { value: "caregiver", label: "Cuidador" },
  { value: "other", label: "Outro" },
];

const fieldLabelClassName = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const fieldControlClassName = "h-11 rounded-2xl border-border/70 bg-white shadow-sm focus-visible:ring-primary/15";
const textareaClassName = "min-h-24 resize-none rounded-2xl border-border/70 bg-white shadow-sm focus-visible:ring-primary/15";

const defaultForm = {
  name: "",
  contactType: "other",
  relationship: "",
  phone: "",
  email: "",
  organization: "",
  notes: "",
  canContact: false,
  consentDate: "",
  isPrimary: false,
  isActive: true,
};

function contactLabel(value?: string | null) {
  return CONTACT_TYPES.find((item) => item.value === value)?.label || "Contato";
}

function contactIcon(type?: string | null) {
  if (type === "school" || type === "teacher") return GraduationCap;
  if (type === "psychiatrist" || type === "doctor" || type === "speech_therapist" || type === "occupational_therapist") return Stethoscope;
  if (type === "legal_guardian" || type === "financial_guardian" || type === "emergency") return UserRound;
  return Users;
}

export function CareNetworkCard({
  patientId,
  patient,
  profile,
  initialContacts,
  onChanged,
}: {
  patientId: string;
  patient?: Patient | null;
  profile?: Profile | null;
  initialContacts?: SupportContact[];
  onChanged?: (contacts: SupportContact[]) => void;
}) {
  const [contacts, setContacts] = useState<SupportContact[]>(initialContacts || []);
  const [loading, setLoading] = useState(!initialContacts);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const router = useRouter();
  const { hasSubscription, loading: subLoading } = useSubscription();
  const { exportPdf, isExporting: isExportingPdf } = usePdfExport();

  useEffect(() => {
    if (initialContacts) {
      setContacts(initialContacts);
      setLoading(false);
      return;
    }

    fetchContacts();
  }, [patientId, initialContacts]);

  function syncContacts(nextContacts: SupportContact[]) {
    setContacts(nextContacts);
    onChanged?.(nextContacts);
  }

  async function fetchContacts() {
    setLoading(true);
    const { data } = await PatientSupportService.getContacts(patientId);
    syncContacts(data || []);
    setLoading(false);
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { data, error: serviceError } = await PatientSupportService.createContact({
      patientId,
      name: formData.name,
      contactType: formData.contactType,
      relationship: formData.relationship,
      specialty: contactLabel(formData.contactType),
      phone: formData.phone,
      email: formData.email,
      organization: formData.organization,
      notes: formData.notes,
      canContact: formData.canContact,
      consentDate: formData.consentDate || null,
      isPrimary: formData.isPrimary,
      isActive: formData.isActive,
    });

    if (serviceError || !data) {
      setError(serviceError || "Nao foi possivel cadastrar o contato.");
      setSaving(false);
      return;
    }

    const createdContact =
      data.find((contact) =>
        contact.contact_type === formData.contactType &&
        contact.is_active === formData.isActive &&
        contact.can_contact === formData.canContact
      ) ?? data[0];
    await auditCareContactEvent({
      action: "create",
      patientId,
      contactId: createdContact?.id ?? null,
      contactType: formData.contactType,
      newActive: formData.isActive,
      newAuthorized: formData.canContact,
      isEmergencyContact: formData.contactType === "emergency",
      isFinancialResponsible: formData.contactType === "financial_guardian",
    });

    syncContacts(data);
    setFormData(defaultForm);
    setOpen(false);
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const contact = contacts.find((item) => item.id === id);
    const { data, error: serviceError } = await PatientSupportService.deleteContact(id);
    if (!serviceError && data) {
      await auditCareContactEvent({
        action: "remove",
        patientId,
        contactId: id,
        contactType: contact?.contact_type ?? null,
        oldActive: contact?.is_active ?? null,
        newActive: false,
        oldAuthorized: contact?.can_contact ?? null,
        newAuthorized: false,
        isEmergencyContact: contact?.contact_type === "emergency",
        isFinancialResponsible: contact?.contact_type === "financial_guardian",
      });
      syncContacts(data);
    }
  }

  async function handleExportPdf() {
    if (!profile || !contacts.length || !patient) return;

    const patientDetails = [
      `Paciente: ${patient.full_name}`,
      patient.cpf ? `CPF: ${patient.cpf}` : null,
      patient.date_of_birth ? `Data de nasc.: ${formatDate(patient.date_of_birth)}` : null,
      `Data do relatorio: ${new Date().toLocaleDateString("pt-BR")}`,
    ].filter(Boolean).join(" | ");

    const tableBody = contacts.map((contact) => [
      contact.name,
      contactLabel(contact.contact_type),
      contact.organization || contact.relationship || "-",
      contact.phone || contact.email || "-",
      contact.can_contact ? "Autorizado" : "Sem autorizacao",
    ]);

    await exportPdf({
      title: "Rede de Apoio",
      subtitle: patientDetails,
      profile,
      fileName: `rede_apoio_${patient.full_name.toLowerCase().replace(/\s+/g, "_")}.pdf`,
      content: [
        {
          table: {
            headerRows: 1,
            widths: ["*", "auto", "auto", "auto", "auto"],
            body: [
              [
                { text: "Nome", bold: true, fillColor: "#e2e8f0", color: "#1e293b", margin: [5, 5] },
                { text: "Papel", bold: true, fillColor: "#e2e8f0", color: "#1e293b", margin: [5, 5] },
                { text: "Vinculo", bold: true, fillColor: "#e2e8f0", color: "#1e293b", margin: [5, 5] },
                { text: "Contato", bold: true, fillColor: "#e2e8f0", color: "#1e293b", margin: [5, 5] },
                { text: "Autorizacao", bold: true, fillColor: "#e2e8f0", color: "#1e293b", margin: [5, 5] },
              ],
              ...tableBody.map((row) => row.map((cell) => ({ text: cell, margin: [5, 5] }))),
            ],
          },
        },
      ],
    });
  }

  const activeContacts = contacts.filter((contact) => contact.is_active !== false);
  const emergencyContact = activeContacts.find((contact) => contact.contact_type === "emergency");

  return (
    <Card className="rounded-[28px] border border-border/70 bg-white/85 shadow-sm">
      <CardHeader className="border-b border-border/60 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">Rede de apoio</CardTitle>
              <CardDescription className="text-xs">
                Responsaveis, contatos de emergencia e profissionais envolvidos no caso.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-2xl bg-white text-xs"
              onClick={handleExportPdf}
              disabled={contacts.length === 0 || !profile || !patient || isExportingPdf}
            >
              <Download className="size-4" />
              PDF
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-2xl"
              onClick={() => {
                if (!hasSubscription && !subLoading) {
                  router.push("/dashboard/settings/billing");
                  return;
                }
                setOpen(true);
              }}
            >
              <Plus className="size-4" />
              Adicionar contato
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5">
        {!emergencyContact && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>Nenhum contato de emergencia cadastrado para este paciente.</span>
          </div>
        )}

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[1, 2].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/80 bg-slate-50/70 p-10 text-center">
            <Users className="mx-auto mb-3 size-9 text-muted-foreground/40" />
            <p className="text-sm font-semibold text-foreground">Nenhum contato de apoio cadastrado.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre responsaveis, escola, contatos de emergencia ou equipe multidisciplinar.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {contacts.map((contact) => {
              const Icon = contactIcon(contact.contact_type);
              return (
                <div
                  key={contact.id}
                  className={cn(
                    "group rounded-3xl border border-border/70 bg-white/85 p-4 shadow-sm transition hover:border-primary/20",
                    contact.is_active === false && "opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{contact.name}</p>
                          {contact.is_primary && (
                            <Badge variant="outline" className="rounded-full border-violet-200 bg-violet-50 text-[10px] text-violet-700">
                              <Star className="mr-1 size-3" />
                              Preferencial
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          {contactLabel(contact.contact_type)}
                          {contact.relationship ? ` · ${contact.relationship}` : ""}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => handleDelete(contact.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
                    {contact.organization && (
                      <span className="inline-flex items-center gap-2">
                        <Building2 className="size-3.5 text-primary/60" />
                        {contact.organization}
                      </span>
                    )}
                    {contact.phone && (
                      <span className="inline-flex items-center gap-2">
                        <Phone className="size-3.5 text-primary/60" />
                        {contact.phone}
                      </span>
                    )}
                    {contact.email && (
                      <span className="inline-flex items-center gap-2">
                        <Mail className="size-3.5 text-primary/60" />
                        {contact.email}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full text-[10px]",
                        contact.can_contact
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      )}
                    >
                      <ShieldCheck className="mr-1 size-3" />
                      {contact.can_contact ? "Contato autorizado" : "Sem autorizacao"}
                    </Badge>
                    {contact.consent_date && (
                      <Badge variant="outline" className="rounded-full border-sky-200 bg-sky-50 text-[10px] text-sky-700">
                        {formatDate(contact.consent_date)}
                      </Badge>
                    )}
                    {contact.is_active === false && (
                      <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                        Inativo
                      </Badge>
                    )}
                  </div>

                  {contact.notes && (
                    <p className="mt-3 line-clamp-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      {contact.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden rounded-3xl border border-border/70 bg-white p-0 shadow-2xl sm:max-w-2xl">
          <DialogHeader className="border-b border-border/60 bg-[linear-gradient(135deg,rgba(124,58,237,0.09),rgba(20,184,166,0.06))] px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex items-start gap-3 pr-8">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Users className="size-5" />
              </span>
              <div>
                <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">Adicionar contato de apoio</DialogTitle>
                <DialogDescription className="mt-1 text-sm leading-relaxed">
                  Organize responsaveis, escola, equipe multidisciplinar e autorizacoes de contato.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleAddContact} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <section className="rounded-2xl border border-border/70 bg-white p-4">
                <div className="mb-4 flex items-start gap-2">
                  <UserRound className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Dados principais</h3>
                    <p className="text-xs text-muted-foreground">Identifique quem participa da rede de cuidado.</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="support-name" className={fieldLabelClassName}>Nome *</Label>
                <Input
                  id="support-name"
                  value={formData.name}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  required
                  className={fieldControlClassName}
                  placeholder="Nome completo"
                />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={fieldLabelClassName}>Papel no caso *</Label>
                <Select value={formData.contactType} onValueChange={(value) => setFormData({ ...formData, contactType: value || "other" })}>
                  <SelectTrigger className={fieldControlClassName}>
                    <SelectValue placeholder="Selecione o papel" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="support-relationship" className={fieldLabelClassName}>Relacao/vinculo</Label>
                <Input
                  id="support-relationship"
                  value={formData.relationship}
                  onChange={(event) => setFormData({ ...formData, relationship: event.target.value })}
                  className={fieldControlClassName}
                  placeholder="Ex.: mae, escola, medico"
                />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="support-organization" className={fieldLabelClassName}>Organizacao</Label>
                <Input
                  id="support-organization"
                  value={formData.organization}
                  onChange={(event) => setFormData({ ...formData, organization: event.target.value })}
                  className={fieldControlClassName}
                  placeholder="Ex.: escola, clinica, hospital"
                />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border/70 bg-slate-50/65 p-4">
                <div className="mb-4 flex items-start gap-2">
                  <Phone className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Contato</h3>
                    <p className="text-xs text-muted-foreground">Inclua apenas canais que podem ser usados pela clinica.</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="support-phone" className={fieldLabelClassName}>Telefone</Label>
                <Input
                  id="support-phone"
                  value={formData.phone}
                  onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                  className={fieldControlClassName}
                  placeholder="(00) 00000-0000"
                />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="support-email" className={fieldLabelClassName}>E-mail</Label>
                <Input
                  id="support-email"
                  type="email"
                  value={formData.email}
                  onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                  className={fieldControlClassName}
                  placeholder="nome@email.com"
                />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border/70 bg-white p-4">
                <div className="mb-4 flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Autorizacoes</h3>
                    <p className="text-xs text-muted-foreground">Controle se o contato pode ser acionado e se deve aparecer como preferencial.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-slate-50/70 p-3 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={formData.canContact}
                      onChange={(event) => setFormData({ ...formData, canContact: event.target.checked })}
                      className="size-4"
                    />
                    Autorizado para contato
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-slate-50/70 p-3 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={formData.isPrimary}
                      onChange={(event) => setFormData({ ...formData, isPrimary: event.target.checked })}
                      className="size-4"
                    />
                    Preferencial
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-slate-50/70 p-3 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(event) => setFormData({ ...formData, isActive: event.target.checked })}
                      className="size-4"
                    />
                    Ativo
                  </label>
                </div>
                <div className="mt-4 space-y-1.5">
                  <Label htmlFor="support-consent-date" className={fieldLabelClassName}>Data da autorizacao</Label>
                  <Input
                    id="support-consent-date"
                    type="date"
                    value={formData.consentDate}
                    onChange={(event) => setFormData({ ...formData, consentDate: event.target.value })}
                    className={fieldControlClassName}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-border/70 bg-white p-4">
                <div className="mb-4 flex items-start gap-2">
                  <AlertCircle className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Observacoes</h3>
                    <p className="text-xs text-muted-foreground">Use somente informacoes relevantes para coordenacao do cuidado.</p>
                  </div>
                </div>
                <Textarea
                  id="support-notes"
                  value={formData.notes}
                  onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
                  className={textareaClassName}
                  placeholder="Ex.: melhor horario para contato, combinados administrativos..."
                />
              </section>

            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            </div>

            <DialogFooter className="border-t border-border/60 bg-slate-50/85 px-4 py-4 sm:px-6">
              <Button type="button" variant="ghost" className="rounded-2xl px-5 text-muted-foreground" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-2xl px-6 shadow-primary/20" disabled={saving}>
                {saving ? "Salvando..." : "Adicionar contato"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
