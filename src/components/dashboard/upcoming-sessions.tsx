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
import { useSubscription } from "@/hooks/use-subscription";
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
  const { therapistId } = useSubscription();
  const supabase = createClient() as any;
  const [sessions, setSessions] = useState<(Session & { patient?: Patient })[]>([]);

  useEffect(() => {
    if (therapistId) {
      loadSessions();
    }
  }, [therapistId]);

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
    <Card className="border-0 shadow-xl shadow-slate-200/40 bg-white/80 backdrop-blur-md rounded-[32px] overflow-hidden animate-fade-in delay-300">
      <CardHeader className="pb-4 px-8 pt-8 border-b border-indigo-50/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[11px] font-black text-indigo-600/40 uppercase tracking-[0.2em]">
            Próximas Sessões
          </CardTitle>
          <Link
            href="/dashboard/schedule"
            className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 transition-colors uppercase tracking-widest bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100/50 shadow-sm active:scale-95 transition-all"
          >
            Ver Agenda
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-8">
        {sessions.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-indigo-100/50 shadow-inner">
              <Clock className="w-8 h-8 text-indigo-200" />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Sem sessões hoje
            </p>
          </div>
        ) : (
          <div className="space-y-4">
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
                  className="group flex items-center gap-4 p-4 rounded-[28px] hover:bg-indigo-50/40 transition-all duration-300 border border-transparent hover:border-indigo-100/30"
                >
                  <Avatar className="w-14 h-14 flex-shrink-0 shadow-md group-hover:scale-105 transition-transform rounded-2xl">
                    <AvatarFallback
                      className={cn(
                        "text-sm font-black",
                        avatarColors[index % avatarColors.length]
                      )}
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-base font-bold text-[#1e1b4b] truncate group-hover:text-indigo-600 transition-colors">
                        {session.patient?.full_name || "Paciente"}
                      </p>
                      {isOnline && (
                        <div className="w-6 h-6 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center shadow-sm">
                          <Video className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <Clock className="w-3.5 h-3.5 text-indigo-300" />
                        {formatTime(session.scheduled_at)}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-slate-200" />
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                        {session.duration_minutes} min
                      </span>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    <Badge
                      className={cn(
                        "rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest border-0 shadow-sm",
                        statusConfig.color
                      )}
                    >
                      {statusConfig.label}
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
