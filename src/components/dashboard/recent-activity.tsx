"use client";

import { useEffect, useState } from "react";
import { Calendar, CheckCircle2, Clock, CreditCard, UserPlus, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { formatCurrency, formatDate, formatTime } from "@/lib/constants";
import type { Patient } from "@/types/database";

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

type RecentPatientRow = Pick<Patient, "id" | "full_name" | "created_at">;
type RecentCashFlowRow = {
  id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string | null;
  status: string;
};
type RecentSessionRow = {
  id: string;
  status: string;
  scheduled_at: string;
  updated_at: string | null;
  patient_id: string;
};

const activityConfig = {
  session_completed: {
    icon: CheckCircle2,
    color: "text-emerald-700",
    bg: "bg-emerald-50 ring-emerald-100",
  },
  patient_added: {
    icon: UserPlus,
    color: "text-primary",
    bg: "bg-primary/10 ring-primary/15",
  },
  payment_received: {
    icon: CreditCard,
    color: "text-emerald-700",
    bg: "bg-emerald-50 ring-emerald-100",
  },
  expense_added: {
    icon: Wallet,
    color: "text-rose-700",
    bg: "bg-rose-50 ring-rose-100",
  },
  session_scheduled: {
    icon: Calendar,
    color: "text-sky-700",
    bg: "bg-sky-50 ring-sky-100",
  },
};

function getTimeAgo(date: Date) {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return `${Math.floor(interval)} anos atrás`;
  interval = seconds / 2592000;
  if (interval > 1) return `${Math.floor(interval)} meses atrás`;
  interval = seconds / 86400;
  if (interval >= 1) return `${Math.floor(interval)} dias atrás`;
  interval = seconds / 3600;
  if (interval >= 1) return `Há ${Math.floor(interval)}h`;
  interval = seconds / 60;
  if (interval >= 1) return `Há ${Math.floor(interval)} min`;
  return "Agora mesmo";
}

export function RecentActivity() {
  const { therapistId } = useSubscription();
  const supabase = createClient();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (therapistId) {
      loadActivities();
    }
  }, [therapistId]);

  async function loadActivities() {
    setLoading(true);
    setHasError(false);

    try {
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

      if (sessionsRes.error || patientsRes.error || cashFlowRes.error) {
        throw new Error("Failed to load activity");
      }

      const events: Activity[] = [];

      (patientsRes.data || []).forEach((patient: RecentPatientRow) => {
        events.push({
          id: `p_${patient.id}`,
          type: "patient_added",
          description: `Novo paciente cadastrado: ${patient.full_name}`,
          date: new Date(patient.created_at ?? new Date().toISOString()),
        });
      });

      (cashFlowRes.data || []).forEach((cashFlow: RecentCashFlowRow) => {
        if (cashFlow.status === "confirmed") {
          events.push({
            id: `cf_${cashFlow.id}`,
            type: cashFlow.type === "income" ? "payment_received" : "expense_added",
            description:
              cashFlow.type === "income"
                ? `Pagamento recebido: ${cashFlow.description}`
                : `Despesa registrada: ${cashFlow.description}`,
            date: new Date(cashFlow.created_at ?? new Date().toISOString()),
            highlight: formatCurrency(Number(cashFlow.amount)),
          });
        }
      });

      const sessionPatientIds = [
        ...new Set((sessionsRes.data || []).map((session: RecentSessionRow) => session.patient_id)),
      ];
      let sessionPatients: Array<Pick<Patient, "id" | "full_name">> = [];

      if (sessionPatientIds.length > 0) {
        const { data, error } = await supabase
          .from("patients")
          .select("id, full_name")
          .in("id", sessionPatientIds);

        if (error) throw error;
        sessionPatients = data || [];
      }

      (sessionsRes.data || []).forEach((session: RecentSessionRow) => {
        const patientName =
          sessionPatients.find((patient) => patient.id === session.patient_id)?.full_name ||
          "Paciente";

        if (session.status === "completed") {
          events.push({
            id: `s_comp_${session.id}`,
            type: "session_completed",
            description: `Sessão com ${patientName} finalizada`,
            date: new Date(session.updated_at ?? new Date().toISOString()),
            highlight: "Realizada",
          });
        } else if (session.status === "scheduled") {
          events.push({
            id: `s_sch_${session.id}`,
            type: "session_scheduled",
            description: `Sessão agendada com ${patientName}`,
            date: new Date(session.updated_at ?? new Date().toISOString()),
            highlight: `${formatDate(session.scheduled_at, {
              day: "2-digit",
              month: "short",
            })}, ${formatTime(session.scheduled_at)}`,
          });
        }
      });

      events.sort((a, b) => b.date.getTime() - a.date.getTime());
      setActivities(events.slice(0, 6));
    } catch {
      console.error("[recent-activity] Failed to load activities");
      setHasError(true);
      setActivities([]);
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
              Linha do tempo
            </CardTitle>
            <p className="text-sm text-muted-foreground">Movimentos recentes da prática.</p>
          </div>
          <div className="flex size-9 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Clock className="size-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="flex gap-3 rounded-2xl border border-border/50 p-3">
                <div className="size-10 animate-pulse rounded-xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : hasError ? (
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-5 text-sm text-muted-foreground">
            Não foi possível carregar a linha do tempo agora.
          </div>
        ) : activities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-primary/20 bg-primary/[0.03] p-6 text-center">
            <p className="text-sm font-medium text-foreground">Nenhuma atividade recente</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Os eventos aparecem aqui conforme a rotina clínica acontece.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activities.map((activity) => {
              const config = activityConfig[activity.type];
              const Icon = config.icon;

              return (
                <div
                  key={activity.id}
                  className="flex min-w-0 items-start gap-3 rounded-2xl border border-border/50 bg-white/60 p-3"
                >
                  <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl ring-1", config.bg)}>
                    <Icon className={cn("size-4", config.color)} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{activity.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{getTimeAgo(activity.date)}</span>
                      {activity.highlight && (
                        <>
                          <span className="size-1 rounded-full bg-border" />
                          <span className="font-medium text-primary">{activity.highlight}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
