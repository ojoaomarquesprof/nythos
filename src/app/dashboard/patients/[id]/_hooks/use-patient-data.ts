import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { completeScheduleSession, reverseCompletedScheduleSession } from "@/app/actions/schedule-sessions";
import { createClient } from "@/lib/supabase/client";
import { PatientService } from "@/services/patient-service";
import { BillingService } from "@/services/billing-service";
import { TreatmentPlanService } from "@/services/treatment-plan-service";
import { PatientSupportService } from "@/services/patient-support-service";
import type { FinancialTransaction, TherapistSessionInRange } from "@/services/billing-service";
import { useSubscription } from "@/hooks/use-subscription";
import { usePdfExport } from "@/hooks/use-pdf-export";
import { SESSION_STATUS, formatDate, formatTime } from "@/lib/constants";
import type {
  Patient,
  Session,
  Profile,
  PatientTask,
  PatientTreatmentPlan,
  PatientMoodCheckin,
  SupportContact,
  PatientConsent,
  PatientDocument,
} from "@/types/database";

export type PatientAnamnesisSummary = {
  id: string;
  status: string | null;
  created_at: string | null;
  completed_at: string | null;
  public_expires_at: string | null;
  public_revoked_at: string | null;
};

export type PatientProtocolSummary = {
  id: string;
  protocol_name: string | null;
  evaluation_date: string | null;
  status: string | null;
  created_at: string | null;
};

export type PatientAbcSummary = {
  id: string;
  occurrence_date: string | null;
  intensity: number | null;
  created_at: string | null;
};

const getWeekStart = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

