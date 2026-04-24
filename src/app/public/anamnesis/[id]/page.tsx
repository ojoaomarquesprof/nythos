"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { 
  CheckCircle2, 
  AlertCircle, 
  Send, 
  ChevronRight,
  ShieldCheck,
  FileText,
  Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface TemplateField {
  id: string;
  label: string;
  type: "text" | "long_text" | "number" | "date" | "select";
  required: boolean;
  options?: string[];
}

export default function PublicAnamnesisPage() {
  const { id } = useParams();
  const supabase = createClient();
  
  const [responseRecord, setResponseRecord] = useState<any>(null);
  const [template, setTemplate] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [responses, setResponses] = useState<Record<string, any>>({});

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      
      // 1. Fetch response record
      const { data: resData, error: resError } = await supabase
        .from("anamnesis_responses")
        .select("*")
        .eq("id", id)
        .single();

      if (resError) {
        console.error("Erro Resposta:", resError);
        setError(`Erro ao carregar resposta: ${resError.message} (${resError.code})`);
        setLoading(false);
        return;
      }

      if (resData) {
        // 2. Fetch template
        const { data: tempData, error: tempError } = await supabase
          .from("anamnesis_templates")
          .select("*")
          .eq("id", resData.template_id)
          .single();
        
        if (tempError) {
          setError(`Erro ao carregar modelo: ${tempError.message}`);
          setLoading(false);
          return;
        }

        // 3. Fetch profile (clinic branding)
        const { data: profData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", tempData.user_id)
          .single();

        if (resData.status === "completed") {
          setSubmitted(true);
        }

        setResponseRecord(resData);
        setTemplate(tempData);
        setProfile(profData);
        
        // Initialize responses if not completed
        if (resData.status !== "completed") {
          const initialResponses: Record<string, any> = {};
          (tempData.fields as unknown as TemplateField[]).forEach(f => {
            initialResponses[f.id] = "";
          });
          setResponses(initialResponses);
        }
      }
      setLoading(false);
    }

    loadData();
  }, [id, supabase]);

  const handleInputChange = (fieldId: string, value: any) => {
    setResponses(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Validate required fields
    const fields = template.fields as unknown as TemplateField[];
    const missingFields = fields.filter(f => f.required && !responses[f.id]);
    
    if (missingFields.length > 0) {
      setError(`Por favor, preencha todos os campos obrigatórios.`);
      setSubmitting(false);
      return;
    }

    const { error: submitError } = await supabase
      .from("anamnesis_responses")
      .update({
        responses: responses,
        status: "completed"
      })
      .eq("id", id);

    if (submitError) {
      setError("Erro ao enviar respostas. Tente novamente mais tarde.");
    } else {
      setSubmitted(true);
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="animate-pulse space-y-4 w-full max-w-md">
          <div className="h-12 w-12 bg-muted rounded-full mx-auto" />
          <div className="h-8 w-48 bg-muted rounded mx-auto" />
          <div className="h-64 bg-muted rounded-xl w-full" />
        </div>
      </div>
    );
  }

  if (error && !template) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-lg text-center">
          <CardContent className="pt-10 pb-10">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 mb-2">Link Indisponível</h1>
            <p className="text-muted-foreground">{error}</p>
            {/* Exibir erro técnico para debug */}
            <p className="text-[10px] text-slate-400 mt-4 font-mono bg-slate-100 p-2 rounded">
              Status: {error}
            </p>
            <Button variant="outline" className="mt-6" onClick={() => window.location.href = "/"}>
              Voltar ao Início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-2xl text-center overflow-hidden">
          <div className="h-2 gradient-primary w-full" />
          <CardContent className="pt-10 pb-10">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Formulário Concluído!</h1>
            <p className="text-muted-foreground px-6">
              Suas respostas foram enviadas para <strong>{profile?.full_name}</strong>. 
              Este link não permite mais edições.
            </p>
            <div className="mt-8 pt-8 border-t flex flex-col items-center gap-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                Plataforma Segura Nythos
              </p>
              <div className="flex items-center gap-1 text-slate-400">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-xs">Dados Protegidos</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Clinic Header */}
        <div className="text-center space-y-4">
          {profile?.clinic_logo_url ? (
            <img 
              src={profile.clinic_logo_url} 
              alt="Logo" 
              className="h-16 mx-auto object-contain"
            />
          ) : (
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <FileText className="w-8 h-8 text-primary" />
            </div>
          )}
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
              {profile?.clinic_name || profile?.full_name}
            </h2>
            <h1 className="text-3xl font-bold text-slate-900">{template.title}</h1>
            {template.description && (
              <p className="text-slate-500 max-w-lg mx-auto">{template.description}</p>
            )}
          </div>
        </div>

        {/* Form Card */}
        <Card className="border-0 shadow-2xl rounded-2xl overflow-hidden bg-white">
          <div className="h-1.5 gradient-primary w-full" />
          <CardContent className="p-6 md:p-10">
            <form onSubmit={handleSubmit} className="space-y-8">
              {error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-100 flex items-center gap-3 text-red-700 text-sm animate-in fade-in slide-in-from-top-1">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-10">
                {(template.fields as unknown as TemplateField[]).map((field, idx) => (
                  <div key={field.id} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                    <div className="flex items-start justify-between gap-4">
                      <Label className="text-base font-semibold text-slate-800 leading-tight">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      <span className="text-[10px] font-bold text-slate-300 uppercase bg-slate-50 px-2 py-0.5 rounded">
                        Q{idx + 1}
                      </span>
                    </div>

                    {field.type === "text" && (
                      <Input 
                        className="h-12 text-base border-slate-200 focus:border-primary transition-all shadow-sm"
                        placeholder="Sua resposta..."
                        value={responses[field.id]}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        required={field.required}
                      />
                    )}

                    {field.type === "long_text" && (
                      <Textarea 
                        className="min-h-[120px] text-base border-slate-200 focus:border-primary transition-all shadow-sm resize-none"
                        placeholder="Descreva detalhadamente..."
                        value={responses[field.id]}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        required={field.required}
                      />
                    )}

                    {field.type === "number" && (
                      <Input 
                        type="number"
                        className="h-12 text-base border-slate-200 focus:border-primary transition-all shadow-sm"
                        placeholder="0"
                        value={responses[field.id]}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        required={field.required}
                      />
                    )}

                    {field.type === "date" && (
                      <Input 
                        type="date"
                        className="h-12 text-base border-slate-200 focus:border-primary transition-all shadow-sm"
                        value={responses[field.id]}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        required={field.required}
                      />
                    )}

                    {field.type === "select" && (
                      <Select 
                        value={responses[field.id]} 
                        onValueChange={(val) => handleInputChange(field.id, val)}
                        required={field.required}
                      >
                        <SelectTrigger className="h-12 text-base border-slate-200 shadow-sm">
                          <SelectValue placeholder="Selecione uma opção..." />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((opt) => (
                            <SelectItem key={opt} value={opt} className="text-base">
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-10">
                <Button 
                  type="submit" 
                  className="w-full h-14 text-lg font-bold gradient-primary text-white shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-70 group"
                  disabled={submitting}
                >
                  {submitting ? (
                    <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      Enviar Respostas
                    </div>
                  )}
                </Button>
                <div className="flex items-center justify-center gap-2 mt-6 text-slate-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-[11px] font-medium uppercase tracking-widest">
                    Formulário Criptografado e Seguro
                  </span>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center pb-10">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            Powered by <span className="font-bold text-primary tracking-tight italic">Nythos Health</span>
            <ChevronRight className="w-3 h-3" />
            SaaS Clínico
          </p>
        </div>
      </div>
    </div>
  );
}
