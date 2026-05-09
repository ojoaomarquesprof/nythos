"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Plus,
  ChevronLeft,
  ChevronRight,
  Video,
  X,
  Info,
  CheckCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SubscriptionGate } from "@/components/auth/subscription-gate";
import { SESSION_STATUS, formatTime, formatCurrency } from "@/lib/constants";
import { useScheduleData } from "./_hooks/use-schedule-data";
import { useCalendarSync } from "./_hooks/use-calendar-sync";
import { createScheduleSessions, cancelScheduleSession } from "@/app/actions/schedule-sessions";

export default function SchedulePage() {
  const schedule = useScheduleData();
  const calendar = useCalendarSync(schedule.loadData);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [cancellingSession, setCancellingSession] = useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && schedule.view !== 'month') {
      const now = new Date();
      const currentHour = now.getHours();
      const timelineStartHour = 7;
      const slotHeight = 80;

      if (currentHour >= timelineStartHour && currentHour <= 21) {
        const offset = (currentHour - timelineStartHour) * slotHeight;
        setTimeout(() => {
          scrollRef.current?.scrollTo({
            top: Math.max(0, offset - scrollRef.current.clientHeight / 2),
            behavior: 'smooth'
          });
        }, 300);
      }
    }
  }, [schedule.view, schedule.currentDate]);

  const monthYear = schedule.currentDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const timelineStartHour = 7;
  const timelineEndHour = 21;
  const slotHeight = 80;
  const hourLabels = Array.from(
    { length: timelineEndHour - timelineStartHour + 1 },
    (_, i) => timelineStartHour + i
  );

  const miniCalendarDays = useMemo(() => {
    const start = new Date(schedule.currentDate.getFullYear(), schedule.currentDate.getMonth(), 1);
    const dayOfWeek = start.getDay();
    const firstDay = new Date(start);
    firstDay.setDate(start.getDate() - dayOfWeek);
    return Array.from({ length: 35 }, (_, i) => {
      const d = new Date(firstDay);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [schedule.currentDate]);

  const weekDays = useMemo(() => {
    const start = new Date(schedule.currentDate);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [schedule.currentDate]);

  const selectedItem = schedule.selectedSessionDetails as any;
  const selectedIsExternal = !!selectedItem?.is_external_google;
  const selectedPatient = useMemo(
    () => schedule.patients.find((p) => p.id === schedule.newSession.patient_id) ?? null,
    [schedule.patients, schedule.newSession.patient_id]
  );
  const suggestedPrice = selectedPatient?.session_price ?? schedule.profile?.session_price_default ?? null;

  async function handleCreateSession() {
    if (!schedule.therapistId) {
      setScheduleError("Terapeuta não identificado.");
      return;
    }

    setScheduleError(null);
    schedule.setSaving(true);
    try {
      const duration = parseInt(schedule.newSession.duration_minutes, 10);
      const rawPrice =
        schedule.newSession.session_price?.trim() !== ""
          ? Number(schedule.newSession.session_price)
          : (suggestedPrice ?? null);

      const result = await createScheduleSessions({
        therapistId: schedule.therapistId,
        patientId: schedule.newSession.patient_id,
        scheduledDate: schedule.newSession.scheduled_at,
        scheduledTime: schedule.newSession.scheduled_time,
        durationMinutes: Number.isNaN(duration) ? 50 : duration,
        sessionType: schedule.newSession.session_type,
        sessionPrice: rawPrice,
        location: schedule.newSession.location,
        isRecurring: schedule.newSession.is_recurring,
        recurrencePeriod: schedule.newSession.recurrence_period as "weekly" | "monthly",
        recurrenceCount: parseInt(schedule.newSession.recurrence_count, 10),
        isIndefinite: schedule.newSession.is_indefinite,
      });

      if (!result.success) {
        throw new Error(result.error || "Falha ao agendar sessão.");
      }

      const createdCount = result.createdCount ?? 1;
      const googleCreatedCount = result.googleCreatedCount ?? 0;
      if (result.warning) {
        calendar.setSyncBanner({
          type: "info",
          message: `Sess�o(�es) criada(s): ${createdCount}. Google: ${googleCreatedCount}. ${result.warning}`,
        });
      } else if (googleCreatedCount > 0) {
        calendar.setSyncBanner({
          type: "success",
          message: `? ${createdCount} sess�o(�es) criada(s) e ${googleCreatedCount} enviada(s) ao Google Calendar.`,
        });
      } else {
        calendar.setSyncBanner({
          type: "success",
          message: `? ${createdCount} sess�o(�es) criada(s).`,
        });
      }

      schedule.setShowNewSession(false);
      schedule.setNewSession({
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
      await schedule.loadData();
    } catch (err: any) {
      setScheduleError(err?.message ?? "Falha ao agendar sessão.");
    } finally {
      schedule.setSaving(false);
    }
  }

  async function handleCancelSession() {
    if (!selectedItem?.id || selectedIsExternal) return;

    setCancellingSession(true);
    try {
      const result = await cancelScheduleSession({ sessionId: selectedItem.id });
      if (!result.success) {
        throw new Error(result.error || "Falha ao cancelar sessão.");
      }

      if (result.warning) {
        calendar.setSyncBanner({ type: "info", message: result.warning });
      } else {
        calendar.setSyncBanner({ type: "success", message: "Sessão cancelada com sucesso." });
      }

      schedule.setShowSessionDetails(false);
      schedule.setSelectedSessionDetails(null);
      await schedule.loadData();
    } catch (err: any) {
      calendar.setSyncBanner({
        type: "error",
        message: err?.message ?? "Falha ao cancelar sessão.",
      });
    } finally {
      setCancellingSession(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-200px)] md:h-[calc(100vh-80px)] w-full overflow-hidden bg-white/30 relative">
      {calendar.syncBanner && (
        <div className={cn(
          "absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl border backdrop-blur-md text-sm font-bold transition-all max-w-md w-[90%]",
          calendar.syncBanner.type === 'success' && "bg-emerald-50/95 border-emerald-200 text-emerald-800",
          calendar.syncBanner.type === 'error' && "bg-rose-50/95 border-rose-200 text-rose-800",
          calendar.syncBanner.type === 'info' && "bg-blue-50/95 border-blue-200 text-blue-800"
        )}>
          {calendar.syncBanner.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
          {calendar.syncBanner.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
          {calendar.syncBanner.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
          <span className="flex-1">{calendar.syncBanner.message}</span>
          <button onClick={() => calendar.setSyncBanner(null)} className="opacity-50 hover:opacity-100 transition-opacity">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <aside className="w-72 border-r border-white/40 bg-white/40 backdrop-blur-xl p-6 hidden lg:flex flex-col gap-8 shrink-0">
        <SubscriptionGate>
          <Button
            onClick={() => schedule.setShowNewSession(true)}
            className="w-full h-14 rounded-full bg-white text-primary font-black shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 border border-primary/10 px-6"
          >
            <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white shrink-0">
              <Plus className="w-5 h-5" />
            </div>
            <span className="truncate">AGENDAR SESSÃO</span>
          </Button>
        </SubscriptionGate>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-black text-primary uppercase tracking-widest">{monthYear}</h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="w-6 h-6 rounded-full" onClick={() => schedule.navigate(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="w-6 h-6 rounded-full" onClick={() => schedule.navigate(1)}>
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
              const isToday = day.toDateString() === new Date().toDateString();
              const isSelected = day.toDateString() === schedule.currentDate.toDateString();
              const isCurrentMonth = day.getMonth() === schedule.currentDate.getMonth();
              
              return (
                <div key={i} className="flex items-center justify-center h-8">
                  <span 
                    onClick={() => {
                      schedule.setCurrentDate(day);
                      schedule.setView('day');
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
            <div className="flex items-center gap-3 px-2 py-1 rounded-lg">
              <div className={cn("w-4 h-4 rounded-sm shadow-sm", calendar.googleConnected ? "bg-emerald-500" : "bg-slate-300")} />
              <span className="text-xs font-bold text-primary/80">Google Calendar</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/60 bg-white/40 backdrop-blur-md p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black text-slate-700">Google Calendar</span>
              {calendar.googleConnected ? (
                <span className="ml-auto flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase">
                  <Wifi className="w-3 h-3" /> Conectado
                </span>
              ) : (
                <span className="ml-auto flex items-center gap-1 text-[9px] font-black text-slate-400 uppercase">
                  <WifiOff className="w-3 h-3" /> Desconectado
                </span>
              )}
            </div>

            {calendar.googleConnected ? (
              <div className="space-y-2">
                <Button
                  onClick={calendar.handleGoogleSync}
                  disabled={calendar.syncing}
                  className="w-full h-9 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[11px] font-black flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", calendar.syncing && "animate-spin")} />
                  {calendar.syncing ? "Sincronizando..." : "Sincronizar Agora"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={calendar.handleGoogleDisconnect}
                  className="w-full h-7 rounded-xl text-[10px] font-bold text-slate-400 hover:text-rose-500 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Unlink className="w-3 h-3" />
                  Desconectar
                </Button>
              </div>
            ) : (
              <Button
                onClick={calendar.handleGoogleConnect}
                disabled={calendar.connecting}
                className="w-full h-9 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] font-black flex items-center justify-center gap-2 shadow-sm hover:shadow-md hover:scale-[1.02]"
              >
                {calendar.connecting ? 'Conectando...' : 'Conectar Google'}
              </Button>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white/60 backdrop-blur-md relative">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between px-4 md:px-8 py-3 md:py-0 md:h-20 border-b border-white/40 bg-white/40 shrink-0 gap-3">
          <div className="flex flex-wrap items-center gap-3 md:gap-8 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-7 h-7 text-primary" />
              <h1 className="text-xl md:text-2xl font-black text-primary tracking-tight hidden sm:block">Agenda</h1>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                className="rounded-full border-primary/20 font-bold hover:bg-primary/5 h-8 md:h-10 px-4 text-xs"
                onClick={() => {
                  schedule.setCurrentDate(new Date());
                  schedule.setSelectedDate(new Date());
                }}
              >
                Hoje
              </Button>
              <div className="flex items-center bg-white/60 rounded-full border p-0.5">
                <Button variant="ghost" size="icon" className="w-7 h-7 rounded-full" onClick={() => schedule.navigate(-1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="w-7 h-7 rounded-full" onClick={() => schedule.navigate(1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <h2 className="text-sm md:text-xl font-black text-primary/80 capitalize">{monthYear}</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/60 rounded-full border p-1 flex">
              <Button 
                variant="ghost" 
                size="sm" 
                className={cn("rounded-full h-8 px-4 text-xs font-black", schedule.view === 'week' ? "bg-white text-primary shadow-sm" : "text-primary/40")}
                onClick={() => schedule.setView('week')}
              >
                Semana
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className={cn("rounded-full h-8 px-4 text-xs font-black", schedule.view === 'month' ? "bg-white text-primary shadow-sm" : "text-primary/40")}
                onClick={() => schedule.setView('month')}
              >
                Mês
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className={cn("rounded-full h-8 px-4 text-xs font-black", schedule.view === 'day' ? "bg-white text-primary shadow-sm" : "text-primary/40")}
                onClick={() => schedule.setView('day')}
              >
                Dia
              </Button>
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-hide bg-white/20">
          {schedule.view !== 'month' ? (
            <div className="relative min-w-[900px] md:min-w-0">
              <div className="sticky top-0 z-30 grid bg-white/80 backdrop-blur-md border-b grid-cols-[80px_1fr]">
                <div className="h-16 flex items-end justify-end p-2 sticky left-0 z-40 bg-white/80">
                  <span className="text-[10px] font-black text-primary/30 uppercase">GMT-03</span>
                </div>
                <div className="grid grid-cols-7">
                  {weekDays.map((day, i) => {
                    const isToday = day.toDateString() === new Date().toDateString();
                    return (
                      <div key={i} className={cn("h-16 flex flex-col items-center justify-center", isToday && "bg-primary/5")}>
                        <span className={cn("text-[9px] font-black uppercase tracking-widest", isToday ? "text-primary" : "text-primary/40")}>
                          {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][day.getDay()]}
                        </span>
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-black", isToday ? "gradient-primary text-white" : "text-primary/70")}>
                          {day.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-[80px_1fr]" style={{ height: (timelineEndHour - timelineStartHour + 1) * slotHeight }}>
                <div className="border-r sticky left-0 z-20 bg-white/80 shadow-[10px_0_15px_-5px_rgba(0,0,0,0.02)]">
                  {hourLabels.map((hour, idx) => (
                    <div key={hour} className="absolute right-3 -translate-y-1/2" style={{ top: idx * slotHeight }}>
                      <span className="text-[10px] font-black text-primary/30">
                        {hour === timelineStartHour ? "" : `${hour.toString().padStart(2, "0")}:00`}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 relative">
                  {weekDays.map((day, dayIdx) => {
                    const daySessions = schedule.sessions.filter(s => new Date(s.scheduled_at).toDateString() === day.toDateString());
                    return (
                      <div key={dayIdx} className="relative border-l">
                        {hourLabels.map((_, idx) => (
                          <div key={idx} className="absolute left-0 right-0 border-t" style={{ top: idx * slotHeight }} />
                        ))}
                        {daySessions.map(session => {
                          const sessionDate = new Date(session.scheduled_at);
                          const minutesFromStart = (sessionDate.getHours() - timelineStartHour) * 60 + sessionDate.getMinutes();
                          const totalTimelineMinutes = (timelineEndHour - timelineStartHour + 1) * 60;
                          const durationMinutes = session.duration_minutes ?? 50;
                          const clampedStart = Math.max(0, minutesFromStart);
                          const clampedEnd = Math.min(totalTimelineMinutes, minutesFromStart + durationMinutes);
                          if (clampedEnd <= 0 || clampedStart >= totalTimelineMinutes) return null;
                          const top = (clampedStart / 60) * slotHeight;
                          const height = Math.max(18, ((clampedEnd - clampedStart) / 60) * slotHeight);
                          const statusCfg = SESSION_STATUS[session.status as keyof typeof SESSION_STATUS] || SESSION_STATUS.scheduled;
                          const isExternalGoogle = !!(session as any).is_external_google;
                          const eventTitle = isExternalGoogle
                            ? ((session as any).external_title || "Compromisso (Google)")
                            : (session.patient?.full_name || "Sessão");

                          return (
                            <div
                              key={session.id}
                              className="absolute left-1 right-1 z-10"
                              style={{ top, height }}
                              onClick={() => {
                                schedule.setSelectedSessionDetails(session);
                                schedule.setShowSessionDetails(true);
                              }}
                            >
                              <div className={cn(
                                "h-full rounded-xl p-3 border-l-[6px] shadow-sm hover:scale-[1.01] transition-all cursor-pointer overflow-hidden",
                                isExternalGoogle
                                  ? "bg-slate-100/90 border-slate-500"
                                  : session.status === "completed"
                                    ? "bg-emerald-50/90 border-emerald-400"
                                    : "bg-teal-/90 border-teal-"
                              )}>
                                <h4 className="text-xs font-black truncate text-primary uppercase">{eventTitle}</h4>
                                <div className="mt-auto flex items-center justify-between text-[10px]">
                                  <span>{formatTime(session.scheduled_at)}</span>
                                  {isExternalGoogle ? (
                                    <Badge className="text-[9px] font-black bg-slate-200 text-slate-700">Google</Badge>
                                  ) : (
                                    <Badge className={cn("text-[9px] font-black", statusCfg.color)}>{statusCfg.label}</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-7 h-full">
              {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((d, i) => (
                <div key={i} className="h-10 flex items-center justify-center bg-white/60 border-b border-r text-[10px] font-black text-primary/40 uppercase tracking-widest sticky top-0 z-20 shadow-sm">
                  {d}
                </div>
              ))}
              {miniCalendarDays.map((day, i) => {
                const daySessions = schedule.sessions.filter(s => new Date(s.scheduled_at).toDateString() === day.toDateString());
                const isToday = day.toDateString() === new Date().toDateString();
                const isCurrentMonth = day.getMonth() === schedule.currentDate.getMonth();
                
                return (
                  <div key={i} className={cn(
                    "min-h-[120px] border-r border-b p-2 hover:bg-white/40",
                    !isCurrentMonth && "bg-black/[0.02] opacity-40"
                  )}>
                    <div className="flex justify-center mb-2">
                      <span className={cn(
                        "w-8 h-8 flex items-center justify-center rounded-full text-xs font-black",
                        isToday ? "gradient-primary text-white scale-110" : "text-primary/60"
                      )}>
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {daySessions.slice(0, 3).map(s => (
                        <div key={s.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal- text-teal- truncate cursor-pointer" onClick={() => { schedule.setSelectedSessionDetails(s); schedule.setShowSessionDetails(true); }}>
                          {formatTime(s.scheduled_at)} {(s as any).is_external_google ? ((s as any).external_title || "Google") : s.patient?.full_name}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Dialog
        open={schedule.showNewSession}
        onOpenChange={(open) => {
          schedule.setShowNewSession(open);
          if (!open) setScheduleError(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>Agendar Sessão</DialogTitle>
          <DialogDescription>Preencha os dados mínimos para criar a sessão clínica.</DialogDescription>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label>Paciente</Label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={schedule.newSession.patient_id}
                onChange={(e) => {
                  const patientId = e.target.value;
                  const patient = schedule.patients.find((p) => p.id === patientId);
                  const resolvedPrice =
                    patient?.session_price ??
                    schedule.profile?.session_price_default ??
                    null;
                  schedule.setNewSession({
                    ...schedule.newSession,
                    patient_id: patientId,
                    session_price:
                      schedule.newSession.session_price?.trim() !== ""
                        ? schedule.newSession.session_price
                        : (resolvedPrice != null ? String(resolvedPrice) : ""),
                  });
                }}
              >
                <option value="">Selecione um paciente</option>
                {schedule.patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={schedule.newSession.scheduled_at}
                  onChange={(e) => schedule.setNewSession({ ...schedule.newSession, scheduled_at: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={schedule.newSession.scheduled_time}
                  onChange={(e) => schedule.setNewSession({ ...schedule.newSession, scheduled_time: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Duração (min)</Label>
                <Input
                  type="number"
                  min={15}
                  step={5}
                  value={schedule.newSession.duration_minutes}
                  onChange={(e) => schedule.setNewSession({ ...schedule.newSession, duration_minutes: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Local</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={schedule.newSession.location}
                  onChange={(e) => schedule.setNewSession({ ...schedule.newSession, location: e.target.value })}
                >
                  <option value="office">Presencial</option>
                  <option value="online">Online</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de sessão</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={schedule.newSession.session_type}
                  onChange={(e) => schedule.setNewSession({ ...schedule.newSession, session_type: e.target.value })}
                >
                  <option value="individual">Individual</option>
                  <option value="couple">Casal</option>
                  <option value="group">Grupo</option>
                  <option value="online">Online</option>
                  <option value="initial_assessment">Avaliação inicial</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Preço da sessão</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder={suggestedPrice != null ? `${suggestedPrice}` : "Padrão"}
                  value={schedule.newSession.session_price}
                  onChange={(e) => schedule.setNewSession({ ...schedule.newSession, session_price: e.target.value })}
                />
                {suggestedPrice != null && (
                  <p className="text-[11px] text-muted-foreground">
                    Valor padrão sugerido: {formatCurrency(Number(suggestedPrice))}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is-recurring"
                  checked={schedule.newSession.is_recurring}
                  onCheckedChange={(checked) =>
                    schedule.setNewSession({ ...schedule.newSession, is_recurring: checked === true })
                  }
                />
                <Label htmlFor="is-recurring">Sessão recorrente</Label>
              </div>
              {schedule.newSession.is_recurring && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Periodicidade</Label>
                    <select
                      className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                      value={schedule.newSession.recurrence_period}
                      onChange={(e) =>
                        schedule.setNewSession({ ...schedule.newSession, recurrence_period: e.target.value })
                      }
                    >
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensal</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Quantidade</Label>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      disabled={schedule.newSession.is_indefinite}
                      value={schedule.newSession.recurrence_count}
                      onChange={(e) =>
                        schedule.setNewSession({ ...schedule.newSession, recurrence_count: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <Checkbox
                      id="is-indefinite"
                      checked={schedule.newSession.is_indefinite}
                      onCheckedChange={(checked) =>
                        schedule.setNewSession({ ...schedule.newSession, is_indefinite: checked === true })
                      }
                    />
                    <Label htmlFor="is-indefinite">Sem data final (cria 12 ocorrências iniciais)</Label>
                  </div>
                </div>
              )}
            </div>
            {scheduleError && <p className="text-sm text-rose-600">{scheduleError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => schedule.setShowNewSession(false)} disabled={schedule.saving}>
              Cancelar
            </Button>
            <Button onClick={handleCreateSession} disabled={schedule.saving}>
              {schedule.saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={schedule.showSessionDetails}
        onOpenChange={(open) => {
          schedule.setShowSessionDetails(open);
          if (!open) schedule.setSelectedSessionDetails(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>{selectedIsExternal ? "Bloqueio Externo" : "Detalhes da Sessão"}</DialogTitle>
          <DialogDescription>
            {selectedIsExternal ? "Evento importado do Google Calendar (somente leitura)." : "Informações da sessão clínica."}
          </DialogDescription>
          {selectedItem && (
            <div className="space-y-2 text-sm">
              <p><strong>Título:</strong> {selectedIsExternal ? (selectedItem.external_title || "Compromisso (Google)") : (selectedItem.patient?.full_name || "Sessão")}</p>
              <p><strong>Horário:</strong> {new Date(selectedItem.scheduled_at).toLocaleString("pt-BR")}</p>
              <p><strong>Duração:</strong> {selectedItem.duration_minutes ?? 50} min</p>
              {selectedIsExternal ? (
                <>
                  <p><strong>Origem:</strong> Google Calendar</p>
                  {selectedItem.external_location && <p><strong>Local:</strong> {selectedItem.external_location}</p>}
                </>
              ) : (
                <>
                  <p><strong>Status:</strong> {SESSION_STATUS[selectedItem.status as keyof typeof SESSION_STATUS]?.label ?? selectedItem.status}</p>
                  <p><strong>Local:</strong> {selectedItem.location || "-"}</p>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            {!selectedIsExternal && selectedItem?.status !== "cancelled" && (
              <Button
                variant="destructive"
                onClick={handleCancelSession}
                disabled={cancellingSession}
              >
                {cancellingSession ? "Cancelando..." : "Cancelar sessão"}
              </Button>
            )}
            <Button onClick={() => schedule.setShowSessionDetails(false)} disabled={cancellingSession}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

