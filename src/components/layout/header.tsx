"use client";

import { useEffect, useState } from "react";
import { Bell, Search, Brain, CalendarDays, Wallet, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import Link from "next/link";
import { getGreeting } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

export function Header() {
  const greeting = getGreeting();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionsTodayCount, setSessionsTodayCount] = useState(0);
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Perfil
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setProfile(profileData);

      // 2. Sessões de hoje
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const { count: sessionsToday } = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("scheduled_at", todayStart.toISOString())
        .lte("scheduled_at", todayEnd.toISOString());

      // 3. Pagamentos pendentes (sessions completed sem pagamento confirmado)
      const { count: pendingPayments } = await supabase
        .from("cash_flow")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("type", "income")
        .eq("status", "pending");

      setSessionsTodayCount(sessionsToday || 0);
      setPendingPaymentsCount(pendingPayments || 0);
    }
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userName = profile?.full_name || "Psicóloga";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
        {/* Left: Logo (mobile only) + Greeting */}
        <div className="flex items-center gap-3">
          {/* Mobile logo */}
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shadow-sm md:hidden">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{greeting} 👋</p>
            <h2 className="text-base font-semibold tracking-tight -mt-0.5">
              {userName}
            </h2>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Search button */}
          <button className="p-2.5 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <Search className="w-5 h-5" />
          </button>

          {/* Notifications */}
          <Popover>
            <PopoverTrigger className="relative p-2.5 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Bell className="w-5 h-5" />
              {(sessionsTodayCount + pendingPaymentsCount) > 0 && (
                <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-destructive text-white border-2 border-background">
                  {sessionsTodayCount + pendingPaymentsCount}
                </Badge>
              )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 overflow-hidden">
              <PopoverHeader className="px-4 py-3 border-b border-border/50 bg-muted/20">
                <PopoverTitle className="text-sm font-semibold">Notificações</PopoverTitle>
              </PopoverHeader>
              <div className="p-2 space-y-1">
                {sessionsTodayCount > 0 && (
                  <Link
                    href="/dashboard/schedule"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <CalendarDays className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium">Sessões de Hoje</p>
                      <p className="text-[11px] text-muted-foreground">
                        Você tem {sessionsTodayCount} {sessionsTodayCount === 1 ? "sessão agendada" : "sessões agendadas"} para hoje.
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                )}

                {pendingPaymentsCount > 0 && (
                  <Link
                    href="/dashboard/finances"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium">Pagamentos Pendentes</p>
                      <p className="text-[11px] text-muted-foreground">
                        {pendingPaymentsCount} {pendingPaymentsCount === 1 ? "recebimento pendente" : "recebimentos pendentes"} a confirmar.
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                )}

                {sessionsTodayCount === 0 && pendingPaymentsCount === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-xs text-muted-foreground">Tudo em dia por aqui! ✨</p>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Avatar (mobile only) */}
          <Avatar className="w-9 h-9 md:hidden ring-2 ring-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
