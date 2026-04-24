"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, MapPin, Video, MoreVertical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SESSION_STATUS, formatTime } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Session, Patient } from "@/types/database";

const avatarColors = [
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

export function UpcomingSessions() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<(Session & { patient?: Patient })[]>([]);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // Get today's remaining sessions
    const { data: sessionsData } = await supabase
      .from("sessions")
      .select("*")
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", endOfDay.toISOString())
      .eq("status", "scheduled")
      .order("scheduled_at")
      .limit(5);

    if (sessionsData && sessionsData.length > 0) {
      const patientIds = [...new Set(sessionsData.map((s: Session) => s.patient_id))];
      const { data: patientsData } = await supabase
        .from("patients")
        .select("*")
        .in("id", patientIds);

      const enriched = sessionsData.map((s: Session) => ({
        ...s,
        patient: patientsData?.find((p: Patient) => p.id === s.patient_id),
      }));
      setSessions(enriched);
    }
  }

  return (
    <Card className="border-0 shadow-sm animate-fade-in delay-300">
      <CardHeader className="pb-3 px-4 md:px-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Próximas Sessões
          </CardTitle>
          <Link
            href="/dashboard/schedule"
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Ver agenda →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-4 md:px-6 pb-4">
        {sessions.length === 0 ? (
          <div className="py-8 text-center">
            <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Sem sessões pendentes hoje
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session, index) => {
              const statusConfig =
                SESSION_STATUS[session.status] || SESSION_STATUS.scheduled;
              const initials = session.patient?.full_name
                ? session.patient.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "??";
              const isOnline = session.session_type === "online";

              return (
                <Link
                  key={session.id}
                  href={`/dashboard/patients/${session.patient_id}`}
                  className="group flex items-center gap-3 p-3 rounded-xl hover:bg-muted/40 transition-all duration-200 cursor-pointer"
                >
                  <Avatar className="w-10 h-10 flex-shrink-0">
                    <AvatarFallback
                      className={cn(
                        "text-xs font-semibold",
                        avatarColors[index % avatarColors.length]
                      )}
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {session.patient?.full_name || "Paciente"}
                      </p>
                      {isOnline && (
                        <Badge
                          variant="outline"
                          className="h-5 gap-1 text-[10px] px-1.5 border-sky-200 text-sky-700 bg-sky-50"
                        >
                          <Video className="w-3 h-3" />
                          Online
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatTime(session.scheduled_at)} ·{" "}
                        {session.duration_minutes} min
                      </span>
                      {!isOnline && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          Consultório
                        </span>
                      )}
                    </div>
                  </div>

                  <Badge
                    variant="secondary"
                    className={cn("text-[10px] h-5", statusConfig.color)}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full mr-1",
                        statusConfig.dot
                      )}
                    />
                    {statusConfig.label}
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
