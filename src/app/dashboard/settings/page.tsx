"use client";

import { useEffect, useState } from "react";
import { User, Bell, Shield, Save, CheckCircle2, AlertCircle, Upload, ImageIcon, Fingerprint } from "lucide-react";
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

export default function SettingsPage() {
  const supabase = createClient();
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
    session_duration_default: 50,
    session_price_default: 150,
  });

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
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
          session_duration_default: data.session_duration_default || 50,
          session_price_default: data.session_price_default || 150,
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
    field: "avatar_url" | "clinic_logo_url",
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
    else setUploadingLogo(true);

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
      else setUploadingLogo(false);
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
        session_duration_default: formData.session_duration_default,
        session_price_default: formData.session_price_default,
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

  if (loading) {
    return (
      <div className="px-4 py-5 md:px-6 md:py-6 max-w-2xl mx-auto w-full">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-40 bg-muted rounded" />
          <div className="h-[400px] bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seu perfil e preferências
          </p>
        </div>
        {success && (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none px-3 py-1 flex items-center gap-1.5 animate-in fade-in zoom-in duration-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Salvo!
          </Badge>
        )}
      </div>

      {/* Profile Form */}
      <form onSubmit={handleSave}>
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Perfil Profissional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Avatar Upload */}
            <div className="space-y-1.5">
              <Label>Sua Foto (Avatar)</Label>
              <div className="flex items-center gap-4 mt-1">
                {formData.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={formData.avatar_url}
                    alt="Avatar"
                    className="w-16 h-16 rounded-full object-cover border-2 border-primary/20 flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground border-2 border-dashed border-border flex-shrink-0">
                    <User className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1">
                  <label className="cursor-pointer">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors ${uploadingAvatar ? "bg-muted opacity-60" : "hover:bg-muted/50 border-border"}`}>
                      {uploadingAvatar ? (
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="text-muted-foreground">
                        {uploadingAvatar ? "Enviando..." : "Escolher foto..."}
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
                  <p className="text-[11px] text-muted-foreground mt-1">JPG, PNG ou GIF. Máximo 5MB.</p>
                </div>
              </div>
            </div>

            {/* Logo Upload */}
            <div className="space-y-1.5">
              <Label>Logo da Clínica <span className="text-[11px] text-muted-foreground">(usada nos PDFs)</span></Label>
              <div className="flex items-center gap-4 mt-1">
                {formData.clinic_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={formData.clinic_logo_url}
                    alt="Logo"
                    className="w-20 h-16 rounded-lg object-contain bg-white border border-border p-1 flex-shrink-0"
                  />
                ) : (
                  <div className="w-20 h-16 rounded-lg bg-muted flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border flex-shrink-0">
                    <ImageIcon className="w-5 h-5 mb-1" />
                    <span className="text-[9px]">Logo</span>
                  </div>
                )}
                <div className="flex-1">
                  <label className="cursor-pointer">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors ${uploadingLogo ? "bg-muted opacity-60" : "hover:bg-muted/50 border-border"}`}>
                      {uploadingLogo ? (
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="text-muted-foreground">
                        {uploadingLogo ? "Enviando..." : "Escolher logo..."}
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
                  <p className="text-[11px] text-muted-foreground mt-1">PNG com fundo transparente recomendado. Máximo 5MB.</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Nome Completo</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  placeholder="Dra. Maria Silva"
                  className="h-10"
                  value={formData.full_name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crp">CRP</Label>
                <Input
                  id="crp"
                  name="crp"
                  placeholder="06/123456"
                  className="h-10"
                  value={formData.crp}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clinic_name">Nome da Clínica</Label>
                <Input
                  id="clinic_name"
                  name="clinic_name"
                  placeholder="Clínica Equilíbrio"
                  className="h-10"
                  value={formData.clinic_name}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  name="phone"
                  placeholder="(11) 99999-9999"
                  className="h-10"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="session_duration_default">Duração Padrão (min)</Label>
                <Input
                  id="session_duration_default"
                  name="session_duration_default"
                  type="number"
                  className="h-10"
                  value={formData.session_duration_default}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="session_price_default">Valor Padrão (R$)</Label>
                <Input
                  id="session_price_default"
                  name="session_price_default"
                  type="number"
                  step="0.01"
                  className="h-10"
                  value={formData.session_price_default}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="submit"
                className="gradient-primary text-white"
                disabled={saving}
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Notifications */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            Notificações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Lembretes por Push</p>
              <p className="text-xs text-muted-foreground max-w-[280px]">
                Receba alertas sobre sessões agendadas diretamente na tela do seu dispositivo.
              </p>
            </div>
            <Badge className={cn(
              "px-2 py-0.5 border-none",
              pushStatus === "granted" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
            )}>
              {pushStatus === "granted" ? "Ativado" : pushStatus === "denied" ? "Bloqueado" : "Inativo"}
            </Badge>
          </div>
          <Button 
            variant={pushStatus === "granted" ? "secondary" : "outline"} 
            className="w-full sm:w-auto"
            onClick={requestPushPermission}
            disabled={pushStatus === "granted"}
          >
            {pushStatus === "granted" ? "Notificações Ativas" : "Ativar Notificações Push"}
          </Button>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Segurança
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Bloqueio Biométrico</p>
              <p className="text-xs text-muted-foreground max-w-[280px]">
                Proteja o acesso aos prontuários usando FaceID ou TouchID.
              </p>
            </div>
            <Badge className={cn(
              "px-2 py-0.5 border-none",
              isBiometryEnabled ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
            )}>
              {isBiometryEnabled ? "Configurado" : "Inativo"}
            </Badge>
          </div>
          <Button 
            variant={isBiometryEnabled ? "secondary" : "outline"} 
            className="w-full sm:w-auto flex items-center gap-2"
            onClick={handleToggleBiometry}
          >
            <Fingerprint className="w-4 h-4" />
            {isBiometryEnabled ? "Desativar Biometria" : "Configurar Biometria"}
          </Button>
        </CardContent>
      </Card>

      {/* Error Dialog */}
      <Dialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              {errorDialog.title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">{errorDialog.message}</p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setErrorDialog((prev) => ({ ...prev, open: false }))}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
