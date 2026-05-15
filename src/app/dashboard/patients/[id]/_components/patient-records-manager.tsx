"use client";

import { useRef, useState } from "react";
import type React from "react";
import {
  Archive,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  Plus,
  Shield,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PatientSupportService } from "@/services/patient-support-service";
import type { PatientConsent, PatientDocument } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  PATIENT_DOCUMENT_ACCEPT,
  PATIENT_DOCUMENT_ALLOWED_EXTENSIONS,
  PATIENT_DOCUMENT_ALLOWED_MIME_TYPES,
  PATIENT_DOCUMENT_MAX_SIZE_BYTES,
  formatPatientDocumentFileSize,
} from "@/lib/patient-documents/file-rules";

const CONSENT_TYPES = [
  { value: "general_consent", label: "Consentimento geral" },
  { value: "online_care", label: "Atendimento online" },
  { value: "legal_guardian", label: "Autorizacao do responsavel" },
  { value: "school_contact", label: "Contato com escola" },
  { value: "multidisciplinary_contact", label: "Contato com equipe multidisciplinar" },
  { value: "patient_portal", label: "Acesso ao portal do paciente" },
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

const fieldLabelClassName = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const fieldControlClassName = "h-11 rounded-2xl border-border/70 bg-white shadow-sm focus-visible:ring-primary/15";
const textareaClassName = "min-h-24 resize-none rounded-2xl border-border/70 bg-white shadow-sm focus-visible:ring-primary/15";

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
  documentDate: "",
};

function labelFor(options: Array<{ value: string; label: string }>, value?: string | null) {
  return options.find((item) => item.value === value)?.label || "Registro";
}

