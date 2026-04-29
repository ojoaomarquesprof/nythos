"use client";

import React, { useEffect, useState, useMemo } from "react";
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
  Wallet,
  Bell,
  Archive,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Check,
  History,
  Smile,
  Frown,
  Zap,
  Waves,
  HeartPulse,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogClose,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SESSION_STATUS, formatCurrency, formatDate, formatTime, SPECIALTIES } from "@/lib/constants";
import type { Patient, Session, Profile, CashFlow, PatientTask } from "@/types/database";
import { createPdfDocument, addPdfFooter, addTableToPdf } from "@/lib/pdf-generator";
import { CareNetworkCard } from "@/components/dashboard/patients/care-network-card";
import { ProtocolTrackerCard } from "@/components/dashboard/patients/protocol-tracker-card";
import { AbcRecordCard } from "@/components/dashboard/patients/abc-record-card";
import { AnamnesisRequestCard } from "@/components/dashboard/patients/anamnesis-request-card";
import { useSubscription } from "@/hooks/use-subscription";

const getWeekStart = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient() as any;
  const { isSecretary } = useSubscription();

  const [patient, setPatient] = useState<Patient | null>(null);
  const TABS = [
    { value: "info", label: "Perfil do Paciente", shortLabel: "Perfil", icon: User },
    { value: "sessions", label: "Sessões Agendadas", shortLabel: "Sessões", icon: Clock },
    { value: "finance", label: "Financeiro do Paciente", shortLabel: "Finanças", icon: Wallet },
    { value: "notes", label: "Prontuário Geral", shortLabel: "Prontuário", icon: FileText },
    { value: "behavior", label: "Comportamento (ABC)", shortLabel: "ABC", icon: Activity },
    { value: "team", label: "Equipe Multidisciplinar", shortLabel: "Equipe", icon: Users },
    { value: "protocols", label: "Protocolos e Rastreadores", shortLabel: "Protocolos", icon: ClipboardList },
    { value: "anamnesis", label: "Anamnese e Formulários", shortLabel: "Anamnese", icon: Shield },
    { value: "archive", label: "Arquivo de Sessões", shortLabel: "Arquivo", icon: Archive },
    { value: "alerts", label: "Lembretes e Alertas", shortLabel: "Alertas", icon: Bell },
  ];
  const [sessions, setSessions] = useState<Session[]>([]);
  const [patientCashFlow, setPatientCashFlow] = useState<CashFlow[]>([]);
  const [patientTasks, setPatientTasks] = useState<PatientTask[]>([]);
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
  const [viewingSession, setViewingSession] = useState<Session | null>(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [sessionEditForm, setSessionEditForm] = useState({
    notes: "",
    mood_happy_sad: 5,
    mood_anxious_calm: 5,
  });

  const [rescheduleSession, setRescheduleSession] = useState<Session | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleWeekOffset, setRescheduleWeekOffset] = useState(0);
  const [therapistSessions, setTherapistSessions] = useState<Session[]>([]);
  const [showCancelSeriesModal, setShowCancelSeriesModal] = useState(false);
  const [cancellingSession, setCancellingSession] = useState<Session | null>(null);

  function showError(title: string, message: string) {
    setErrorDialog({ open: true, title, message });
  }

  useEffect(() => {
    loadData();
  }, [id]);

  const rescheduleWeekDays = useMemo(() => {
    const start = getWeekStart(new Date());
    start.setDate(start.getDate() + (rescheduleWeekOffset * 7));
    return Array.from({ length: 6 }, (_, i) => { // Seg-Sáb
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [rescheduleWeekOffset]);

  useEffect(() => {
    async function fetchAgendaForReschedule() {
      if (!profile || !showRescheduleModal) return;
      
      const startRange = rescheduleWeekDays[0];
      const endRange = new Date(rescheduleWeekDays[5]);
      endRange.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("sessions")
        .select("id, scheduled_at, duration_minutes, patient:patients(full_name)")
        .eq("user_id", profile.id)
        .gte("scheduled_at", startRange.toISOString())
        .lte("scheduled_at", endRange.toISOString())
        .not("status", "eq", "cancelled");

      if (!error && data) {
        setTherapistSessions(data);
      }
    }
    fetchAgendaForReschedule();
  }, [rescheduleWeekOffset, showRescheduleModal, profile, rescheduleWeekDays]);

  async function loadData() {
    setLoading(true);

    const idStr = Array.isArray(id) ? id[0] : id;

    const [patientRes, sessionsRes, authRes, guardianRes, tasksRes] = await Promise.all([
      supabase.from("patients").select("*").eq("id", idStr).single(),
      supabase
        .from("sessions")
        .select("*")
        .eq("patient_id", idStr)
        .order("scheduled_at", { ascending: false }),
      supabase.auth.getUser(),
      supabase.from("patient_guardians").select("*").eq("patient_id", idStr).maybeSingle(),
      supabase
        .from("patient_tasks")
        .select("*")
        .eq("patient_id", idStr)
        .order("created_at", { ascending: false }),
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
    if (tasksRes.data) setPatientTasks(tasksRes.data);
    if (guardianRes.data) setGuardian(guardianRes.data);

    const sessionIds = sessionsRes.data?.map((s: Session) => s.id) || [];
    if (sessionIds.length > 0) {
      const { data: cashFlowData } = await supabase
        .from("cash_flow")
        .select("*")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false });
      setPatientCashFlow(cashFlowData || []);
    } else {
      setPatientCashFlow([]);
    }
    
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

  const handleStartEditingSession = () => {
    if (!viewingSession) return;
    
    let evolution = { notes: "", mood_happy_sad: 5, mood_anxious_calm: 5 };
    try {
      if (viewingSession.session_notes_encrypted) {
        const parsed = JSON.parse(viewingSession.session_notes_encrypted);
        evolution = {
          notes: parsed.notes || viewingSession.session_notes_encrypted || "",
          mood_happy_sad: parsed.mood_happy_sad || 5,
          mood_anxious_calm: parsed.mood_anxious_calm || 5
        };
      }
    } catch (e) {
      evolution.notes = viewingSession.session_notes_encrypted || "";
    }
    
    setSessionEditForm(evolution);
    setIsEditingSession(true);
  };

  const handleSaveSessionEdit = async () => {
    if (!viewingSession || !patient) return;
    setIsSaving(true);

    try {
      const evolutionData = {
        notes: sessionEditForm.notes,
        mood_happy_sad: sessionEditForm.mood_happy_sad,
        mood_anxious_calm: sessionEditForm.mood_anxious_calm,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from("sessions")
        .update({ 
          status: "completed",
          session_notes_encrypted: JSON.stringify(evolutionData)
        })
        .eq("id", viewingSession.id);

      if (error) throw error;

      // Update local state
      setSessions(prev => prev.map(s => 
        s.id === viewingSession.id 
          ? { ...s, status: "completed" as any, session_notes_encrypted: JSON.stringify(evolutionData) } 
          : s
      ));
      
      setViewingSession({ 
        ...viewingSession, 
        status: "completed" as any, 
        session_notes_encrypted: JSON.stringify(evolutionData) 
      });
      
      setIsEditingSession(false);
      
      // Emit event to refresh other components if needed
      window.dispatchEvent(new CustomEvent("notifications:refresh"));
    } catch (err: any) {
      showError("Erro ao salvar", err.message || "Erro inesperado.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelSession = async (allFollowing: boolean) => {
    if (!cancellingSession) return;
    setIsSaving(true);

    try {
      let query = supabase.from("sessions").update({ status: "cancelled" });
      
      if (allFollowing && cancellingSession.recurrence_rule) {
        query = query
          .eq("recurrence_rule", cancellingSession.recurrence_rule)
          .gte("scheduled_at", cancellingSession.scheduled_at);
      } else {
        query = query.eq("id", cancellingSession.id);
      }

      const { error } = await query;
      if (error) throw error;

      setShowCancelSeriesModal(false);
      setCancellingSession(null);
      loadData();
      window.dispatchEvent(new CustomEvent("notifications:refresh"));
    } catch (err: any) {
      showError("Erro ao cancelar", err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleSession || !rescheduleDate || !rescheduleTime || !profile) return;
    setIsSaving(true);

    try {
      const [year, month, day] = rescheduleDate.split('-').map(Number);
      const [hours, minutes] = rescheduleTime.split(':').map(Number);
      const scheduledAt = new Date(year, month - 1, day, hours, minutes);

      if (isNaN(scheduledAt.getTime())) {
        throw new Error("Data ou hora inválida.");
      }

      // Check for conflicts
      const { data: conflicts, error: conflictError } = await supabase
        .from("sessions")
        .select("id, scheduled_at, duration_minutes")
        .eq("user_id", profile.id)
        .neq("id", rescheduleSession.id)
        .gte("scheduled_at", new Date(scheduledAt.getTime() - 4 * 60 * 60 * 1000).toISOString())
        .lte("scheduled_at", new Date(scheduledAt.getTime() + 4 * 60 * 60 * 1000).toISOString())
        .not("status", "eq", "cancelled");

      if (conflictError) throw conflictError;

      const hasConflict = conflicts?.some((s: { scheduled_at: string; duration_minutes: number }) => {
        const start = new Date(s.scheduled_at);
        const end = new Date(start.getTime() + s.duration_minutes * 60000);
        const newStart = scheduledAt;
        const newEnd = new Date(newStart.getTime() + rescheduleSession.duration_minutes * 60000);
        return (newStart < end && newEnd > start);
      });

      if (hasConflict) {
        throw new Error("Este horário já está ocupado por outro paciente.");
      }

      const { error } = await supabase
        .from("sessions")
        .update({ 
          scheduled_at: scheduledAt.toISOString(),
          status: "scheduled" 
        })
        .eq("id", rescheduleSession.id);

      if (error) throw error;

      setShowRescheduleModal(false);
      setRescheduleSession(null);
      loadData();
      window.dispatchEvent(new CustomEvent("notifications:refresh"));
    } catch (err: any) {
      showError("Erro ao reagendar", err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSlotClick = (day: Date, hour: number) => {
    setRescheduleDate(day.toISOString().split('T')[0]);
    setRescheduleTime(`${hour.toString().padStart(2, '0')}:00`);
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
      
      let currentY = startY + 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      // 1. Notas Manuais
      if (patient.notes_encrypted) {
        doc.setFont("helvetica", "bold");
        doc.text("Notas Gerais:", 14, currentY);
        doc.setFont("helvetica", "normal");
        const splitNotes = doc.splitTextToSize(patient.notes_encrypted, 180);
        doc.text(splitNotes, 14, currentY + 5);
        currentY += (splitNotes.length * 5) + 15;
      }

      // 2. Evoluções de Sessão
      const completedSessions = sessions.filter(s => s.status === "completed" && s.session_notes_encrypted);
      if (completedSessions.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.text("Evoluções por Sessão:", 14, currentY);
        currentY += 8;

        completedSessions.forEach(session => {
          if (currentY > 270) { doc.addPage(); currentY = 20; }
          
          let evolution: any = null;
          try {
            evolution = JSON.parse(session.session_notes_encrypted || "{}");
          } catch (e) {
            evolution = { notes: session.session_notes_encrypted };
          }

          const dateStr = `${new Date(session.scheduled_at).toLocaleDateString("pt-BR")} - `;
          const moodStr = evolution.mood_happy_sad ? ` (Humor: ${evolution.mood_happy_sad}/10)` : "";
          
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text(dateStr + moodStr, 14, currentY);
          
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          const splitEv = doc.splitTextToSize(evolution.notes || evolution || "", 170);
          doc.text(splitEv, 20, currentY + 5);
          
          currentY += (splitEv.length * 4) + 12;
        });
      }

      addPdfFooter(doc);
      doc.save(`prontuario_evolucao_${patient.full_name.replace(/\s+/g, '_')}.pdf`);
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
          body: sessions.map((s: any) => {
            let notes = "—";
            if (s.session_notes_encrypted) {
              try {
                const ev = JSON.parse(s.session_notes_encrypted);
                notes = ev.notes || s.session_notes_encrypted;
              } catch {
                notes = s.session_notes_encrypted;
              }
            }
            return [
              formatDate(s.scheduled_at),
              s.session_type,
              SESSION_STATUS[s.status as keyof typeof SESSION_STATUS].label,
              notes
            ];
          }),
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

  const handleExportSingleSession = async (session: Session) => {
    if (!patient || !profile) return;
    setIsExporting(true);
    
    try {
      let evolution: any = null;
      try {
        evolution = JSON.parse(session.session_notes_encrypted || "{}");
      } catch (e) {
        evolution = { notes: session.session_notes_encrypted };
      }

      const { doc, startY } = await createPdfDocument({
        title: "Relatório de Atendimento Individual",
        subtitle: `Paciente: ${patient.full_name} | Data: ${formatDate(session.scheduled_at)}`,
        profile
      });

      let currentY = startY;
      
      // Detalhes em Tabela
      addTableToPdf(doc, {
        startY: currentY,
        head: [['Informação', 'Detalhe']],
        body: [
          ["Data/Hora", `${formatDate(session.scheduled_at)} às ${formatTime(session.scheduled_at)}`],
          ["Duração", `${session.duration_minutes} minutos`],
          ["Modalidade", session.session_type === "online" ? "Online" : "Presencial"],
          ["Humor do Paciente", evolution.mood_happy_sad ? `${evolution.mood_happy_sad}/10` : "Não registrado"],
          ["Nível de Agitação", evolution.mood_anxious_calm ? `${evolution.mood_anxious_calm}/10` : "Não registrado"],
        ],
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 10 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      // Evolução
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(79, 70, 229);
      doc.text("Evolução Clínica", 14, currentY);
      currentY += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      const notesText = evolution.notes || session.session_notes_encrypted || "Nenhuma nota registrada.";
      const splitText = doc.splitTextToSize(notesText, 180);
      doc.text(splitText, 14, currentY);

      addPdfFooter(doc);
      doc.save(`sessao_${patient.full_name.replace(/\s+/g, '_')}_${formatDate(session.scheduled_at).replace(/\//g, '-')}.pdf`);
    } catch (e) {
      console.error(e);
      showError("Erro na Exportação", "Erro ao gerar PDF da sessão individual.");
    } finally {
      setIsExporting(false);
    }
  };

  const [isMobile, setIsMobile] = useState(false);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("vertical");
  const [activeTab, setActiveTab] = useState("info");

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      setOrientation(mobile ? "horizontal" : "vertical");
    };
    
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const activeTabInfo = TABS.find(t => t.value === activeTab) || TABS[0];
  const ActiveIcon = activeTabInfo.icon;

  if (loading) {
    return (
      <div className="px-4 py-5 md:px-6 md:py-6 max-w-7xl mx-auto w-full">
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
      <div className="px-4 py-5 md:px-6 md:py-6 max-w-7xl mx-auto w-full text-center py-20">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold">Paciente não encontrado</h2>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  const scheduledOnlySessions = sessions.filter((s) => s.status === "scheduled");
  const archivedSessions = sessions.filter((s) => s.status !== "scheduled");
  const totalPatientIncome = patientCashFlow
    .filter((f) => f.type === "income")
    .reduce((sum, f) => sum + Number(f.amount), 0);
  const pendingPatientIncome = patientCashFlow
    .filter((f) => f.type === "income" && f.status === "pending")
    .reduce((sum, f) => sum + Number(f.amount), 0);
  const openAlerts = patientTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditForm((prev: any) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-7xl mx-auto w-full space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/patients")}
          className="text-muted-foreground hover:bg-white/40 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Voltar para Pacientes
        </Button>
      </div>

      {/* Painel do Paciente (estilo modal grande com sidebar) */}
      <Tabs value={activeTab} onValueChange={setActiveTab} orientation={orientation} className="w-full">
        <div className={cn(
          "w-full rounded-[24px] lg:rounded-[32px] glass-panel overflow-hidden flex flex-col lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:h-[calc(100vh-9rem)]",
          !isMobile && "min-h-[600px]"
        )}>
          {/* Mobile Tab Selector - Clean and Premium */}
          <div className="lg:hidden flex items-center justify-between p-4 bg-white/40 backdrop-blur-md border-b border-white/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                <ActiveIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-primary/60 uppercase tracking-tighter leading-none mb-1">Seção atual</p>
                <h2 className="text-sm font-bold text-foreground leading-none">{activeTabInfo.label}</h2>
              </div>
            </div>
            
            <Dialog>
              <DialogTrigger render={
                <Button variant="ghost" size="sm" className="rounded-full bg-white/60 border border-white/80 shadow-sm text-primary font-bold text-[11px] h-9 px-4 hover:bg-white transition-all">
                  Mudar Seção
                  <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-60" />
                </Button>
              } />
              <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden rounded-[32px] border-none glass-panel">
                <div className="p-6 bg-gradient-to-br from-primary/10 to-transparent">
                  <h3 className="text-xl font-bold text-primary mb-1">Navegação</h3>
                  <p className="text-xs text-muted-foreground mb-6">Selecione uma seção para visualizar os detalhes.</p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {TABS.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.value;
                      return (
                        <DialogClose
                          key={tab.value}
                          render={
                            <Button
                              variant="ghost"
                              onClick={() => setActiveTab(tab.value)}
                              className={cn(
                                "flex flex-col items-start gap-2 h-auto p-4 rounded-2xl border transition-all text-left",
                                isActive 
                                  ? "bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-[1.02]" 
                                  : "bg-white/40 border-white/60 hover:bg-white/60 text-foreground"
                              )}
                            >
                              <Icon className={cn("w-5 h-5", isActive ? "text-white" : "text-primary")} />
                              <span className="text-[11px] font-bold leading-tight">{tab.label}</span>
                            </Button>
                          }
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="p-4 bg-white/20 border-t border-white/20 flex justify-center">
                  <DialogClose render={<Button variant="ghost" className="w-full rounded-xl font-bold text-muted-foreground">Fechar</Button>} />
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="bg-white/30 p-2 lg:p-5 overflow-x-auto lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-white/20 scrollbar-hide hidden lg:block">
            <div className="hidden lg:flex items-center gap-3 mb-8 p-2 rounded-2xl bg-white/40 border border-white/50 shadow-sm">
              <Avatar className="w-10 h-10 ring-2 ring-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                  {patient.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-primary/60 uppercase tracking-tighter">Paciente em foco</p>
                <p className="text-sm font-bold truncate text-foreground">{patient.full_name}</p>
              </div>
            </div>

            <TabsList className="w-fit lg:w-full h-fit bg-transparent p-1 flex flex-row flex-nowrap lg:flex-col gap-2 pr-10 lg:pr-1">
              <TabsTrigger value="info" className="glass-pill whitespace-nowrap px-4 lg:px-4 py-3 lg:py-2.5">
                <User className="w-4 h-4" />
                <span className="lg:inline">{isMobile ? "Perfil" : "Perfil do Paciente"}</span>
              </TabsTrigger>
              <TabsTrigger value="sessions" className="glass-pill whitespace-nowrap px-4 lg:px-4 py-3 lg:py-2.5">
                <Clock className="w-4 h-4" />
                <span className="lg:inline">{isMobile ? "Sessões" : "Sessões (Agendadas)"}</span>
              </TabsTrigger>
              <TabsTrigger value="finance" className="glass-pill whitespace-nowrap px-4 lg:px-4 py-3 lg:py-2.5">
                <Wallet className="w-4 h-4" />
                <span className="lg:inline">{isMobile ? "Finanças" : "Financeiro"}</span>
              </TabsTrigger>
              <TabsTrigger value="notes" className="glass-pill whitespace-nowrap px-4 lg:px-4 py-3 lg:py-2.5">
                <FileText className="w-4 h-4" />
                <span className="lg:inline">{isMobile ? "Notas" : "Prontuário Geral"}</span>
              </TabsTrigger>
              <TabsTrigger value="behavior" className="glass-pill whitespace-nowrap px-4 lg:px-4 py-3 lg:py-2.5">
                <Activity className="w-4 h-4" />
                <span className="lg:inline">{isMobile ? "ABC" : "Comportamento"}</span>
              </TabsTrigger>
              <TabsTrigger value="team" className="glass-pill whitespace-nowrap px-4 lg:px-4 py-3 lg:py-2.5">
                <Users className="w-4 h-4" />
                <span className="lg:inline">Equipe</span>
              </TabsTrigger>
              <TabsTrigger value="protocols" className="glass-pill whitespace-nowrap px-4 lg:px-4 py-3 lg:py-2.5">
                <ClipboardList className="w-4 h-4" />
                <span className="lg:inline">Protocolos</span>
              </TabsTrigger>
              <TabsTrigger value="anamnesis" className="glass-pill whitespace-nowrap px-4 lg:px-4 py-3 lg:py-2.5">
                <Shield className="w-4 h-4" />
                <span className="lg:inline">Anamnese</span>
              </TabsTrigger>
              <TabsTrigger value="archive" className="glass-pill whitespace-nowrap px-4 lg:px-4 py-3 lg:py-2.5">
                <Archive className="w-4 h-4" />
                <span className="lg:inline">Arquivo</span>
              </TabsTrigger>
              <TabsTrigger value="alerts" className="glass-pill whitespace-nowrap px-4 lg:px-4 py-3 lg:py-2.5">
                <Bell className="w-4 h-4" />
                <span className="lg:inline">Alertas</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-4 lg:p-6 overflow-y-auto min-w-0 w-full flex-1">
        {/* Sessões */}
        <TabsContent value="sessions" className="mt-0 space-y-3 w-full">
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

          {scheduledOnlySessions.length === 0 ? (
            <Card className="border shadow-none">
              <CardContent className="py-12 text-center">
                <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma sessão agendada.</p>
              </CardContent>
            </Card>
          ) : (
            scheduledOnlySessions.map((session: Session) => {
              const statusCfg = SESSION_STATUS[session.status];
              return (
                <Card key={session.id} className="border shadow-none">
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
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-primary border-primary/20 hover:bg-primary/5"
                          onClick={() => {
                            setRescheduleSession(session);
                            const date = new Date(session.scheduled_at);
                            setRescheduleDate(date.toISOString().split('T')[0]);
                            setRescheduleTime(date.toTimeString().slice(0, 5));
                            setShowRescheduleModal(true);
                          }}
                        >
                          <Calendar className="w-3.5 h-3.5 mr-1" />
                          Remarcar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50"
                          onClick={() => {
                            setCancellingSession(session);
                            setShowCancelSeriesModal(true);
                          }}
                        >
                          <X className="w-3.5 h-3.5 mr-1" />
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="info" className="mt-0 space-y-6 animate-fade-in w-full">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/20 p-6 rounded-[32px] border border-white/40 backdrop-blur-md">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-primary">Perfil do Paciente</h2>
                <p className="text-sm text-muted-foreground">Dados cadastrais e informações gerais do paciente.</p>
              </div>
              {!isEditing && (
                <Button 
                  onClick={() => setIsEditing(true)} 
                  className="rounded-full gradient-primary text-white font-bold px-8 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
                >
                  <User className="w-4 h-4 mr-2" />
                  Editar Perfil
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-lg">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Nome Completo:</Label>
                <Input 
                  readOnly={!isEditing} 
                  className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
                  value={isEditing ? (editForm.full_name || "") : (patient.full_name || "—")} 
                  name="full_name"
                  onChange={handleEditChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Data de Nascimento:</Label>
                <Input 
                  type={isEditing ? "date" : "text"}
                  readOnly={!isEditing} 
                  className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
                  value={isEditing ? (editForm.date_of_birth || "") : (patient.date_of_birth ? formatDate(patient.date_of_birth) : "—")} 
                  name="date_of_birth"
                  onChange={handleEditChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">CPF:</Label>
                <Input 
                  readOnly={!isEditing} 
                  className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
                  value={isEditing ? (editForm.cpf || "") : (patient.cpf || "—")} 
                  name="cpf"
                  onChange={handleEditChange}
                />
              </div>
            </div>

            {/* Responsável Legal Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between ml-2">
                <h3 className="text-xl font-bold text-primary flex items-center gap-2">
                  <div className="w-2 h-8 bg-primary/20 rounded-full" />
                  Responsável Legal
                </h3>
                {isEditing && (
                  <div className="flex items-center gap-2 bg-white/40 px-4 py-2 rounded-full border border-white/60 shadow-sm">
                    <Checkbox 
                      id="has_guardian" 
                      checked={editForm.has_guardian} 
                      onCheckedChange={(checked) => setEditForm((prev: any) => ({ ...prev, has_guardian: checked }))}
                    />
                    <Label htmlFor="has_guardian" className="text-xs font-bold text-primary cursor-pointer">Possui responsável legal?</Label>
                  </div>
                )}
              </div>

              {(editForm.has_guardian || (!isEditing && guardian)) ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-md">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Nome do Responsável:</Label>
                    <Input 
                      readOnly={!isEditing} 
                      className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
                      value={isEditing ? (editForm.guardian_name || "") : (guardian?.full_name || "—")} 
                      name="guardian_name"
                      onChange={handleEditChange}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">CPF do Responsável:</Label>
                    <Input 
                      readOnly={!isEditing} 
                      className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
                      value={isEditing ? (editForm.guardian_cpf || "") : (guardian?.cpf || "—")} 
                      name="guardian_cpf"
                      onChange={handleEditChange}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Telefone:</Label>
                    <Input 
                      readOnly={!isEditing} 
                      className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
                      value={isEditing ? (editForm.guardian_phone || "") : (guardian?.phone || "—")} 
                      name="guardian_phone"
                      onChange={handleEditChange}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Email:</Label>
                    <Input 
                      readOnly={!isEditing} 
                      className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
                      value={isEditing ? (editForm.guardian_email || "") : (guardian?.email || "—")} 
                      name="guardian_email"
                      onChange={handleEditChange}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Parentesco:</Label>
                    {isEditing ? (
                      <select
                        name="guardian_relationship"
                        className="flex h-14 w-full rounded-full border border-white/40 bg-white/50 px-6 py-2 text-base font-bold focus:ring-primary/20"
                        value={editForm.guardian_relationship}
                        onChange={handleEditChange}
                      >
                        <option value="mother">Mãe</option>
                        <option value="father">Pai</option>
                        <option value="grandfather">Avô/Avó</option>
                        <option value="uncle">Tio/Tia</option>
                        <option value="guardian">Tutor Legal</option>
                        <option value="other">Outro</option>
                      </select>
                    ) : (
                      <Input readOnly className="glass-input-field h-14 text-base font-bold cursor-default px-6" value={
                        guardian?.relationship === "mother" ? "Mãe" :
                        guardian?.relationship === "father" ? "Pai" :
                        guardian?.relationship === "grandfather" ? "Avô/Avó" :
                        guardian?.relationship === "uncle" ? "Tio/Tia" :
                        guardian?.relationship === "guardian" ? "Tutor Legal" :
                        guardian?.relationship === "other" ? "Outro" : "—"
                      } />
                    )}
                  </div>
                  <div className="flex flex-col justify-end pb-2">
                    <div className={cn(
                      "flex items-center gap-3 px-6 h-14 rounded-full border transition-all",
                      editForm.guardian_is_financial ? "bg-emerald-50 border-emerald-200" : "bg-white/40 border-white/60"
                    )}>
                      <Checkbox 
                        id="guardian_is_financial" 
                        disabled={!isEditing}
                        checked={editForm.guardian_is_financial} 
                        onCheckedChange={(checked) => setEditForm((prev: any) => ({ ...prev, guardian_is_financial: checked }))}
                      />
                      <Label htmlFor="guardian_is_financial" className="text-sm font-bold text-primary cursor-pointer">Responsável Financeiro?</Label>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white/20 p-8 rounded-[32px] border border-white/40 border-dashed text-center">
                  <p className="text-sm text-muted-foreground italic">Este paciente não possui um responsável legal cadastrado.</p>
                </div>
              )}
            </div>

            {/* General Info Section */}
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-primary ml-2 flex items-center gap-2">
                <div className="w-2 h-8 bg-primary rounded-full" />
                Informações Gerais
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-md">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">Início do Tratamento:</p>
                  <Input readOnly className="glass-input-field h-12 text-sm font-bold cursor-default px-5" value={formatDate(patient.created_at)} />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">Gênero:</p>
                  {isEditing ? (
                    <select
                      name="gender"
                      className="flex h-12 w-full rounded-full border border-white/40 bg-white/50 px-5 py-2 text-sm font-bold focus:ring-primary/20"
                      value={editForm.gender}
                      onChange={handleEditChange}
                    >
                      <option value="prefer_not_to_say">Não informado</option>
                      <option value="female">Feminino</option>
                      <option value="male">Masculino</option>
                      <option value="other">Outro</option>
                    </select>
                  ) : (
                    <Input readOnly className="glass-input-field h-12 text-sm font-bold cursor-default px-5" value={patient.gender === "female" ? "Feminino" : patient.gender === "male" ? "Masculino" : patient.gender === "other" ? "Outro" : "Não informado"} />
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">Status:</p>
                  <div className="h-12 flex items-center px-5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 font-bold text-sm">
                    Ativo
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">País de residência:</p>
                  <Input readOnly className="glass-input-field h-12 text-sm font-bold cursor-default px-5" value="Brasil" />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">Endereço:</p>
                  <Input 
                    readOnly={!isEditing} 
                    className={cn("glass-input-field h-12 text-sm font-bold px-5", !isEditing && "cursor-default")} 
                    value={isEditing ? (editForm.address || "") : (patient.address || "—")} 
                    name="address"
                    onChange={handleEditChange}
                  />
                </div>
              </div>
            </div>

            {/* Finance Section */}
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-primary ml-2 flex items-center gap-2">
                <div className="w-2 h-8 bg-emerald-400 rounded-full" />
                Financeiro
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.5fr] gap-6 bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-md items-end">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">Moeda:</p>
                  <Input readOnly className="glass-input-field h-12 text-sm font-bold cursor-default px-5" value="BRL - Real brasileiro" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">Valor da sessão:</p>
                  <Input 
                    readOnly={!isEditing} 
                    className={cn("glass-input-field h-12 text-sm font-black px-5 text-emerald-600", !isEditing && "cursor-default")} 
                    value={isEditing ? (editForm.session_price || "") : (patient.session_price ? formatCurrency(patient.session_price) : "—")} 
                    name="session_price"
                    type={isEditing ? "number" : "text"}
                    onChange={handleEditChange}
                  />
                </div>
                <Button variant="ghost" className="h-12 rounded-full gradient-primary text-white font-black text-xs shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all">
                  <Wallet className="w-4 h-4 mr-2" />
                  ACESSAR DASHBOARD FINANCEIRO
                </Button>

                {((isEditing && editForm.guardian_is_financial && editForm.has_guardian) || (!isEditing && guardian?.is_financial_responsible)) && (
                  <div className="md:col-span-3 mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 animate-fade-in">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">Pagador Responsável</p>
                      <p className="text-sm font-bold text-slate-800">{isEditing ? editForm.guardian_name : guardian?.full_name}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Emergency Contacts */}
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-primary ml-2 flex items-center gap-2">
                <div className="w-2 h-8 bg-red-400 rounded-full" />
                Contatos de Emergência
              </h3>
              <div className="bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-md flex flex-col md:flex-row gap-6 items-center justify-between">
                {patient.emergency_contact_name ? (
                  <div className="flex items-center gap-4 p-4 rounded-[24px] bg-white/40 border border-white/50 flex-1 w-full">
                    <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center font-black text-lg shadow-sm">
                      {patient.emergency_contact_name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 leading-none mb-1">{patient.emergency_contact_name}</p>
                      <p className="text-xs font-bold text-muted-foreground">{patient.emergency_contact_phone || "Sem telefone"}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic flex-1">Nenhum contato de emergência cadastrado.</p>
                )}
                <Button variant="ghost" className="h-12 rounded-full gradient-primary text-white font-black text-xs px-8 shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all">
                  <Plus className="w-4 h-4 mr-2" />
                  ADICIONAR CONTATO
                </Button>
              </div>
            </div>

            {/* Health and Treatment Placeholder */}
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-primary ml-2 flex items-center gap-2">
                <div className="w-2 h-8 bg-blue-400 rounded-full" />
                Saúde e Tratamento
              </h3>
              <div className="bg-white/30 p-12 rounded-[32px] border border-white/40 shadow-md border-dashed text-center">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-8 h-8 text-blue-400 opacity-60" />
                </div>
                <p className="text-sm text-muted-foreground italic font-medium">Informações de saúde, alergias e histórico médico do paciente...</p>
              </div>
            </div>
            
            {isEditing && (
              <div className="flex justify-end gap-3 pt-6 pb-12">
                <Button variant="ghost" className="rounded-full px-10 h-12 font-bold" onClick={() => { setIsEditing(false); loadData(); }}>
                  Cancelar
                </Button>
                <Button className="gradient-primary text-white rounded-full px-16 h-12 font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all" onClick={handleUpdatePatient} disabled={isSaving}>
                  {isSaving ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Prontuário */}
        <TabsContent value="notes" className="mt-0 space-y-6 w-full animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/20 p-6 rounded-[32px] border border-white/40 backdrop-blur-md">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-primary">Prontuário e Evolução</h2>
              <p className="text-sm text-muted-foreground">Registro de notas de evolução e histórico clínico do paciente.</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="rounded-full border-primary/20 text-primary hover:bg-primary/5 h-10 px-6 font-bold text-xs"
                onClick={handleExportFullRecord}
                disabled={isExporting}
              >
                <FileText className="w-4 h-4 mr-2" />
                Relatório Completo
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-primary/20 text-primary hover:bg-primary/5 h-10 px-6 font-bold text-xs"
                onClick={handleExportNotes}
                disabled={isExporting || !patient.notes_encrypted}
              >
                <Download className="w-4 h-4 mr-2" />
                Exportar Notas
              </Button>
            </div>
          </div>

          <Card className="glass-panel border-0 shadow-lg rounded-[32px] overflow-hidden">
            <CardHeader className="pb-4 bg-white/30 backdrop-blur-sm border-b border-white/40">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-primary">
                <FileText className="w-5 h-5" />
                Nova Nota de Evolução
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-4">
              <Textarea
                placeholder="Registre a evolução do paciente nesta sessão..."
                className="min-h-[160px] rounded-[24px] border-white/40 bg-white/50 focus:bg-white/80 transition-all p-6 text-sm leading-relaxed resize-none shadow-inner"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-[11px] font-bold uppercase tracking-widest">Criptografia de ponta-a-ponta ativa</p>
                </div>
                <Button
                  className="gradient-primary text-white rounded-full h-11 px-10 font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all"
                  disabled={!newNote.trim() || savingNote}
                  onClick={handleAddNote}
                >
                  {savingNote ? "Salvando..." : "ADICIONAR NOTA"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-0 shadow-lg rounded-[32px] overflow-hidden">
            <CardContent className="p-8">
              <div className="flex items-center gap-2 mb-6">
                <History className="w-5 h-5 text-primary/40" />
                <h3 className="text-sm font-black text-primary/40 uppercase tracking-widest">Linha do Tempo de Evolução</h3>
              </div>
              
              <div className="space-y-6">
                {/* Notas Manuais */}
                {patient.notes_encrypted && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-teal- uppercase tracking-widest ml-4">Observações Gerais</p>
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-slate-700 font-medium bg-white/20 p-8 rounded-[24px] border border-white/40">
                      {patient.notes_encrypted}
                    </pre>
                  </div>
                )}

                {/* Evoluções de Sessão */}
                {sessions.filter(s => s.status === "completed" && s.session_notes_encrypted).map(session => {
                  let evolution = null;
                  try {
                    evolution = JSON.parse(session.session_notes_encrypted || "{}");
                  } catch (e) {
                    evolution = { notes: session.session_notes_encrypted };
                  }

                  return (
                    <div key={session.id} className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                      <div className="flex items-center justify-between ml-4">
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                          Sessão em {formatDate(session.scheduled_at)} às {formatTime(session.scheduled_at)}
                        </p>
                        {evolution.mood_happy_sad && (
                          <div className="flex gap-2">
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[9px] font-black uppercase">
                              Humor: {evolution.mood_happy_sad}/10
                            </Badge>
                          </div>
                        )}
                      </div>
                      <div className="bg-white/40 p-6 rounded-[24px] border border-white/60 shadow-sm">
                        <p className="text-sm leading-relaxed font-medium text-slate-700">
                          {evolution.notes || evolution}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {!patient.notes_encrypted && sessions.filter(s => s.status === "completed" && s.session_notes_encrypted).length === 0 && (
                  <p className="text-sm text-muted-foreground italic text-center py-10">Nenhum registro de evolução encontrado.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Equipe */}
        <TabsContent value="team" className="mt-0 space-y-6 w-full animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/20 p-6 rounded-[32px] border border-white/40 backdrop-blur-md">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-primary">Rede de Apoio</h2>
              <p className="text-sm text-muted-foreground">Gestão da equipe multidisciplinar que acompanha o paciente.</p>
            </div>
          </div>
          <CareNetworkCard patientId={id as string} patient={patient} profile={profile} />
        </TabsContent>

        {/* Protocolos */}
        <TabsContent value="protocols" className="mt-0 space-y-6 w-full animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/20 p-6 rounded-[32px] border border-white/40 backdrop-blur-md">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-primary">Protocolos e Testes</h2>
              <p className="text-sm text-muted-foreground">Acompanhamento de protocolos clínicos e rastreadores de desenvolvimento.</p>
            </div>
          </div>
          <ProtocolTrackerCard patientId={id as string} patient={patient} profile={profile} />
        </TabsContent>

        {/* Comportamento */}
        <TabsContent value="behavior" className="mt-0 space-y-6 w-full animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/20 p-6 rounded-[32px] border border-white/40 backdrop-blur-md">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-primary">Análise Comportamental</h2>
              <p className="text-sm text-muted-foreground">Registro de ocorrências (Antecedente, Comportamento e Consequência).</p>
            </div>
          </div>
          <AbcRecordCard patientId={id as string} patient={patient} profile={profile} />
        </TabsContent>

        {/* Financeiro por paciente */}
        <TabsContent value="finance" className="mt-0 space-y-6 w-full animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/20 p-6 rounded-[32px] border border-white/40 backdrop-blur-md">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-primary">Financeiro do Paciente</h2>
              <p className="text-sm text-muted-foreground">Histórico de pagamentos, sessões faturadas e pendências.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="glass-panel border-0 shadow-lg rounded-[32px] overflow-hidden bg-emerald-50/20">
              <CardContent className="p-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-emerald-700/60 uppercase tracking-widest mb-0.5">Total Recebido</p>
                    <p className="text-3xl font-black text-emerald-700 tracking-tight">{formatCurrency(totalPatientIncome)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-panel border-0 shadow-lg rounded-[32px] overflow-hidden bg-amber-50/20">
              <CardContent className="p-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-amber-700/60 uppercase tracking-widest mb-0.5">Valor Pendente</p>
                    <p className="text-3xl font-black text-amber-700 tracking-tight">{formatCurrency(pendingPatientIncome)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4 ml-2">
              <div className="w-2 h-6 bg-primary rounded-full" />
              <h3 className="text-sm font-black text-primary/40 uppercase tracking-widest">Últimos Lançamentos</h3>
            </div>

            {patientCashFlow.length === 0 ? (
              <Card className="glass-panel border-0 shadow-md rounded-[32px] bg-white/10">
                <CardContent className="py-16 text-center">
                  <Wallet className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">Nenhum lançamento financeiro para este paciente.</p>
                </CardContent>
              </Card>
            ) : (
              patientCashFlow.map((tx) => (
                <Card key={tx.id} className="glass-panel border-0 shadow-sm rounded-[24px] bg-white/40 hover:bg-white/60 transition-all border border-white/20">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                        tx.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                      )}>
                        {tx.type === "income" ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{tx.description}</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{formatDate(tx.created_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-lg font-black tracking-tight", tx.type === "income" ? "text-emerald-600" : "text-red-600")}>
                        {tx.type === "income" ? "+" : "-"} {formatCurrency(Number(tx.amount))}
                      </p>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[9px] font-black uppercase tracking-widest px-2 border-0 shadow-sm mt-1",
                          tx.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : 
                          tx.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {tx.status === "confirmed" ? "Confirmado" : tx.status === "pending" ? "Pendente" : "Cancelado"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Arquivo de Sessões */}
        <TabsContent value="archive" className="mt-0 space-y-6 w-full animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/20 p-6 rounded-[32px] border border-white/40 backdrop-blur-md">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-primary">Arquivo de Sessões</h2>
              <p className="text-sm text-muted-foreground">Histórico completo de sessões realizadas, canceladas e faltas.</p>
            </div>
          </div>

          <div className="space-y-3">
            {archivedSessions.length === 0 ? (
              <Card className="glass-panel border-0 shadow-md rounded-[32px] bg-white/10">
                <CardContent className="py-16 text-center">
                  <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">Nenhuma sessão arquivada.</p>
                </CardContent>
              </Card>
            ) : (
              archivedSessions.map((session) => {
                const statusCfg = SESSION_STATUS[session.status];
                return (
                  <Card key={session.id} className="glass-panel border-0 shadow-sm rounded-[24px] bg-white/40 hover:bg-white/60 transition-all border border-white/20">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-primary/5 flex flex-col items-center justify-center border border-primary/10">
                            <span className="text-[10px] font-black text-primary leading-none uppercase">{new Date(session.scheduled_at).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
                            <span className="text-lg font-black text-primary leading-none mt-0.5">{new Date(session.scheduled_at).getDate()}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-800">{formatTime(session.scheduled_at)}</p>
                              <Badge className={cn("text-[9px] font-black uppercase tracking-widest h-5 px-2 border-0 shadow-sm", statusCfg.color)}>{statusCfg.label}</Badge>
                            </div>
                            <p className="text-xs font-medium text-slate-500 mt-0.5">
                              {session.duration_minutes} MIN · {session.session_type}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="rounded-full text-primary hover:bg-primary/10 transition-all active:scale-95"
                          onClick={() => {
                            setViewingSession(session);
                            setIsEditingSession(false);
                            setShowSessionModal(true);
                          }}
                        >
                          <ChevronRight className="w-5 h-5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* Reschedule Modal */}
        <Dialog open={showRescheduleModal} onOpenChange={setShowRescheduleModal}>
          <DialogContent className="sm:max-w-[850px] rounded-[32px] glass-panel border-none shadow-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/20 bg-white/40 flex items-center justify-between shrink-0">
              <div>
                <DialogTitle className="text-xl font-black text-primary uppercase tracking-tight">Remarcar Sessão</DialogTitle>
                <DialogDescription className="text-xs font-bold text-muted-foreground/60 mt-1 uppercase tracking-widest">
                  Selecione um novo horário livre na sua agenda
                </DialogDescription>
              </div>
              <div className="flex items-center bg-white/60 rounded-full border border-white/80 p-1 shadow-sm">
                <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => setRescheduleWeekOffset(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-[10px] font-black px-3 uppercase tracking-widest text-primary/60">
                  {rescheduleWeekDays[0].toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })} - {rescheduleWeekDays[5].toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
                </span>
                <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => setRescheduleWeekOffset(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-4 bg-white/10">
              <div className="grid grid-cols-[60px_repeat(6,1fr)] min-w-[800px] gap-px bg-white/40 border border-primary/20 rounded-2xl overflow-hidden shadow-sm relative">
                {/* Header */}
                <div className="bg-white/60 h-12 border-b border-primary/20 sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.05)]"></div>
                {rescheduleWeekDays.map((day, i) => (
                  <div key={i} className={cn(
                    "bg-white/60 h-12 border-b border-primary/20 flex flex-col items-center justify-center",
                    day.toDateString() === new Date().toDateString() && "bg-primary/5"
                  )}>
                    <span className="text-[8px] font-black text-primary/40 uppercase tracking-widest">{["SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][i]}</span>
                    <span className="text-sm font-black text-primary">{day.getDate()}</span>
                  </div>
                ))}

                {/* Rows */}
                {Array.from({ length: 13 }, (_, i) => 8 + i).map((hour) => (
                  <React.Fragment key={hour}>
                    <div className="bg-white/60 h-16 flex items-center justify-center border-r border-primary/10 sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                      <span className="text-[10px] font-black text-primary/30">{hour}:00</span>
                    </div>
                    {rescheduleWeekDays.map((day, dayIdx) => {
                      const isOccupied = therapistSessions.some(s => {
                        const sDate = new Date(s.scheduled_at);
                        return sDate.toDateString() === day.toDateString() && sDate.getHours() === hour;
                      });
                      const isSelected = rescheduleDate === day.toISOString().split('T')[0] && parseInt(rescheduleTime.split(':')[0]) === hour;

                      return (
                        <div 
                          key={dayIdx} 
                          onClick={() => !isOccupied && handleSlotClick(day, hour)}
                          className={cn(
                            "h-16 relative border-r border-b border-primary/10 transition-all cursor-pointer",
                            isOccupied ? "bg-red-50/30 cursor-not-allowed" : "hover:bg-primary/5",
                            isSelected && "bg-primary/10 ring-2 ring-primary ring-inset z-10"
                          )}
                        >
                          {isOccupied && (
                            <div className="absolute inset-1 rounded-lg bg-red-100/60 border border-red-200/50 flex flex-col items-center justify-center p-1 overflow-hidden">
                              <span className="text-[7px] font-black text-red-600 uppercase tracking-tighter text-center leading-none">Ocupado</span>
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute inset-1 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                              <Check className="w-4 h-4 text-primary animate-in zoom-in-50" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="p-6 bg-white/50 border-t border-white/20 flex justify-between items-center px-8 shrink-0">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Horário Selecionado</span>
                <span className="text-sm font-black text-primary">
                  {rescheduleDate ? new Date(rescheduleDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : "Selecione na grade"}
                  {rescheduleTime && ` às ${rescheduleTime}`}
                </span>
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" className="rounded-full font-bold px-8" onClick={() => setShowRescheduleModal(false)}>
                  CANCELAR
                </Button>
                <Button 
                  className="gradient-primary text-white rounded-full font-black px-12 h-12 shadow-lg shadow-primary/20 active:scale-95 transition-all"
                  onClick={handleReschedule}
                  disabled={isSaving || !rescheduleDate || !rescheduleTime}
                >
                  {isSaving ? "SALVANDO..." : "CONFIRMAR"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Cancel Series / Session Modal */}
        <Dialog open={showCancelSeriesModal} onOpenChange={setShowCancelSeriesModal}>
          <DialogContent className="sm:max-w-[400px] rounded-[32px] glass-panel border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Confirmar Cancelamento
              </DialogTitle>
              <DialogDescription className="text-sm font-medium pt-2">
                Tem certeza que deseja cancelar esta sessão?
              </DialogDescription>
            </DialogHeader>
            
            {cancellingSession?.recurrence_rule && (
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mt-2">
                <p className="text-xs text-amber-800 font-bold">Esta sessão faz parte de um pacote ou série recorrente.</p>
                <p className="text-[10px] text-amber-700 mt-1">Deseja cancelar apenas esta sessão ou todas as futuras?</p>
              </div>
            )}

            <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4 w-full">
              <Button variant="ghost" className="rounded-full font-bold text-muted-foreground order-3 sm:order-1" onClick={() => setShowCancelSeriesModal(false)}>
                Voltar
              </Button>
              
              {cancellingSession?.recurrence_rule ? (
                <div className="flex flex-col sm:flex-row gap-2 flex-1">
                  <Button 
                    variant="outline"
                    className="rounded-full font-bold text-red-600 border-red-200 hover:bg-red-50 flex-1"
                    onClick={() => handleCancelSession(false)}
                    disabled={isSaving}
                  >
                    Apenas esta
                  </Button>
                  <Button 
                    className="rounded-full font-black bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200 flex-1"
                    onClick={() => handleCancelSession(true)}
                    disabled={isSaving}
                  >
                    Toda a série
                  </Button>
                </div>
              ) : (
                <Button 
                  className="rounded-full font-black bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200 flex-1"
                  onClick={() => handleCancelSession(false)}
                  disabled={isSaving}
                >
                  Confirmar Cancelamento
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Session Detail Modal */}
        <Dialog open={showSessionModal} onOpenChange={setShowSessionModal}>
          <DialogContent className="sm:max-w-xl rounded-[32px] border-white/40 backdrop-blur-2xl bg-white/90 shadow-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
            {viewingSession && (
              <div className="animate-in fade-in zoom-in-95 duration-200 flex flex-col h-full overflow-hidden">
                <div className="p-8 border-b border-primary/10 bg-white/50 flex items-center justify-between shrink-0">
                  <div>
                    <h2 className="text-2xl font-black text-primary tracking-tight uppercase leading-none">
                      {isEditingSession ? "Editar Sessão" : "Detalhes da Sessão"}
                    </h2>
                    <p className="text-xs font-bold text-muted-foreground/60 mt-1 uppercase tracking-widest">
                      {formatDate(viewingSession.scheduled_at)} às {formatTime(viewingSession.scheduled_at)}
                    </p>
                  </div>
                  {!isEditingSession && (
                    <div className="flex items-center gap-3">
                      <Badge className={cn("rounded-full px-4 py-1 text-[10px] font-black uppercase tracking-widest border-0", SESSION_STATUS[viewingSession.status].color)}>
                        {SESSION_STATUS[viewingSession.status].label}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="w-10 h-10 rounded-full bg-primary/5 text-primary hover:bg-primary/10 transition-all"
                        onClick={handleStartEditingSession}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="p-8 space-y-8 overflow-y-auto flex-1">
                  {isEditingSession ? (
                    /* Edit Mode Form */
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                      <div className="space-y-3">
                        <Label className="text-[11px] font-black text-primary/60 uppercase ml-2 tracking-widest flex items-center gap-2">
                          <Edit className="w-4 h-4" />
                          Evolução Clínica
                        </Label>
                        <Textarea 
                          className="min-h-[180px] rounded-[24px] border-primary/20 bg-white/50 p-6 text-sm leading-relaxed focus:bg-white transition-all shadow-inner resize-none"
                          placeholder="Descreva a evolução do paciente..."
                          value={sessionEditForm.notes}
                          onChange={(e) => setSessionEditForm(p => ({ ...p, notes: e.target.value }))}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-8">
                        {/* Sliders in Edit Mode */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between px-2">
                            <Label className="text-[11px] font-black text-primary/60 uppercase tracking-widest">Humor do Paciente</Label>
                            <span className="text-lg font-black text-primary">{sessionEditForm.mood_happy_sad}</span>
                          </div>
                          <div className="bg-white/40 p-6 rounded-3xl border border-primary/20 shadow-sm space-y-4">
                            <div className="flex items-center justify-between px-2">
                              <Frown className={cn("w-6 h-6 transition-all", sessionEditForm.mood_happy_sad <= 3 ? "text-rose-500 scale-110" : "text-muted-foreground/30")} />
                              <Smile className={cn("w-6 h-6 transition-all", sessionEditForm.mood_happy_sad >= 8 ? "text-emerald-500 scale-110" : "text-muted-foreground/30")} />
                            </div>
                            <input 
                              type="range" min="1" max="10" step="1"
                              value={sessionEditForm.mood_happy_sad}
                              onChange={(e) => setSessionEditForm(p => ({ ...p, mood_happy_sad: parseInt(e.target.value) }))}
                              className="w-full h-2 bg-primary/10 rounded-full appearance-none cursor-pointer accent-primary"
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between px-2">
                            <Label className="text-[11px] font-black text-primary/60 uppercase tracking-widest">Nível de Agitação</Label>
                            <span className="text-lg font-black text-primary">{sessionEditForm.mood_anxious_calm}</span>
                          </div>
                          <div className="bg-white/40 p-6 rounded-3xl border border-primary/20 shadow-sm space-y-4">
                            <div className="flex items-center justify-between px-2">
                              <Waves className={cn("w-6 h-6 transition-all", sessionEditForm.mood_anxious_calm <= 3 ? "text-sky-500 scale-110" : "text-muted-foreground/30")} />
                              <Zap className={cn("w-6 h-6 transition-all", sessionEditForm.mood_anxious_calm >= 8 ? "text-amber-500 scale-110" : "text-muted-foreground/30")} />
                            </div>
                            <input 
                              type="range" min="1" max="10" step="1"
                              value={sessionEditForm.mood_anxious_calm}
                              onChange={(e) => setSessionEditForm(p => ({ ...p, mood_anxious_calm: parseInt(e.target.value) }))}
                              className="w-full h-2 bg-primary/10 rounded-full appearance-none cursor-pointer accent-primary"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
                    <>
                      <div className="space-y-4">
                        <Label className="text-[11px] font-black text-primary/60 uppercase ml-2 tracking-widest flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Evolução Clínica
                        </Label>
                        <div className="bg-white/40 p-6 rounded-3xl border border-white/60 shadow-sm italic text-sm leading-relaxed text-slate-700">
                          {(() => {
                            try {
                              const evolution = JSON.parse(viewingSession.session_notes_encrypted || "{}");
                              return evolution.notes || viewingSession.session_notes_encrypted || "Nenhuma nota registrada.";
                            } catch (e) {
                              return viewingSession.session_notes_encrypted || "Nenhuma nota registrada.";
                            }
                          })()}
                        </div>
                      </div>

                      {/* Mood Indices */}
                      {(() => {
                        try {
                          const evolution = JSON.parse(viewingSession.session_notes_encrypted || "{}");
                          if (!evolution.mood_happy_sad && !evolution.mood_anxious_calm) return null;
                          
                          return (
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 space-y-3">
                                <div className="flex items-center justify-between text-primary">
                                  <Label className="text-[9px] font-black uppercase tracking-widest">Humor</Label>
                                  {evolution.mood_happy_sad >= 7 ? <Smile className="w-4 h-4" /> : <Frown className="w-4 h-4" />}
                                </div>
                                <p className="text-2xl font-black text-primary">{evolution.mood_happy_sad}/10</p>
                              </div>
                              <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100 space-y-3">
                                <div className="flex items-center justify-between text-amber-600">
                                  <Label className="text-[9px] font-black uppercase tracking-widest">Agitação</Label>
                                  {evolution.mood_anxious_calm >= 7 ? <Zap className="w-4 h-4" /> : <Waves className="w-4 h-4" />}
                                </div>
                                <p className="text-2xl font-black text-amber-700">{evolution.mood_anxious_calm}/10</p>
                              </div>
                            </div>
                          );
                        } catch (e) {
                          return null;
                        }
                      })()}

                      {/* Meta Data */}
                      <div className="grid grid-cols-2 gap-8 bg-white/40 p-6 rounded-3xl border border-white/60">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Duração</p>
                          <p className="text-base font-black text-primary">{viewingSession.duration_minutes} min</p>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Tipo</p>
                          <p className="text-base font-black text-primary capitalize">{viewingSession.session_type}</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="p-6 bg-white/50 border-t border-primary/10 flex justify-between items-center px-8 shrink-0">
                  {isEditingSession ? (
                    <>
                      <Button 
                        variant="ghost" 
                        onClick={() => setIsEditingSession(false)}
                        className="rounded-full px-8 font-black text-muted-foreground"
                      >
                        CANCELAR
                      </Button>
                      <Button 
                        onClick={handleSaveSessionEdit}
                        disabled={isSaving}
                        className="rounded-full px-12 h-12 font-black gradient-primary text-white shadow-lg active:scale-95 transition-all"
                      >
                        {isSaving ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button 
                        variant="outline" 
                        onClick={() => handleExportSingleSession(viewingSession)}
                        disabled={isExporting}
                        className="rounded-full px-6 h-10 font-bold border-primary/20 text-primary hover:bg-primary/5"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        EXPORTAR PDF
                      </Button>
                      <Button 
                        variant="ghost" 
                        onClick={() => setShowSessionModal(false)}
                        className="rounded-full px-8 font-black text-primary"
                      >
                        FECHAR
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </DialogContent>

        </Dialog>

        {/* Lembretes e Alertas */}
        <TabsContent value="alerts" className="mt-0 space-y-6 w-full animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/20 p-6 rounded-[32px] border border-white/40 backdrop-blur-md">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-primary">Alertas e Lembretes</h2>
              <p className="text-sm text-muted-foreground">Notificações importantes e lembretes configurados para este paciente.</p>
            </div>
            <Button className="rounded-full gradient-primary text-white font-black px-8 h-11 shadow-lg shadow-primary/20 active:scale-95 transition-all">
              <Plus className="w-4 h-4 mr-2" />
              NOVO ALERTA
            </Button>
          </div>

          <div className="space-y-3">
            {patientTasks.length === 0 ? (
              <Card className="glass-panel border-0 shadow-md rounded-[32px] bg-white/10 border-dashed border-2 border-white/40">
                <CardContent className="py-24 text-center">
                  <div className="w-20 h-20 rounded-full bg-white/50 flex items-center justify-center mx-auto mb-6 shadow-inner border border-white/60">
                    <Bell className="w-10 h-10 text-primary opacity-30" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">Tudo em dia!</h3>
                  <p className="text-sm text-muted-foreground font-medium max-w-[300px] mx-auto">Não há alertas críticos ou lembretes pendentes para este paciente no momento.</p>
                </CardContent>
              </Card>
            ) : (
              patientTasks.map((task) => (
                <Card key={task.id} className="glass-panel border-0 shadow-sm rounded-[24px] bg-white/40 hover:bg-white/60 transition-all border border-white/20">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          task.status === "completed" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                        )}>
                          <Bell className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{task.title}</p>
                          <p className="text-xs font-medium text-slate-500">{task.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[9px] font-black uppercase tracking-widest px-2 border-0 shadow-sm",
                            task.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                          )}
                        >
                          {task.status === "completed" ? "Concluído" : "Pendente"}
                        </Badge>
                        {task.due_date && (
                          <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest">
                            {formatDate(task.due_date)}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Anamnese e Forms */}
        <TabsContent value="anamnesis" className="mt-0 space-y-6 w-full animate-fade-in">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/20 p-6 rounded-[32px] border border-white/40 backdrop-blur-md">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-primary">Anamnese e Formulários</h2>
                <p className="text-sm text-muted-foreground">Gerencie o envio e as respostas de questionários clínicos.</p>
              </div>
            </div>
            
            <AnamnesisRequestCard patientId={patient.id} />
          </div>
        </TabsContent>
          </div>
        </div>
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
