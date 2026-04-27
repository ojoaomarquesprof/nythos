"use client";

import { useEffect, useState } from "react";
import { 
  FileText, 
  Send, 
  Copy, 
  Check, 
  ExternalLink,
  Plus,
  Clock,
  CheckCircle2,
  Trash2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import type { AnamnesisTemplate, AnamnesisResponse } from "@/types/database";
import { formatDate } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function AnamnesisRequestCard({ patientId }: { patientId: string }) {
  const supabase = createClient() as any;
  const [templates, setTemplates] = useState<AnamnesisTemplate[]>([]);
  const [requests, setRequests] = useState<(AnamnesisResponse & { anamnesis_templates: AnamnesisTemplate })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewingResponse, setViewingResponse] = useState<any>(null);
  
  // Manual Entry States
  const [manualEntryTemplate, setManualEntryTemplate] = useState<AnamnesisTemplate | null>(null);
  const [manualResponses, setManualResponses] = useState<Record<string, any>>({});
  const [submittingManual, setSubmittingManual] = useState(false);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [templatesRes, requestsRes] = await Promise.all([
      supabase.from("anamnesis_templates").select("*").eq("user_id", user.id).order("title"),
      supabase
        .from("anamnesis_responses")
        .select("*, anamnesis_templates(*)")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
    ]);

    if (!templatesRes.error) setTemplates(templatesRes.data || []);
    if (!requestsRes.error) setRequests(requestsRes.data as any || []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    // Realtime Subscription for this patient's responses
    const channel = supabase
      .channel(`patient-anamnesis-${patientId}`)
      .on(
        "postgres_changes",
        { 
          event: "*", 
          schema: "public", 
          table: "anamnesis_responses"
        },
        () => {
          loadData(); // Reload data when anything changes
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
      const { data, error } = await supabase
        .from("anamnesis_responses")
        .insert({
          template_id: selectedTemplate,
          patient_id: patientId,
          status: "pending",
          responses: {}
        })
        .select()
        .single();

      if (error) {
        console.error("Erro ao criar solicitação:", error);
        alert(`Erro ao criar solicitação: ${error.message}`);
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
    (template.fields as any[]).forEach(f => {
      initialResponses[f.id] = "";
    });
    setManualResponses(initialResponses);
    setManualEntryTemplate(template);
  };

  const submitManualEntry = async () => {
    if (!manualEntryTemplate) return;
    setSubmittingManual(true);

    try {
      const { error } = await supabase
        .from("anamnesis_responses")
        .insert({
          template_id: manualEntryTemplate.id,
          patient_id: patientId,
          status: "completed",
          responses: manualResponses
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

  const copyToClipboard = (id: string) => {
    const url = `${window.location.origin}/public/anamnesis/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover esta solicitação?")) return;
    const { error } = await supabase.from("anamnesis_responses").delete().eq("id", id);
    if (!error) loadData();
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
                Envie questionários personalizados para o paciente.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8 p-8">
        {/* Creation Area */}
        <div className="flex flex-col gap-3 p-6 rounded-3xl bg-primary/5 border border-primary/10">
          <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest ml-1">Novo Envio ou Preenchimento</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Select 
                key={templates.length} // Force re-render when templates load
                value={selectedTemplate} 
                onValueChange={(val: any) => setSelectedTemplate(val || "")}
                disabled={loading || templates.length === 0}
              >
                <SelectTrigger className="glass-input-field h-12 bg-white/70 w-full">
                  <SelectValue placeholder={templates.length === 0 ? "Carregando modelos..." : "Selecione um modelo..."}>
                    {selectedTemplate ? templates.find(t => t.id === selectedTemplate)?.title : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-white/40 backdrop-blur-xl" side="bottom" sideOffset={8} alignItemWithTrigger={false}>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id} className="rounded-lg">
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button 
                variant="outline"
                className="h-12 px-6 rounded-full border-primary/20 text-primary hover:bg-primary/5 transition-all"
                disabled={!selectedTemplate || creating}
                onClick={() => {
                  const template = templates.find(t => t.id === selectedTemplate);
                  if (template) handleManualEntry(template);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Preencher Agora
              </Button>
              <Button 
                className="gradient-primary text-white h-12 px-8 rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-95" 
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

        {/* Requests List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Solicitações Enviadas e Preenchidas
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
              <p className="text-sm text-muted-foreground">Nenhuma solicitação enviada para este paciente.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {requests.map((req: any) => (
                <div 
                  key={req.id} 
                  className="flex items-center justify-between p-4 rounded-[24px] border border-white/40 bg-white/40 hover:bg-white/60 transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                      req.status === "completed" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
                    )}>
                      {req.status === "completed" ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate text-primary/80">{req.anamnesis_templates.title}</p>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        {formatDate(req.created_at)} · {req.status === "completed" ? "Finalizado" : "Pendente"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    {req.status === "pending" && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-white"
                        onClick={() => copyToClipboard(req.id)}
                        title="Copiar Link"
                      >
                        {copiedId === req.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    )}
                    {req.status === "completed" && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-white"
                        onClick={() => setViewingResponse(req)}
                        title="Visualizar Respostas"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-9 w-9 rounded-full text-muted-foreground hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(req.id)}
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      {/* Manual Entry Modal */}
      <Dialog open={!!manualEntryTemplate} onOpenChange={(open) => !open && setManualEntryTemplate(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-[32px] border-0 shadow-2xl">
          <DialogHeader className="p-8 bg-primary/5 border-b border-primary/10">
            <DialogTitle className="text-2xl font-bold text-primary">{manualEntryTemplate?.title}</DialogTitle>
            <DialogDescription>
              Preenchimento manual para o paciente no consultório.
            </DialogDescription>
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
                    onChange={(e) => setManualResponses(prev => ({ ...prev, [field.id]: e.target.value }))}
                  />
                )}

                {field.type === "long_text" && (
                  <Textarea 
                    className="rounded-2xl border-slate-200 focus:border-primary transition-all shadow-sm bg-slate-50/50 min-h-[100px] py-4"
                    placeholder="Descreva detalhadamente..."
                    value={manualResponses[field.id]}
                    onChange={(e) => setManualResponses(prev => ({ ...prev, [field.id]: e.target.value }))}
                  />
                )}

                {field.type === "select" && (
                  <Select 
                    value={manualResponses[field.id]} 
                    onValueChange={(val: any) => setManualResponses(prev => ({ ...prev, [field.id]: val || "" }))}
                  >
                    <SelectTrigger className="glass-input-field h-12 bg-slate-50/50">
                      <SelectValue placeholder="Selecione uma opção..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-white/40 backdrop-blur-xl">
                      {field.options?.map((opt: string) => (
                        <SelectItem key={opt} value={opt} className="rounded-lg">
                          {opt}
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
                    onChange={(e) => setManualResponses(prev => ({ ...prev, [field.id]: e.target.value }))}
                  />
                )}

                {field.type === "date" && (
                  <Input 
                    type="date"
                    className="glass-input-field h-12 bg-slate-50/50"
                    value={manualResponses[field.id]}
                    onChange={(e) => setManualResponses(prev => ({ ...prev, [field.id]: e.target.value }))}
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

      {/* View Response Modal */}
      <Dialog open={!!viewingResponse} onOpenChange={(open) => !open && setViewingResponse(null)}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-[32px] border-0 shadow-2xl">
          <DialogHeader className="p-8 bg-emerald-50 border-b border-emerald-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <DialogTitle className="text-2xl font-bold text-emerald-900">{viewingResponse?.anamnesis_templates?.title}</DialogTitle>
            </div>
            <DialogDescription className="text-emerald-700/70">
              Respostas enviadas em {viewingResponse && formatDate(viewingResponse.created_at)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            {viewingResponse && (viewingResponse.anamnesis_templates.fields as any[]).map((field: any, idx: number) => (
              <div key={field.id} className="space-y-2 p-5 rounded-2xl bg-slate-50/50 border border-slate-100">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold text-emerald-300 mt-1 uppercase">Questão {idx + 1}</span>
                  <p className="text-sm font-bold text-slate-800">{field.label}</p>
                </div>
                <div className="pl-0 mt-3 pt-3 border-t border-slate-200/50">
                  {viewingResponse.responses[field.id] ? (
                    <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {viewingResponse.responses[field.id]}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-400 italic">Nenhuma resposta fornecida</p>
                  )}
                </div>
              </div>
            ))}
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
