"use client";

import { useEffect, useState } from "react";
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  Settings2, 
  FileText, 
  Save, 
  X,
  Type,
  AlignLeft,
  Hash,
  Calendar as CalendarIcon,
  List
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import type { AnamnesisTemplate } from "@/types/database";
import { cn } from "@/lib/utils";

interface TemplateField {
  id: string;
  label: string;
  type: "text" | "long_text" | "number" | "date" | "select";
  required: boolean;
  options?: string[];
}

export function AnamnesisBuilder() {
  const supabase = createClient();
  const [templates, setTemplates] = useState<AnamnesisTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<TemplateField[]>([]);

  const fieldTypes = [
    { value: "text", label: "Texto Curto", icon: Type },
    { value: "long_text", label: "Texto Longo", icon: AlignLeft },
    { value: "number", label: "Número", icon: Hash },
    { value: "date", label: "Data", icon: CalendarIcon },
    { value: "select", label: "Seleção Única", icon: List },
  ];

  async function loadTemplates() {
    setLoading(true);
    const { data, error } = await supabase
      .from("anamnesis_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setTemplates(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleOpenModal = (template?: AnamnesisTemplate) => {
    if (template) {
      setEditingId(template.id);
      setTitle(template.title);
      setDescription(template.description || "");
      setFields((template.fields as unknown as TemplateField[]) || []);
    } else {
      setEditingId(null);
      setTitle("");
      setDescription("");
      setFields([]);
    }
    setIsModalOpen(true);
  };

  const handleAddField = () => {
    const newField: TemplateField = {
      id: Math.random().toString(36).substring(7),
      label: "",
      type: "text",
      required: false,
    };
    setFields([...fields, newField]);
  };

  const handleRemoveField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id));
  };

  const handleFieldChange = (id: string, updates: Partial<TemplateField>) => {
    setFields(fields.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setIsSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      user_id: user.id,
      title,
      description,
      fields: fields as any,
    };

    let error;
    if (editingId) {
      const { error: err } = await supabase
        .from("anamnesis_templates")
        .update(payload)
        .eq("id", editingId);
      error = err;
    } else {
      const { error: err } = await supabase
        .from("anamnesis_templates")
        .insert(payload);
      error = err;
    }

    if (!error) {
      setIsModalOpen(false);
      loadTemplates();
    }
    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este modelo?")) return;
    
    const { error } = await supabase
      .from("anamnesis_templates")
      .delete()
      .eq("id", id);

    if (!error) {
      loadTemplates();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Modelos de Anamnese
        </h2>
        <Button onClick={() => handleOpenModal()} size="sm" className="gradient-primary text-white">
          <Plus className="w-4 h-4 mr-2" />
          Novo Modelo
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          Array(2).fill(0).map((_, i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
          ))
        ) : templates.length === 0 ? (
          <Card className="col-span-full border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <FileText className="w-10 h-10 mb-2 opacity-20" />
              <p>Nenhum modelo criado ainda.</p>
              <Button 
                variant="link" 
                onClick={() => handleOpenModal()}
                className="text-primary mt-1"
              >
                Criar meu primeiro modelo
              </Button>
            </CardContent>
          </Card>
        ) : (
          templates.map((template) => (
            <Card key={template.id} className="group border-0 shadow-sm hover:shadow-md transition-all">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{template.title}</CardTitle>
                    {template.description && (
                      <CardDescription className="line-clamp-1">{template.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => handleOpenModal(template)}
                    >
                      <Settings2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 text-muted-foreground hover:text-red-600"
                      onClick={() => handleDelete(template.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="font-normal text-[10px]">
                    {((template.fields as any[]) || []).length} campos
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    Criado em {new Date(template.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Editor Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Modelo" : "Novo Modelo de Anamnese"}</DialogTitle>
            <DialogDescription>
              Personalize os campos que você deseja coletar durante a anamnese.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-title">Título do Modelo</Label>
                <Input 
                  id="template-title" 
                  placeholder="Ex: Anamnese Infantil, Avaliação Adulto..." 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-desc">Descrição (Opcional)</Label>
                <Textarea 
                  id="template-desc" 
                  placeholder="Explique o propósito deste modelo..." 
                  className="h-20"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Campos do Formulário
                </Label>
                <Button onClick={handleAddField} size="sm" variant="outline" className="h-8">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Adicionar Campo
                </Button>
              </div>

              <div className="space-y-3">
                {fields.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed rounded-lg text-muted-foreground bg-muted/20">
                    <p className="text-sm">Clique em "Adicionar Campo" para começar.</p>
                  </div>
                ) : (
                  fields.map((field, index) => (
                    <div key={field.id} className="p-4 rounded-xl border bg-card/50 space-y-3 relative group">
                      <div className="flex items-start gap-3">
                        <div className="mt-2.5 cursor-grab">
                          <GripVertical className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                        
                        <div className="flex-1 space-y-3">
                          <div className="grid grid-cols-12 gap-3">
                            <div className="col-span-8">
                              <Input 
                                placeholder="Pergunta / Rótulo do campo"
                                value={field.label}
                                onChange={(e) => handleFieldChange(field.id, { label: e.target.value })}
                                className="h-9"
                              />
                            </div>
                            <div className="col-span-4">
                              <Select 
                                value={field.type} 
                                onValueChange={(val: any) => handleFieldChange(field.id, { type: val })}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {fieldTypes.map((t) => (
                                    <SelectItem key={t.value} value={t.value}>
                                      <div className="flex items-center gap-2">
                                        <t.icon className="w-3.5 h-3.5" />
                                        <span>{t.label}</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="flex items-center space-x-2">
                              <Checkbox 
                                id={`req-${field.id}`} 
                                checked={field.required}
                                onCheckedChange={(val) => handleFieldChange(field.id, { required: !!val })}
                              />
                              <label 
                                htmlFor={`req-${field.id}`}
                                className="text-xs text-muted-foreground cursor-pointer"
                              >
                                Obrigatório
                              </label>
                            </div>

                            {field.type === "select" && (
                              <div className="flex-1">
                                <Input 
                                  placeholder="Opções separadas por vírgula"
                                  className="h-8 text-xs"
                                  value={field.options?.join(", ") || ""}
                                  onChange={(e) => handleFieldChange(field.id, { 
                                    options: e.target.value.split(",").map(o => o.trim()).filter(o => o) 
                                  })}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-red-600 shrink-0"
                          onClick={() => handleRemoveField(field.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button 
              className="gradient-primary text-white" 
              onClick={handleSave}
              disabled={isSaving || !title.trim() || fields.length === 0}
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {editingId ? "Salvar Alterações" : "Criar Modelo"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
