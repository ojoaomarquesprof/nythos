"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  Users,
  Wallet,
  Clock,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/constants";
import { useSubscription } from "@/hooks/use-subscription";
import type { Session } from "@/types/database";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  gradientClass: string;
  delay?: string;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  gradientClass,
  delay = "",
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-0 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 animate-fade-in",
        delay
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {title}
            </p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-1">
                {trend.value >= 0 ? (
                  <TrendingUp className="w-3 h-3 text-green-600" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-500" />
                )}
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    trend.value >= 0 ? "text-green-600" : "text-red-500"
                  )}
                >
                  {trend.value > 0 ? "+" : ""}
                  {trend.value}%
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {trend.label}
                </span>
              </div>
            )}
          </div>
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0",
              gradientClass
            )}
          >
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsCards() {
  const { therapistId } = useSubscription();
  const supabase = createClient();
  const [stats, setStats] = useState({
    sessionsToday: 0,
    nextSessionTime: "",
    activePatients: 0,
    monthlyIncome: 0,
    pendingPayments: 0,
    pendingAmount: 0,
  });

  useEffect(() => {
    if (therapistId) {
      loadStats();
    }
  }, [therapistId]);

  async function loadStats() {
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

    const todaySessions = (sessionsRes.data || []) as Session[];
    const nextSession = todaySessions.find(
      (s: Session) => new Date(s.scheduled_at) > new Date()
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
        (sum: number, t: { amount: number }) => sum + Number(t.amount),
        0
      ),
      pendingPayments: (pendingRes.data || []).length,
      pendingAmount: (pendingRes.data || []).reduce(
        (sum: number, t: { amount: number }) => sum + Number(t.amount),
        0
      ),
    });
  }

  const cards = [
    {
      title: "Sessões Hoje",
      value: stats.sessionsToday,
      subtitle: stats.nextSessionTime
        ? `Próxima às ${stats.nextSessionTime}`
        : "Sem sessões hoje",
      icon: CalendarDays,
      gradientClass: "gradient-primary",
      delay: "delay-100",
    },
    {
      title: "Pacientes Ativos",
      value: stats.activePatients,
      icon: Users,
      gradientClass: "gradient-sage",
      delay: "delay-200",
    },
    {
      title: "Receita do Mês",
      value: formatCurrency(stats.monthlyIncome),
      icon: Wallet,
      gradientClass: "gradient-warm",
      delay: "delay-300",
    },
    {
      title: "Pgto. Pendentes",
      value: stats.pendingPayments,
      subtitle: stats.pendingAmount
        ? `${formatCurrency(stats.pendingAmount)} a receber`
        : undefined,
      icon: Clock,
      gradientClass: "gradient-rose",
      delay: "delay-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {cards.map((stat) => (
        <StatCard key={stat.title} {...stat} />
      ))}
    </div>
  );
}
