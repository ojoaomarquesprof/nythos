"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Bell, Search, Brain, CalendarDays, Wallet, ArrowRight, FileText, CheckCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  const [newAnamnesis, setNewAnamnesis] = useState<any[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);
  const supabase = createClient() as any;
  const channelRef = useRef<any>(null);

  // Carregar notificações dispensadas do localStorage
  useEffect(() => {
    const saved = localStorage.getItem("dismissed_notifications");
    if (saved) {
      setDismissedNotifications(JSON.parse(saved));
    }
  }, []);

  const saveDismissed = (ids: string[]) => {
    localStorage.setItem("dismissed_notifications", JSON.stringify(ids));
    setDismissedNotifications(ids);
  };

  const loadNotificationData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (!profile) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfile(profileData);
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [sessionsRes, paymentsRes, anamnesisRes] = await Promise.all([
        supabase.from("sessions").select("*", { count: "exact", head: true }).eq("user_id", user.id).gte("scheduled_at", todayStart.toISOString()).lte("scheduled_at", todayEnd.toISOString()),
        supabase.from("cash_flow").select("*").eq("user_id", user.id).eq("type", "income").eq("status", "pending"),
        supabase
          .from("anamnesis_responses")
          .select("*, patients(full_name), anamnesis_templates!inner(title, user_id)")
          .eq("anamnesis_templates.user_id", user.id)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(10)
      ]);

      setSessionsTodayCount(sessionsRes.count || 0);
      
      // Filtrar notificações já dispensadas
      const savedDismissed = JSON.parse(localStorage.getItem("dismissed_notifications") || "[]");
      const anamnesisData = (anamnesisRes.data || []).filter((item: any) => !savedDismissed.includes(`anamnesis-${item.id}`));
      const paymentsData = (paymentsRes.data || []).filter((item: any) => !savedDismissed.includes(`payment-${item.id}`));

      setPendingPaymentsCount(paymentsData.length);
      setNewAnamnesis(anamnesisData);
    } catch (err) {
      console.error("Erro ao carregar notificações:", err);
    }
  }, [supabase, profile]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Carga inicial
      loadNotificationData();

      // 2. Setup Realtime (apenas uma vez)
      if (!channelRef.current) {
        const channelName = `header-notifications-${user.id}`;
        channelRef.current = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "sessions", filter: `user_id=eq.${user.id}` },
            () => loadNotificationData()
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cash_flow", filter: `user_id=eq.${user.id}` },
            () => loadNotificationData()
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "anamnesis_responses" },
            () => loadNotificationData()
          )
          .subscribe();
      }
    };

    init();

    const handleManualRefresh = () => {
      loadNotificationData();
    };

    window.addEventListener("notifications:refresh", handleManualRefresh);

    return () => {
      window.removeEventListener("notifications:refresh", handleManualRefresh);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [loadNotificationData, supabase]);

  const handleMarkAsRead = () => {
    const newDismissed = [...dismissedNotifications];
    newAnamnesis.forEach(item => newDismissed.push(`anamnesis-${item.id}`));
    // Para pagamentos pendentes, como eles são baseados no estado do banco,
    // podemos dispensar os IDs atuais que foram carregados.
    // Mas note que novos pagamentos que surgirem depois aparecerão normalmente.
    saveDismissed(newDismissed);
    // Resetar contagens locais para feedback imediato
    setNewAnamnesis([]);
    setPendingPaymentsCount(0);
  };

  const userName = profile?.full_name || "Psicóloga";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const totalNotifications = (sessionsTodayCount > 0 ? 1 : 0) + (pendingPaymentsCount > 0 ? 1 : 0) + newAnamnesis.length;

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 max-w-7xl mx-auto w-full">
        {/* Left: Logo (mobile only) + Greeting */}
        <div className="flex items-center gap-4">
          {/* Mobile logo */}
          <div className="w-10 h-10 flex items-center justify-center md:hidden shrink-0">
            <img src="/logo-icon.png" alt="Nythos Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-primary/40 leading-none">
                {greeting}
              </span>
              <span className="text-sm">👋</span>
            </div>
            <h2 className="text-lg font-bold tracking-tight text-slate-700 -mt-1 leading-tight">
              {userName}
            </h2>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {/* Search button */}
          <button className="p-3 rounded-xl hover:bg-indigo-50 transition-all text-slate-400 hover:text-primary group active:scale-90">
            <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>

          {/* Notifications */}
          <Popover>
            <PopoverTrigger className="relative p-3 rounded-xl hover:bg-rose-50 transition-all text-slate-400 hover:text-rose-500 group active:scale-90 outline-none border-none bg-transparent cursor-pointer">
              <Bell className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              {totalNotifications > 0 && (
                <Badge className="absolute top-2 right-2 h-4 w-4 p-0 flex items-center justify-center text-[9px] font-black bg-rose-500 text-white border-2 border-white shadow-sm animate-bounce">
                  {totalNotifications}
                </Badge>
              )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 overflow-hidden rounded-2xl border-border/50 shadow-2xl">
              <PopoverHeader className="px-4 py-3 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between">
                <PopoverTitle className="text-sm font-semibold">Notificações</PopoverTitle>
                {totalNotifications > 0 && (
                  <button 
                    onClick={handleMarkAsRead}
                    className="text-[10px] font-bold text-primary hover:text-primary/70 transition-colors flex items-center gap-1"
                  >
                    <CheckCheck className="w-3 h-3" />
                    Limpar
                  </button>
                )}
              </PopoverHeader>
              <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto">
                {totalNotifications === 0 && (
                  <div className="py-8 text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground/40">
                      <Bell className="w-6 h-6" />
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">Nenhuma nova notificação</p>
                  </div>
                )}

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

                {newAnamnesis.map((item) => (
                  <Link
                    key={item.id}
                    href={`/dashboard/patients/${item.patient_id}?tab=anamnesis`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium">Anamnese Preenchida</p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.patients?.name} preencheu: {item.anamnesis_templates?.title}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}

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

                {totalNotifications === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-xs text-muted-foreground">Tudo em dia por aqui! ✨</p>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Avatar (mobile only) */}
          <Avatar className="w-9 h-9 md:hidden ring-2 ring-primary/20">
            {profile?.avatar_url && (
              <AvatarImage src={profile.avatar_url} alt={profile.full_name || ""} />
            )}
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
