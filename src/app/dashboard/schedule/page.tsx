"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  Plus,
  Clock,
  ChevronLeft,
  ChevronRight,
  Video,
  MapPin,
  X,
} from "lucide-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SESSION_STATUS, formatTime, formatCurrency } from "@/lib/constants";
import type { Session, Patient } from "@/types/database";

export default function SchedulePage() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<(Session & { patient?: Patient })[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showNewSession, setShowNewSession] = useState(false);
  const [saving, setSaving] = useState(false);

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
  });

  useEffect(() => {
    loadData();
  }, [currentDate]);

  async function loadData() {
    setLoading(true);

    const startOfWeek = getWeekStart(currentDate);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const [sessionsRes, patientsRes] = await Promise.all([
      supabase
        .from("sessions")
        .select("*")
        .gte("scheduled_at", startOfWeek.toISOString())
        .lt("scheduled_at", endOfWeek.toISOString())
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("patients")
        .select("*")
        .eq("status", "active")
        .order("full_name"),
    ]);

    if (patientsRes.data) setPatients(patientsRes.data);

    if (sessionsRes.data && patientsRes.data) {
      const enriched = sessionsRes.data.map((s: Session) => ({
        ...s,
        patient: patientsRes.data.find((p: Patient) => p.id === s.patient_id),
      }));
      setSessions(enriched);
    }

    setLoading(false);
  }

  function getWeekStart(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getWeekDays(date: Date) {
    const start = getWeekStart(date);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }

  const weekDays = getWeekDays(currentDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const navigateWeek = (dir: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const baseDate = new Date(
      `${newSession.scheduled_at}T${newSession.scheduled_time}:00`
    );

    const count = newSession.is_recurring ? parseInt(newSession.recurrence_count) || 1 : 1;
    const sessionsToInsert = [];

    for (let i = 0; i < count; i++) {
      const scheduledAt = new Date(baseDate);
      if (newSession.is_recurring) {
        if (newSession.recurrence_period === "weekly") {
          scheduledAt.setDate(scheduledAt.getDate() + i * 7);
        } else if (newSession.recurrence_period === "biweekly") {
          scheduledAt.setDate(scheduledAt.getDate() + i * 14);
        } else if (newSession.recurrence_period === "monthly") {
          scheduledAt.setMonth(scheduledAt.getMonth() + i);
        }
      }

      sessionsToInsert.push({
        user_id: user.id,
        patient_id: newSession.patient_id,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: parseInt(newSession.duration_minutes),
        session_type: newSession.session_type as Session["session_type"],
        session_price: newSession.session_price
          ? parseFloat(newSession.session_price)
          : null,
        location: newSession.location,
        status: "scheduled",
      });
    }

    const { error } = await supabase.from("sessions").insert(sessionsToInsert);

    if (!error) {
      setShowNewSession(false);
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
        });
      loadData();
    }
    setSaving(false);
  };

  const handleStatusChange = async (
    sessionId: string,
    newStatus: Session["status"]
  ) => {
    const { error } = await supabase
      .from("sessions")
      .update({ status: newStatus })
      .eq("id", sessionId);

    if (!error) {
      loadData();
    }
  };

  const dayNames = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const monthYear = currentDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Agenda</h1>
          <p className="text-sm text-muted-foreground capitalize">{monthYear}</p>
        </div>
        <Button
          className="gradient-primary text-white shadow-sm"
          onClick={() => setShowNewSession(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Nova Sessão</span>
          <span className="sm:hidden">Nova</span>
        </Button>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigateWeek(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentDate(new Date())}
          className="text-primary font-medium"
        >
          Hoje
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigateWeek(1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Week Calendar */}
      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map((day, i) => {
          const isToday = day.toDateString() === today.toDateString();
          const daySessions = sessions.filter(
            (s) => new Date(s.scheduled_at).toDateString() === day.toDateString()
          );

          return (
            <div key={i} className="flex flex-col items-center">
              <span className="text-[10px] text-muted-foreground font-medium mb-1">
                {dayNames[i]}
              </span>
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium mb-2 transition-all",
                  isToday
                    ? "bg-primary text-white shadow-sm"
                    : "text-foreground hover:bg-muted"
                )}
              >
                {day.getDate()}
              </div>
              {daySessions.length > 0 && (
                <div className="flex gap-0.5">
                  {daySessions.slice(0, 3).map((_, idx) => (
                    <div
                      key={idx}
                      className="w-1.5 h-1.5 rounded-full bg-primary"
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Daily Sessions */}
      {weekDays.map((day, dayIndex) => {
        const daySessions = sessions.filter(
          (s) =>
            new Date(s.scheduled_at).toDateString() === day.toDateString()
        );

        if (daySessions.length === 0) return null;

        const isToday = day.toDateString() === today.toDateString();

        return (
          <div key={dayIndex} className="space-y-2">
            <h3
              className={cn(
                "text-sm font-semibold",
                isToday && "text-primary"
              )}
            >
              {isToday ? "Hoje" : day.toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
              <span className="text-muted-foreground font-normal ml-2">
                {daySessions.length} sessão{daySessions.length > 1 ? "ões" : ""}
              </span>
            </h3>

            {daySessions.map((session) => {
              const statusCfg = SESSION_STATUS[session.status];
              const patientInitials = session.patient?.full_name
                ? session.patient.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "??";

              return (
                <Card key={session.id} className="border-0 shadow-sm">
                  <CardContent className="p-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10 flex-shrink-0">
                        <AvatarFallback className="bg-violet-100 text-violet-700 text-xs font-semibold">
                          {patientInitials}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {session.patient?.full_name || "Paciente"}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {formatTime(session.scheduled_at)} ·{" "}
                            {session.duration_minutes}min
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {session.session_type === "online" ? (
                              <Video className="w-3 h-3" />
                            ) : (
                              <MapPin className="w-3 h-3" />
                            )}
                            {session.session_type === "online"
                              ? "Online"
                              : "Consultório"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge
                          variant="secondary"
                          className={cn("text-[10px] h-5", statusCfg.color)}
                        >
                          {statusCfg.label}
                        </Badge>
                        {session.status === "scheduled" && (
                          <div className="flex gap-1">
                            <button
                              onClick={() =>
                                handleStatusChange(session.id, "completed")
                              }
                              className="w-7 h-7 rounded-md bg-green-50 text-green-600 flex items-center justify-center text-xs font-bold hover:bg-green-100 transition-colors"
                              title="Marcar como realizada"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() =>
                                handleStatusChange(session.id, "missed")
                              }
                              className="w-7 h-7 rounded-md bg-red-50 text-red-500 flex items-center justify-center text-xs font-bold hover:bg-red-100 transition-colors"
                              title="Marcar como falta"
                            >
                              ✗
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );
      })}

      {sessions.length === 0 && !loading && (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <CalendarDays className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-lg mb-2">Sem sessões esta semana</CardTitle>
            <p className="text-sm text-muted-foreground max-w-xs">
              Agende sessões para os seus pacientes.
            </p>
            <Button
              className="mt-6 gradient-primary text-white"
              onClick={() => setShowNewSession(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Agendar Sessão
            </Button>
          </CardContent>
        </Card>
      )}

      {/* New Session Dialog */}
      <Dialog open={showNewSession} onOpenChange={setShowNewSession}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Sessão</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSession} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Paciente *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={newSession.patient_id}
                onChange={(e) =>
                  setNewSession((p) => ({ ...p, patient_id: e.target.value }))
                }
                required
              >
                <option value="">Selecione o paciente</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input
                  type="date"
                  className="h-10"
                  value={newSession.scheduled_at}
                  onChange={(e) =>
                    setNewSession((p) => ({
                      ...p,
                      scheduled_at: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hora *</Label>
                <Input
                  type="time"
                  className="h-10"
                  value={newSession.scheduled_time}
                  onChange={(e) =>
                    setNewSession((p) => ({
                      ...p,
                      scheduled_time: e.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duração (min)</Label>
                <Input
                  type="number"
                  className="h-10"
                  value={newSession.duration_minutes}
                  onChange={(e) =>
                    setNewSession((p) => ({
                      ...p,
                      duration_minutes: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={newSession.session_type}
                  onChange={(e) =>
                    setNewSession((p) => ({
                      ...p,
                      session_type: e.target.value,
                    }))
                  }
                >
                  <option value="individual">Individual</option>
                  <option value="couple">Casal</option>
                  <option value="group">Grupo</option>
                  <option value="online">Online</option>
                  <option value="initial_assessment">Avaliação Inicial</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Usar valor padrão do paciente"
                className="h-10"
                value={newSession.session_price}
                onChange={(e) =>
                  setNewSession((p) => ({
                    ...p,
                    session_price: e.target.value,
                  }))
                }
              />
            </div>

            <div className="pt-3 border-t border-muted/50">
              <label className="flex items-center gap-2 mb-2 cursor-pointer group">
                <input
                  type="checkbox"
                  id="is_recurring"
                  className="w-4 h-4 rounded border-input text-primary focus:ring-primary transition-all cursor-pointer"
                  checked={newSession.is_recurring}
                  onChange={(e) =>
                    setNewSession((p) => ({
                      ...p,
                      is_recurring: e.target.checked,
                    }))
                  }
                />
                <span className="text-sm font-medium group-hover:text-primary transition-colors">
                  Repetir sessão
                </span>
              </label>

              {newSession.is_recurring && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Frequência</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={newSession.recurrence_period}
                      onChange={(e) =>
                        setNewSession((p) => ({
                          ...p,
                          recurrence_period: e.target.value,
                        }))
                      }
                    >
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quinzenal</option>
                      <option value="monthly">Mensal</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Ocorrências</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="2"
                        max="52"
                        className="h-9 pr-8"
                        value={newSession.recurrence_count}
                        onChange={(e) =>
                          setNewSession((p) => ({
                            ...p,
                            recurrence_count: e.target.value,
                          }))
                        }
                      />
                      <span className="absolute right-2 top-2 text-[10px] text-muted-foreground pointer-events-none">
                        vezes
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowNewSession(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 gradient-primary text-white"
                disabled={saving}
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Agendar"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
