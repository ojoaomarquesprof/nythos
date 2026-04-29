"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  UserPlus,
  CreditCard,
  FileText,
  Calendar,
  Wallet,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
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
    color: "text-teal-",
    bg: "bg-teal-",
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
  const { therapistId } = useSubscription();
  const supabase = createClient() as any;
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (therapistId) {
      loadActivities();
    }
  }, [therapistId]);

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
    <Card className="border-0 shadow-xl shadow-slate-200/40 bg-white/80 backdrop-blur-md rounded-[32px] overflow-hidden animate-fade-in delay-400">
      <CardHeader className="pb-4 px-8 pt-8 border-b border-teal-/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[11px] font-black text-teal-/40 uppercase tracking-[0.2em]">
            Linha do Tempo
          </CardTitle>
          <div className="w-8 h-8 rounded-xl bg-teal- text-teal- flex items-center justify-center shadow-inner">
            <Clock className="w-4 h-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-8">
        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-2xl bg-teal- flex-shrink-0" />
                <div className="flex-1 space-y-2 py-2">
                  <div className="h-4 bg-teal- rounded w-3/4" />
                  <div className="h-3 bg-teal- rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Nenhuma atividade recente
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Subtle Timeline line */}
            <div className="absolute left-[23px] top-6 bottom-6 w-0.5 bg-teal-/80" />

            <div className="space-y-6">
              {activities.map((activity) => {
                const config = activityConfig[activity.type];
                const Icon = config.icon;

                return (
                  <div
                    key={activity.id}
                    className="relative flex items-center gap-5 group"
                  >
                    {/* Premium Icon Container */}
                    <div
                      className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 z-10 shadow-md transition-all group-hover:scale-110",
                        config.bg
                      )}
                    >
                      <Icon className={cn("w-5 h-5", config.color)} />
                    </div>

                    {/* Content Section */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#1e1b4b] truncate group-hover:text-teal- transition-colors">
                        {activity.description}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {getTimeAgo(activity.date)}
                        </span>
                        {activity.highlight && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-teal-/50 text-[9px] font-black text-teal- uppercase tracking-widest border border-teal-/50">
                            <span className="w-1 h-1 rounded-full bg-teal-" />
                            {activity.highlight}
                          </div>
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
