"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { AnamnesisService } from "@/services/anamnesis-service";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AnamnesisResponse, AnamnesisTemplate } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

type AnamnesisRequest = AnamnesisResponse & {
  public_token?: string | null;
  public_expires_at?: string | null;
  public_last_used_at?: string | null;
  public_revoked_at?: string | null;
  anamnesis_templates: AnamnesisTemplate | null;
};

type LinkState = "active" | "expired" | "revoked" | "completed";

function getLinkState(request: AnamnesisRequest): LinkState {
  if (request.public_revoked_at) return "revoked";
  if (
    request.status === "pending" &&
    request.public_expires_at &&
    new Date(request.public_expires_at).getTime() <= Date.now()
  ) {
    return "expired";
  }
  if (request.status === "completed") return "completed";
  return "active";
}

export function AnamnesisRequestCard({ patientId }: { patientId: string }) {
  const supabase = createClient() as any;
  const [templates, setTemplates] = useState<AnamnesisTemplate[]>([]);
  const [requests, setRequests] = useState<AnamnesisRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewingResponse, setViewingResponse] = useState<AnamnesisRequest | null>(null);
  const [manualEntryTemplate, setManualEntryTemplate] = useState<AnamnesisTemplate | null>(null);
  const [manualResponses, setManualResponses] = useState<Record<string, any>>({});
  const [submittingManual, setSubmittingManual] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const [templatesRes, requestsRes] = await Promise.all([
      supabase.from("anamnesis_templates").select("*").eq("user_id", user.id).order("title"),
      supabase.rpc("get_anamnesis_responses_decrypted", { p_patient_id: patientId }),
    ]);

    if (!templatesRes.error) setTemplates(templatesRes.data || []);
    if (!requestsRes.error) setRequests((requestsRes.data || []) as AnamnesisRequest[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel(`patient-anamnesis-${patientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "anamnesis_responses" },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [patientId]);

  const handleCreateRequest = async () => {
    if (!selectedTemplate) return;
    setCreating(true);

    try {
      const { error } = await supabase.rpc("create_anamnesis_request_secure", {
        p_patient_id: patientId,
        p_template_id: selectedTemplate,
      });

      if (error) {
        console.error("Erro ao criar solicitacao:", error);
        alert(`Erro ao criar solicitacao: ${error.message}`);
      } else {
        await loadData();
        setSelectedTemplate("");
      }
    } catch (err) {
      console.error("Erro inesperado:", err);
      alert("Ocorreu um erro inesperado ao gerar o link.");
    } finally {
      setCreating(false);
    }
  };

  const handleManualEntry = (template: AnamnesisTemplate) => {
    const initialResponses: Record<string, any> = {};
    (template.fields as any[]).forEach((field) => {
      initialResponses[field.id] = "";
    });
    setManualResponses(initialResponses);
    setManualEntryTemplate(template);
  };

  const submitManualEntry = async () => {
    if (!manualEntryTemplate) return;
    setSubmittingManual(true);

    try {
      const { error } = await supabase.rpc("create_manual_anamnesis_response_secure", {
        p_patient_id: patientId,
        p_template_id: manualEntryTemplate.id,
        p_responses: manualResponses,
      });

      if (error) throw error;
      setManualEntryTemplate(null);
      await loadData();
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    } finally {
      setSubmittingManual(false);
    }
  };

  const copyToClipboard = async (token: string) => {
    const url = `${window.location.origin}/public/anamnesis/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevokeLink = async (requestId: string) => {
    if (!confirm("Revogar este link publico agora?")) return;
    setMutatingId(requestId);
    const { error } = await AnamnesisService.revokePublicLink(requestId);
    if (error) alert(error);
    await loadData();
    setMutatingId(null);
  };

  const handleRegenerateLink = async (requestId: string) => {
    if (!confirm("Gerar um novo link? O link anterior sera invalidado imediatamente.")) return;
    setMutatingId(requestId);
    const { error } = await AnamnesisService.regeneratePublicLink(requestId);
    if (error) alert(error);
    await loadData();
    setMutatingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover esta solicitacao?")) return;
    const { error } = await supabase.from("anamnesis_responses").delete().eq("id", id);
    if (!error) loadData();
  };

  const getResponseValue = (responses: AnamnesisResponse["responses"], fieldId: string) => {
    if (!responses || typeof responses !== "object" || Array.isArray(responses)) return null;
    const value = (responses as Record<string, unknown>)[fieldId];
    return typeof value === "string" || typeof value === "number" ? String(value) : null;
  };

  return (
    <Card className="glass-panel border-0 shadow-lg overflow-hidden rounded-[32px] animate-fade-in">
      <CardHeader className="pb-4 bg-white/30 backdrop-blur-sm border-b border-white/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-primary">Solicitar Anamnese</CardTitle>
              <CardDescription className="text-xs">
                Envie questionarios personalizados para o paciente.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-8 p-8">
        <div className="flex flex-col gap-3 p-6 rounded-3xl bg-primary/5 border border-primary/10">
          <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest ml-1">
            Novo Envio ou Preenchimento
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Select
                key={templates.length}
                value={selectedTemplate}
                onValueChange={(value: any) => setSelectedTemplate(value || "")}
                disabled={loading || templates.length === 0}
              >
                <SelectTrigger className="glass-input-field h-12 bg-white/70 w-full">
                  <SelectValue
                    placeholder={templates.length === 0 ? "Carregando modelos..." : "Selecione um modelo..."}
                  >
                    {selectedTemplate ? templates.find((item) => item.id === selectedTemplate)?.title : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  className="rounded-2xl border-white/40 backdrop-blur-xl"
                  side="bottom"
                  sideOffset={8}
                  alignItemWithTrigger={false}
                >
                  {templates.map((template: any) => (
                    <SelectItem key={template.id} value={template.id} className="rounded-lg">
                      {template.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
              <Button
                variant="outline"
                className="h-12 px-6 rounded-full border-primary/20 text-primary hover:bg-primary/5 transition-all w-full sm:w-auto justify-center"
                disabled={!selectedTemplate || creating}
                onClick={() => {
                  const template = templates.find((item) => item.id === selectedTemplate);
                  if (template) handleManualEntry(template);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Preencher Agora
              </Button>
              <Button
                className="gradient-primary text-white h-12 px-8 rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-95 w-full sm:w-auto justify-center"
                disabled={!selectedTemplate || creating}
                onClick={handleCreateRequest}
              >
                {creating ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Gerar Link
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Solicitacoes Enviadas e Preenchidas
            </p>
            {requests.length > 0 && (
              <Badge variant="outline" className="text-[9px] px-2 py-0">
                {requests.length} total
              </Badge>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              <div className="h-16 bg-white/50 animate-pulse rounded-2xl" />
              <div className="h-16 bg-white/50 animate-pulse rounded-2xl" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-10 border border-dashed rounded-[32px] bg-white/5 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center mb-3">
                <FileText className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma solicitacao enviada para este paciente.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {requests.map((request) => {
                const publicToken = request.public_token ?? request.id;
                const templateTitle = request.anamnesis_templates?.title ?? "Modelo indisponivel";
                const linkState = getLinkState(request);
                const canCopy = linkState === "active";
                const canRegenerate = request.status === "pending";
                const canRevoke = linkState !== "revoked";

                return (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-4 rounded-[24px] border border-white/40 bg-white/40 hover:bg-white/60 transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                          linkState === "completed"
                            ? "bg-emerald-100 text-emerald-600"
                            : linkState === "revoked"
                            ? "bg-rose-100 text-rose-600"
                            : linkState === "expired"
                            ? "bg-amber-100 text-amber-600"
                            : "bg-blue-100 text-blue-600"
                        )}
                      >
                        {linkState === "completed" ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <Clock className="w-5 h-5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate text-primary/80">{templateTitle}</p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                          {request.created_at ? formatDate(request.created_at) : "Data indisponivel"} ·{" "}
                          {linkState === "completed"
                            ? "Finalizado"
                            : linkState === "revoked"
                            ? "Revogado"
                            : linkState === "expired"
                            ? "Expirado"
                            : "Pendente"}
                        </p>
                        {request.public_expires_at && request.status === "pending" && (
                          <p className="text-[10px] text-muted-foreground">
                            Expira em{" "}
                            {new Date(request.public_expires_at).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canCopy && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-white"
                          onClick={() => copyToClipboard(publicToken)}
                          title="Copiar Link"
                        >
                          {copiedId === publicToken ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      )}

                      {request.status === "completed" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-white"
                          onClick={() => setViewingResponse(request)}
                          title="Visualizar Respostas"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      )}

                      {canRegenerate && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-white"
                          onClick={() => handleRegenerateLink(request.id)}
                          title="Regenerar Link"
                          disabled={mutatingId === request.id}
                        >
                          {mutatingId === request.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </Button>
                      )}

                      {canRevoke && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 rounded-full text-muted-foreground hover:text-amber-700 hover:bg-amber-50"
                          onClick={() => handleRevokeLink(request.id)}
                          title="Revogar Link"
                          disabled={mutatingId === request.id}
                        >
                          <Clock className="w-4 h-4" />
                        </Button>
                      )}

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 rounded-full text-muted-foreground hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(request.id)}
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={!!manualEntryTemplate} onOpenChange={(open) => !open && setManualEntryTemplate(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-[32px] border-0 shadow-2xl">
          <DialogHeader className="p-8 bg-primary/5 border-b border-primary/10">
            <DialogTitle className="text-2xl font-bold text-primary">{manualEntryTemplate?.title}</DialogTitle>
            <DialogDescription>Preenchimento manual para o paciente no consultorio.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-8 space-y-8">
            {(manualEntryTemplate?.fields as any[])?.map((field, idx) => (
              <div key={field.id} className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <Label className="text-sm font-bold text-slate-700">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <span className="text-[10px] font-bold text-slate-300 uppercase">Q{idx + 1}</span>
                </div>

                {field.type === "text" && (
                  <Input
                    className="glass-input-field h-12 bg-slate-50/50"
                    placeholder="Sua resposta..."
                    value={manualResponses[field.id]}
                    onChange={(e) =>
                      setManualResponses((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                  />
                )}

                {field.type === "long_text" && (
                  <Textarea
                    className="rounded-2xl border-slate-200 focus:border-primary transition-all shadow-sm bg-slate-50/50 min-h-[100px] py-4"
                    placeholder="Descreva detalhadamente..."
                    value={manualResponses[field.id]}
                    onChange={(e) =>
                      setManualResponses((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                  />
                )}

                {field.type === "select" && (
                  <Select
                    value={manualResponses[field.id]}
                    onValueChange={(value: any) =>
                      setManualResponses((prev) => ({ ...prev, [field.id]: value || "" }))
                    }
                  >
                    <SelectTrigger className="glass-input-field h-12 bg-slate-50/50">
                      <SelectValue placeholder="Selecione uma opcao..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-white/40 backdrop-blur-xl">
                      {field.options?.map((option: string) => (
                        <SelectItem key={option} value={option} className="rounded-lg">
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {field.type === "number" && (
                  <Input
                    type="number"
                    className="glass-input-field h-12 bg-slate-50/50"
                    placeholder="0"
                    value={manualResponses[field.id]}
                    onChange={(e) =>
                      setManualResponses((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                  />
                )}

                {field.type === "date" && (
                  <Input
                    type="date"
                    className="glass-input-field h-12 bg-slate-50/50"
                    value={manualResponses[field.id]}
                    onChange={(e) =>
                      setManualResponses((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}
          </div>

          <div className="p-8 bg-slate-50/80 backdrop-blur-sm border-t border-slate-200 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setManualEntryTemplate(null)} className="rounded-full px-6">
              Cancelar
            </Button>
            <Button
              onClick={submitManualEntry}
              disabled={submittingManual}
              className="gradient-primary text-white rounded-full px-8 shadow-lg shadow-primary/20"
            >
              {submittingManual ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Salvar Respostas"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingResponse} onOpenChange={(open) => !open && setViewingResponse(null)}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-[32px] border-0 shadow-2xl">
          <DialogHeader className="p-8 bg-emerald-50 border-b border-emerald-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <DialogTitle className="text-2xl font-bold text-emerald-900">
                {viewingResponse?.anamnesis_templates?.title ?? "Modelo indisponivel"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-emerald-700/70">
              Respostas enviadas em{" "}
              {viewingResponse?.created_at ? formatDate(viewingResponse.created_at) : "data indisponivel"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            {viewingResponse?.anamnesis_templates ? (
              (viewingResponse.anamnesis_templates.fields as { id: string; label: string }[]).map(
                (field, idx) => {
                  const responseValue = getResponseValue(viewingResponse.responses, field.id);
                  return (
                    <div
                      key={field.id}
                      className="space-y-2 p-5 rounded-2xl bg-slate-50/50 border border-slate-100"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-bold text-emerald-300 mt-1 uppercase">
                          Questao {idx + 1}
                        </span>
                        <p className="text-sm font-bold text-slate-800">{field.label}</p>
                      </div>
                      <div className="pl-0 mt-3 pt-3 border-t border-slate-200/50">
                        {responseValue ? (
                          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                            {responseValue}
                          </p>
                        ) : (
                          <p className="text-sm text-slate-400 italic">Nenhuma resposta fornecida</p>
                        )}
                      </div>
                    </div>
                  );
                }
              )
            ) : (
              <div className="p-5 rounded-2xl bg-slate-50/50 border border-slate-100">
                <p className="text-sm font-bold text-slate-800">Modelo removido ou indisponivel</p>
                <p className="text-sm text-slate-500 mt-2">
                  As respostas foram registradas, mas o modelo original nao esta disponivel para exibicao.
                </p>
              </div>
            )}
          </div>

          <div className="p-8 bg-slate-50/80 backdrop-blur-sm border-t border-slate-200 flex justify-end">
            <Button variant="outline" onClick={() => setViewingResponse(null)} className="rounded-full px-8">
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
