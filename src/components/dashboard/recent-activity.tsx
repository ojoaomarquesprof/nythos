"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  UserPlus,
  CreditCard,
  FileText,
  Calendar,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatTime, formatDate } from "@/lib/constants";
import type { Patient, Session, CashFlow } from "@/types/database";

interface Activity {
  id: string;
  type:
    | "session_completed"
    | "patient_added"
    | "payment_received"
    | "session_scheduled"
    | "expense_added";
  description: string;
  date: Date;
  highlight?: string;
}

const activityConfig = {
  session_completed: {
    icon: CheckCircle2,
    color: "text-green-600",
    bg: "bg-green-100",
  },
  patient_added: {
    icon: UserPlus,
    color: "text-violet-600",
    bg: "bg-violet-100",
  },
  payment_received: {
    icon: CreditCard,
    color: "text-emerald-600",
    bg: "bg-emerald-100",
  },
  expense_added: {
    icon: Wallet,
    color: "text-red-600",
    bg: "bg-red-100",
  },
  session_scheduled: {
    icon: Calendar,
    color: "text-sky-600",
    bg: "bg-sky-100",
  },
};

function getTimeAgo(date: Date) {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " anos atrás";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " meses atrás";
  interval = seconds / 86400;
  if (interval >= 1) return Math.floor(interval) + " dias atrás";
  interval = seconds / 3600;
  if (interval >= 1) return "Há " + Math.floor(interval) + "h";
  interval = seconds / 60;
  if (interval >= 1) return "Há " + Math.floor(interval) + " min";
  return "Agora mesmo";
}

export function RecentActivity() {
  const supabase = createClient();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivities();
  }, []);

  async function loadActivities() {
    setLoading(true);
    try {
      // Fetch data in parallel
      const [sessionsRes, patientsRes, cashFlowRes] = await Promise.all([
        supabase
          .from("sessions")
          .select("id, status, scheduled_at, updated_at, patient_id")
          .order("updated_at", { ascending: false })
          .limit(10),
        supabase
          .from("patients")
          .select("id, full_name, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("cash_flow")
          .select("id, type, amount, description, created_at, status")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const events: Activity[] = [];

      // Add Patients
      if (patientsRes.data) {
        patientsRes.data.forEach((p: Patient) => {
          events.push({
            id: `p_${p.id}`,
            type: "patient_added",
            description: `Novo paciente cadastrado: ${p.full_name}`,
            date: new Date(p.created_at),
          });
        });
      }

      // Add Cash Flow
      if (cashFlowRes.data) {
        cashFlowRes.data.forEach((cf: CashFlow) => {
          if (cf.status === "confirmed") {
            events.push({
              id: `cf_${cf.id}`,
              type: cf.type === "income" ? "payment_received" : "expense_added",
              description:
                cf.type === "income"
                  ? `Pagamento recebido: ${cf.description}`
                  : `Despesa registrada: ${cf.description}`,
              date: new Date(cf.created_at),
              highlight: formatCurrency(Number(cf.amount)),
            });
          }
        });
      }

      // We need patient names for sessions
      const sessionPatientIds = [
        ...new Set((sessionsRes.data || []).map((s: Session) => s.patient_id)),
      ];
      let sessionPatients: any[] = [];
      if (sessionPatientIds.length > 0) {
        const { data } = await supabase
          .from("patients")
          .select("id, full_name")
          .in("id", sessionPatientIds);
        sessionPatients = data || [];
      }

      // Add Sessions
      if (sessionsRes.data) {
        sessionsRes.data.forEach((s: Session) => {
          const patientName =
            sessionPatients.find((p: { id: string; full_name: string }) => p.id === s.patient_id)?.full_name ||
            "Paciente";

          if (s.status === "completed") {
            events.push({
              id: `s_comp_${s.id}`,
              type: "session_completed",
              description: `Sessão com ${patientName} finalizada`,
              date: new Date(s.updated_at),
              highlight: "Realizada",
            });
          } else if (s.status === "scheduled") {
            events.push({
              id: `s_sch_${s.id}`,
              type: "session_scheduled",
              description: `Sessão agendada com ${patientName}`,
              date: new Date(s.updated_at), // Using updated_at to show when it was created/updated
              highlight: `${formatDate(s.scheduled_at, {
                day: "2-digit",
                month: "short",
              })}, ${formatTime(s.scheduled_at)}`,
            });
          }
        });
      }

      // Sort all events by date descending and take top 6
      events.sort((a, b) => b.date.getTime() - a.date.getTime());
      setActivities(events.slice(0, 6));
    } catch (error) {
      console.error("Failed to load activities", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-0 shadow-sm animate-fade-in delay-400">
      <CardHeader className="pb-3 px-4 md:px-6">
        <CardTitle className="text-base font-semibold">
          Atividade Recente
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 md:px-6 pb-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma atividade recente
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[18px] top-3 bottom-3 w-px bg-border" />

            <div className="space-y-1">
              {activities.map((activity) => {
                const config = activityConfig[activity.type];
                const Icon = config.icon;

                return (
                  <div
                    key={activity.id}
                    className="relative flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 z-10",
                        config.bg
                      )}
                    >
                      <Icon className={cn("w-4 h-4", config.color)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-1">
                      <p className="text-sm leading-snug">
                        {activity.description}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {getTimeAgo(activity.date)}
                        </span>
                        {activity.highlight && (
                          <span className="text-[11px] font-medium text-primary bg-primary/5 px-1.5 py-0.5 rounded">
                            {activity.highlight}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
