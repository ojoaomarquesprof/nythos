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

  async function loadData() {
    setLoading(true);
    const [templatesRes, requestsRes] = await Promise.all([
      supabase.from("anamnesis_templates").select("*").order("title"),
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
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Solicitar Anamnese</CardTitle>
          </div>
        </div>
        <CardDescription>
          Envie um formulário personalizado para o paciente preencher online.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Creation Area */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Select 
              value={selectedTemplate} 
              onValueChange={(val: any) => setSelectedTemplate(val || "")}
              disabled={loading || templates.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={templates.length === 0 ? "Nenhum modelo criado" : "Selecione um modelo..."} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button 
            className="gradient-primary text-white shrink-0" 
            disabled={!selectedTemplate || creating}
            onClick={handleCreateRequest}
          >
            {creating ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-3.5 h-3.5 mr-2" />
                Gerar Link
              </>
            )}
          </Button>
        </div>

        {/* Requests List */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Solicitações Enviadas
          </p>
          
          {loading ? (
            <div className="space-y-2">
              <div className="h-12 bg-muted animate-pulse rounded-lg" />
              <div className="h-12 bg-muted animate-pulse rounded-lg" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-6 border border-dashed rounded-xl bg-muted/5">
              <p className="text-xs text-muted-foreground">Nenhuma solicitação enviada para este paciente.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((req: any) => (
                <div 
                  key={req.id} 
                  className="flex items-center justify-between p-3 rounded-xl border bg-card/50 hover:bg-card transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      req.status === "completed" ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                    )}>
                      {req.status === "completed" ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{req.anamnesis_templates.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDate(req.created_at)} · {req.status === "completed" ? "Preenchido" : "Aguardando paciente"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-4">
                    {req.status === "pending" && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => copyToClipboard(req.id)}
                        title="Copiar Link"
                      >
                        {copiedId === req.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    )}
                    {req.status === "completed" && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setViewingResponse(req)}
                        title="Visualizar Respostas"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 text-muted-foreground hover:text-red-600"
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

      {/* View Response Modal */}
      <Dialog open={!!viewingResponse} onOpenChange={(open) => !open && setViewingResponse(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingResponse?.anamnesis_templates?.title}</DialogTitle>
            <DialogDescription>
              Respostas enviadas em {viewingResponse && formatDate(viewingResponse.created_at)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {viewingResponse && (viewingResponse.anamnesis_templates.fields as any[]).map((field: any, idx: number) => (
              <div key={field.id} className="space-y-2 pb-4 border-b last:border-0 border-slate-100">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold text-slate-300 mt-1 uppercase">Q{idx + 1}</span>
                  <p className="text-sm font-semibold text-slate-800">{field.label}</p>
                </div>
                <div className="pl-6">
                  {viewingResponse.responses[field.id] ? (
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">
                      {viewingResponse.responses[field.id]}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-400 italic">Sem resposta</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingResponse(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