export function usePatientData() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient() as any;
  const { isSecretary } = useSubscription();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [patientCashFlow, setPatientCashFlow] = useState<FinancialTransaction[]>([]);
  const [patientTasks, setPatientTasks] = useState<PatientTask[]>([]);
  const [anamnesisSummaries, setAnamnesisSummaries] = useState<PatientAnamnesisSummary[]>([]);
  const [protocolSummaries, setProtocolSummaries] = useState<PatientProtocolSummary[]>([]);
  const [abcSummaries, setAbcSummaries] = useState<PatientAbcSummary[]>([]);
  const [treatmentPlan, setTreatmentPlan] = useState<PatientTreatmentPlan | null>(null);
  const [moodCheckins, setMoodCheckins] = useState<PatientMoodCheckin[]>([]);
  const [supportContacts, setSupportContacts] = useState<SupportContact[]>([]);
  const [patientConsents, setPatientConsents] = useState<PatientConsent[]>([]);
  const [patientDocuments, setPatientDocuments] = useState<PatientDocument[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
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
  const [therapistSessions, setTherapistSessions] = useState<TherapistSessionInRange[]>([]);
  const [showCancelSeriesModal, setShowCancelSeriesModal] = useState(false);
  const [cancellingSession, setCancellingSession] = useState<Session | null>(null);

  function showError(title: string, message: string) {
    setErrorDialog({ open: true, title, message });
  }

  const rescheduleWeekDays = useMemo(() => {
    const start = getWeekStart(new Date());
    start.setDate(start.getDate() + (rescheduleWeekOffset * 7));
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [rescheduleWeekOffset]);

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    async function fetchAgendaForReschedule() {
      if (!profile || !showRescheduleModal) return;
      
      const startRange = rescheduleWeekDays[0];
      const endRange = new Date(rescheduleWeekDays[5]);
      endRange.setHours(23, 59, 59, 999);

      const { data, error } = await BillingService.getTherapistSessionsInRange(
        profile.id,
        startRange,
        endRange
      );

      if (!error && data) {
        setTherapistSessions(data);
      }
    }
    fetchAgendaForReschedule();
  }, [rescheduleWeekOffset, showRescheduleModal, profile, rescheduleWeekDays]);

  async function loadData() {
    setLoading(true);

    const idStr = Array.isArray(id) ? id[0] : id;

    const [
      patientRes,
      sessionsRes,
      authRes,
      guardianRes,
      tasksRes,
      treatmentPlanRes,
      moodCheckinsRes,
      supportContactsRes,
      consentsRes,
      documentsRes,
      anamnesisRes,
      protocolRes,
      abcRes
    ] = await Promise.all([
      PatientService.getById(idStr),
      BillingService.getSessionsByPatient(idStr),
      supabase.auth.getUser(),
      PatientService.getGuardian(idStr),
      PatientService.getTasks(idStr),
      TreatmentPlanService.getByPatient(idStr),
      supabase.rpc("get_patient_mood_checkins_decrypted", { p_patient_id: idStr }),
      PatientSupportService.getContacts(idStr),
      PatientSupportService.getConsents(idStr),
      PatientSupportService.getDocuments(idStr),
      supabase
        .from("anamnesis_responses")
        .select("id,status,created_at,completed_at,public_expires_at,public_revoked_at")
        .eq("patient_id", idStr)
        .order("created_at", { ascending: false }),
      supabase.rpc("get_patient_evaluations_decrypted", { p_patient_id: idStr }),
      supabase.rpc("get_abc_records_decrypted", { p_patient_id: idStr }),
    ]);

    if (patientRes.data) {
      setPatient(patientRes.data);
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
    setTreatmentPlan(treatmentPlanRes.data || null);
    setMoodCheckins(moodCheckinsRes.error ? [] : (moodCheckinsRes.data || []));
    setSupportContacts(supportContactsRes.data || []);
    setPatientConsents(consentsRes.data || []);
    setPatientDocuments(documentsRes.data || []);
    setAnamnesisSummaries(anamnesisRes.error ? [] : (anamnesisRes.data || []));
    setProtocolSummaries(protocolRes.error ? [] : (protocolRes.data || []).map((item: any) => ({
      id: item.id,
      protocol_name: item.protocol_name ?? null,
      evaluation_date: item.evaluation_date ?? null,
      status: item.status ?? null,
      created_at: item.created_at ?? null,
    })));
    setAbcSummaries(abcRes.error ? [] : (abcRes.data || []).map((item: any) => ({
      id: item.id,
      occurrence_date: item.occurrence_date ?? null,
      intensity: typeof item.intensity === "number" ? item.intensity : null,
      created_at: item.created_at ?? null,
    })));
    if (guardianRes.data) setGuardian(guardianRes.data);

    const { data: cashFlowData } = await supabase
      .from("cash_flow")
      .select(`
        *,
        session_package:session_packages(id, name, total_sessions),
        session:sessions(id, scheduled_at, billing_mode)
      `)
      .eq("patient_id", idStr)
      .order("created_at", { ascending: false });
    setPatientCashFlow((cashFlowData || []) as FinancialTransaction[]);
    
    if (authRes.data.user) {
      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", authRes.data.user.id).single();
      if (profileData) setProfile(profileData);
    }
    
    setLoading(false);
  }

  const handleAddNote = async () => {
    if (!newNote.trim() || !patient) return;
    setSavingNote(true);

    const { data, error } = await PatientService.updatePatientNotes(patient.id, newNote.trim());

    if (!error && data) {
      setPatient(data);
      setNewNote("");
    }
    setSavingNote(false);
  };

  const handleStatusChange = async (sessionId: string, newStatus: Session["status"]) => {
    const { error } = await BillingService.updateSessionStatus(sessionId, newStatus);

    if (!error) {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: newStatus } : s))
      );
    }
  };

  const handleCompleteSession = async (session: Session): Promise<boolean> => {
    if (session.status !== "scheduled") return false;

    const scheduledAt = new Date(session.scheduled_at);
    const isFuture = !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() > Date.now();
    if (isFuture) {
      const confirmed = window.confirm(
        "Esta sessão ainda está no futuro. Deseja marcar como realizada mesmo assim?"
      );
      if (!confirmed) return false;
    }

    setIsSaving(true);
    try {
      const result = await completeScheduleSession({
        sessionId: session.id,
        allowFutureCompletion: isFuture,
      });

      if (!result.success) {
        throw new Error(result.error || "Falha ao marcar sessão como realizada.");
      }

      if (result.packageCreditConsumed) {
        toast.success("Sessão realizada. 1 crédito do pacote foi consumido.");
      } else {
        toast.success("Sessão marcada como realizada.");
      }
      if (result.billingCreated) {
        toast.success("Cobrança pendente criada no financeiro.");
      } else if (result.packageCreditAlreadyConsumed) {
        toast.info("Crédito do pacote já estava consumido para esta sessão.");
      } else if (result.billingAlreadyExists) {
        toast.info("Já existe um lançamento financeiro vinculado a esta sessão.");
      } else if (result.billingSkippedReason === "courtesy_or_zero_value") {
        toast.info("Sessão cortesia ou sem valor: cobrança não criada.");
      }
      if (result.needsEvolution) {
        toast.info("Evolução ainda não registrada. Você pode registrar sem bloquear a finalização.");
      }

      await loadData();
      window.dispatchEvent(new CustomEvent("notifications:refresh"));
      return true;
    } catch (err: any) {
      showError("Erro ao finalizar sessão", err.message || "Erro inesperado.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleReverseCompletedSession = async (session: Session): Promise<boolean> => {
    if (session.status !== "completed") return false;

    const confirmed = window.confirm(
      [
        "Desfazer realização desta sessão?",
        "",
        "A sessão voltará para agendada.",
        "Cobrança pendente será cancelada, se houver.",
        "Crédito de pacote será devolvido, se houver.",
        "A evolução será mantida no histórico.",
      ].join("\n")
    );
    if (!confirmed) return false;

    setIsSaving(true);
    try {
      const result = await reverseCompletedScheduleSession({
        sessionId: session.id,
        reason: "Desfazer realização pelo prontuário do paciente",
      });

      if (!result.success) {
        throw new Error(result.error || "Falha ao desfazer realização.");
      }

      if (result.packageCreditReversed) {
        toast.success("Sessão revertida e crédito devolvido ao pacote.");
      } else if (result.cashFlowCancelled) {
        toast.success("Sessão revertida e cobrança pendente cancelada.");
      } else {
        toast.success("Sessão revertida.");
      }
      if (result.warning === "package_usage_not_found") {
        toast.info("Nenhum crédito ativo foi encontrado para devolver.");
      }
      if (result.hadEvolution) {
        toast.info("A evolução registrada foi mantida no histórico.");
      }

      setShowSessionModal(false);
      setViewingSession(null);
      await loadData();
      window.dispatchEvent(new CustomEvent("notifications:refresh"));
      return true;
    } catch (err: any) {
      showError("Erro ao desfazer realização", err.message || "Erro inesperado.");
      return false;
    } finally {
      setIsSaving(false);
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
    const notes = sessionEditForm.notes.trim();
    if (!notes) {
      toast.info("Registre a evolução antes de salvar.");
      return;
    }

    setIsSaving(true);

    try {
      const { data: updatedSession, error } = await BillingService.updateSessionEvolution(
        viewingSession.id,
        notes,
        sessionEditForm.mood_happy_sad,
        sessionEditForm.mood_anxious_calm
      );

      if (error) throw new Error(error);
      if (!updatedSession) {
        throw new Error("Erro ao carregar a evoluÃ§Ã£o salva.");
      }

      setSessions(prev => prev.map(s => 
        s.id === viewingSession.id 
          ? updatedSession
          : s
      ));
      
      setViewingSession(updatedSession);
      
      setIsEditingSession(false);
      toast.success("Evolução registrada para esta sessão.");
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
      const { error } = await BillingService.cancelSession(
        cancellingSession.id,
        cancellingSession.recurrence_rule,
        cancellingSession.scheduled_at,
        allFollowing
      );
      if (error) throw new Error(error);

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

      const { data: hasConflict, error: conflictError } = await BillingService.checkRescheduleConflicts(
        profile.id,
        rescheduleSession.id,
        scheduledAt,
        rescheduleSession.duration_minutes ?? 50
      );

      if (conflictError) throw new Error(conflictError);

      if (hasConflict) {
        throw new Error("Este horário já está ocupado por outro paciente.");
      }

      const { error } = await BillingService.rescheduleSession(rescheduleSession.id, scheduledAt);

      if (error) throw new Error(error);

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
    const { error } = await PatientService.archivePatient(patient.id);
      
    if (!error) {
      router.push("/dashboard/patients");
    } else {
      setIsArchiving(false);
      showError("Erro", "Erro ao arquivar paciente: " + error);
    }
  };

  const handleUpdatePatient = async () => {
    if (!patient || !editForm) return;
    setIsSaving(true);

    try {
      const { error: pError } = await PatientService.updatePatient(patient.id, {
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
      });

      if (pError) throw new Error(pError);

      if (editForm.has_guardian) {
        const guardianData = {
          full_name: editForm.guardian_name,
          email: editForm.guardian_email || null,
          phone: editForm.guardian_phone || null,
          cpf: editForm.guardian_cpf || null,
          relationship: editForm.guardian_relationship,
          is_financial_responsible: editForm.guardian_is_financial,
        };

        const { error: gError } = await PatientService.createOrUpdateGuardian(
          patient.id,
          guardian?.id,
          guardianData
        );
        if (gError) throw new Error(gError);
      }

      await loadData();
      setIsEditing(false);
    } catch (err: any) {
      showError("Erro ao salvar", err.message || "Erro inesperado.");
    } finally {
      setIsSaving(false);
    }
  };

  const { exportPdf, isExporting: isExportingPdf } = usePdfExport();

  return {
    id,
    router,
    isSecretary,
    patient,
    setPatient,
    sessions,
    setSessions,
    patientCashFlow,
    patientTasks,
    anamnesisSummaries,
    protocolSummaries,
    abcSummaries,
    treatmentPlan,
    setTreatmentPlan,
    moodCheckins,
    setMoodCheckins,
    supportContacts,
    setSupportContacts,
    patientConsents,
    setPatientConsents,
    patientDocuments,
    setPatientDocuments,
    profile,
    loading,
    newNote,
    setNewNote,
    savingNote,
    isArchiving,
    isEditing,
    setIsEditing,
    isSaving,
    guardian,
    editForm,
    setEditForm,
    errorDialog,
    setErrorDialog,
    viewingSession,
    setViewingSession,
    showSessionModal,
    setShowSessionModal,
    isEditingSession,
    setIsEditingSession,
    sessionEditForm,
    setSessionEditForm,
    rescheduleSession,
    setRescheduleSession,
    rescheduleDate,
    setRescheduleDate,
    rescheduleTime,
    setRescheduleTime,
    showRescheduleModal,
    setShowRescheduleModal,
    rescheduleWeekOffset,
    setRescheduleWeekOffset,
    therapistSessions,
    showCancelSeriesModal,
    setShowCancelSeriesModal,
    cancellingSession,
    setCancellingSession,
    showError,
    rescheduleWeekDays,
    loadData,
    handleAddNote,
    handleStatusChange,
    handleCompleteSession,
    handleReverseCompletedSession,
    handleStartEditingSession,
    handleSaveSessionEdit,
    handleCancelSession,
    handleReschedule,
    handleSlotClick,
    handleArchive,
    handleUpdatePatient,
    exportPdf,
    isExportingPdf,
  };
}
