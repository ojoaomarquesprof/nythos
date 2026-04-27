"use client";

import { useEffect, useState } from "react";
import { User, Bell, Shield, Save, CheckCircle2, AlertCircle, Upload, ImageIcon, Fingerprint, Users, PenTool } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";
import { AnamnesisBuilder } from "@/components/dashboard/settings/anamnesis-builder";

export default function SettingsPage() {
  const supabase = createClient() as any;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorDialog, setErrorDialog] = useState({ open: false, title: "", message: "" });

  const [formData, setFormData] = useState({
    full_name: "",
    crp: "",
    clinic_name: "",
    phone: "",
    avatar_url: "",
    clinic_logo_url: "",
    signature_url: "",
    session_duration_default: 50,
    session_price_default: 150,
    cpf: "",
    rg: "",
    address: "",
  });

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  
  // New states for notifications and security
  const [pushStatus, setPushStatus] = useState<NotificationPermission>("default");
  const [isBiometryEnabled, setIsBiometryEnabled] = useState(false);

  function showError(title: string, message: string) {
    setErrorDialog({ open: true, title, message });
  }

  async function loadProfile() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        showError("Erro ao carregar perfil", error.message);
      } else if (data) {
        setProfile(data);
        setFormData({
          full_name: data.full_name || "",
          crp: data.crp || "",
          clinic_name: data.clinic_name || "",
          phone: data.phone || "",
          avatar_url: data.avatar_url || "",
          clinic_logo_url: data.clinic_logo_url || "",
          signature_url: data.signature_url || "",
          session_duration_default: data.session_duration_default || 50,
          session_price_default: data.session_price_default || 150,
          cpf: data.cpf || "",
          rg: data.rg || "",
          address: data.address || "",
        });
      }
    }

    if ("Notification" in window) {
      setPushStatus(Notification.permission);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]:
        e.target.type === "number" ? Number(e.target.value) : e.target.value,
    }));
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "avatar_url" | "clinic_logo_url" | "signature_url",
  ) => {
    const file = e.target.files?.[0];
    if (!file || !profile) {
      showError("Erro no Upload", "Você precisa estar logado para enviar imagens.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showError("Arquivo Muito Grande", "A imagem deve ter no máximo 5MB.");
      e.target.value = "";
      return;
    }

    if (field === "avatar_url") setUploadingAvatar(true);
    else if (field === "clinic_logo_url") setUploadingLogo(true);
    else setUploadingSignature(true);

    try {
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
      const safeExt = ["jpg","jpeg","png","gif","webp"].includes(fileExt) ? fileExt : "png";
      const fileName = `${profile.id}/${field}-${Date.now()}.${safeExt}`;

      const { error: uploadError } = await supabase.storage
        .from("brand")
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }

      const { data } = supabase.storage.from("brand").getPublicUrl(fileName);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ [field]: data.publicUrl })
        .eq("id", profile.id);

      if (updateError) {
        throw new Error(`Erro ao salvar URL: ${updateError.message}`);
      }

      setFormData((prev) => ({ ...prev, [field]: publicUrl }));
      setProfile((prev) => prev ? { ...prev, [field]: data.publicUrl } : prev);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      showError("Erro no Upload", msg);
      e.target.value = "";
    } finally {
      if (field === "avatar_url") setUploadingAvatar(false);
      else if (field === "clinic_logo_url") setUploadingLogo(false);
      else setUploadingSignature(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setSuccess(false);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: formData.full_name,
        crp: formData.crp,
        clinic_name: formData.clinic_name,
        phone: formData.phone,
        avatar_url: formData.avatar_url,
        clinic_logo_url: formData.clinic_logo_url,
        signature_url: formData.signature_url,
        session_duration_default: formData.session_duration_default,
        session_price_default: formData.session_price_default,
        cpf: formData.cpf,
        rg: formData.rg,
        address: formData.address,
      })
      .eq("id", profile.id);

    if (!error) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      if (formData.full_name !== profile.full_name) {
        await supabase.auth.updateUser({ data: { full_name: formData.full_name } });
      }
    } else {
      showError("Erro ao Salvar", error.message);
    }

    setSaving(false);
  };

  const requestPushPermission = async () => {
    if (!("Notification" in window)) {
      showError("Não Suportado", "Seu navegador não suporta notificações push.");
      return;
    }

    const permission = await Notification.requestPermission();
    setPushStatus(permission);
    
    if (permission === "granted") {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else if (permission === "denied") {
      showError("Acesso Negado", "Você bloqueou as notificações. Ative-as nas configurações do seu navegador para receber lembretes.");
    }
  };

  const handleToggleBiometry = () => {
    if (!window.PublicKeyCredential) {
      showError("Não Suportado", "Seu dispositivo ou navegador não suporta autenticação biométrica (WebAuthn).");
      return;
    }

    // In a real app, we would call navigator.credentials.create here
    setIsBiometryEnabled(!isBiometryEnabled);
    if (!isBiometryEnabled) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <div className="px-4 py-5 md:px-6 md:py-8 space-y-8 max-w-7xl mx-auto w-full animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/20 p-6 rounded-[32px] border border-white/40 shadow-sm backdrop-blur-md">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Personalize sua experiência e gerencie os dados da sua clínica.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {success && (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none px-4 py-1.5 flex items-center gap-1.5 animate-in slide-in-from-top-2 duration-300 rounded-full shadow-sm">
              <CheckCircle2 className="w-4 h-4" />
              Alterações salvas com sucesso!
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Configuration Column */}
        <div className="lg:col-span-8 space-y-8">
          {/* Profile Form */}
          <form onSubmit={handleSave}>
            <Card className="border-0 shadow-sm overflow-hidden rounded-[32px] glass-panel">
              <CardHeader className="pb-6 border-b border-white/10">
                <CardTitle className="text-xl flex items-center gap-2 text-primary">
                  <User className="w-5 h-5" />
                  Perfil Profissional
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                {/* Visual Identity Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Avatar Upload */}
                  <div className="space-y-3">
                    <Label className="text-sm font-bold text-primary/70 uppercase ml-1">Sua Foto Profissional</Label>
                    <div className="flex items-center gap-5 p-4 rounded-3xl bg-white/30 border border-white/40 shadow-inner">
                      {formData.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={formData.avatar_url}
                          alt="Avatar"
                          className="w-20 h-20 rounded-2xl object-cover border-4 border-white shadow-md flex-shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-2xl bg-white/50 flex items-center justify-center text-primary/30 border-2 border-dashed border-primary/20 flex-shrink-0 shadow-inner">
                          <User className="w-8 h-8" />
                        </div>
                      )}
                      <div className="flex-1 space-y-2">
                        <label className="cursor-pointer group">
                          <div className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed transition-all ${uploadingAvatar ? "bg-muted opacity-60" : "hover:bg-white hover:border-primary/40 border-primary/10 bg-white/40 shadow-sm"}`}>
                            {uploadingAvatar ? (
                              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4 text-primary/60 group-hover:text-primary" />
                            )}
                            <span className="text-xs font-bold text-primary/60 group-hover:text-primary">
                              {uploadingAvatar ? "Enviando..." : "Alterar Foto"}
                            </span>
                          </div>
                          <Input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleFileUpload(e, "avatar_url")}
                            disabled={uploadingAvatar}
                          />
                        </label>
                        <p className="text-[10px] text-muted-foreground leading-tight px-1">Recomendado: 400x400px. Máximo 5MB.</p>
                      </div>
                    </div>
                  </div>

                  {/* Logo Upload */}
                  <div className="space-y-3">
                    <Label className="text-sm font-bold text-primary/70 uppercase ml-1">Logo da Clínica</Label>
                    <div className="flex items-center gap-5 p-4 rounded-3xl bg-white/30 border border-white/40 shadow-inner">
                      {formData.clinic_logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={formData.clinic_logo_url}
                          alt="Logo"
                          className="w-20 h-20 rounded-2xl object-contain bg-white border-4 border-white shadow-md p-1.5 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-2xl bg-white/50 flex flex-col items-center justify-center text-primary/30 border-2 border-dashed border-primary/20 flex-shrink-0 shadow-inner">
                          <ImageIcon className="w-8 h-8 mb-1" />
                        </div>
                      )}
                      <div className="flex-1 space-y-2">
                        <label className="cursor-pointer group">
                          <div className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed transition-all ${uploadingLogo ? "bg-muted opacity-60" : "hover:bg-white hover:border-primary/40 border-primary/10 bg-white/40 shadow-sm"}`}>
                            {uploadingLogo ? (
                              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4 text-primary/60 group-hover:text-primary" />
                            )}
                            <span className="text-xs font-bold text-primary/60 group-hover:text-primary">
                              {uploadingLogo ? "Enviando..." : "Alterar Logo"}
                            </span>
                          </div>
                          <Input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleFileUpload(e, "clinic_logo_url")}
                            disabled={uploadingLogo}
                          />
                        </label>
                        <p className="text-[10px] text-muted-foreground leading-tight px-1">Usada em relatórios PDF. Fundo transparente.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Signature Upload */}
                <div className="space-y-3">
                  <Label className="text-sm font-bold text-primary/70 uppercase ml-1">Assinatura Digital (PNG)</Label>
                  <div className="flex items-center gap-5 p-4 rounded-3xl bg-white/30 border border-white/40 shadow-inner">
                    {formData.signature_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={formData.signature_url}
                        alt="Assinatura"
                        className="w-20 h-20 rounded-2xl object-contain bg-white border-4 border-white shadow-md p-1.5 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-white/50 flex flex-col items-center justify-center text-primary/30 border-2 border-dashed border-primary/20 flex-shrink-0 shadow-inner">
                        <PenTool className="w-8 h-8 mb-1" />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <label className="cursor-pointer group">
                        <div className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed transition-all ${uploadingSignature ? "bg-muted opacity-60" : "hover:bg-white hover:border-primary/40 border-primary/10 bg-white/40 shadow-sm"}`}>
                          {uploadingSignature ? (
                            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 text-primary/60 group-hover:text-primary" />
                          )}
                          <span className="text-xs font-bold text-primary/60 group-hover:text-primary">
                            {uploadingSignature ? "Enviando..." : "Subir Assinatura"}
                          </span>
                        </div>
                        <Input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, "signature_url")}
                          disabled={uploadingSignature}
                        />
                      </label>
                      <p className="text-[10px] text-muted-foreground leading-tight px-1">Será usada nos recibos. Use fundo transparente.</p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/10" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="full_name" className="text-xs font-bold text-primary/70 uppercase ml-1">Nome Completo</Label>
                    <Input
                      id="full_name"
                      name="full_name"
                      placeholder="Dra. Maria Silva"
                      className="glass-input-field h-12"
                      value={formData.full_name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="crp" className="text-xs font-bold text-primary/70 uppercase ml-1">CRP</Label>
                    <Input
                      id="crp"
                      name="crp"
                      placeholder="06/123456"
                      className="glass-input-field h-12"
                      value={formData.crp}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinic_name" className="text-xs font-bold text-primary/70 uppercase ml-1">Nome da Clínica</Label>
                    <Input
                      id="clinic_name"
                      name="clinic_name"
                      placeholder="Clínica Equilíbrio"
                      className="glass-input-field h-12"
                      value={formData.clinic_name}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-xs font-bold text-primary/70 uppercase ml-1">Telefone de Contato</Label>
                    <Input
                      id="phone"
                      name="phone"
                      placeholder="(11) 99999-9999"
                      className="glass-input-field h-12"
                      value={formData.phone}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpf" className="text-xs font-bold text-primary/70 uppercase ml-1">CPF (Obrigatório para contratos)</Label>
                    <Input
                      id="cpf"
                      name="cpf"
                      placeholder="000.000.000-00"
                      className="glass-input-field h-12"
                      value={formData.cpf}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rg" className="text-xs font-bold text-primary/70 uppercase ml-1">RG</Label>
                    <Input
                      id="rg"
                      name="rg"
                      placeholder="00.000.000-0"
                      className="glass-input-field h-12"
                      value={formData.rg}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="address" className="text-xs font-bold text-primary/70 uppercase ml-1">Endereço Completo</Label>
                    <Input
                      id="address"
                      name="address"
                      placeholder="Rua, Número, Bairro, Cidade - UF"
                      className="glass-input-field h-12"
                      value={formData.address}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-primary/5 p-6 rounded-3xl border border-primary/10">
                  <div className="space-y-2">
                    <Label htmlFor="session_duration_default" className="text-xs font-bold text-primary/70 uppercase ml-1">Duração Padrão (min)</Label>
                    <Input
                      id="session_duration_default"
                      name="session_duration_default"
                      type="number"
                      className="glass-input-field h-12 bg-white/50"
                      value={formData.session_duration_default}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="session_price_default" className="text-xs font-bold text-primary/70 uppercase ml-1">Valor Padrão da Sessão</Label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-primary/40">R$</span>
                      <Input
                        id="session_price_default"
                        name="session_price_default"
                        type="number"
                        step="0.01"
                        className="glass-input-field h-12 pl-12 bg-white/50"
                        value={formData.session_price_default}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    className="gradient-primary text-white h-12 px-10 rounded-full font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
                    disabled={saving}
                  >
                    {saving ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Salvar Configurações
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>

          {/* Anamnesis Builder */}
          <div className="glass-panel p-8 rounded-[32px]">
            <AnamnesisBuilder />
          </div>
        </div>

        {/* Side Actions Column */}
        <div className="lg:col-span-4 space-y-8">
          {/* Team Management */}
          <Card className="border-0 shadow-sm overflow-hidden rounded-[32px] glass-panel border-l-4 border-l-indigo-500">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2 text-indigo-700">
                <Users className="w-5 h-5" />
                Gestão de Equipe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-8 pt-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Adicione secretárias ou auxiliares para gerenciar sua agenda. Eles terão acesso restrito, garantindo o sigilo total dos prontuários.
              </p>
              <Button 
                variant="outline" 
                className="w-full h-12 rounded-2xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold transition-all"
                onClick={() => window.location.href = '/dashboard/settings/team'}
              >
                Configurar Acessos da Equipe
              </Button>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card className="border-0 shadow-sm overflow-hidden rounded-[32px] glass-panel">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2 text-primary">
                <Bell className="w-5 h-5" />
                Notificações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-8 pt-4">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/30 border border-white/40">
                <div>
                  <p className="text-sm font-bold">Lembretes por Push</p>
                  <p className="text-[10px] text-muted-foreground">Alertas diretos no navegador</p>
                </div>
                <Badge className={cn(
                  "px-3 py-1 border-none rounded-full text-[10px] font-bold shadow-sm",
                  pushStatus === "granted" ? "bg-emerald-100 text-emerald-700" : "bg-white/50 text-muted-foreground"
                )}>
                  {pushStatus === "granted" ? "Ativado" : pushStatus === "denied" ? "Bloqueado" : "Inativo"}
                </Badge>
              </div>
              <Button 
                variant={pushStatus === "granted" ? "secondary" : "outline"} 
                className="w-full h-12 rounded-2xl font-bold transition-all"
                onClick={requestPushPermission}
                disabled={pushStatus === "granted"}
              >
                {pushStatus === "granted" ? "Notificações Ativadas" : "Ativar Notificações"}
              </Button>
            </CardContent>
          </Card>

          {/* Security */}
          <Card className="border-0 shadow-sm overflow-hidden rounded-[32px] glass-panel">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2 text-primary">
                <Shield className="w-5 h-5" />
                Segurança
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-8 pt-4">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/30 border border-white/40">
                <div>
                  <p className="text-sm font-bold">Acesso Biométrico</p>
                  <p className="text-[10px] text-muted-foreground">FaceID / TouchID</p>
                </div>
                <Badge className={cn(
                  "px-3 py-1 border-none rounded-full text-[10px] font-bold shadow-sm",
                  isBiometryEnabled ? "bg-emerald-100 text-emerald-700" : "bg-white/50 text-muted-foreground"
                )}>
                  {isBiometryEnabled ? "Configurado" : "Inativo"}
                </Badge>
              </div>
              <Button 
                variant={isBiometryEnabled ? "secondary" : "outline"} 
                className="w-full h-12 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all"
                onClick={handleToggleBiometry}
              >
                <Fingerprint className="w-4 h-4" />
                {isBiometryEnabled ? "Remover Biometria" : "Configurar Biometria"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Error Dialog */}
      <Dialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md border-none glass-panel rounded-[32px] p-8">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-red-600 text-xl font-bold">
              <AlertCircle className="w-6 h-6" />
              {errorDialog.title}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground leading-relaxed">{errorDialog.message}</p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" className="rounded-full px-8" onClick={() => setErrorDialog((prev) => ({ ...prev, open: false }))}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
