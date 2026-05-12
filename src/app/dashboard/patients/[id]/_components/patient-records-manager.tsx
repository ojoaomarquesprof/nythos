"use client";

import { useState } from "react";
import type React from "react";
import {
  Archive,
  Calendar,
  CheckCircle2,
  FileText,
  Plus,
  Shield,
  Trash2,
} from "lucide-react";
import { PatientSupportService } from "@/services/patient-support-service";
import type { PatientConsent, PatientDocument } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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

const CONSENT_TYPES = [
  { value: "general_consent", label: "Termo de consentimento geral" },
  { value: "online_care", label: "Atendimento online" },
  { value: "legal_guardian", label: "Responsavel legal" },
  { value: "school_contact", label: "Contato com escola" },
  { value: "multidisciplinary_contact", label: "Contato com equipe" },
  { value: "patient_portal", label: "Uso do portal" },
  { value: "third_party_sharing", label: "Compartilhamento com terceiros" },
  { value: "other", label: "Outro" },
];

const CONSENT_STATUS = [
  { value: "pending", label: "Pendente" },
  { value: "signed", label: "Assinado" },
  { value: "revoked", label: "Revogado" },
  { value: "expired", label: "Expirado" },
];

const DOCUMENT_CATEGORIES = [
  { value: "consent", label: "Termo" },
  { value: "report", label: "Relatorio" },
  { value: "assessment", label: "Laudo/avaliacao" },
  { value: "certificate", label: "Atestado" },
  { value: "referral", label: "Encaminhamento" },
  { value: "school_document", label: "Documento escolar" },
  { value: "receipt", label: "Recibo" },
  { value: "image", label: "Imagem" },
  { value: "other", label: "Outro" },
];

const defaultConsentForm = {
  consentType: "general_consent",
  status: "pending",
  signedAt: "",
  expiresAt: "",
  relatedPersonName: "",
  version: "",
  notes: "",
};

const defaultDocumentForm = {
  category: "other",
  title: "",
  description: "",
  fileName: "",
  mimeType: "",
  documentDate: "",
};

function labelFor(options: Array<{ value: string; label: string }>, value?: string | null) {
  return options.find((item) => item.value === value)?.label || value || "Registro";
}

