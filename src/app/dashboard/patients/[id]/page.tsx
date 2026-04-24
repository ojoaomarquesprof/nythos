"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  MapPin,
  Shield,
  FileText,
  Clock,
  Edit,
  Trash2,
  Plus,
  User,
  Heart,
  AlertCircle,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SESSION_STATUS, formatCurrency, formatDate, formatTime } from "@/lib/constants";
import type { Patient, Session, Profile } from "@/types/database";
import { createPdfDocument, addPdfFooter, addTableToPdf } from "@/lib/pdf-generator";

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [errorDialog, setErrorDialog] = useState({ open: false, title: "", message: "" });

  function showError(title: string, message: string) {
    setErrorDialog({ open: true, title, message });
  }

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);

    const idStr = Array.isArray(id) ? id[0] : id;

    const [patientRes, sessionsRes, authRes] = await Promise.all([
      supabase.from("patients").select("*").eq("id", idStr).single(),
      supabase
        .from("sessions")
        .select("*")
        .eq("patient_id", idStr)
        .order("scheduled_at", { ascending: false }),
      supabase.auth.getUser()
    ]);

    if (patientRes.data) setPatient(patientRes.data);
    if (sessionsRes.data) setSessions(sessionsRes.data);
    
    if (authRes.data.user) {
      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", authRes.data.user.id).single();
      if (profileData) setProfile(profileData);
    }
    
    setLoading(false);
  }

  const handleAddNote = async () => {
    if (!newNote.trim() || !patient) return;
    setSavingNote(true);

    const existingNotes = patient.notes_encrypted || "";
    const timestamp = new Date().toLocaleString("pt-BR");
    const updatedNotes = `[${timestamp}]\n${newNote}\n\n---\n\n${existingNotes}`;

    const { error } = await supabase
      .from("patients")
      .update({ notes_encrypted: updatedNotes })
      .eq("id", patient.id);

    if (!error) {
      setPatient({ ...patient, notes_encrypted: updatedNotes });
      setNewNote("");
    }
    setSavingNote(false);
  };

  const handleStatusChange = async (sessionId: string, newStatus: Session["status"]) => {
    const { error } = await supabase
      .from("sessions")
      .update({ status: newStatus })
      .eq("id", sessionId);

    if (!error) {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: newStatus } : s))
      );
    }
  };

  const handleArchive = async () => {
    if (!patient) return;
    if (!confirm("Tem certeza que deseja arquivar este paciente?")) return;
    
    setIsArchiving(true);
    const { error } = await supabase
      .from("patients")
      .update({ status: "archived" })
      .eq("id", patient.id);
      
    if (!error) {
      router.push("/dashboard/patients");
    } else {
      setIsArchiving(false);
      showError("Erro", "Erro ao arquivar paciente: " + error.message);
    }
  };

  const handleExportSessions = async () => {
    if (!patient || !profile) {
      showError("Erro", "Não foi possível carregar os dados necessários para gerar o PDF.");
      return;
    }
    setIsExporting(true);
    
    try {
      const { doc, startY } = await createPdfDocument({
        title: "Relatório de Sessões",
        subtitle: `Paciente: ${patient.full_name}\nGerado em: ${new Date().toLocaleDateString("pt-BR")}`,
        profile
      });

      const tableData = sessions.map(s => [
        new Date(s.scheduled_at).toLocaleDateString("pt-BR"),
        formatTime(s.scheduled_at),
        `${s.duration_minutes} min`,
        s.session_type === "online" ? "Online" : "Presencial",
        SESSION_STATUS[s.status].label
      ]);

      addTableToPdf(doc, {
        startY: startY,
        head: [['Data', 'Hora', 'Duração', 'Tipo', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [139, 92, 246] }, // Primary violet color
      });

      addPdfFooter(doc);
      doc.save(`sessoes_${patient.full_name.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error(error);
      showError("Erro na Exportação", "Ocorreu um erro ao gerar o PDF das sessões.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportNotes = async () => {
    if (!patient || !profile || !patient.notes_encrypted) return;
    setIsExporting(true);
    
    try {
      const { doc, startY } = await createPdfDocument({
        title: "Prontuário do Paciente",
        subtitle: `Paciente: ${patient.full_name}\nData de Nascimento: ${patient.date_of_birth ? formatDate(patient.date_of_birth) : "Não informada"}\nCPF: ${patient.cpf || "Não informado"}`,
        profile
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Evolução Clínica e Observações", 14, startY);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      
      const splitText = doc.splitTextToSize(patient.notes_encrypted, 180);
      doc.text(splitText, 14, startY + 8);

      addPdfFooter(doc);
      doc.save(`prontuario_${patient.full_name.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      showError("Erro na Exportação", "Ocorreu um erro ao gerar o PDF do prontuário.");
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-5 md:px-6 md:py-6 max-w-5xl mx-auto w-full">
        <div className="animate-pulse space-y-6">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-32 bg-muted rounded-xl" />
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="px-4 py-5 md:px-6 md:py-6 max-w-5xl mx-auto w-full text-center py-20">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold">Paciente não encontrado</h2>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  const initials = patient.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const completedSessions = sessions.filter((s) => s.status === "completed").length;
  const scheduledSessions = sessions.filter((s) => s.status === "scheduled").length;

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-5xl mx-auto w-full space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/patients")}
          className="text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Pacientes
        </Button>
      </div>

      {/* Patient Card */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <Avatar className="w-16 h-16 flex-shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{patient.full_name}</h1>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-xs",
                    patient.status === "active"
                      ? "bg-green-100 text-green-700"
                      : patient.status === "inactive"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-500"
                  )}
                >
                  {patient.status === "active"
                    ? "Ativo"
                    : patient.status === "inactive"
                    ? "Inativo"
                    : "Arquivado"}
                </Badge>
              </div>

              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {patient.phone && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="w-3.5 h-3.5" />
                    {patient.phone}
                  </span>
                )}
                {patient.email && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="w-3.5 h-3.5" />
                    {patient.email}
                  </span>
                )}
                {patient.date_of_birth && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(patient.date_of_birth)}
                  </span>
                )}
              </div>

              {/* Quick stats */}
              <div className="flex items-center gap-4 mt-3">
                <div className="text-center px-3 py-1.5 rounded-lg bg-primary/5">
                  <p className="text-lg font-bold text-primary">{completedSessions}</p>
                  <p className="text-[10px] text-muted-foreground">Realizadas</p>
                </div>
                <div className="text-center px-3 py-1.5 rounded-lg bg-blue-50">
                  <p className="text-lg font-bold text-blue-600">{scheduledSessions}</p>
                  <p className="text-[10px] text-muted-foreground">Agendadas</p>
                </div>
                <div className="text-center px-3 py-1.5 rounded-lg bg-emerald-50">
                  <p className="text-lg font-bold text-emerald-600">
                    {formatCurrency(patient.session_price || 150)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Sessão</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="sessions" className="w-full">
        <TabsList className="w-full justify-start bg-muted/50 p-1 h-auto">
          <TabsTrigger value="sessions" className="text-xs data-[state=active]:shadow-sm">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Sessões ({sessions.length})
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-xs data-[state=active]:shadow-sm">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Prontuário
          </TabsTrigger>
          <TabsTrigger value="info" className="text-xs data-[state=active]:shadow-sm">
            <User className="w-3.5 h-3.5 mr-1.5" />
            Dados
          </TabsTrigger>
        </TabsList>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="mt-4 space-y-3">
          <div className="flex justify-end mb-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportSessions}
              disabled={isExporting || sessions.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar Sessões (PDF)
            </Button>
          </div>
          
          {sessions.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma sessão registrada.
                </p>
              </CardContent>
            </Card>
          ) : (
            sessions.map((session) => {
              const statusCfg = SESSION_STATUS[session.status];
              return (
                <Card key={session.id} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">
                            {formatDate(session.scheduled_at, {
                              weekday: "short",
                              day: "2-digit",
                              month: "short",
                            })}
                          </p>
                          <span className="text-sm text-muted-foreground">
                            {formatTime(session.scheduled_at)}
                          </span>
                          <Badge className={cn("text-[10px] h-5", statusCfg.color)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full mr-1", statusCfg.dot)} />
                            {statusCfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {session.duration_minutes} min · {session.session_type}
                          {session.session_price && ` · ${formatCurrency(session.session_price)}`}
                        </p>
                      </div>

                      {session.status === "scheduled" && (
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50"
                            onClick={() => handleStatusChange(session.id, "completed")}
                          >
                            ✓ Realizada
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => handleStatusChange(session.id, "missed")}
                          >
                            ✗ Faltou
                          </Button>
                        </div>
                      )}
                    </div>

                    {session.session_notes_encrypted && (
                      <div className="mt-3 p-3 rounded-lg bg-muted/30 text-sm">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Nota de Evolução:
                        </p>
                        {session.session_notes_encrypted}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Notes Tab (Prontuário) */}
        <TabsContent value="notes" className="mt-4 space-y-4">
          <div className="flex justify-end mb-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportNotes}
              disabled={isExporting || !patient.notes_encrypted}
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar Prontuário (PDF)
            </Button>
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Nova Nota de Evolução
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Registre a evolução do paciente, observações clínicas, intervenções realizadas..."
                className="min-h-[120px] resize-none"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  🔒 Dados protegidos com criptografia
                </p>
                <Button
                  size="sm"
                  className="gradient-primary text-white"
                  disabled={!newNote.trim() || savingNote}
                  onClick={handleAddNote}
                >
                  {savingNote ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Adicionar Nota
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {patient.notes_encrypted ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                  {patient.notes_encrypted}
                </pre>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-10 text-center">
                <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma nota registrada ainda.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Info Tab */}
        <TabsContent value="info" className="mt-4 space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informações Pessoais</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "CPF", value: patient.cpf },
                  { label: "Data de Nascimento", value: patient.date_of_birth ? formatDate(patient.date_of_birth) : null },
                  { label: "Gênero", value: patient.gender === "female" ? "Feminino" : patient.gender === "male" ? "Masculino" : patient.gender === "other" ? "Outro" : "Não informado" },
                  { label: "Endereço", value: patient.address },
                  { label: "Contato de Emergência", value: patient.emergency_contact_name },
                  { label: "Tel. Emergência", value: patient.emergency_contact_phone },
                  { label: "Convênio", value: patient.insurance_provider },
                  { label: "Nº Convênio", value: patient.insurance_number },
                ].map((field) => (
                  <div key={field.label}>
                    <p className="text-xs text-muted-foreground">{field.label}</p>
                    <p className="text-sm font-medium mt-0.5">
                      {field.value || "—"}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => alert("A edição de paciente será implementada em breve.")}>
              <Edit className="w-4 h-4 mr-2" />
              Editar Dados
            </Button>
            <Button 
              variant="outline" 
              className="text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={handleArchive}
              disabled={isArchiving || patient.status === "archived"}
            >
              {isArchiving ? (
                <div className="w-4 h-4 border-2 border-destructive/30 border-t-destructive rounded-full animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              {patient.status === "archived" ? "Paciente Arquivado" : "Arquivar"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Error Dialog */}
      <Dialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              {errorDialog.title}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">{errorDialog.message}</p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setErrorDialog(prev => ({ ...prev, open: false }))}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
