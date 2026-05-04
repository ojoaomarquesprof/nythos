"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  CalendarDays,
  Plus,
  Clock,
  ChevronLeft,
  ChevronRight,
  Video,
  MapPin,
  X,
  Pencil,
  Trash2,
  MoreVertical,
  Search,
  Filter,
  Check,
  ChevronDown,
  Info,
  User,
  ExternalLink,
  Calendar,
  Smile,
  Frown,
  Zap,
  Waves,
  Play,
  CheckCircle,
  Timer
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardTitle, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogClose, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SubscriptionGate } from "@/components/auth/subscription-gate";
import { useSubscription } from "@/hooks/use-subscription";
import { SESSION_STATUS, formatTime, formatCurrency } from "@/lib/constants";
import type { Session, Patient } from "@/types/database";

// Auxiliares de data
const getWeekStart = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getMonthStart = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
};

export default function SchedulePage() {
  const { therapistId } = useSubscription();
  const supabase = createClient() as any;
  const [sessions, setSessions] = useState<(Session & { patient?: Patient })[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [showNewSession, setShowNewSession] = useState(false);
  const [showSessionDetails, setShowSessionDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // New session form
  const [newSession, setNewSession] = useState({
    patient_id: "",
    scheduled_at: "",
    scheduled_time: "14:00",
    duration_minutes: "50",
    session_type: "individual",
    session_price: "",
    location: "office",
    is_recurring: false,
    recurrence_period: "weekly",
    recurrence_count: "4",
    is_indefinite: false,
    is_package: false,
    package_sessions: "10",
    discount_percentage: "0",
  });

  const [selectedSessionDetails, setSelectedSessionDetails] = useState<
    (Session & { patient?: Patient }) | null
  >(null);

  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  // Session Manager
  const [showSessionManager, setShowSessionManager] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [moodHappySad, setMoodHappySad] = useState(5);
  const [moodAnxiousCalm, setMoodAnxiousCalm] = useState(5);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [showSeriesDialog, setShowSeriesDialog] = useState(false);
  const [seriesActionType, setSeriesActionType] = useState<'delete' | 'reschedule' | null>(null);

  const [rescheduleWeekOffset, setRescheduleWeekOffset] = useState(0);
  const [therapistSessionsForReschedule, setTherapistSessionsForReschedule] = useState<Session[]>([]);

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
      if (!therapistId || !isRescheduling) return;
      
      const startRange = rescheduleWeekDays[0];
      const endRange = new Date(rescheduleWeekDays[5]);
      endRange.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("sessions")
        .select("id, scheduled_at, duration_minutes, patient:patients(full_name)")
        .eq("user_id", therapistId)
        .gte("scheduled_at", startRange.toISOString())
        .lte("scheduled_at", endRange.toISOString())
        .not("status", "eq", "cancelled");

      if (!error && data) {
        setTherapistSessionsForReschedule(data);
      }
    }
    fetchAgendaForReschedule();
  }, [rescheduleWeekOffset, isRescheduling, therapistId, rescheduleWeekDays]);

  useEffect(() => {
    if (therapistId) {
      loadData();
    }
  }, [currentDate, therapistId, view]);

  async function loadData() {
    setLoading(true);
    let start: Date;
    let end: Date;

    if (view === 'week') {
      start = getWeekStart(currentDate);
      end = new Date(start);
      end.setDate(end.getDate() + 7);
    } else if (view === 'day') {
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else {
      start = getMonthStart(currentDate);
      start.setDate(start.getDate() - 7); // Pegar uns dias antes para o grid
      end = new Date(start);
      end.setDate(end.getDate() + 42); // 6 semanas
    }

    const [sessionsRes, patientsRes, profileRes] = await Promise.all([
      supabase
        .from("sessions")
        .select("*, patient:patients(*)")
        .eq("user_id", therapistId)
        .gte("scheduled_at", start.toISOString())
        .lt("scheduled_at", end.toISOString())
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("patients")
        .select("*")
        .eq("user_id", therapistId),
      supabase
        .from("profiles")
        .select("*")
        .eq("id", therapistId)
        .single()
    ]);

    if (!sessionsRes.error) setSessions(sessionsRes.data);
    if (!patientsRes.error) setPatients(patientsRes.data);
    if (!profileRes.error) setProfile(profileRes.data);
    setLoading(false);
  }

  const navigate = (amount: number) => {
    const nextDate = new Date(currentDate);
    if (view === 'week') {
      nextDate.setDate(nextDate.getDate() + amount * 7);
    } else if (view === 'day') {
      nextDate.setDate(nextDate.getDate() + amount);
    } else {
      nextDate.setMonth(nextDate.getMonth() + amount);
    }
    setCurrentDate(nextDate);
  };

  const today = new Date();
  
  const weekDays = useMemo(() => {
    if (view === 'day') return [currentDate];
    return Array.from({ length: 7 }, (_, i) => {
      const d = getWeekStart(currentDate);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate, view]);

  const monthDays = useMemo(() => {
    if (view !== 'month') return [];
    const start = getMonthStart(currentDate);
    const dayOfWeek = start.getDay();
    const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const firstDay = new Date(start);
    firstDay.setDate(start.getDate() + diff - 1);
    
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(firstDay);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate, view]);

  useEffect(() => {
    if (showNewSession && !newSession.scheduled_at) {
      setNewSession(p => ({
        ...p,
        scheduled_at: currentDate.toISOString().split('T')[0]
      }));
    }
  }, [showNewSession, currentDate]);

  useEffect(() => {
    // Rola automaticamente para o horário atual ao carregar a página
    if (scrollRef.current && view !== 'month') {
      const now = new Date();
      const currentHour = now.getHours();
      const timelineStartHour = 7;
      const timelineEndHour = 21;
      const slotHeight = 80;

      if (currentHour >= timelineStartHour && currentHour <= timelineEndHour) {
        const offset = (currentHour - timelineStartHour) * slotHeight;
        const containerHeight = scrollRef.current.clientHeight;
        // Centraliza o horário atual na tela
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTo({
              top: Math.max(0, offset - containerHeight / 2 + (slotHeight / 2)),
              behavior: 'smooth'
            });
          }
        }, 300); // pequeno delay para garantir que o layout renderizou
      }
    }
  }, [view, currentDate]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!therapistId) {
      alert("Erro: ID do terapeuta não encontrado. Tente recarregar a página.");
      return;
    }
    setSaving(true);

    try {
      if (!newSession.scheduled_at || !newSession.scheduled_time) {
        throw new Error("Data e hora são obrigatórias.");
      }

      const scheduledAtStr = `${newSession.scheduled_at}T${newSession.scheduled_time}:00`;
      const scheduledAt = new Date(scheduledAtStr);

      if (isNaN(scheduledAt.getTime())) {
        throw new Error("Data ou hora inválida.");
      }

      const sessionsToInsert = [];
      const isRecurring = newSession.is_recurring || newSession.is_package;
      const count = newSession.is_package 
        ? parseInt(newSession.package_sessions) 
        : (newSession.is_recurring 
            ? (newSession.is_indefinite ? 12 : parseInt(newSession.recurrence_count)) 
            : 1);

      // Calcular valor para financeiro
      const currentPatient = patients.find(p => p.id === newSession.patient_id);
      const basePrice = parseFloat(newSession.session_price) || currentPatient?.session_price || profile?.session_price_default || 0;
      const totalBase = basePrice * (newSession.is_package ? parseInt(newSession.package_sessions) : 1);
      const discountVal = (totalBase * (parseFloat(newSession.discount_percentage || "0") / 100));
      const finalPackageValue = totalBase - discountVal;

      const seriesId = isRecurring ? crypto.randomUUID() : null;

      for (let i = 0; i < count; i++) {
        const sessionDate = new Date(scheduledAt);
        
        if (isRecurring) {
          if (newSession.recurrence_period === "weekly") {
            sessionDate.setDate(sessionDate.getDate() + (i * 7));
          } else if (newSession.recurrence_period === "fortnightly") {
            sessionDate.setDate(sessionDate.getDate() + (i * 14));
          } else if (newSession.recurrence_period === "monthly") {
            sessionDate.setMonth(sessionDate.getMonth() + i);
          } else if (newSession.recurrence_period === "indefinite") {
            sessionDate.setDate(sessionDate.getDate() + (i * 7));
          }
        }

        sessionsToInsert.push({
          user_id: therapistId,
          patient_id: newSession.patient_id,
          scheduled_at: sessionDate.toISOString(),
          duration_minutes: parseInt(newSession.duration_minutes),
          session_type: newSession.session_type,
          session_price: newSession.is_package ? (finalPackageValue / count) : basePrice,
          location: newSession.location,
          status: "scheduled",
          recurrence_rule: seriesId,
        });
      }

      const { data: createdSessions, error: sessionError } = await supabase.from("sessions").insert(sessionsToInsert).select();

      if (sessionError) {
        console.error("Supabase Session Error:", sessionError);
        throw sessionError;
      }

      // Se for pacote, gerar UMA cobrança no financeiro
      if (newSession.is_package && createdSessions && createdSessions.length > 0) {
        const firstSession = createdSessions[0];
        const { error: finError } = await supabase.from("cash_flow").insert({
          user_id: therapistId,
          session_id: firstSession.id,
          type: 'income',
          amount: finalPackageValue,
          description: `Pacote de ${count} sessões - ${currentPatient?.full_name}`,
          category: 'package',
          status: 'pending',
          due_date: scheduledAt.toISOString().split('T')[0],
        });

        if (finError) {
          console.error("Erro ao gerar financeiro do pacote:", JSON.stringify(finError));
          alert("A agenda foi criada, mas houve um erro ao gerar a cobrança no financeiro. Verifique manualmente.");
        }
      }

      setShowNewSession(false);
      loadData();
      setNewSession({
        patient_id: "",
        scheduled_at: "",
        scheduled_time: "14:00",
        duration_minutes: "50",
        session_type: "individual",
        session_price: "",
        location: "office",
        is_recurring: false,
        recurrence_period: "weekly",
        recurrence_count: "4",
        is_indefinite: false,
        is_package: false,
        package_sessions: "10",
        discount_percentage: "0",
      });
    } catch (err: any) {
      console.error("Erro completo durante a criação:", err);
      alert(`Erro ao criar sessão: ${err.message || "Erro desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };

  const openSessionDetailsModal = (session: Session & { patient?: Patient }) => {
    setSelectedSessionDetails(session);
    setIsRescheduling(false);
    const date = new Date(session.scheduled_at);
    setRescheduleDate(date.toISOString().split('T')[0]);
    setRescheduleTime(date.toTimeString().slice(0, 5));
    setShowSessionDetails(true);
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedSessionDetails || !therapistId) return;
    setSaving(true);

    try {
      // Atualizar o status da sessão
      // Nota: Existe um trigger no banco (on_session_completed) que cria 
      // automaticamente o registro no financeiro quando o status muda para 'completed'
      const { error: sessionError } = await supabase
        .from("sessions")
        .update({ status })
        .eq("id", selectedSessionDetails.id);

      if (sessionError) throw sessionError;

      setShowSessionDetails(false);
      loadData();
      
      // Forçar atualização do sininho de notificações
      window.dispatchEvent(new CustomEvent("notifications:refresh"));
    } catch (err: any) {
      console.error("Erro ao atualizar status:", err);
      alert(`Erro ao atualizar: ${err.message || "Erro desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!selectedSessionDetails) return;
    
    if (selectedSessionDetails.recurrence_rule) {
      setSeriesActionType('delete');
      setShowSeriesDialog(true);
      return;
    }

    if (!confirm("Deseja realmente excluir esta sessão?")) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("sessions")
        .delete()
        .eq("id", selectedSessionDetails.id);

      if (error) throw error;
      setShowSessionDetails(false);
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const deleteSeries = async (allFollowing: boolean) => {
    if (!selectedSessionDetails || !therapistId) return;
    setSaving(true);

    try {
      let query = supabase.from("sessions").delete();
      
      if (allFollowing) {
        query = query
          .eq("recurrence_rule", selectedSessionDetails.recurrence_rule)
          .gte("scheduled_at", selectedSessionDetails.scheduled_at);
      } else {
        query = query.eq("id", selectedSessionDetails.id);
      }

      const { error } = await query;
      if (error) throw error;

      setShowSeriesDialog(false);
      setShowSessionDetails(false);
      loadData();
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao excluir: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const canMarkAsCompleted = (scheduledAt: string) => {
    const sessionTime = new Date(scheduledAt);
    const now = new Date();
    // Permitir se a sessão já começou ou começa em menos de 30 minutos
    const diffInMinutes = (sessionTime.getTime() - now.getTime()) / (1000 * 60);
    return diffInMinutes <= 30;
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionDetails || !therapistId || !rescheduleDate || !rescheduleTime) return;
    setSaving(true);

    try {
      const [year, month, day] = rescheduleDate.split('-').map(Number);
      const [hours, minutes] = rescheduleTime.split(':').map(Number);
      const newScheduledAt = new Date(year, month - 1, day, hours, minutes);

      if (isNaN(newScheduledAt.getTime())) {
        throw new Error("Data ou hora selecionada é inválida.");
      }

      if (selectedSessionDetails.recurrence_rule) {
        setSeriesActionType('reschedule');
        setShowSeriesDialog(true);
        return;
      }

      const { error: updateError } = await supabase
        .from("sessions")
        .update({ 
          scheduled_at: newScheduledAt.toISOString(),
          status: "scheduled" // Mantendo 'scheduled' pois 'rescheduled' viola o check constraint
        })
        .eq("id", selectedSessionDetails.id);

      if (updateError) throw updateError;

      // Sincronizar financeiro (atualizar data de vencimento)
      await supabase
        .from("cash_flow")
        .update({ due_date: newScheduledAt.toISOString().split('T')[0] })
        .eq("session_id", selectedSessionDetails.id);

      setIsRescheduling(false);
      setShowSessionDetails(false);
      loadData();
      window.dispatchEvent(new CustomEvent("notifications:refresh"));
    } catch (err: any) {
      console.error("Erro ao reagendar:", err);
      alert(`Erro ao reagendar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const rescheduleSeries = async (allFollowing: boolean) => {
    if (!selectedSessionDetails || !therapistId || !rescheduleDate || !rescheduleTime) return;
    setSaving(true);

    try {
      const [year, month, day] = rescheduleDate.split('-').map(Number);
      const [hours, minutes] = rescheduleTime.split(':').map(Number);
      const newScheduledAt = new Date(year, month - 1, day, hours, minutes);

      if (allFollowing) {
        const originalDate = new Date(selectedSessionDetails.scheduled_at);
        const diffMs = newScheduledAt.getTime() - originalDate.getTime();

        const { data: futureSessions, error: fetchError } = await supabase
          .from("sessions")
          .select("id, scheduled_at")
          .eq("recurrence_rule", selectedSessionDetails.recurrence_rule)
          .gte("scheduled_at", selectedSessionDetails.scheduled_at);

        if (fetchError) throw fetchError;

        if (futureSessions) {
          const updates = futureSessions.map(async (s: any) => {
            const sDate = new Date(s.scheduled_at);
            const nextDate = new Date(sDate.getTime() + diffMs);
            const nextDateIso = nextDate.toISOString();
            
            const { error: sessionError } = await supabase
              .from("sessions")
              .update({ 
                scheduled_at: nextDateIso,
                status: "scheduled"
              })
              .eq("id", s.id);
            if (sessionError) throw sessionError;

            // Atualizar financeiro vinculado a essa sessão específica (se houver)
            await supabase
              .from("cash_flow")
              .update({ due_date: nextDateIso.split('T')[0] })
              .eq("session_id", s.id);
          });
          await Promise.all(updates);
          console.log(`Série de ${futureSessions.length} sessões atualizada.`);
        }
      } else {
        const { error: updateError } = await supabase
          .from("sessions")
          .update({ 
            scheduled_at: newScheduledAt.toISOString(),
            status: "scheduled"
          })
          .eq("id", selectedSessionDetails.id);
        
        if (updateError) throw updateError;

        // Sincronizar financeiro desta sessão
        await supabase
          .from("cash_flow")
          .update({ due_date: newScheduledAt.toISOString().split('T')[0] })
          .eq("session_id", selectedSessionDetails.id);
        
        console.log("Sessão individual da série atualizada.");
      }

      setShowSeriesDialog(false);
      setShowSessionDetails(false);
      loadData();
      window.dispatchEvent(new CustomEvent("notifications:refresh"));
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao reagendar série: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStartSession = () => {
    setSessionStartTime(new Date());
    setSessionNotes("");
    setMoodHappySad(5);
    setMoodAnxiousCalm(5);
    setShowSessionDetails(false);
    setShowSessionManager(true);
  };

  const handleSlotClickReschedule = (day: Date, hour: number, minutes: number = 0) => {
    const dateStr = day.toISOString().split('T')[0];
    const timeStr = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    setRescheduleDate(dateStr);
    setRescheduleTime(timeStr);
  };

  const handleFinishSession = async () => {
    if (!selectedSessionDetails || !therapistId) return;
    setSaving(true);

    try {
      // Aqui vamos salvar as notas e humor. Futuramente podemos usar uma tabela dedicada.
      // Por enquanto vamos compor um objeto JSON nas notas.
      const evolutionData = {
        notes: sessionNotes,
        mood_happy_sad: moodHappySad,
        mood_anxious_calm: moodAnxiousCalm,
        finished_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from("sessions")
        .update({ 
          status: "completed",
          session_notes_encrypted: JSON.stringify(evolutionData)
        })
        .eq("id", selectedSessionDetails.id);

      if (error) throw error;

      setShowSessionManager(false);
      loadData();
      window.dispatchEvent(new CustomEvent("notifications:refresh"));
      alert("Sessão finalizada e salva com sucesso!");
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao finalizar sessão: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const dayNamesShort = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
  const monthYear = currentDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const timelineStartHour = 7;
  const timelineEndHour = 21;
  const slotHeight = 80; // Altura maior para melhor visualização
  const hourLabels = Array.from(
    { length: timelineEndHour - timelineStartHour + 1 },
    (_, i) => timelineStartHour + i
  );
  
  const sessionsByDay = (days: Date[]) => days.map((day) =>
    sessions
      .filter((s) => new Date(s.scheduled_at).toDateString() === day.toDateString())
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  );

  const weekSessionsByDay = useMemo(() => sessionsByDay(weekDays), [sessions, weekDays]);

  const now = new Date();
  const isCurrentInView = weekDays.some(day => day.toDateString() === now.toDateString());
  const nowMinutesFromStart = (now.getHours() - timelineStartHour) * 60 + now.getMinutes();
  const showNowLine = isCurrentInView && nowMinutesFromStart >= 0 && nowMinutesFromStart <= (timelineEndHour - timelineStartHour) * 60;
  const nowLineTop = (nowMinutesFromStart / 60) * slotHeight;

  const miniCalendarDays = useMemo(() => {
    const start = getMonthStart(currentDate);
    const dayOfWeek = start.getDay(); // 0 is Sunday
    const firstDay = new Date(start);
    firstDay.setDate(start.getDate() - dayOfWeek);
    
    return Array.from({ length: 35 }, (_, i) => {
      const d = new Date(firstDay);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate]);

  return (
    <div className="flex h-[calc(100dvh-200px)] md:h-[calc(100vh-80px)] w-full overflow-hidden animate-fade-in bg-white/30">
      {/* Sidebar */}
      <aside className="w-72 border-r border-white/40 bg-white/40 backdrop-blur-xl p-6 hidden lg:flex flex-col gap-8 shrink-0">
        <SubscriptionGate>
          <Button
            onClick={() => setShowNewSession(true)}
            className="w-full h-14 rounded-full bg-white text-primary font-black shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 border border-primary/10 px-6"
          >
            <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white shrink-0">
              <Plus className="w-5 h-5" />
            </div>
            <span className="truncate">AGENDAR SESSÃO</span>
          </Button>
        </SubscriptionGate>

        {/* Mini Calendar */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-black text-primary uppercase tracking-widest">{monthYear}</h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="w-6 h-6 rounded-full" onClick={() => navigate(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="w-6 h-6 rounded-full" onClick={() => navigate(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <span key={i} className="text-[10px] font-black text-muted-foreground">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {miniCalendarDays.map((day, i) => {
              const isToday = day.toDateString() === today.toDateString();
              const isSelected = day.toDateString() === currentDate.toDateString();
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              
              return (
                <div key={i} className="flex items-center justify-center h-8">
                  <span 
                    onClick={() => {
                      setCurrentDate(day);
                      setView('day');
                    }}
                    className={cn(
                      "text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full cursor-pointer hover:bg-primary/10 transition-all",
                      isSelected ? "gradient-primary text-white shadow-md scale-110" : 
                      isToday ? "bg-primary/10 text-primary" : 
                      isCurrentMonth ? "text-primary/70" : "text-primary/20"
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-white/40">
          <h3 className="text-[11px] font-black text-primary/40 uppercase tracking-widest ml-2">Minhas Agendas</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3 px-2 py-1 cursor-pointer hover:bg-white/40 rounded-lg transition-colors">
              <div className="w-4 h-4 rounded-sm bg-primary shadow-sm" />
              <span className="text-xs font-bold text-primary/80">Sessões Clínicas</span>
            </div>
            <div className="flex items-center gap-3 px-2 py-1 cursor-pointer hover:bg-white/40 rounded-lg transition-colors opacity-50">
              <div className="w-4 h-4 rounded-sm bg-emerald-400 shadow-sm" />
              <span className="text-xs font-bold text-primary/80">Google Agenda (Em breve)</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white/60 backdrop-blur-md relative">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between px-4 md:px-8 py-3 md:py-0 md:h-20 border-b border-white/40 bg-white/40 shrink-0 gap-3 md:gap-0">
          <div className="flex flex-wrap items-center gap-3 md:gap-8 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-7 h-7 md:w-8 md:h-8 text-primary" />
              <h1 className="text-xl md:text-2xl font-black text-primary tracking-tight hidden sm:block">Agenda</h1>
            </div>

            <div className="flex items-center gap-2 md:gap-4">
              <Button 
                variant="outline" 
                className="rounded-full border-primary/20 font-bold hover:bg-primary/5 active:scale-95 transition-all h-8 md:h-10 px-4 md:px-6 text-xs md:text-sm"
                onClick={() => {
                  const now = new Date();
                  setCurrentDate(now);
                  setSelectedDate(now);
                }}
              >
                Hoje
              </Button>
              <div className="flex items-center bg-white/60 rounded-full border border-white/80 p-0.5 md:p-1 shadow-sm">
                <Button variant="ghost" size="icon" className="w-7 h-7 md:w-8 md:h-8 rounded-full" onClick={() => navigate(-1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="w-7 h-7 md:w-8 md:h-8 rounded-full" onClick={() => navigate(1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <h2 className="text-sm md:text-xl font-black text-primary/80 capitalize w-full sm:w-auto text-center sm:text-left order-last sm:order-none">{monthYear}</h2>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="bg-white/60 rounded-full border border-white/80 p-1 flex shadow-sm w-full md:w-auto">
              <Button 
                variant="ghost" 
                size="sm" 
                className={cn(
                  "flex-1 md:flex-none rounded-full h-8 px-3 md:px-4 text-[11px] md:text-xs font-black transition-all",
                  view === 'week' ? "bg-white text-primary shadow-sm" : "text-primary/40 hover:text-primary"
                )}
                onClick={() => setView('week')}
              >
                Semana
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className={cn(
                  "flex-1 md:flex-none rounded-full h-8 px-3 md:px-4 text-[11px] md:text-xs font-black transition-all",
                  view === 'month' ? "bg-white text-primary shadow-sm" : "text-primary/40 hover:text-primary"
                )}
                onClick={() => setView('month')}
              >
                Mês
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className={cn(
                  "flex-1 md:flex-none rounded-full h-8 px-3 md:px-4 text-[11px] md:text-xs font-black transition-all",
                  view === 'day' ? "bg-white text-primary shadow-sm" : "text-primary/40 hover:text-primary"
                )}
                onClick={() => setView('day')}
              >
                Dia
              </Button>
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-hide relative bg-white/20">
          {view !== 'month' ? (
            <div className={cn(
              "relative",
              view === 'week' && "min-w-[900px] sm:min-w-0"
            )}>
              {/* Header de Dias */}
              <div className={cn(
                "sticky top-0 z-30 grid bg-white/80 backdrop-blur-md border-b border-white/40 shadow-sm",
                view === 'week' ? "grid-cols-[60px_repeat(7,1fr)] md:grid-cols-[80px_repeat(7,1fr)]" : "grid-cols-[60px_1fr] md:grid-cols-[80px_1fr]"
              )}>
                <div className="h-16 md:h-24 flex items-end justify-end p-2 md:p-4 border-r border-white/20 sticky left-0 z-40 bg-white/80">
                  <span className="text-[8px] md:text-[10px] font-black text-primary/30 uppercase tracking-tighter">GMT-03</span>
                </div>
                {weekDays.map((day, i) => {
                  const isToday = day.toDateString() === today.toDateString();
                  return (
                    <div key={i} className={cn(
                      "h-16 md:h-24 flex flex-col items-center justify-center border-l border-teal-/50",
                      isToday && "bg-primary/5"
                    )}>
                      <span className={cn(
                        "text-[9px] md:text-[11px] font-black uppercase tracking-widest mb-1 md:mb-2",
                        isToday ? "text-primary" : "text-primary/40"
                      )}>
                        {view === 'day' ? day.toLocaleDateString("pt-BR", { weekday: 'long' }) : dayNamesShort[i]}
                      </span>
                      <div className={cn(
                        "w-8 h-8 md:w-12 md:h-12 rounded-full flex items-center justify-center text-sm md:text-xl font-black transition-all",
                        isToday ? "gradient-primary text-white shadow-lg shadow-primary/20 scale-110" : "text-primary/70"
                      )}>
                        {day.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Grid de Horários */}
              <div className={cn(
                "grid relative",
                view === 'week' ? "grid-cols-[60px_repeat(7,1fr)] md:grid-cols-[80px_repeat(7,1fr)]" : "grid-cols-[60px_1fr] md:grid-cols-[80px_1fr]"
              )} style={{ height: (timelineEndHour - timelineStartHour + 1) * slotHeight }}>
                <div className="border-r border-white/20 relative sticky left-0 z-20 bg-white/80 shadow-[10px_0_15px_-5px_rgba(0,0,0,0.02)]">
                  {hourLabels.map((hour, idx) => (
                    <div key={hour} className="absolute right-1 md:right-3 -translate-y-1/2" style={{ top: idx * slotHeight }}>
                      <span className="text-[9px] md:text-[11px] font-black text-primary/30 tracking-tighter">
                        {hour === timelineStartHour ? "" : `${hour.toString().padStart(2, "0")}:00`}
                      </span>
                    </div>
                  ))}
                </div>

                {weekDays.map((day, dayIdx) => {
                  const daySessions = weekSessionsByDay[dayIdx];
                  const isTodayColumn = day.toDateString() === today.toDateString();
                  
                  return (
                    <div key={dayIdx} className={cn(
                      "relative border-l border-teal- group transition-colors",
                      dayIdx % 2 !== 0 && "bg-teal-/50",
                      isTodayColumn && "bg-primary/[0.05]"
                    )}>
                      {hourLabels.map((_, idx) => (
                        <div key={idx}>
                          {/* Linha da Hora Cheia - Contraste Máximo */}
                          <div className="absolute left-0 right-0 border-t border-teal-/30" style={{ top: idx * slotHeight }} />
                          {/* Linha pontilhada de 30 min - Bem Marcada */}
                          {idx < hourLabels.length - 1 && (
                            <div className="absolute left-0 right-0 border-t border-dotted border-teal-/40" style={{ top: idx * slotHeight + (slotHeight / 2) }} />
                          )}
                        </div>
                      ))}

                      {daySessions.map((session) => {
                        const sessionDate = new Date(session.scheduled_at);
                        const minutesFromStart = (sessionDate.getHours() - timelineStartHour) * 60 + sessionDate.getMinutes();
                        const top = (minutesFromStart / 60) * slotHeight;
                        const height = (session.duration_minutes / 60) * slotHeight;
                        const statusCfg = SESSION_STATUS[session.status];
                        
                        return (
                          <div
                            key={session.id}
                            className="absolute left-1 right-1 z-10 animate-slide-up"
                            style={{ top, height }}
                            onClick={() => openSessionDetailsModal(session)}
                          >
                            <div className={cn(
                              "h-full rounded-xl p-3 border-l-[6px] shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-95 transition-all cursor-pointer overflow-hidden backdrop-blur-md",
                              session.status === "completed" ? "bg-emerald-50/90 border-emerald-400" :
                              session.status === "missed" ? "bg-rose-50/90 border-rose-400" :
                              "bg-teal-/90 border-teal-"
                            )}>
                              <div className="flex flex-col h-full">
                                <div className="flex items-start justify-between gap-1">
                                  <h4 className={cn(
                                    "text-xs md:text-sm font-black truncate leading-tight uppercase tracking-tight",
                                    session.status === "completed" ? "text-emerald-700" :
                                    session.status === "missed" ? "text-rose-700" :
                                    "text-teal-"
                                  )}>
                                    {session.patient?.full_name}
                                  </h4>
                                  {session.session_type === "online" && <Video className="w-3 h-3 text-primary/40 shrink-0" />}
                                </div>
                                <div className="mt-auto flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-primary/40">
                                    {formatTime(session.scheduled_at)}
                                  </span>
                                  <Badge className={cn(
                                    "text-[9px] h-4 px-2 py-0 border-0 font-black uppercase tracking-tighter",
                                    statusCfg.color
                                  )}>
                                    {statusCfg.label}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {showNowLine && isTodayColumn && (
                        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowLineTop }}>
                          <div className="h-0.5 w-full bg-rose-500 shadow-sm relative">
                            <div className="absolute -left-1.5 -top-1 w-3 h-3 rounded-full bg-rose-500 border-2 border-white shadow-md" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Month View */
            <div className="grid grid-cols-7 h-full border-l border-teal-">
              {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((d, i) => (
                <div key={i} className="h-10 flex items-center justify-center bg-white/60 border-b border-r border-teal- text-[10px] font-black text-primary/40 uppercase tracking-widest sticky top-0 z-20 shadow-sm">
                  {d}
                </div>
              ))}
              {monthDays.map((day, i) => {
                const daySessions = sessions.filter(s => new Date(s.scheduled_at).toDateString() === day.toDateString());
                const isToday = day.toDateString() === today.toDateString();
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                
                return (
                  <div key={i} className={cn(
                    "min-h-[120px] border-r border-b border-teal- p-2 transition-colors hover:bg-white/40",
                    !isCurrentMonth && "bg-black/[0.02] opacity-40",
                    isToday && "bg-primary/[0.05]"
                  )}>
                    <div className="flex justify-center mb-2">
                      <span className={cn(
                        "w-8 h-8 flex items-center justify-center rounded-full text-xs font-black shadow-sm",
                        isToday ? "gradient-primary text-white scale-110" : "text-primary/60 bg-white/40"
                      )}>
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {daySessions.slice(0, 3).map(s => (
                        <div key={s.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-teal- text-teal- truncate cursor-pointer hover:scale-105 transition-transform" onClick={() => openSessionDetailsModal(s)}>
                          {formatTime(s.scheduled_at)} {s.patient?.full_name}
                        </div>
                      ))}
                      {daySessions.length > 3 && (
                        <div className="text-[9px] font-black text-primary/40 text-center uppercase tracking-tighter">
                          + {daySessions.length - 3} sessões
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Action Button for Mobile */}
        <SubscriptionGate>
          <Button
            className="md:hidden fixed bottom-[90px] right-4 z-50 w-14 h-14 rounded-full gradient-primary shadow-xl shadow-primary/30 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all border-2 border-white/20"
            onClick={() => setShowNewSession(true)}
          >
            <Plus className="w-6 h-6" />
          </Button>
        </SubscriptionGate>
      </main>

      {/* New Session Dialog */}
      <Dialog open={showNewSession} onOpenChange={setShowNewSession}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-0 rounded-[32px] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col h-[90vh] [&>button.absolute]:hidden">

          {/* ── HEADER ── */}
          <div className="h-24 bg-primary relative overflow-hidden shrink-0">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-24 -mt-24 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full -ml-16 -mb-16 blur-2xl" />
            <div className="absolute inset-0 flex items-center px-6 gap-4 z-10">
              <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center border border-white/20 shrink-0">
                <Plus className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-lg font-bold text-white tracking-tight">Agendar Sessão</DialogTitle>
                <p className="text-[10px] text-white/60 font-medium mt-0.5">Preencha os dados do atendimento</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewSession(false)}
                className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── SCROLLABLE CONTENT ── */}
          <ScrollArea className="flex-1 min-h-0">
            <form id="new-session-form" onSubmit={handleCreateSession}>
              <div className="px-6 py-5 space-y-4">

                {/* Paciente */}
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-semibold text-primary/50 uppercase tracking-widest ml-1">Paciente *</Label>
                  <select
                    className="flex h-10 w-full rounded-xl border border-primary/15 bg-white px-4 text-sm font-medium text-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    value={newSession.patient_id}
                    onChange={(e) => setNewSession(p => ({ ...p, patient_id: e.target.value }))}
                    required
                  >
                    <option value="">Selecione um paciente...</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </div>

                {/* Data e Hora */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-semibold text-primary/50 uppercase tracking-widest ml-1">Data *</Label>
                    <Input
                      type="date"
                      className="h-10 rounded-xl border-primary/15 text-sm font-medium"
                      value={newSession.scheduled_at}
                      onChange={(e) => setNewSession(p => ({ ...p, scheduled_at: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-semibold text-primary/50 uppercase tracking-widest ml-1">Hora *</Label>
                    <Input
                      type="time"
                      className="h-10 rounded-xl border-primary/15 text-sm font-medium"
                      value={newSession.scheduled_time}
                      onChange={(e) => setNewSession(p => ({ ...p, scheduled_time: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* Duração e Valor */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-semibold text-primary/50 uppercase tracking-widest ml-1">Duração (min)</Label>
                    <Input
                      type="number"
                      className="h-10 rounded-xl border-primary/15 text-sm font-medium"
                      value={newSession.duration_minutes}
                      onChange={(e) => setNewSession(p => ({ ...p, duration_minutes: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-semibold text-primary/50 uppercase tracking-widest ml-1">Valor (R$)</Label>
                    <Input
                      type="number"
                      placeholder="Padrão do paciente"
                      className="h-10 rounded-xl border-primary/15 text-sm font-medium"
                      value={newSession.session_price}
                      onChange={(e) => setNewSession(p => ({ ...p, session_price: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Opções extras */}
                <div className="space-y-3 pt-3 border-t border-primary/8">
                  <div className="flex items-center gap-2.5">
                    <Checkbox id="is_package" checked={newSession.is_package}
                      onCheckedChange={(checked) => setNewSession(p => ({ ...p, is_package: !!checked }))} />
                    <Label htmlFor="is_package" className="text-xs font-medium text-primary/70 cursor-pointer">É um pacote de sessões?</Label>
                  </div>

                  {newSession.is_package && (
                    <div className="pl-6 space-y-3 animate-in fade-in slide-in-from-left-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[9px] font-semibold text-primary/40 uppercase tracking-widest ml-1">Quantas sessões?</Label>
                          <Input type="number" className="h-9 rounded-xl border-primary/15 text-sm font-medium"
                            value={newSession.package_sessions}
                            onChange={(e) => setNewSession(p => ({ ...p, package_sessions: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] font-semibold text-primary/40 uppercase tracking-widest ml-1">Desconto (%)</Label>
                          <Input type="number" className="h-9 rounded-xl border-primary/15 text-sm font-medium"
                            value={newSession.discount_percentage}
                            onChange={(e) => setNewSession(p => ({ ...p, discount_percentage: e.target.value }))} />
                        </div>
                      </div>
                      <div className="bg-primary/5 rounded-xl p-3 border border-primary/10 flex items-center justify-between">
                        <span className="text-[9px] font-semibold text-primary/40 uppercase tracking-widest">Total do Pacote</span>
                        <span className="text-sm font-bold text-primary">
                          {(() => {
                            const p = patients.find(pat => pat.id === newSession.patient_id);
                            const price = parseFloat(newSession.session_price) || p?.session_price || profile?.session_price_default || 0;
                            const total = price * parseInt(newSession.package_sessions || "1");
                            const disc = total * (parseFloat(newSession.discount_percentage || "0") / 100);
                            return formatCurrency(total - disc);
                          })()}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2.5">
                    <Checkbox id="is_recurring" checked={newSession.is_recurring}
                      onCheckedChange={(checked) => setNewSession(p => ({ ...p, is_recurring: !!checked }))} />
                    <Label htmlFor="is_recurring" className="text-xs font-medium text-primary/70 cursor-pointer">Repetir este agendamento?</Label>
                  </div>

                  {newSession.is_recurring && (
                    <div className="pl-6 space-y-3 animate-in fade-in slide-in-from-left-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[9px] font-semibold text-primary/40 uppercase tracking-widest ml-1">Frequência</Label>
                          <select className="flex h-9 w-full rounded-xl border border-primary/15 bg-white px-3 text-sm font-medium focus:ring-primary/20 outline-none"
                            value={newSession.recurrence_period}
                            onChange={(e) => setNewSession(p => ({ ...p, recurrence_period: e.target.value as any }))}>
                            <option value="weekly">Semanal</option>
                            <option value="fortnightly">Quinzenal</option>
                            <option value="monthly">Mensal</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] font-semibold text-primary/40 uppercase tracking-widest ml-1">Repetir quantas vezes?</Label>
                          <div className="flex items-center gap-2">
                            <Input type="number" disabled={newSession.is_indefinite}
                              className="h-9 rounded-xl border-primary/15 text-sm font-medium w-20"
                              value={newSession.recurrence_count}
                              onChange={(e) => setNewSession(p => ({ ...p, recurrence_count: e.target.value }))} />
                            <div className="flex items-center gap-1.5">
                              <Checkbox id="is_indefinite" checked={newSession.is_indefinite}
                                onCheckedChange={(checked) => setNewSession(p => ({ ...p, is_indefinite: !!checked }))} />
                              <Label htmlFor="is_indefinite" className="text-[10px] font-medium text-primary/60 cursor-pointer">Sem fim</Label>
                            </div>
                          </div>
                        </div>
                      </div>
                      {newSession.is_indefinite && (
                        <p className="text-[9px] text-muted-foreground/50 italic ml-1">* Serão criadas 12 sessões inicialmente.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </form>
          </ScrollArea>

          {/* ── FIXED FOOTER ── */}
          <div className="shrink-0 px-5 py-3.5 bg-white border-t border-primary/8 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] flex gap-2">
            <Button type="button" variant="ghost"
              className="rounded-full h-10 px-5 font-semibold text-xs border border-primary/20 text-primary/60 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-all flex-1"
              onClick={() => setShowNewSession(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="new-session-form"
              className="gradient-primary text-white rounded-full h-10 px-8 font-semibold text-xs shadow-md shadow-primary/20 active:scale-95 transition-all flex-1"
              disabled={saving}>
              {saving ? "Salvando..." : "Confirmar Agendamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Session Details Dialog */}
      <Dialog open={showSessionDetails} onOpenChange={setShowSessionDetails}>
        <DialogContent className={cn(
          "p-0 overflow-hidden border-0 rounded-[32px] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col transition-all",
          isRescheduling ? "sm:max-w-[850px] h-[90vh]" : "sm:max-w-lg h-auto max-h-[90vh]"
        )}>
          {selectedSessionDetails && (
            <>
              {/* ── ZONE 1: FIXED HEADER ── */}
              {!isRescheduling ? (
                <>
                  {/* Blue hero header — more compact */}
                  <div className="h-28 bg-primary relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-24 -mt-24 blur-3xl" />
                    <div className="absolute bottom-0 left-0 w-36 h-36 bg-black/10 rounded-full -ml-18 -mb-18 blur-2xl" />
                    <div className="absolute top-4 left-5 right-5 flex justify-between items-center z-20">
                      <Button variant="ghost" size="icon"
                        className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-rose-50 hover:border-rose-400 hover:text-rose-500 transition-all active:scale-90"
                        onClick={handleDeleteSession}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <Badge className={cn("rounded-full px-3 py-1 text-[9px] font-bold tracking-wider border-0 shadow-lg",
                        SESSION_STATUS[selectedSessionDetails.status].color)}>
                        {SESSION_STATUS[selectedSessionDetails.status].label}
                      </Badge>
                    </div>
                  </div>
                  {/* Overlapping avatar — smaller and more refined */}
                  <div className="relative h-0 z-40 shrink-0">
                    <div className="absolute -top-8 left-6">
                      <Avatar className="w-16 h-16 rounded-2xl shadow-xl border-4 border-white ring-2 ring-black/5">
                        <AvatarFallback className="bg-primary text-white text-xl font-bold rounded-2xl">
                          {selectedSessionDetails.patient?.full_name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </div>
                </>
              ) : (
                /* Reschedule compact header */
                <div className="p-5 border-b border-primary/10 bg-white flex items-center justify-between shrink-0">
                  <div>
                    <p className="text-xl font-black text-primary uppercase tracking-tight">Remarcar Sessão</p>
                    <p className="text-xs font-bold text-muted-foreground/60 mt-0.5 uppercase tracking-widest">Selecione um novo horário livre</p>
                  </div>
                  <div className="flex items-center bg-white/80 rounded-full border border-primary/20 p-1 shadow-sm">
                    <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full"
                      onClick={(e) => { e.preventDefault(); setRescheduleWeekOffset(p => p - 1); }}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-[9px] font-black px-2 uppercase tracking-widest text-primary/60">
                      {rescheduleWeekDays[0].toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })} – {rescheduleWeekDays[5].toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
                    </span>
                    <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full"
                      onClick={(e) => { e.preventDefault(); setRescheduleWeekOffset(p => p + 1); }}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ── ZONE 2: SCROLLABLE CONTENT ── */}
              {!isRescheduling ? (
                <ScrollArea className="flex-1 min-h-0">
                  <div className="px-6 pt-10 pb-4 space-y-5">
                    {/* Patient info */}
                    <div className="flex flex-col gap-3">
                      <div>
                        <h2 className="text-lg font-bold text-primary tracking-tight leading-tight">
                          {selectedSessionDetails.patient?.full_name}
                        </h2>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge className={cn("rounded-full px-3 py-0.5 text-[9px] font-bold tracking-wide border-0",
                            SESSION_STATUS[selectedSessionDetails.status].color)}>
                            {SESSION_STATUS[selectedSessionDetails.status].label}
                          </Badge>
                          <span className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {new Date(selectedSessionDetails.scheduled_at).toLocaleDateString("pt-BR", { weekday: 'long', day: '2-digit', month: 'long' })}
                          </span>
                        </div>
                      </div>
                      <Link href={`/dashboard/patients/${selectedSessionDetails.patient_id}`} className="w-full">
                        <Button variant="ghost" className="w-full rounded-full h-9 text-xs font-semibold border border-primary/15 text-primary/70 hover:bg-primary/5 hover:text-primary transition-all flex items-center gap-2">
                          <User className="w-3.5 h-3.5" />
                          Acessar perfil do paciente
                        </Button>
                      </Link>
                    </div>

                    {/* Session meta — compact grid */}
                    <div className="grid grid-cols-4 gap-px bg-primary/8 rounded-2xl overflow-hidden border border-primary/10">
                      <div className="bg-white px-3 py-3 space-y-0.5">
                        <p className="text-[9px] font-semibold text-primary/40 uppercase tracking-widest">Início</p>
                        <p className="text-base font-bold text-primary">{formatTime(selectedSessionDetails.scheduled_at)}</p>
                      </div>
                      <div className="bg-white px-3 py-3 space-y-0.5">
                        <p className="text-[9px] font-semibold text-primary/40 uppercase tracking-widest">Duração</p>
                        <p className="text-base font-bold text-primary">{selectedSessionDetails.duration_minutes}<span className="text-xs font-normal text-primary/50 ml-0.5">min</span></p>
                      </div>
                      <div className="bg-white px-3 py-3 space-y-0.5">
                        <p className="text-[9px] font-semibold text-primary/40 uppercase tracking-widest">Tipo</p>
                        <p className="text-sm font-semibold text-primary/80 capitalize">{selectedSessionDetails.session_type}</p>
                      </div>
                      <div className="bg-white px-3 py-3 space-y-0.5">
                        <p className="text-[9px] font-semibold text-primary/40 uppercase tracking-widest">Valor</p>
                        <p className="text-sm font-bold text-emerald-600">
                          {selectedSessionDetails.session_price ? formatCurrency(selectedSessionDetails.session_price) : "Padrão"}
                        </p>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              ) : (
                /* ── Rescheduling grid — independent scroll window ── */
                <div className="flex-1 min-h-0 overflow-auto p-4 bg-white/30">
                  <div className="overflow-auto h-full rounded-2xl border border-primary/20 bg-white shadow-inner">
                    <div className="grid grid-cols-[56px_repeat(6,1fr)] min-w-[680px] gap-px bg-primary/10">
                      {/* Grid header */}
                      <div className="bg-white h-10 border-b border-primary/10 sticky top-0 left-0 z-30" />
                      {rescheduleWeekDays.map((day, i) => (
                        <div key={i} className={cn(
                          "bg-white h-10 border-b border-primary/10 flex flex-col items-center justify-center sticky top-0 z-20",
                          day.toDateString() === new Date().toDateString() && "bg-primary/5"
                        )}>
                          <span className="text-[8px] font-black text-primary/40 uppercase tracking-widest">{["SEG","TER","QUA","QUI","SEX","SÁB"][i]}</span>
                          <span className="text-xs font-black text-primary">{day.getDate()}</span>
                        </div>
                      ))}

                      {/* Grid rows — 30min intervals 8:00–20:30 */}
                      {Array.from({ length: 26 }, (_, i) => ({ hour: Math.floor(i / 2) + 8, minutes: (i % 2) * 30 })).map(({ hour, minutes }) => (
                        <React.Fragment key={`${hour}-${minutes}`}>
                          <div className={cn(
                            "bg-white/80 h-10 flex items-center justify-center border-r border-primary/10 sticky left-0 z-10",
                            minutes !== 0 && "opacity-40"
                          )}>
                            <span className="text-[9px] font-black text-primary/40">{hour}:{minutes.toString().padStart(2,'0')}</span>
                          </div>
                          {rescheduleWeekDays.map((day, dayIdx) => {
                            const isOccupied = therapistSessionsForReschedule.some(s => {
                              const sDate = new Date(s.scheduled_at);
                              return sDate.toDateString() === day.toDateString() && sDate.getHours() === hour && Math.abs(sDate.getMinutes() - minutes) < 30;
                            });
                            const [selH, selM] = rescheduleTime ? rescheduleTime.split(':').map(Number) : [-1,-1];
                            const isSelected = rescheduleDate === day.toISOString().split('T')[0] && selH === hour && selM === minutes;
                            return (
                              <div key={dayIdx}
                                onClick={() => !isOccupied && handleSlotClickReschedule(day, hour, minutes)}
                                className={cn(
                                  "h-10 relative border-r border-b border-primary/10 transition-all cursor-pointer",
                                  isOccupied ? "bg-red-50/40 cursor-not-allowed" : "hover:bg-primary/5",
                                  isSelected && "bg-primary/15 ring-2 ring-primary ring-inset z-10",
                                  minutes !== 0 && "border-b-dashed border-b-primary/5"
                                )}>
                                {isOccupied && (
                                  <div className="absolute inset-0.5 rounded bg-red-100/70 flex items-center justify-center">
                                    <span className="text-[6px] font-black text-red-600 uppercase">Ocupado</span>
                                  </div>
                                )}
                                {isSelected && (
                                  <div className="absolute inset-0.5 rounded bg-primary/20 border border-primary/30 flex items-center justify-center">
                                    <Check className="w-3 h-3 text-primary" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── ZONE 3: FIXED FOOTER ── */}
              <div className="shrink-0 px-5 py-3.5 bg-white border-t border-primary/8 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
                {isRescheduling ? (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="flex flex-col min-w-0">
                        <p className="text-[8px] font-semibold text-primary/40 uppercase tracking-widest">Horário Selecionado</p>
                        <p className="text-sm font-bold text-primary truncate">
                          {rescheduleDate
                            ? new Date(rescheduleDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
                            : "Selecione na grade"}
                          {rescheduleTime && ` às ${rescheduleTime}`}
                        </p>
                      </div>
                      {rescheduleTime && (
                        <div className="flex flex-col gap-1 pl-4 border-l border-primary/10 shrink-0">
                          <p className="text-[8px] font-semibold text-primary/40 uppercase tracking-widest">Ajuste Fino</p>
                          <input type="time" value={rescheduleTime}
                            onChange={(e) => setRescheduleTime(e.target.value)}
                            className="bg-white border border-primary/20 rounded-lg px-2 py-1 text-xs font-bold text-primary focus:ring-2 focus:ring-primary/20 outline-none h-7 w-28" />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="ghost" className="rounded-full h-9 px-4 font-semibold text-xs hover:bg-rose-50 hover:text-rose-500 transition-all"
                        onClick={() => setIsRescheduling(false)}>
                        Cancelar
                      </Button>
                      <Button className="gradient-primary text-white rounded-full h-9 px-6 font-semibold text-xs shadow-md shadow-primary/20 active:scale-95 transition-all"
                        onClick={handleReschedule}
                        disabled={saving || !rescheduleDate || !rescheduleTime}>
                        {saving ? "Remarcando..." : "Confirmar"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  selectedSessionDetails.status === "scheduled" && (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        {new Date(selectedSessionDetails.scheduled_at) < new Date() ? (
                          <Button className="rounded-full bg-emerald-600 text-white font-semibold text-xs h-10 shadow-md shadow-emerald-900/15 hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                            onClick={handleStartSession} disabled={saving}>
                            <CheckCircle className="w-3.5 h-3.5" />Confirmar Presença
                          </Button>
                        ) : (
                          <Button className="rounded-full gradient-primary text-white font-semibold text-xs h-10 shadow-md shadow-primary/20 hover:shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                            onClick={handleStartSession}
                            disabled={saving || !canMarkAsCompleted(selectedSessionDetails.scheduled_at)}>
                            <Play className="w-3.5 h-3.5 fill-current" />Iniciar Sessão
                          </Button>
                        )}
                        <Button variant="outline" className="rounded-full border-rose-200 text-rose-500 font-semibold text-xs h-10 hover:bg-rose-50 active:scale-95 transition-all"
                          onClick={() => handleUpdateStatus("missed")} disabled={saving}>
                          Faltou
                        </Button>
                      </div>
                      <Button variant="ghost" className="w-full rounded-full font-semibold text-xs h-9 border border-primary/15 text-primary/70 hover:bg-primary/5 hover:text-primary transition-all flex items-center justify-center gap-1.5"
                        onClick={() => setIsRescheduling(true)}>
                        <Calendar className="w-3.5 h-3.5" />Remarcar Sessão
                      </Button>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Session Manager Modal */}
      <Dialog open={showSessionManager} onOpenChange={setShowSessionManager}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden border-0 rounded-[32px] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col h-[90vh] [&>button.absolute]:hidden">
          {selectedSessionDetails && (
            <>
              {/* ── HEADER ── */}
              <div className="h-28 bg-primary relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-24 -mt-24 blur-3xl" />
                <div className="absolute bottom-0 left-0 w-36 h-36 bg-black/10 rounded-full -ml-18 -mb-18 blur-2xl" />
                <div className="absolute inset-0 flex items-center px-6 gap-4 z-10">
                  <Avatar className="w-12 h-12 rounded-2xl border-2 border-white/30 shrink-0">
                    <AvatarFallback className="bg-white/20 text-white text-lg font-bold rounded-2xl backdrop-blur-md">
                      {selectedSessionDetails.patient?.full_name?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-bold text-white tracking-tight truncate">
                      {selectedSessionDetails.patient?.full_name}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className="bg-white/20 text-white border-0 rounded-full px-2.5 py-0.5 text-[9px] font-semibold tracking-wide backdrop-blur-md">
                        Em Sessão
                      </Badge>
                      <span className="text-xs text-white/70 flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        {sessionStartTime?.toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSessionManager(false)}
                    className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* ── SCROLLABLE CONTENT ── */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 py-5 space-y-6">

                  {/* Notas de Evolução */}
                  <div className="space-y-2">
                    <Label className="text-[9px] font-semibold text-primary/70 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                      <Pencil className="w-3 h-3" />
                      Evolução da Sessão
                    </Label>
                    <textarea
                      className="w-full h-48 rounded-2xl border border-primary/15 bg-white p-4 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground/40 resize-none"
                      placeholder="Descreva aqui o que ocorreu durante a sessão..."
                      value={sessionNotes}
                      onChange={(e) => setSessionNotes(e.target.value)}
                    />
                  </div>

                  {/* Mood Sliders */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Humor do Paciente */}
                    <div className="space-y-2">
                      <Label className="text-[9px] font-semibold text-primary/70 uppercase tracking-widest ml-1">Humor do Paciente</Label>
                      <div className="bg-white p-4 rounded-2xl border border-primary/15 space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <Frown className={cn("w-6 h-6 transition-all", moodHappySad <= 3 ? "text-rose-500 scale-125" : "text-primary/25")} />
                          <span className="text-xl font-bold text-primary">{moodHappySad}</span>
                          <Smile className={cn("w-6 h-6 transition-all", moodHappySad >= 8 ? "text-emerald-500 scale-125" : "text-primary/25")} />
                        </div>
                        {/* Slider with visible track */}
                        <div className="relative py-1">
                          <div className="absolute h-2 rounded-full bg-primary/15 left-0 right-0 top-1/2 -translate-y-1/2" />
                          <input
                            type="range" min="1" max="10" step="1"
                            value={moodHappySad}
                            onChange={(e) => setMoodHappySad(parseInt(e.target.value))}
                            className="relative w-full h-2 rounded-full appearance-none cursor-pointer accent-primary bg-transparent"
                          />
                        </div>
                        <div className="flex justify-between text-[9px] font-semibold text-primary/60 uppercase tracking-wide">
                          <span>Triste</span>
                          <span>Feliz</span>
                        </div>
                      </div>
                    </div>

                    {/* Nível de Agitação */}
                    <div className="space-y-2">
                      <Label className="text-[9px] font-semibold text-primary/70 uppercase tracking-widest ml-1">Nível de Agitação</Label>
                      <div className="bg-white p-4 rounded-2xl border border-primary/15 space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <Zap className={cn("w-6 h-6 transition-all", moodAnxiousCalm <= 3 ? "text-amber-500 scale-125 rotate-12" : "text-primary/25")} />
                          <span className="text-xl font-bold text-primary">{moodAnxiousCalm}</span>
                          <Waves className={cn("w-6 h-6 transition-all", moodAnxiousCalm >= 8 ? "text-sky-500 scale-125" : "text-primary/25")} />
                        </div>
                        {/* Slider with visible track */}
                        <div className="relative py-1">
                          <div className="absolute h-2 rounded-full bg-primary/15 left-0 right-0 top-1/2 -translate-y-1/2" />
                          <input
                            type="range" min="1" max="10" step="1"
                            value={moodAnxiousCalm}
                            onChange={(e) => setMoodAnxiousCalm(parseInt(e.target.value))}
                            className="relative w-full h-2 rounded-full appearance-none cursor-pointer accent-primary bg-transparent"
                          />
                        </div>
                        <div className="flex justify-between text-[9px] font-semibold text-primary/60 uppercase tracking-wide">
                          <span>Ansioso</span>
                          <span>Calmo</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="bg-amber-50 rounded-xl p-3.5 flex gap-3 border border-amber-100">
                    <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed font-medium">
                      As notas de evolução são armazenadas de forma segura. Em breve, transcrição automática de áudio com IA estará disponível.
                    </p>
                  </div>
                </div>
              </ScrollArea>

              {/* ── FIXED FOOTER ── */}
              <div className="shrink-0 px-5 py-3.5 bg-white border-t border-primary/8 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
                <Button
                  onClick={handleFinishSession}
                  disabled={saving}
                  className="w-full gradient-primary text-white rounded-full h-10 font-semibold text-sm shadow-md shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  {saving ? "Finalizando..." : "Finalizar Sessão"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Series Action Dialog (Delete/Reschedule) */}
      <Dialog open={showSeriesDialog} onOpenChange={setShowSeriesDialog}>
        <DialogContent className="sm:max-w-md rounded-[32px] border-white/40 backdrop-blur-2xl bg-white/90 shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-primary tracking-tight uppercase">
              {seriesActionType === 'delete' ? 'Excluir Sessão' : 'Reagendar Sessão'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <p className="text-base font-bold text-muted-foreground/80 leading-relaxed">
              Esta sessão pertence a uma série. O que você deseja fazer?
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <Button 
              className="h-14 rounded-full font-black text-sm tracking-widest bg-teal- text-teal- hover:bg-teal- border-0"
              onClick={() => seriesActionType === 'delete' ? deleteSeries(false) : rescheduleSeries(false)}
              disabled={saving}
            >
              APENAS ESTA SESSÃO
            </Button>
            <Button 
              className="h-14 rounded-full font-black text-sm tracking-widest gradient-primary text-white shadow-lg active:scale-95 transition-all"
              onClick={() => seriesActionType === 'delete' ? deleteSeries(true) : rescheduleSeries(true)}
              disabled={saving}
            >
              ESTA E AS PRÓXIMAS
            </Button>
            <Button 
              variant="ghost" 
              className="h-12 rounded-full font-black text-xs text-muted-foreground"
              onClick={() => setShowSeriesDialog(false)}
            >
              CANCELAR
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