function consentStatusClass(status: string) {
  if (status === "signed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "expired") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function validateDocumentFile(file: File) {
  if (file.size > PATIENT_DOCUMENT_MAX_SIZE_BYTES) {
    return "O arquivo excede o limite de 20 MB.";
  }

  if (!PATIENT_DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type as any)) {
    return "Tipo de arquivo nao permitido. Envie PDF, imagem PNG/JPG/WebP, DOC ou DOCX.";
  }

  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
  const allowedExtensions = PATIENT_DOCUMENT_ALLOWED_EXTENSIONS[file.type] || [];
  if (!allowedExtensions.includes(extension)) {
    return "A extensao do arquivo nao corresponde ao tipo enviado.";
  }

  return null;
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

function ModalIntro({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <DialogHeader className="border-b border-border/60 bg-[linear-gradient(135deg,rgba(124,58,237,0.09),rgba(20,184,166,0.06))] px-6 py-5">
      <div className="flex items-start gap-3 pr-8">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">{title}</DialogTitle>
          <DialogDescription className="mt-1 text-sm leading-relaxed">{description}</DialogDescription>
        </div>
      </div>
    </DialogHeader>
  );
}

function FormSection({
  icon: Icon,
  title,
  description,
  children,
  muted = false,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section className={cn("rounded-2xl border border-border/70 p-4", muted ? "bg-slate-50/65" : "bg-white")}>
      <div className="mb-4 flex items-start gap-2">
        <Icon className="mt-0.5 size-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
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
  const [selectedDocumentFile, setSelectedDocumentFile] = useState<File | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const documentFileInputRef = useRef<HTMLInputElement | null>(null);

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
      documentDate: documentForm.documentDate || null,
      file: selectedDocumentFile,
    });

    if (serviceError || !data) {
      setError(serviceError || "Nao foi possivel registrar o documento.");
      setSaving(false);
      return;
    }

    onDocumentsChanged(data);
    setDocumentForm(defaultDocumentForm);
    setSelectedDocumentFile(null);
    if (documentFileInputRef.current) documentFileInputRef.current.value = "";
    setDocumentOpen(false);
    setSaving(false);
  }

  async function handleDeleteConsent(id: string) {
    const { data, error: serviceError } = await PatientSupportService.deleteConsent(id);
    if (!serviceError && data) onConsentsChanged(data);
  }

  async function handleDeleteDocument(id: string) {
    const { data, error: serviceError } = await PatientSupportService.deleteDocument(id);
    if (data) onDocumentsChanged(data);
    if (serviceError) setError(serviceError);
  }

  function handleDocumentFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setError(null);

    if (!file) {
      setSelectedDocumentFile(null);
      return;
    }

    const fileError = validateDocumentFile(file);
    if (fileError) {
      setSelectedDocumentFile(null);
      if (documentFileInputRef.current) documentFileInputRef.current.value = "";
      setError(fileError);
      return;
    }

    setSelectedDocumentFile(file);
    if (!documentForm.title.trim()) {
      const titleFromFile = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
      if (titleFromFile) setDocumentForm((prev) => ({ ...prev, title: titleFromFile }));
    }
  }

  async function handleDownloadDocument(documentId: string) {
    setDownloadingDocumentId(documentId);
    setError(null);
    const { data, error: serviceError } = await PatientSupportService.getDocumentDownloadUrl(documentId);
    setDownloadingDocumentId(null);

    if (serviceError || !data?.url) {
      setError(serviceError || "Nao foi possivel preparar o download.");
      return;
    }

    window.open(data.url, "_blank", "noopener,noreferrer");
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
                  Arquivos privados e metadados sensiveis do paciente.
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
          {!documentOpen && error && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
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
                      {document.has_file ? "Arquivo anexado" : "Somente metadados"}
                    </Badge>
                    {document.document_date && (
                      <Badge variant="outline" className="rounded-full border-sky-200 bg-sky-50 text-[10px] text-sky-700">
                        <Calendar className="mr-1 size-3" />
                        {formatDate(document.document_date)}
                      </Badge>
                    )}
                    {document.has_file && (
                      <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                        <CheckCircle2 className="mr-1 size-3" />
                        Privado
                      </Badge>
                    )}
                    {document.size_bytes != null && document.size_bytes > 0 && (
                      <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-[10px] text-slate-600">
                        {formatPatientDocumentFileSize(document.size_bytes)}
                      </Badge>
                    )}
                  </div>
                  {document.description && (
                    <p className="mt-3 line-clamp-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                      {document.description}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {document.has_file && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-2xl bg-white text-xs"
                        disabled={downloadingDocumentId === document.id}
                        onClick={() => handleDownloadDocument(document.id)}
                      >
                        <Download className="size-3.5" />
                        {downloadingDocumentId === document.id ? "Preparando..." : "Baixar/visualizar"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden rounded-3xl border border-border/70 bg-white p-0 shadow-2xl sm:max-w-2xl">
          <ModalIntro
            icon={Shield}
            title="Registrar consentimento"
            description="Guarde o status de autorizacoes e termos importantes do paciente."
          />
          <form onSubmit={handleCreateConsent} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
              <FormSection icon={Shield} title="Dados principais" description="Escolha o tipo de autorizacao e a situacao atual.">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className={fieldLabelClassName}>Tipo</Label>
                <Select value={consentForm.consentType} onValueChange={(value) => setConsentForm({ ...consentForm, consentType: value || "other" })}>
                  <SelectTrigger className={fieldControlClassName}>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={fieldLabelClassName}>Status</Label>
                <Select value={consentForm.status} onValueChange={(value) => setConsentForm({ ...consentForm, status: value || "pending" })}>
                  <SelectTrigger className={fieldControlClassName}>
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSENT_STATUS.map((status) => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="related-person" className={fieldLabelClassName}>Pessoa relacionada</Label>
                    <Input
                      id="related-person"
                      className={fieldControlClassName}
                      placeholder="Nome do paciente, responsavel ou terceiro"
                      value={consentForm.relatedPersonName}
                      onChange={(event) => setConsentForm({ ...consentForm, relatedPersonName: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="version" className={fieldLabelClassName}>Versao</Label>
                    <Input
                      id="version"
                      className={fieldControlClassName}
                      placeholder="Ex.: v1.0, 2026.1"
                      value={consentForm.version}
                      onChange={(event) => setConsentForm({ ...consentForm, version: event.target.value })}
                    />
                  </div>
                </div>
              </FormSection>

              <FormSection icon={Calendar} title="Datas e validade" muted>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="signed-at" className={fieldLabelClassName}>Data de assinatura</Label>
                    <Input id="signed-at" type="date" className={fieldControlClassName} value={consentForm.signedAt} onChange={(event) => setConsentForm({ ...consentForm, signedAt: event.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="expires-at" className={fieldLabelClassName}>Validade</Label>
                    <Input id="expires-at" type="date" className={fieldControlClassName} value={consentForm.expiresAt} onChange={(event) => setConsentForm({ ...consentForm, expiresAt: event.target.value })} />
                  </div>
                </div>
              </FormSection>

              <FormSection icon={FileText} title="Observacoes" description="Use este campo apenas para informacoes administrativas relevantes.">
                <Textarea
                  id="consent-notes"
                  className={textareaClassName}
                  placeholder="Ex.: termo recebido por e-mail, pendente de assinatura do responsavel..."
                  value={consentForm.notes}
                  onChange={(event) => setConsentForm({ ...consentForm, notes: event.target.value })}
                />
              </FormSection>

              {error && (
                <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </div>
            <DialogFooter className="border-t border-border/60 bg-slate-50/85 px-6 py-4">
              <Button type="button" variant="ghost" className="rounded-2xl px-5 text-muted-foreground" onClick={() => setConsentOpen(false)}>Cancelar</Button>
              <Button type="submit" className="rounded-2xl px-6 shadow-primary/20" disabled={saving}>{saving ? "Salvando..." : "Registrar consentimento"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={documentOpen}
        onOpenChange={(open) => {
          setDocumentOpen(open);
          if (open) setError(null);
          if (!open) {
            setSelectedDocumentFile(null);
            if (documentFileInputRef.current) documentFileInputRef.current.value = "";
          }
        }}
      >
        <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden rounded-3xl border border-border/70 bg-white p-0 shadow-2xl sm:max-w-2xl">
          <ModalIntro
            icon={Archive}
            title="Adicionar documento"
            description="Anexe arquivos em area privada ou registre uma referencia manual quando nao houver arquivo."
          />
          <form onSubmit={handleCreateDocument} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
              <FormSection icon={FileText} title="Dados do documento" description="Identifique o documento para facilitar consultas futuras.">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="document-title" className={fieldLabelClassName}>Titulo *</Label>
                    <Input
                      id="document-title"
                      className={fieldControlClassName}
                      placeholder="Ex.: Relatorio escolar, laudo, termo assinado"
                      value={documentForm.title}
                      onChange={(event) => setDocumentForm({ ...documentForm, title: event.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={fieldLabelClassName}>Categoria</Label>
                    <Select value={documentForm.category} onValueChange={(value) => setDocumentForm({ ...documentForm, category: value || "other" })}>
                      <SelectTrigger className={fieldControlClassName}>
                        <SelectValue placeholder="Selecione a categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_CATEGORIES.map((category) => (
                          <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="document-date" className={fieldLabelClassName}>Data do documento</Label>
                    <Input id="document-date" type="date" className={fieldControlClassName} value={documentForm.documentDate} onChange={(event) => setDocumentForm({ ...documentForm, documentDate: event.target.value })} />
                  </div>
                </div>
              </FormSection>

              <FormSection icon={Upload} title="Arquivo privado" description="Opcional. O arquivo sera armazenado em area privada e acessivel apenas a usuarios autorizados." muted>
                <input
                  ref={documentFileInputRef}
                  type="file"
                  className="hidden"
                  accept={PATIENT_DOCUMENT_ACCEPT}
                  onChange={handleDocumentFileChange}
                />
                {selectedDocumentFile ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700">
                          <FileText className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{selectedDocumentFile.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatPatientDocumentFileSize(selectedDocumentFile.size)}
                            {selectedDocumentFile.type ? ` · ${selectedDocumentFile.type}` : ""}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-full text-emerald-800 hover:bg-white"
                        onClick={() => {
                          setSelectedDocumentFile(null);
                          if (documentFileInputRef.current) documentFileInputRef.current.value = "";
                        }}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-primary/25 bg-white px-4 py-6 text-center transition hover:border-primary/45 hover:bg-primary/5"
                    onClick={() => documentFileInputRef.current?.click()}
                  >
                    <span className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Upload className="size-5" />
                    </span>
                    <span className="text-sm font-semibold text-foreground">Selecionar arquivo</span>
                    <span className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                      PDF, PNG, JPG, WebP, DOC ou DOCX ate 20 MB. Registros sem arquivo continuam permitidos.
                    </span>
                  </button>
                )}
              </FormSection>

              <FormSection icon={CheckCircle2} title="Descricao" description="Use uma descricao curta, administrativa e facil de reconhecer.">
                <Textarea
                  id="document-description"
                  className={textareaClassName}
                  placeholder="Ex.: documento enviado pela escola com observacoes de acompanhamento."
                  value={documentForm.description}
                  onChange={(event) => setDocumentForm({ ...documentForm, description: event.target.value })}
                />
                <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  A descricao continua protegida pelo fluxo de criptografia existente. Evite copiar conteudo integral do arquivo aqui.
                </p>
              </FormSection>

              {error && (
                <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </div>
            <DialogFooter className="border-t border-border/60 bg-slate-50/85 px-6 py-4">
              <Button type="button" variant="ghost" className="rounded-2xl px-5 text-muted-foreground" onClick={() => setDocumentOpen(false)}>Cancelar</Button>
              <Button type="submit" className="rounded-2xl px-6 shadow-primary/20" disabled={saving}>{saving ? "Salvando..." : "Adicionar documento"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