function consentStatusClass(status: string) {
  if (status === "signed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "expired") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function EmptyBlock({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border/80 bg-slate-50/70 p-8 text-center">
      <Icon className="mx-auto mb-3 size-9 text-muted-foreground/40" />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function PatientRecordsManager({
  patientId,
  consents,
  documents,
  onConsentsChanged,
  onDocumentsChanged,
}: {
  patientId: string;
  consents: PatientConsent[];
  documents: PatientDocument[];
  onConsentsChanged: (records: PatientConsent[]) => void;
  onDocumentsChanged: (records: PatientDocument[]) => void;
}) {
  const [consentOpen, setConsentOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentForm, setConsentForm] = useState(defaultConsentForm);
  const [documentForm, setDocumentForm] = useState(defaultDocumentForm);

  async function handleCreateConsent(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const { data, error: serviceError } = await PatientSupportService.createConsent({
      patientId,
      consentType: consentForm.consentType,
      status: consentForm.status,
      signedAt: consentForm.signedAt || null,
      expiresAt: consentForm.expiresAt || null,
      relatedPersonName: consentForm.relatedPersonName,
      version: consentForm.version,
      notes: consentForm.notes,
    });

    if (serviceError || !data) {
      setError(serviceError || "Nao foi possivel registrar o consentimento.");
      setSaving(false);
      return;
    }

    onConsentsChanged(data);
    setConsentForm(defaultConsentForm);
    setConsentOpen(false);
    setSaving(false);
  }

  async function handleCreateDocument(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const { data, error: serviceError } = await PatientSupportService.createDocument({
      patientId,
      category: documentForm.category,
      title: documentForm.title,
      description: documentForm.description,
      fileName: documentForm.fileName,
      mimeType: documentForm.mimeType,
      documentDate: documentForm.documentDate || null,
    });

    if (serviceError || !data) {
      setError(serviceError || "Nao foi possivel registrar o documento.");
      setSaving(false);
      return;
    }

    onDocumentsChanged(data);
    setDocumentForm(defaultDocumentForm);
    setDocumentOpen(false);
    setSaving(false);
  }

  async function handleDeleteConsent(id: string) {
    const { data, error: serviceError } = await PatientSupportService.deleteConsent(id);
    if (!serviceError && data) onConsentsChanged(data);
  }

  async function handleDeleteDocument(id: string) {
    const { data, error: serviceError } = await PatientSupportService.deleteDocument(id);
    if (!serviceError && data) onDocumentsChanged(data);
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-[28px] border border-border/70 bg-white/85 shadow-sm">
        <CardHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                <Shield className="size-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">Consentimentos e autorizacoes</CardTitle>
                <CardDescription className="text-xs">
                  Registros manuais de termos, autorizacoes e validade.
                </CardDescription>
              </div>
            </div>
            <Button size="sm" className="h-9 rounded-2xl" onClick={() => setConsentOpen(true)}>
              <Plus className="size-4" />
              Registrar consentimento
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {consents.length === 0 ? (
            <EmptyBlock
              icon={Shield}
              title="Nenhum consentimento registrado."
              description="Registre termos assinados, autorizacoes pendentes ou vencimentos importantes."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {consents.map((consent) => (
                <div key={consent.id} className="group rounded-3xl border border-border/70 bg-white/85 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{labelFor(CONSENT_TYPES, consent.consent_type)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {consent.related_person_name || "Paciente/responsavel"}
                        {consent.version ? ` · versao ${consent.version}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => handleDeleteConsent(consent.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant="outline" className={cn("rounded-full text-[10px]", consentStatusClass(consent.status))}>
                      {labelFor(CONSENT_STATUS, consent.status)}
                    </Badge>
                    {consent.signed_at && (
                      <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                        Assinado em {formatDate(consent.signed_at)}
                      </Badge>
                    )}
                    {consent.expires_at && (
                      <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                        Vence em {formatDate(consent.expires_at)}
                      </Badge>
                    )}
                  </div>
                  {consent.notes && (
                    <p className="mt-3 line-clamp-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                      {consent.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border border-border/70 bg-white/85 shadow-sm">
        <CardHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                <Archive className="size-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">Arquivos e documentos</CardTitle>
                <CardDescription className="text-xs">
                  Metadados privados de documentos do paciente. Upload seguro fica preparado para a proxima etapa.
                </CardDescription>
              </div>
            </div>
            <Button size="sm" className="h-9 rounded-2xl" onClick={() => setDocumentOpen(true)}>
              <Plus className="size-4" />
              Adicionar documento
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {documents.length === 0 ? (
            <EmptyBlock
              icon={Archive}
              title="Nenhum documento anexado."
              description="Registre termos, relatorios, laudos, atestados ou documentos escolares relevantes."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {documents.map((document) => (
                <div key={document.id} className="group rounded-3xl border border-border/70 bg-white/85 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                        <FileText className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{document.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {labelFor(DOCUMENT_CATEGORIES, document.category)}
                          {document.file_name ? ` · ${document.file_name}` : ""}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => handleDeleteDocument(document.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                      Metadado privado
                    </Badge>
                    {document.document_date && (
                      <Badge variant="outline" className="rounded-full border-sky-200 bg-sky-50 text-[10px] text-sky-700">
                        <Calendar className="mr-1 size-3" />
                        {formatDate(document.document_date)}
                      </Badge>
                    )}
                    {document.storage_path && (
                      <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                        <CheckCircle2 className="mr-1 size-3" />
                        Arquivo vinculado
                      </Badge>
                    )}
                  </div>
                  {document.description && (
                    <p className="mt-3 line-clamp-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                      {document.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border border-border/70 bg-white p-0 shadow-2xl sm:max-w-2xl">
          <DialogHeader className="border-b border-border/60 bg-slate-50/80 px-6 py-5">
            <DialogTitle>Registrar consentimento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateConsent} className="space-y-5 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={consentForm.consentType} onValueChange={(value) => setConsentForm({ ...consentForm, consentType: value || "other" })}>
                  <SelectTrigger className="h-11 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={consentForm.status} onValueChange={(value) => setConsentForm({ ...consentForm, status: value || "pending" })}>
                  <SelectTrigger className="h-11 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSENT_STATUS.map((status) => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signed-at">Data de assinatura</Label>
                <Input id="signed-at" type="date" className="h-11 rounded-2xl" value={consentForm.signedAt} onChange={(event) => setConsentForm({ ...consentForm, signedAt: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expires-at">Validade</Label>
                <Input id="expires-at" type="date" className="h-11 rounded-2xl" value={consentForm.expiresAt} onChange={(event) => setConsentForm({ ...consentForm, expiresAt: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="related-person">Pessoa relacionada</Label>
                <Input id="related-person" className="h-11 rounded-2xl" value={consentForm.relatedPersonName} onChange={(event) => setConsentForm({ ...consentForm, relatedPersonName: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="version">Versao</Label>
                <Input id="version" className="h-11 rounded-2xl" value={consentForm.version} onChange={(event) => setConsentForm({ ...consentForm, version: event.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="consent-notes">Observacoes</Label>
              <Textarea id="consent-notes" className="min-h-24 rounded-2xl" value={consentForm.notes} onChange={(event) => setConsentForm({ ...consentForm, notes: event.target.value })} />
            </div>
            {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" className="rounded-2xl" onClick={() => setConsentOpen(false)}>Cancelar</Button>
              <Button type="submit" className="rounded-2xl" disabled={saving}>{saving ? "Salvando..." : "Registrar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={documentOpen} onOpenChange={setDocumentOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border border-border/70 bg-white p-0 shadow-2xl sm:max-w-2xl">
          <DialogHeader className="border-b border-border/60 bg-slate-50/80 px-6 py-5">
            <DialogTitle>Adicionar documento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateDocument} className="space-y-5 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="document-title">Titulo *</Label>
                <Input id="document-title" className="h-11 rounded-2xl" value={documentForm.title} onChange={(event) => setDocumentForm({ ...documentForm, title: event.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={documentForm.category} onValueChange={(value) => setDocumentForm({ ...documentForm, category: value || "other" })}>
                  <SelectTrigger className="h-11 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_CATEGORIES.map((category) => (
                      <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="document-date">Data do documento</Label>
                <Input id="document-date" type="date" className="h-11 rounded-2xl" value={documentForm.documentDate} onChange={(event) => setDocumentForm({ ...documentForm, documentDate: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="file-name">Nome do arquivo</Label>
                <Input id="file-name" className="h-11 rounded-2xl" value={documentForm.fileName} onChange={(event) => setDocumentForm({ ...documentForm, fileName: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mime-type">Tipo/MIME</Label>
                <Input id="mime-type" className="h-11 rounded-2xl" placeholder="application/pdf" value={documentForm.mimeType} onChange={(event) => setDocumentForm({ ...documentForm, mimeType: event.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="document-description">Descricao</Label>
              <Textarea id="document-description" className="min-h-24 rounded-2xl" value={documentForm.description} onChange={(event) => setDocumentForm({ ...documentForm, description: event.target.value })} />
            </div>
            <p className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
              Nesta fase o registro e privado e guarda metadados. Upload/download seguro com Storage privado fica preparado para a proxima iteracao.
            </p>
            {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" className="rounded-2xl" onClick={() => setDocumentOpen(false)}>Cancelar</Button>
              <Button type="submit" className="rounded-2xl" disabled={saving}>{saving ? "Salvando..." : "Registrar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
