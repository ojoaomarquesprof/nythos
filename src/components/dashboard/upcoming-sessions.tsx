"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, Video } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SESSION_STATUS, formatTime } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import type { Patient, Session } from "@/types/database";

const avatarColors = [
  "bg-primary/10 text-primary",
  "bg-emerald-50 text-emerald-700",
  "bg-rose-50 text-rose-700",
  "bg-amber-50 text-amber-700",
  "bg-sky-50 text-sky-700",
  "bg-fuchsia-50 text-fuchsia-700",
];

function getInitials(name?: string | null) {
  if (!name) return "??";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function UpcomingSessions() {
  const { therapistId } = useSubscription();
  const supabase = createClient();
  const [sessions, setSessions] = useState<(Session & { patient?: Patient })[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (therapistId) {
      loadSessions();
    }
  }, [therapistId]);

  async function loadSessions() {
    setLoading(true);
    setHasError(false);

    try {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const { data: sessionsData, error } = await supabase
        .from("sessions")
        .select("*")
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", endOfDay.toISOString())
        .eq("status", "scheduled")
        .order("scheduled_at")
        .limit(5);

      if (error) throw error;

      if (!sessionsData || sessionsData.length === 0) {
        setSessions([]);
        return;
      }

      const patientIds = [...new Set(sessionsData.map((session) => session.patient_id))];
      const { data: patientsData, error: patientsError } = await supabase
        .from("patients")
        .select("*")
        .in("id", patientIds);

      if (patientsError) throw patientsError;

      setSessions(
        sessionsData.map((session) => ({
          ...session,
          patient: patientsData?.find((patient) => patient.id === session.patient_id),
        }))
      );
    } catch {
      console.error("[upcoming-sessions] Failed to load sessions");
      setHasError(true);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="animate-fade-in border-border/70 bg-card/95 py-0 shadow-[0_16px_42px_rgba(41,31,67,0.08)]">
      <CardHeader className="border-b border-border/60 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Próximas sessões
            </CardTitle>
            <p className="text-sm text-muted-foreground">O restante da agenda de hoje.</p>
          </div>
          <Link
            href="/dashboard/schedule"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-xl bg-white/80")}
          >
            Ver agenda
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-3 md:p-4">
        {loading ? (
          <div className="space-y-3 p-2">
            {[1, 2, 3].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-border/50 p-3">
                <div className="size-11 animate-pulse rounded-2xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : hasError ? (
          <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-border/60 bg-muted/30 p-6 text-center">
            <CalendarDays className="mb-3 size-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Agenda indisponível agora</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tente atualizar a página em instantes.
            </p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-primary/[0.03] p-6 text-center">
            <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Clock className="size-5" />
            </div>
            <p className="text-sm font-medium text-foreground">Sem sessões restantes hoje</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              A agenda do dia está livre para evolução de prontuários ou planejamento.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session, index) => {
              const statusConfig =
                SESSION_STATUS[session.status as keyof typeof SESSION_STATUS] || SESSION_STATUS.scheduled;
              const isOnline = session.session_type === "online";

              return (
                <Link
                  key={session.id}
                  href={`/dashboard/patients/${session.patient_id}`}
                  className="group flex items-center gap-3 rounded-2xl border border-transparent p-3 transition-all hover:border-primary/15 hover:bg-primary/[0.03]"
                >
                  <Avatar className="size-11 shrink-0 rounded-2xl">
                    <AvatarFallback
                      className={cn("rounded-2xl text-sm font-semibold", avatarColors[index % avatarColors.length])}
                    >
                      {getInitials(session.patient?.full_name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {session.patient?.full_name || "Paciente"}
                      </p>
                      {isOnline && (
                        <span className="flex size-6 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                          <Video className="size-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5 text-primary" />
                        {formatTime(session.scheduled_at)}
                      </span>
                      {session.duration_minutes && (
                        <>
                          <span className="size-1 rounded-full bg-border" />
                          <span>{session.duration_minutes} min</span>
                        </>
                      )}
                    </div>
                  </div>

                  <Badge className={cn("hidden rounded-full border-0 px-2.5 py-1 text-xs sm:inline-flex", statusConfig.color)}>
                    {statusConfig.label}
                  </Badge>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
