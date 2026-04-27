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
  const colorMap: Record<string, { bg: string, text: string, shadow: string, border: string }> = {
    "gradient-primary": { bg: "bg-indigo-600", text: "text-indigo-600", shadow: "shadow-indigo-500/20", border: "border-indigo-500/20" },
    "gradient-sage": { bg: "bg-emerald-500", text: "text-emerald-600", shadow: "shadow-emerald-500/20", border: "border-emerald-500/20" },
    "gradient-warm": { bg: "bg-amber-500", text: "text-amber-600", shadow: "shadow-amber-500/20", border: "border-amber-500/20" },
    "gradient-rose": { bg: "bg-rose-500", text: "text-rose-600", shadow: "shadow-rose-500/20", border: "border-rose-500/20" },
  };

  const colors = colorMap[gradientClass] || colorMap["gradient-primary"];

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-0 shadow-lg shadow-slate-200/40 bg-white/80 backdrop-blur-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5 animate-fade-in rounded-[32px] border-b-4 group",
        colors.border,
        delay
      )}
    >
      <CardContent className="p-6">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all group-hover:scale-110 group-hover:rotate-3",
              colors.bg,
              colors.shadow
            )}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            <p className={cn("text-[10px] font-black uppercase tracking-[0.2em] opacity-40", colors.text)}>
              {title}
            </p>
          </div>
          
          <div className="space-y-1.5">
            <p className="text-2xl font-black text-[#1e1b4b] tracking-tighter leading-none group-hover:translate-x-1 transition-transform">
              {value}
            </p>
            {subtitle && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <span className={cn("w-1 h-1 rounded-full", colors.bg)} />
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsCards() {
  const { therapistId } = useSubscription();
  const supabase = createClient() as any;
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
