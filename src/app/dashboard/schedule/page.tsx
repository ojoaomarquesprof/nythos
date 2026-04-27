"use client";

import { useEffect, useState, useMemo } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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

      let updateError;
      try {
        const { error } = await supabase
          .from("sessions")
          .update({ 
            scheduled_at: newScheduledAt.toISOString(),
            status: "rescheduled"
          })
          .eq("id", selectedSessionDetails.id);
        updateError = error;
      } catch (e) {
        // Fallback se o ENUM do banco não aceitar 'rescheduled'
        const { error } = await supabase
          .from("sessions")
          .update({ 
            scheduled_at: newScheduledAt.toISOString(),
            status: "scheduled"
          })
          .eq("id", selectedSessionDetails.id);
        updateError = error;
      }

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
          const updates = futureSessions.map(async (s) => {
            const sDate = new Date(s.scheduled_at);
            const nextDate = new Date(sDate.getTime() + diffMs);
            const nextDateIso = nextDate.toISOString();
            
            // Atualizar sessão
            try {
              const { error } = await supabase
                .from("sessions")
                .update({ 
                  scheduled_at: nextDateIso,
                  status: "rescheduled"
                })
                .eq("id", s.id);
              if (error) throw error;
            } catch (e) {
              await supabase
                .from("sessions")
                .update({ 
                  scheduled_at: nextDateIso,
                  status: "scheduled"
                })
                .eq("id", s.id);
            }

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
        // Apenas esta sessão (da série)
        let updateError;
        try {
          const { error } = await supabase
            .from("sessions")
            .update({ 
              scheduled_at: newScheduledAt.toISOString(),
              status: "rescheduled"
            })
            .eq("id", selectedSessionDetails.id);
          updateError = error;
        } catch (e) {
          const { error } = await supabase
            .from("sessions")
            .update({ 
              scheduled_at: newScheduledAt.toISOString(),
              status: "scheduled"
            })
            .eq("id", selectedSessionDetails.id);
          updateError = error;
        }
        
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
    <div className="flex h-[calc(100vh-80px)] w-full overflow-hidden animate-fade-in bg-white/30">
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
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white/60 backdrop-blur-md">
        <header className="h-20 border-b border-white/40 flex items-center justify-between px-8 bg-white/40 shrink-0">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-8 h-8 text-primary" />
              <h1 className="text-2xl font-black text-primary tracking-tight hidden sm:block">Agenda</h1>
            </div>

            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                className="rounded-full border-primary/20 font-bold hover:bg-primary/5 active:scale-95 transition-all h-10 px-6"
                onClick={() => {
                  const now = new Date();
                  setCurrentDate(now);
                  setSelectedDate(now);
                }}
              >
                Hoje
              </Button>
              <div className="flex items-center bg-white/60 rounded-full border border-white/80 p-1 shadow-sm">
                <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => navigate(-1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => navigate(1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <h2 className="text-xl font-black text-primary/80 capitalize">{monthYear}</h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/60 rounded-full border border-white/80 p-1 flex shadow-sm">
              <Button 
                variant="ghost" 
                size="sm" 
                className={cn(
                  "rounded-full h-8 px-4 text-xs font-black transition-all",
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
                  "rounded-full h-8 px-4 text-xs font-black transition-all",
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
                  "rounded-full h-8 px-4 text-xs font-black transition-all",
                  view === 'day' ? "bg-white text-primary shadow-sm" : "text-primary/40 hover:text-primary"
                )}
                onClick={() => setView('day')}
              >
                Dia
              </Button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto scrollbar-hide relative bg-white/20">
          {view !== 'month' ? (
            <div className={cn(
              "relative",
              view === 'week' && "min-w-[900px] sm:min-w-0"
            )}>
              {/* Header de Dias */}
              <div className={cn(
                "sticky top-0 z-30 grid bg-white/80 backdrop-blur-md border-b border-white/40 shadow-sm",
                view === 'week' ? "grid-cols-[80px_repeat(7,1fr)]" : "grid-cols-[80px_1fr]"
              )}>
                <div className="h-24 flex items-end justify-end p-4 border-r border-white/20 sticky left-0 z-40 bg-white/80">
                  <span className="text-[10px] font-black text-primary/30 uppercase tracking-tighter">GMT-03</span>
                </div>
                {weekDays.map((day, i) => {
                  const isToday = day.toDateString() === today.toDateString();
                  return (
                    <div key={i} className={cn(
                      "h-24 flex flex-col items-center justify-center border-l border-indigo-100/50",
                      isToday && "bg-primary/5"
                    )}>
                      <span className={cn(
                        "text-[11px] font-black uppercase tracking-widest mb-2",
                        isToday ? "text-primary" : "text-primary/40"
                      )}>
                        {view === 'day' ? day.toLocaleDateString("pt-BR", { weekday: 'long' }) : dayNamesShort[i]}
                      </span>
                      <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center text-xl font-black transition-all",
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
                view === 'week' ? "grid-cols-[80px_repeat(7,1fr)]" : "grid-cols-[80px_1fr]"
              )} style={{ height: (timelineEndHour - timelineStartHour + 1) * slotHeight }}>
                <div className="border-r border-white/20 relative sticky left-0 z-20 bg-white/80 shadow-[10px_0_15px_-5px_rgba(0,0,0,0.02)]">
                  {hourLabels.map((hour, idx) => (
                    <div key={hour} className="absolute right-3 -translate-y-1/2" style={{ top: idx * slotHeight }}>
                      <span className="text-[11px] font-black text-primary/30 tracking-tighter">
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
                      "relative border-l border-indigo-200 group transition-colors",
                      dayIdx % 2 !== 0 && "bg-indigo-50/50",
                      isTodayColumn && "bg-primary/[0.05]"
                    )}>
                      {hourLabels.map((_, idx) => (
                        <div key={idx}>
                          {/* Linha da Hora Cheia - Contraste Máximo */}
                          <div className="absolute left-0 right-0 border-t border-indigo-400/30" style={{ top: idx * slotHeight }} />
                          {/* Linha pontilhada de 30 min - Bem Marcada */}
                          {idx < hourLabels.length - 1 && (
                            <div className="absolute left-0 right-0 border-t border-dotted border-indigo-300/40" style={{ top: idx * slotHeight + (slotHeight / 2) }} />
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
                              "bg-indigo-50/90 border-indigo-400"
                            )}>
                              <div className="flex flex-col h-full">
                                <div className="flex items-start justify-between gap-1">
                                  <h4 className={cn(
                                    "text-sm font-black truncate leading-tight uppercase tracking-tight",
                                    session.status === "completed" ? "text-emerald-700" :
                                    session.status === "missed" ? "text-rose-700" :
                                    "text-indigo-700"
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
            <div className="grid grid-cols-7 h-full border-l border-indigo-200">
              {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((d, i) => (
                <div key={i} className="h-10 flex items-center justify-center bg-white/60 border-b border-r border-indigo-200 text-[10px] font-black text-primary/40 uppercase tracking-widest sticky top-0 z-20 shadow-sm">
                  {d}
                </div>
              ))}
              {monthDays.map((day, i) => {
                const daySessions = sessions.filter(s => new Date(s.scheduled_at).toDateString() === day.toDateString());
                const isToday = day.toDateString() === today.toDateString();
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                
                return (
                  <div key={i} className={cn(
                    "min-h-[120px] border-r border-b border-indigo-100 p-2 transition-colors hover:bg-white/40",
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
                        <div key={s.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-indigo-100 text-indigo-700 truncate cursor-pointer hover:scale-105 transition-transform" onClick={() => openSessionDetailsModal(s)}>
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
      </main>

      {/* New Session Dialog */}
      <Dialog open={showNewSession} onOpenChange={setShowNewSession}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden border-0 rounded-[32px] shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="bg-indigo-600 p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/5 rounded-full -ml-12 -mb-12 blur-xl" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-md border border-white/30">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <DialogTitle className="text-3xl font-black tracking-tight">Agendar Sessão</DialogTitle>
              <p className="text-indigo-100 text-[10px] font-black uppercase tracking-[0.2em] mt-1 opacity-80">Organize seu próximo atendimento clínico</p>
            </div>
          </div>
          
          <form onSubmit={handleCreateSession} className="space-y-8 mt-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Paciente *</Label>
                <select
                  className="flex h-14 w-full rounded-full border border-white/40 bg-white/60 px-6 py-2 text-base font-bold focus:ring-primary/20 transition-all outline-none"
                  value={newSession.patient_id}
                  onChange={(e) => setNewSession(p => ({ ...p, patient_id: e.target.value }))}
                  required
                >
                  <option value="">Selecione...</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Data *</Label>
                  <Input
                    type="date"
                    className="glass-input-field h-14 px-6 text-base font-bold"
                    value={newSession.scheduled_at}
                    onChange={(e) => setNewSession(p => ({ ...p, scheduled_at: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Hora *</Label>
                  <Input
                    type="time"
                    className="glass-input-field h-14 px-6 text-base font-bold"
                    value={newSession.scheduled_time}
                    onChange={(e) => setNewSession(p => ({ ...p, scheduled_time: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Duração (min)</Label>
                  <Input
                    type="number"
                    className="glass-input-field h-14 px-6 text-base font-bold"
                    value={newSession.duration_minutes}
                    onChange={(e) => setNewSession(p => ({ ...p, duration_minutes: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Valor (R$)</Label>
                  <Input
                    type="number"
                    placeholder="Deixe vazio para usar o padrão"
                    className="glass-input-field h-14 px-6 text-base font-bold"
                    value={newSession.session_price}
                    onChange={(e) => setNewSession(p => ({ ...p, session_price: e.target.value }))}
                  />
                </div>
              </div>

              {/* Recorrência e Pacotes */}
              <div className="space-y-4 pt-4 border-t border-indigo-100/50">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      id="is_package" 
                      checked={newSession.is_package}
                      onCheckedChange={(checked) => setNewSession(p => ({ ...p, is_package: !!checked }))}
                    />
                    <Label htmlFor="is_package" className="text-xs font-bold text-primary/80 cursor-pointer">É um pacote de sessões?</Label>
                  </div>
                  
                  {newSession.is_package && (
                    <div className="pl-7 space-y-4 animate-in fade-in slide-in-from-left-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-2">Quantas sessões?</Label>
                          <Input 
                            type="number" 
                            className="glass-input-field h-10 px-4 text-sm font-bold w-full mt-1"
                            value={newSession.package_sessions}
                            onChange={(e) => setNewSession(p => ({ ...p, package_sessions: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-2">Desconto (%)</Label>
                          <Input 
                            type="number" 
                            className="glass-input-field h-10 px-4 text-sm font-bold w-full mt-1"
                            value={newSession.discount_percentage}
                            onChange={(e) => setNewSession(p => ({ ...p, discount_percentage: e.target.value }))}
                          />
                        </div>
                      </div>
                      
                      <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Resumo do Pacote</span>
                          <span className="text-xs font-black text-primary">
                            {(() => {
                              const p = patients.find(pat => pat.id === newSession.patient_id);
                              const price = parseFloat(newSession.session_price) || p?.session_price || profile?.session_price_default || 0;
                              const total = price * parseInt(newSession.package_sessions || "1");
                              const disc = total * (parseFloat(newSession.discount_percentage || "0") / 100);
                              return `Total: ${formatCurrency(total - disc)}`;
                            })()}
                          </span>
                        </div>
                        <p className="text-[9px] text-muted-foreground/60 mt-1 leading-tight">
                          * Será gerada uma única cobrança no financeiro para o total deste pacote.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <Checkbox 
                      id="is_recurring" 
                      checked={newSession.is_recurring}
                      onCheckedChange={(checked) => setNewSession(p => ({ ...p, is_recurring: !!checked }))}
                    />
                    <Label htmlFor="is_recurring" className="text-xs font-bold text-primary/80 cursor-pointer">Deseja repetir este agendamento?</Label>
                  </div>

                  {newSession.is_recurring && (
                    <div className="pl-7 space-y-4 animate-in fade-in slide-in-from-left-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-2">Frequência</Label>
                          <select 
                            className="flex h-10 w-full rounded-xl border border-white/40 bg-white/60 px-4 py-1 text-sm font-bold focus:ring-primary/20 outline-none"
                            value={newSession.recurrence_period}
                            onChange={(e) => setNewSession(p => ({ ...p, recurrence_period: e.target.value as any }))}
                          >
                            <option value="weekly">Semanalmente</option>
                            <option value="fortnightly">Quinzenalmente</option>
                            <option value="monthly">Mensalmente</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-2">Repetir quantas vezes?</Label>
                          <div className="flex items-center gap-3 mt-1">
                            <Input 
                              type="number" 
                              disabled={newSession.is_indefinite}
                              className="glass-input-field h-10 px-4 text-sm font-bold w-20"
                              value={newSession.recurrence_count}
                              onChange={(e) => setNewSession(p => ({ ...p, recurrence_count: e.target.value }))}
                            />
                            <div className="flex items-center gap-2">
                              <Checkbox 
                                id="is_indefinite"
                                checked={newSession.is_indefinite}
                                onCheckedChange={(checked) => setNewSession(p => ({ ...p, is_indefinite: !!checked }))}
                              />
                              <Label htmlFor="is_indefinite" className="text-[10px] font-bold text-primary/60 cursor-pointer">Indeterminado</Label>
                            </div>
                          </div>
                        </div>
                      </div>
                      {newSession.is_indefinite && (
                        <p className="text-[10px] font-medium text-muted-foreground/60 italic ml-2">
                          * Serão criadas automaticamente 12 sessões para início do controle.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-4">
              <Button type="button" variant="ghost" className="rounded-full h-14 px-8 font-black flex-1" onClick={() => setShowNewSession(false)}>CANCELAR</Button>
              <Button type="submit" className="gradient-primary text-white rounded-full h-14 px-12 font-black shadow-lg flex-1" disabled={saving}>
                {saving ? "SALVANDO..." : "CONFIRMAR AGENDAMENTO"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Session Details Dialog */}
      <Dialog open={showSessionDetails} onOpenChange={setShowSessionDetails}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-0 rounded-[32px] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh]">
          <ScrollArea className="flex-1 w-full">
            {selectedSessionDetails && (
              <div className="animate-fade-in pb-8">
                <div className="h-40 bg-indigo-600 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -mr-24 -mt-24 blur-3xl" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full -ml-16 -mb-16 blur-2xl" />
                  
                  <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-20">
                    <Badge className={cn(
                      "rounded-full px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] border-0 shadow-lg",
                      SESSION_STATUS[selectedSessionDetails.status].color
                    )}>
                      {SESSION_STATUS[selectedSessionDetails.status].label}
                    </Badge>
                    <Button 
                      variant="ghost"
                      size="icon" 
                      className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-rose-500 hover:border-rose-400 transition-all active:scale-90"
                      onClick={handleDeleteSession}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="absolute -bottom-12 left-8 z-30">
                    <Avatar className="w-24 h-24 border-[6px] border-white shadow-2xl rounded-[32px]">
                      <AvatarFallback className="bg-indigo-50 text-indigo-600 text-3xl font-black">
                        {selectedSessionDetails.patient?.full_name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </div>

              <div className="p-8 pt-14 space-y-8">
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-3xl font-black text-primary tracking-tight leading-tight uppercase">
                      {selectedSessionDetails.patient?.full_name}
                    </h2>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className={cn(
                        "rounded-full px-4 py-1 text-[10px] font-black uppercase tracking-widest border-0",
                        SESSION_STATUS[selectedSessionDetails.status].color
                      )}>
                        {SESSION_STATUS[selectedSessionDetails.status].label}
                      </Badge>
                      <span className="text-xs font-bold text-muted-foreground/60 flex items-center gap-1.5 ml-2">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(selectedSessionDetails.scheduled_at).toLocaleDateString("pt-BR", { weekday: 'long', day: '2-digit', month: 'long' })}
                      </span>
                    </div>
                  </div>

                  <Link href={`/dashboard/patients/${selectedSessionDetails.patient_id}`} className="w-full">
                    <Button 
                      variant="outline" 
                      className="w-full rounded-full h-12 font-black border-primary/20 text-primary hover:bg-primary hover:text-white transition-all flex items-center gap-2"
                    >
                      <User className="w-4 h-4" />
                      ACESSAR PERFIL DO PACIENTE
                    </Button>
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-8 bg-white/40 p-6 rounded-3xl border border-white/60">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Início</p>
                    <p className="text-xl font-black text-primary">{formatTime(selectedSessionDetails.scheduled_at)}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Duração</p>
                    <p className="text-xl font-black text-primary">{selectedSessionDetails.duration_minutes} min</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Tipo</p>
                    <p className="text-sm font-bold text-primary/80 capitalize">{selectedSessionDetails.session_type}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Valor</p>
                    <p className="text-sm font-black text-emerald-600">
                      {selectedSessionDetails.session_price ? formatCurrency(selectedSessionDetails.session_price) : "Padrão"}
                    </p>
                  </div>
                </div>

                {selectedSessionDetails.status === "scheduled" && (
                  <div className="space-y-4">
                    {!isRescheduling ? (
                      <>
                        <p className="text-[11px] font-black text-primary/60 uppercase tracking-widest ml-2">Ações de Status</p>
                        <div className="grid grid-cols-2 gap-3">
                          <Button 
                            className="rounded-full gradient-primary text-white font-black h-12 shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            onClick={handleStartSession}
                            disabled={saving || !canMarkAsCompleted(selectedSessionDetails.scheduled_at)}
                          >
                            <Play className="w-4 h-4 fill-current" />
                            INICIAR SESSÃO
                          </Button>
                          <Button 
                            variant="outline"
                            className="rounded-full border-rose-200 text-rose-500 font-black h-12 hover:bg-rose-50 shadow-sm active:scale-95 transition-all"
                            onClick={() => handleUpdateStatus("missed")}
                            disabled={saving}
                          >
                            FALTOU
                          </Button>
                        </div>
                        <Button 
                          variant="ghost"
                          className="w-full rounded-full border border-indigo-100 text-indigo-500 font-black h-12 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                          onClick={() => setIsRescheduling(true)}
                        >
                          <Calendar className="w-4 h-4" />
                          REMARCAR SESSÃO
                        </Button>
                      </>
                    ) : (
                      <form onSubmit={handleReschedule} className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                        <p className="text-[11px] font-black text-indigo-600 uppercase tracking-widest ml-2">Nova Data e Hora</p>
                        
                        <div className="grid grid-cols-1 gap-6">
                          {/* Modern Date Picker */}
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-3">Data da Sessão</Label>
                            <Popover>
                              <PopoverTrigger
                                className={cn(
                                  "w-full h-14 rounded-2xl border border-indigo-100 bg-white/50 text-left font-bold text-base px-6 hover:bg-white transition-all shadow-sm flex items-center cursor-pointer",
                                  !rescheduleDate && "text-muted-foreground"
                                )}
                              >
                                <Calendar className="mr-3 h-5 w-5 text-primary/50" />
                                {rescheduleDate ? (
                                  format(new Date(rescheduleDate + 'T12:00:00'), "PPP", { locale: ptBR })
                                ) : (
                                  <span>Selecione a data</span>
                                )}
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 rounded-[28px] border-white/40 shadow-2xl backdrop-blur-xl" align="start">
                                <CalendarComponent
                                  mode="single"
                                  selected={rescheduleDate ? new Date(rescheduleDate + 'T12:00:00') : undefined}
                                  onSelect={(date) => date && setRescheduleDate(format(date, "yyyy-MM-dd"))}
                                  initialFocus
                                  locale={ptBR}
                                  className="p-4"
                                />
                              </PopoverContent>
                            </Popover>
                          </div>

                          {/* Modern Time Selection */}
                          <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-3">Horário Disponível</Label>
                            <div className="bg-white/40 rounded-3xl p-4 border border-indigo-50 shadow-inner">
                              <ScrollArea className="h-40 pr-4">
                                <div className="grid grid-cols-4 gap-2">
                                  {Array.from({ length: 15 }, (_, i) => {
                                    const hour = 7 + i;
                                    return [0, 30].map(minute => {
                                      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                                      const isSelected = rescheduleTime === timeStr;
                                      return (
                                        <button
                                          key={timeStr}
                                          type="button"
                                          onClick={() => setRescheduleTime(timeStr)}
                                          className={cn(
                                            "h-10 rounded-xl text-xs font-black transition-all border flex items-center justify-center",
                                            isSelected 
                                              ? "bg-primary text-white border-primary shadow-md scale-105" 
                                              : "bg-white/50 border-indigo-50 text-primary/60 hover:border-primary/30 hover:bg-white"
                                          )}
                                        >
                                          {timeStr}
                                        </button>
                                      );
                                    });
                                  }).flat()}
                                </div>
                              </ScrollArea>
                              <div className="mt-4 pt-4 border-t border-indigo-50 flex items-center gap-3">
                                <Clock className="w-4 h-4 text-primary/30" />
                                <span className="text-[10px] font-black text-primary/40 uppercase">Horário Personalizado:</span>
                                <Input 
                                  type="time" 
                                  value={rescheduleTime}
                                  onChange={(e) => setRescheduleTime(e.target.value)}
                                  className="w-24 h-8 text-xs font-bold rounded-lg border-indigo-100 bg-white/60 text-center"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                          <Button 
                            type="button" 
                            variant="ghost" 
                            className="flex-1 rounded-full h-14 font-black tracking-widest text-xs hover:bg-rose-50 hover:text-rose-500 transition-all"
                            onClick={() => setIsRescheduling(false)}
                          >
                            CANCELAR
                          </Button>
                          <Button 
                            type="submit" 
                            className="flex-[2] gradient-primary text-white rounded-full h-14 px-8 font-black tracking-widest text-xs shadow-xl shadow-primary/20 active:scale-95 transition-all"
                            disabled={saving || !rescheduleDate || !rescheduleTime}
                          >
                            {saving ? "REMARCANDO..." : "CONFIRMAR NOVO HORÁRIO"}
                          </Button>
                        </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
      {/* Session Manager Modal */}
      <Dialog open={showSessionManager} onOpenChange={setShowSessionManager}>
        <DialogContent className="sm:max-w-4xl rounded-[32px] border-white/40 backdrop-blur-2xl bg-white/90 shadow-2xl p-0 overflow-hidden h-[90vh] flex flex-col">
          {selectedSessionDetails && (
            <>
              <div className="p-8 border-b border-indigo-100 bg-white/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="w-14 h-14 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary font-black uppercase">
                      {selectedSessionDetails.patient?.full_name?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-2xl font-black text-primary tracking-tight uppercase leading-none">
                      {selectedSessionDetails.patient?.full_name}
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                      <Badge className="bg-indigo-500/10 text-indigo-600 border-0 rounded-full px-3 py-0.5 text-[10px] font-black tracking-widest uppercase">
                        Em Sessão
                      </Badge>
                      <span className="text-xs font-bold text-muted-foreground/60 flex items-center gap-1.5">
                        <Timer className="w-3.5 h-3.5" />
                        {sessionStartTime?.toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
                <Button 
                  onClick={handleFinishSession}
                  disabled={saving}
                  className="gradient-primary text-white rounded-full px-8 h-12 font-black shadow-lg flex items-center gap-2 active:scale-95 transition-all"
                >
                  <CheckCircle className="w-5 h-5" />
                  FINALIZAR SESSÃO
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-12">
                {/* Notas de Evolução */}
                <div className="space-y-4">
                  <Label className="text-sm font-black text-primary uppercase tracking-widest ml-1 flex items-center gap-2">
                    <Pencil className="w-4 h-4" />
                    Evolução da Sessão
                  </Label>
                  <textarea
                    className="w-full h-64 rounded-3xl border-indigo-100 bg-white/50 p-6 text-base font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground/40 resize-none shadow-inner"
                    placeholder="Descreva aqui o que ocorreu durante a sessão..."
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                  />
                </div>

                {/* Mood/Status Sliders */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  {/* Happy/Sad Slider */}
                  <div className="space-y-6">
                    <Label className="text-sm font-black text-primary uppercase tracking-widest ml-1">Humor do Paciente</Label>
                    <div className="bg-white/40 p-8 rounded-3xl border border-indigo-50 shadow-sm space-y-6">
                      <div className="flex items-center justify-between px-2">
                        <Frown className={cn("w-8 h-8 transition-all", moodHappySad <= 3 ? "text-rose-500 scale-125" : "text-muted-foreground/30")} />
                        <span className="text-2xl font-black text-primary">{moodHappySad}</span>
                        <Smile className={cn("w-8 h-8 transition-all", moodHappySad >= 8 ? "text-emerald-500 scale-125" : "text-muted-foreground/30")} />
                      </div>
                      <input 
                        type="range" 
                        min="1" max="10" step="1"
                        value={moodHappySad}
                        onChange={(e) => setMoodHappySad(parseInt(e.target.value))}
                        className="w-full h-3 bg-indigo-100 rounded-full appearance-none cursor-pointer accent-primary"
                      />
                      <div className="flex justify-between text-[9px] font-black text-muted-foreground/60 uppercase tracking-tighter">
                        <span>Triste / Desanimado</span>
                        <span>Feliz / Disposto</span>
                      </div>
                    </div>
                  </div>

                  {/* Anxious/Calm Slider */}
                  <div className="space-y-6">
                    <Label className="text-sm font-black text-primary uppercase tracking-widest ml-1">Nível de Agitação</Label>
                    <div className="bg-white/40 p-8 rounded-3xl border border-indigo-50 shadow-sm space-y-6">
                      <div className="flex items-center justify-between px-2">
                        <Zap className={cn("w-8 h-8 transition-all", moodAnxiousCalm <= 3 ? "text-amber-500 scale-125 rotate-12" : "text-muted-foreground/30")} />
                        <span className="text-2xl font-black text-primary">{moodAnxiousCalm}</span>
                        <Waves className={cn("w-8 h-8 transition-all", moodAnxiousCalm >= 8 ? "text-sky-500 scale-125" : "text-muted-foreground/30")} />
                      </div>
                      <input 
                        type="range" 
                        min="1" max="10" step="1"
                        value={moodAnxiousCalm}
                        onChange={(e) => setMoodAnxiousCalm(parseInt(e.target.value))}
                        className="w-full h-3 bg-indigo-100 rounded-full appearance-none cursor-pointer accent-primary"
                      />
                      <div className="flex justify-between text-[9px] font-black text-muted-foreground/60 uppercase tracking-tighter">
                        <span>Ansioso / Agitado</span>
                        <span>Calmo / Tranquilo</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 rounded-2xl p-4 flex gap-3 border border-amber-100">
                  <Info className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed font-medium">
                    As notas de evolução são armazenadas de forma segura. Em breve, você poderá usar a inteligência artificial para transcrever automaticamente o áudio da sessão.
                  </p>
                </div>
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
              className="h-14 rounded-full font-black text-sm tracking-widest bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-0"
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
