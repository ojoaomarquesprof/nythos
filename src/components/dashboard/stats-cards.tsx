"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock, type LucideIcon, Users, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/constants";
import { useSubscription } from "@/hooks/use-subscription";
import type { Session } from "@/types/database";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: LucideIcon;
  tone: "violet" | "mint" | "amber" | "rose";
  loading?: boolean;
}

const toneClasses = {
  violet: {
    icon: "bg-primary/10 text-primary ring-primary/15",
    dot: "bg-primary",
  },
  mint: {
    icon: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
  },
  amber: {
    icon: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500",
  },
  rose: {
    icon: "bg-rose-50 text-rose-700 ring-rose-200",
    dot: "bg-rose-500",
  },
} satisfies Record<StatCardProps["tone"], { icon: string; dot: string }>;

function StatCard({ title, value, subtitle, icon: Icon, tone, loading }: StatCardProps) {
  const colors = toneClasses[tone];

  return (
    <Card className="animate-fade-in border-border/70 bg-card/95 py-0 shadow-[0_12px_34px_rgba(41,31,67,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(41,31,67,0.1)]">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("flex size-11 items-center justify-center rounded-2xl ring-1", colors.icon)}>
            <Icon className="size-5" />
          </div>
          <span className={cn("mt-1 size-2 rounded-full", colors.dot)} />
        </div>

        <div className="mt-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
          ) : (
            <p className="truncate text-2xl font-semibold tracking-tight text-foreground">
              {value}
            </p>
          )}
          <p className="min-h-5 text-sm leading-5 text-muted-foreground">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsCards() {
  const { therapistId } = useSubscription();
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [stats, setStats] = useState({
    sessionsToday: 0,
    nextSessionTime: "",
    activePatients: 0,
    monthlyIncome: 0,
    pendingPayments: 0,
    pendingAmount: 0,
  });

  const loadStats = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      const [sessionsRes, patientsRes, incomeRes, pendingRes] = await Promise.all([
        supabase
          .from("sessions")
          .select("scheduled_at")
          .gte("scheduled_at", today.toISOString())
          .lt("scheduled_at", tomorrow.toISOString())
          .order("scheduled_at"),
        supabase
          .from("patients")
          .select("id", { count: "exact" })
          .eq("status", "active"),
        supabase
          .from("cash_flow")
          .select("amount")
          .eq("type", "income")
          .eq("status", "confirmed")
          .gte("created_at", monthStart.toISOString()),
        supabase
          .from("cash_flow")
          .select("amount")
          .eq("type", "income")
          .eq("status", "pending"),
      ]);

      if (sessionsRes.error || patientsRes.error || incomeRes.error || pendingRes.error) {
        throw new Error("Failed to load dashboard stats");
      }

      const todaySessions = (sessionsRes.data || []) as Pick<Session, "scheduled_at">[];
      const nextSession = todaySessions.find(
        (session) => new Date(session.scheduled_at) > new Date()
      );

      setStats({
        sessionsToday: todaySessions.length,
        nextSessionTime: nextSession
          ? new Date(nextSession.scheduled_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "",
        activePatients: patientsRes.count || 0,
        monthlyIncome: (incomeRes.data || []).reduce(
          (sum: number, transaction: { amount: number }) => sum + Number(transaction.amount),
          0
        ),
        pendingPayments: (pendingRes.data || []).length,
        pendingAmount: (pendingRes.data || []).reduce(
          (sum: number, transaction: { amount: number }) => sum + Number(transaction.amount),
          0
        ),
      });
      setHasError(false);
    } catch {
      console.error("[stats-cards] Failed to load stats");
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    if (therapistId) {
      queueMicrotask(() => {
        if (!cancelled) {
          void loadStats();
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [therapistId, loadStats]);

  const fallbackSubtitle = hasError
    ? "Não foi possível atualizar agora"
    : "Sem dados registrados";

  const cards = [
    {
      title: "Sessões hoje",
      value: stats.sessionsToday,
      subtitle: stats.nextSessionTime
        ? `Próxima às ${stats.nextSessionTime}`
        : stats.sessionsToday > 0
          ? "Agenda do dia organizada"
          : fallbackSubtitle,
      icon: CalendarDays,
      tone: "violet" as const,
    },
    {
      title: "Pacientes ativos",
      value: stats.activePatients,
      subtitle: stats.activePatients > 0 ? "Em acompanhamento" : fallbackSubtitle,
      icon: Users,
      tone: "mint" as const,
    },
    {
      title: "Receita do mês",
      value: formatCurrency(stats.monthlyIncome),
      subtitle: stats.monthlyIncome > 0 ? "Recebimentos confirmados" : fallbackSubtitle,
      icon: Wallet,
      tone: "amber" as const,
    },
    {
      title: "Pagamentos pendentes",
      value: stats.pendingPayments,
      subtitle: stats.pendingAmount
        ? `${formatCurrency(stats.pendingAmount)} a receber`
        : fallbackSubtitle,
      icon: Clock,
      tone: "rose" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
      {cards.map((stat) => (
        <StatCard key={stat.title} {...stat} loading={loading} />
      ))}
    </div>
  );
}
