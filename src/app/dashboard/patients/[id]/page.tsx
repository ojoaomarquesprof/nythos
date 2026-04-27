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
  Users,
  Activity,
  ClipboardList,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SESSION_STATUS, formatCurrency, formatDate, formatTime, SPECIALTIES } from "@/lib/constants";
import type { Patient, Session, Profile } from "@/types/database";
import { createPdfDocument, addPdfFooter, addTableToPdf } from "@/lib/pdf-generator";
import { CareNetworkCard } from "@/components/dashboard/patients/care-network-card";
import { ProtocolTrackerCard } from "@/components/dashboard/patients/protocol-tracker-card";
import { AbcRecordCard } from "@/components/dashboard/patients/abc-record-card";
import { AnamnesisRequestCard } from "@/components/dashboard/patients/anamnesis-request-card";
import { useSubscription } from "@/hooks/use-subscription";

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const { isSecretary } = useSubscription();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [guardian, setGuardian] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>(null);
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

    const [patientRes, sessionsRes, authRes, guardianRes] = await Promise.all([
      supabase.from("patients").select("*").eq("id", idStr).single(),
      supabase
        .from("sessions")
        .select("*")
        .eq("patient_id", idStr)
        .order("scheduled_at", { ascending: false }),
      supabase.auth.getUser(),
      supabase.from("patient_guardians").select("*").eq("patient_id", idStr).maybeSingle()
    ]);

    if (patientRes.data) {
      setPatient(patientRes.data);
      // Inicializar form de edição
      setEditForm({
        ...patientRes.data,
        has_guardian: !!guardianRes.data,
        guardian_name: guardianRes.data?.full_name || "",
        guardian_email: guardianRes.data?.email || "",
        guardian_phone: guardianRes.data?.phone || "",
        guardian_cpf: guardianRes.data?.cpf || "",
        guardian_relationship: guardianRes.data?.relationship || "mother",
        guardian_is_financial: guardianRes.data?.is_financial_responsible ?? true,
      });
    }
    if (sessionsRes.data) setSessions(sessionsRes.data);
    if (guardianRes.data) setGuardian(guardianRes.data);
    
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

  const handleUpdatePatient = async () => {
    if (!patient || !editForm) return;
    setIsSaving(true);

    try {
      // 1. Atualizar Paciente
      const { error: pError } = await supabase
        .from("patients")
        .update({
          full_name: editForm.full_name,
          email: editForm.email || null,
          phone: editForm.phone || null,
          cpf: editForm.cpf || null,
          date_of_birth: editForm.date_of_birth || null,
          gender: editForm.gender,
          address: editForm.address || null,
          emergency_contact_name: editForm.emergency_contact_name || null,
          emergency_contact_phone: editForm.emergency_contact_phone || null,
          session_price: editForm.session_price ? parseFloat(editForm.session_price) : null,
          insurance_provider: editForm.insurance_provider || null,
          insurance_number: editForm.insurance_number || null,
        })
        .eq("id", patient.id);

      if (pError) throw pError;

      // 2. Atualizar ou Criar Responsável
      if (editForm.has_guardian) {
        const guardianData = {
          full_name: editForm.guardian_name,
          email: editForm.guardian_email || null,
          phone: editForm.guardian_phone || null,
          cpf: editForm.guardian_cpf || null,
          relationship: editForm.guardian_relationship,
          is_financial_responsible: editForm.guardian_is_financial,
        };

        if (guardian) {
          // Update existente
          const { error: gError } = await supabase
            .from("patient_guardians")
            .update(guardianData)
            .eq("id", guardian.id);
          if (gError) throw gError;
        } else {
          // Criar novo
          const { error: gError } = await supabase
            .from("patient_guardians")
            .insert({ ...guardianData, patient_id: patient.id });
          if (gError) throw gError;
        }
      } else if (guardian) {
        // Se tinha e agora desmarcou, talvez queira deletar ou apenas ignorar? 
        // Por segurança, vamos apenas ignorar ou arquivar. 
        // Mas para manter simples, se desmarcou o checkbox não atualizamos o responsável.
      }

      await loadData();
      setIsEditing(false);
    } catch (err: any) {
      showError("Erro ao salvar", err.message || "Erro inesperado.");
    } finally {
      setIsSaving(false);
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
        subtitle: [
          `Paciente: ${patient.full_name}`,
          patient.cpf ? `CPF: ${patient.cpf}` : null,
          patient.date_of_birth ? `Data de Nasc.: ${formatDate(patient.date_of_birth)}` : null,
          `Data do Relatório: ${new Date().toLocaleDateString("pt-BR")}`
        ].filter(Boolean).join(" | "),
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
      doc.save(`notas_evolucao_${patient.full_name.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      showError("Erro na Exportação", "Ocorreu um erro ao gerar o PDF do prontuário.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportFullRecord = async () => {
    if (!patient || !profile) return;
    setIsExporting(true);
    
    try {
      // 1. Fetch all data in parallel
      const [networkRes, protocolsRes, behaviorRes, anamnesisRes] = await Promise.all([
        supabase.from("care_network").select("*").eq("patient_id", patient.id).order("created_at", { ascending: false }),
        supabase.from("patient_evaluations").select("*").eq("patient_id", patient.id).order("evaluation_date", { ascending: false }),
        supabase.from("abc_records").select("*").eq("patient_id", patient.id).order("occurrence_date", { ascending: false }),
        supabase.from("anamnesis_responses").select("*, anamnesis_templates(*)").eq("patient_id", patient.id).eq("status", "completed").order("created_at", { ascending: false })
      ]);

      const anamneses = (anamnesisRes.data as any[]) || [];

      const { doc, startY } = await createPdfDocument({
        title: "Prontuário Clínico Integrado",
        subtitle: [
          `Paciente: ${patient.full_name}`,
          patient.cpf ? `CPF: ${patient.cpf}` : null,
          patient.date_of_birth ? `Data de Nasc.: ${formatDate(patient.date_of_birth)}` : null,
          `Data do Relatório: ${new Date().toLocaleDateString("pt-BR")}`
        ].filter(Boolean).join(" | "),
        profile
      });

      let currentY = startY;

      // Section 1: Care Network
      if (networkRes.data && networkRes.data.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("1. Rede de Apoio Multidisciplinar", 14, currentY);
        currentY += 8;

        addTableToPdf(doc, {
          startY: currentY,
          head: [["Profissional", "Especialidade", "Contato"]],
          body: networkRes.data.map((p: any) => {
            const specLabel = SPECIALTIES.find(s => s.value === p.specialty)?.label || p.specialty;
            return [p.name, specLabel, p.phone || "—"];
          }),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [79, 70, 229] },
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // Section 2: Protocol Tracker
      if (protocolsRes.data && protocolsRes.data.length > 0) {
        if (currentY > 250) { doc.addPage(); currentY = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("2. Protocolos e Avaliações", 14, currentY);
        currentY += 8;

        addTableToPdf(doc, {
          startY: currentY,
          head: [["Protocolo", "Data", "Score", "Status"]],
          body: protocolsRes.data.map((e: any) => [
            e.protocol_name,
            formatDate(e.evaluation_date),
            e.score || "—",
            e.status === "completed" ? "Concluído" : "Em andamento"
          ]),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [99, 102, 241] },
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // Section 3: ABC Behavior Log
      if (behaviorRes.data && behaviorRes.data.length > 0) {
        if (currentY > 250) { doc.addPage(); currentY = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("3. Registro Comportamental (ABC)", 14, currentY);
        currentY += 8;

        addTableToPdf(doc, {
          startY: currentY,
          head: [["Data", "Comportamento", "Antecedente (A)", "Consequência (C)", "Int."]],
          body: behaviorRes.data.map((r: any) => [
            formatDate(r.occurrence_date),
            r.behavior,
            r.antecedent,
            r.consequence,
            r.intensity.toString()
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [225, 29, 72] },
          columnStyles: { 1: { cellWidth: 40 }, 2: { cellWidth: 40 }, 3: { cellWidth: 40 } }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // Section 4: Anamneses
      if (anamneses && anamneses.length > 0) {
        if (currentY > 250) { doc.addPage(); currentY = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("4. Anamneses e Avaliações", 14, currentY);
        currentY += 10;

        for (const anam of anamneses) {
          if (currentY > 240) { doc.addPage(); currentY = 20; }
          
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text(anam.anamnesis_templates.title, 14, currentY);
          doc.setFontSize(8);
          doc.setFont("helvetica", "italic");
          doc.text(`Respondido em: ${formatDate(anam.created_at)}`, 14, currentY + 5);
          currentY += 12;

          const fields = anam.anamnesis_templates.fields as any[];
          const body = fields.map((f: any, idx: number) => [
            `${idx + 1}. ${f.label}`,
            anam.responses[f.id] || "—"
          ]);

          addTableToPdf(doc, {
            startY: currentY,
            head: [["Pergunta", "Resposta"]],
            body: body,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [79, 70, 229] },
            columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 100 } }
          });
          currentY = (doc as any).lastAutoTable.finalY + 15;
        }
      }

      // Section 5: Sessions
      if (sessions && sessions.length > 0) {
        if (currentY > 250) { doc.addPage(); currentY = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("5. Histórico de Sessões", 14, currentY);
        currentY += 8;

        addTableToPdf(doc, {
          startY: currentY,
          head: [["Data", "Tipo", "Status", "Notas de Evolução"]],
          body: sessions.map((s: any) => [
            formatDate(s.scheduled_at),
            s.session_type,
            SESSION_STATUS[s.status as keyof typeof SESSION_STATUS].label,
            s.session_notes_encrypted || "—"
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [139, 92, 246] },
          columnStyles: { 3: { cellWidth: 90 } }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // Section 5: Evolution Notes (encrypted)
      if (patient.notes_encrypted) {
        if (currentY > 240) { doc.addPage(); currentY = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("6. Evolução Clínica Geral", 14, currentY);
        currentY += 8;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        const splitText = doc.splitTextToSize(patient.notes_encrypted, 180);
        doc.text(splitText, 14, currentY);
      }

      addPdfFooter(doc);
      doc.save(`prontuario_completo_${patient.full_name.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      console.error(e);
      showError("Erro na Exportação", "Ocorreu um erro ao gerar o relatório completo.");
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

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditForm((prev: any) => ({ ...prev, [name]: value }));
  };

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

            {!isSecretary && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 border-primary/30 text-primary hover:bg-primary/5 shadow-sm"
                  onClick={handleExportFullRecord}
                  disabled={isExporting}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Prontuário Completo
                </Button>
              </div>
            )}
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
          {!isSecretary && (
            <TabsTrigger value="notes" className="text-xs data-[state=active]:shadow-sm">
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Prontuário
            </TabsTrigger>
          )}
          <TabsTrigger value="info" className="text-xs data-[state=active]:shadow-sm">
            <User className="w-3.5 h-3.5 mr-1.5" />
            Dados
          </TabsTrigger>
          {!isSecretary && (
            <>
              <TabsTrigger value="network" className="text-xs data-[state=active]:shadow-sm">
                <Users className="w-3.5 h-3.5 mr-1.5" />
                Equipe & Protocolos
              </TabsTrigger>
              <TabsTrigger value="behavior" className="text-xs data-[state=active]:shadow-sm">
                <Activity className="w-3.5 h-3.5 mr-1.5" />
                Comportamento
              </TabsTrigger>
              <TabsTrigger value="anamnesis" className="text-xs data-[state=active]:shadow-sm">
                <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                Anamneses
              </TabsTrigger>
            </>
          )}
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
            sessions.map((session: Session) => {
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

                    {session.session_notes_encrypted && !isSecretary && (
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
          <div className="flex justify-end gap-2 mb-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="border-primary/30 text-primary hover:bg-primary/5"
              onClick={handleExportFullRecord}
              disabled={isExporting}
            >
              <FileText className="w-4 h-4 mr-2" />
              Relatório Completo (Tudo)
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportNotes}
              disabled={isExporting || !patient.notes_encrypted}
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar Notas (Apenas)
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

        {/* Care Network & Protocols Tab */}
        <TabsContent value="network" className="mt-4 animate-fade-in space-y-6">
          <CareNetworkCard 
            patientId={id as string} 
            patient={patient}
            profile={profile}
          />
          <ProtocolTrackerCard 
            patientId={id as string} 
            patient={patient}
            profile={profile}
          />
        </TabsContent>

        {/* Behavior Tab */}
        <TabsContent value="behavior" className="mt-4 animate-fade-in">
          <AbcRecordCard 
            patientId={id as string} 
            patient={patient}
            profile={profile}
          />
        </TabsContent>

        {/* Anamneses Tab */}
        <TabsContent value="anamnesis" className="mt-4 animate-fade-in">
          <AnamnesisRequestCard patientId={id as string} />
        </TabsContent>

        {/* Info Tab */}
        <TabsContent value="info" className="mt-4 space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Informações Pessoais</CardTitle>
              {isEditing && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); loadData(); }}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="gradient-primary text-white" onClick={handleUpdatePatient} disabled={isSaving}>
                    {isSaving ? "Salvando..." : "Salvar Alterações"}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Nome Completo</Label>
                    <Input name="full_name" value={editForm.full_name} onChange={handleEditChange} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>E-mail</Label>
                    <Input name="email" value={editForm.email || ""} onChange={handleEditChange} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefone</Label>
                    <Input name="phone" value={editForm.phone || ""} onChange={handleEditChange} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CPF</Label>
                    <Input name="cpf" value={editForm.cpf || ""} onChange={handleEditChange} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data de Nascimento</Label>
                    <Input name="date_of_birth" type="date" value={editForm.date_of_birth || ""} onChange={handleEditChange} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Gênero</Label>
                    <select
                      name="gender"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={editForm.gender}
                      onChange={handleEditChange}
                    >
                      <option value="prefer_not_to_say">Não informado</option>
                      <option value="female">Feminino</option>
                      <option value="male">Masculino</option>
                      <option value="other">Outro</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Endereço</Label>
                    <Input name="address" value={editForm.address || ""} onChange={handleEditChange} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contato de Emergência</Label>
                    <Input name="emergency_contact_name" value={editForm.emergency_contact_name || ""} onChange={handleEditChange} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tel. Emergência</Label>
                    <Input name="emergency_contact_phone" value={editForm.emergency_contact_phone || ""} onChange={handleEditChange} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Convênio</Label>
                    <Input name="insurance_provider" value={editForm.insurance_provider || ""} onChange={handleEditChange} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nº Convênio</Label>
                    <Input name="insurance_number" value={editForm.insurance_number || ""} onChange={handleEditChange} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor da Sessão (R$)</Label>
                    <Input name="session_price" type="number" value={editForm.session_price || ""} onChange={handleEditChange} />
                  </div>

                  <Separator className="md:col-span-2 my-2" />
                  
                  <div className="md:col-span-2 flex items-center space-x-2">
                    <Checkbox 
                      id="edit_has_guardian" 
                      checked={editForm.has_guardian}
                      onCheckedChange={(checked) => setEditForm((prev: any) => ({ ...prev, has_guardian: !!checked }))}
                    />
                    <Label htmlFor="edit_has_guardian" className="font-semibold text-primary">Possui Responsável (Paciente Infantil)</Label>
                  </div>

                  {editForm.has_guardian && (
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-primary/5 p-4 rounded-lg border border-primary/10">
                      <div className="space-y-1.5 md:col-span-2">
                        <Label>Nome do Responsável</Label>
                        <Input name="guardian_name" value={editForm.guardian_name} onChange={handleEditChange} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>E-mail</Label>
                        <Input name="guardian_email" value={editForm.guardian_email} onChange={handleEditChange} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Telefone</Label>
                        <Input name="guardian_phone" value={editForm.guardian_phone} onChange={handleEditChange} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>CPF do Responsável</Label>
                        <Input name="guardian_cpf" value={editForm.guardian_cpf} onChange={handleEditChange} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Parentesco</Label>
                        <select
                          name="guardian_relationship"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={editForm.guardian_relationship}
                          onChange={handleEditChange}
                        >
                          <option value="mother">Mãe</option>
                          <option value="father">Pai</option>
                          <option value="grandparent">Avô/Avó</option>
                          <option value="other">Outro</option>
                        </select>
                      </div>
                      <div className="md:col-span-2 flex items-center space-x-2">
                        <Checkbox 
                          id="edit_guardian_is_financial" 
                          checked={editForm.guardian_is_financial}
                          onCheckedChange={(checked) => setEditForm((prev: any) => ({ ...prev, guardian_is_financial: !!checked }))}
                        />
                        <Label htmlFor="edit_guardian_is_financial">Responsável financeiro</Label>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
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
                    { label: "Valor da Sessão", value: patient.session_price ? formatCurrency(patient.session_price) : null },
                  ].map((field) => (
                    <div key={field.label}>
                      <p className="text-xs text-muted-foreground">{field.label}</p>
                      <p className="text-sm font-medium mt-0.5">
                        {field.value || "—"}
                      </p>
                    </div>
                  ))}
                  
                  {guardian && (
                    <div className="md:col-span-2 mt-4 p-4 rounded-xl bg-primary/5 border border-primary/10">
                      <p className="text-xs font-bold text-primary uppercase tracking-wider mb-3">Responsável Cadastrado</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Nome</p>
                          <p className="text-sm font-medium">{guardian.full_name}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Parentesco</p>
                          <p className="text-sm font-medium">
                            {guardian.relationship === 'mother' ? 'Mãe' : 
                             guardian.relationship === 'father' ? 'Pai' : 
                             guardian.relationship === 'grandparent' ? 'Avô/Avó' : 'Outro'}
                          </p>
                        </div>
                        {guardian.phone && (
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase">Telefone</p>
                            <p className="text-sm font-medium">{guardian.phone}</p>
                          </div>
                        )}
                        {guardian.is_financial_responsible && (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 w-fit">
                            Responsável Financeiro
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {!isEditing && (
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIsEditing(true)}>
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
          )}
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
