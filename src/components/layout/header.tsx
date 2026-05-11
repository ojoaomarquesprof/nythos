"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCheck,
  FileText,
  Search,
  Wallet,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
        supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("scheduled_at", todayStart.toISOString())
          .lte("scheduled_at", todayEnd.toISOString()),
        supabase
          .from("cash_flow")
          .select("*")
          .eq("user_id", user.id)
          .eq("type", "income")
          .eq("status", "pending"),
        supabase
          .from("anamnesis_responses")
          .select("*, patients(full_name), anamnesis_templates!inner(title, user_id)")
          .eq("anamnesis_templates.user_id", user.id)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      setSessionsTodayCount(sessionsRes.count || 0);

      const savedDismissed = JSON.parse(
        localStorage.getItem("dismissed_notifications") || "[]"
      );
      const anamnesisData = (anamnesisRes.data || []).filter(
        (item: any) => !savedDismissed.includes(`anamnesis-${item.id}`)
      );
      const paymentsData = (paymentsRes.data || []).filter(
        (item: any) => !savedDismissed.includes(`payment-${item.id}`)
      );

      setPendingPaymentsCount(paymentsData.length);
      setNewAnamnesis(anamnesisData);
    } catch {
      console.error("[header] Failed to load notifications");
    }
  }, [supabase, profile]);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      loadNotificationData();

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
    newAnamnesis.forEach((item) => newDismissed.push(`anamnesis-${item.id}`));
    saveDismissed(newDismissed);
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
  const profileMeta = profile?.crp ? `CRP ${profile.crp}` : "Painel profissional";
  const totalNotifications =
    (sessionsTodayCount > 0 ? 1 : 0) +
    (pendingPaymentsCount > 0 ? 1 : 0) +
    newAnamnesis.length;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 shadow-[0_10px_28px_rgba(41,31,67,0.05)] supports-backdrop-filter:backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 md:px-6 md:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/65 shadow-[var(--shadow-sm)] md:hidden">
            <img
              src="/logo-icon.png"
              alt="Nythos Logo"
              className="h-8 w-8 object-contain"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase leading-none tracking-[0.2em] text-primary/55">
                {greeting}
              </span>
              <span className="hidden h-2 w-2 rounded-full bg-accent shadow-[0_0_0_6px_rgba(134,181,160,0.12)] sm:inline-flex" />
            </div>
            <h2 className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-foreground md:text-xl">
              {userName}
            </h2>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Seu espaço clínico com visão clara do dia.
            </p>
          </div>
        </div>

        <div className="hidden flex-1 items-center justify-center px-2 lg:flex">
          <button
            type="button"
            aria-label="Busca global em preparação"
            title="Busca global em preparação"
            className="group flex h-11 w-full max-w-xl items-center gap-3 rounded-2xl border border-border/70 bg-white/65 px-4 text-left text-sm text-muted-foreground shadow-[var(--shadow-sm)] transition-all duration-200 hover:border-primary/15 hover:bg-white/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-105">
              <Search className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate">
              Buscar pacientes, sessões e finanças
            </span>
            <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              Visual
            </span>
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label="Busca global em preparação"
            title="Busca global em preparação"
            className="group rounded-2xl border border-white/70 bg-white/70 p-2.5 text-muted-foreground shadow-[var(--shadow-sm)] transition-all duration-200 hover:border-primary/15 hover:bg-white/90 hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 active:scale-[0.98] lg:hidden"
          >
            <Search className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
          </button>

          <Popover>
            <PopoverTrigger className="group relative cursor-pointer rounded-2xl border border-white/70 bg-white/70 p-2.5 text-muted-foreground shadow-[var(--shadow-sm)] outline-none transition-all duration-200 hover:border-primary/15 hover:bg-white/90 hover:text-primary focus-visible:ring-4 focus-visible:ring-ring/20 active:scale-[0.98]">
              <Bell className="h-5 w-5 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110" />
              {totalNotifications > 0 && (
                <Badge className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-primary px-0 text-[9px] font-black text-white shadow-[var(--shadow-sm)]">
                  {totalNotifications}
                </Badge>
              )}
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={10}
              className="w-[22rem] overflow-hidden rounded-[26px] border-border/70 bg-popover/95 p-0"
            >
              <PopoverHeader className="flex flex-row items-center justify-between border-b border-border/60 bg-muted/25 px-4 py-3">
                <div>
                  <PopoverTitle className="text-sm font-semibold">Notificações</PopoverTitle>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Alertas importantes do seu dia.
                  </p>
                </div>
                {totalNotifications > 0 && (
                  <button
                    onClick={handleMarkAsRead}
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10 hover:text-primary/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                  >
                    <CheckCheck className="h-3 w-3" />
                    Limpar
                  </button>
                )}
              </PopoverHeader>

              <div className="max-h-[420px] space-y-1 overflow-y-auto p-2">
                {totalNotifications === 0 ? (
                  <div className="space-y-2 py-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground/40">
                      <Bell className="h-6 w-6" />
                    </div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Nenhuma nova notificação
                    </p>
                    <p className="text-[11px] text-muted-foreground/75">
                      Tudo em dia por aqui.
                    </p>
                  </div>
                ) : (
                  <>
                    {sessionsTodayCount > 0 && (
                      <Link
                        href="/dashboard/schedule"
                        className="group flex items-center gap-3 rounded-2xl border border-transparent p-3 transition-all duration-200 hover:border-border/60 hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                          <CalendarDays className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold">Sessões de Hoje</p>
                          <p className="text-[11px] text-muted-foreground">
                            Você tem {sessionsTodayCount}{" "}
                            {sessionsTodayCount === 1
                              ? "sessão agendada"
                              : "sessões agendadas"}{" "}
                            para hoje.
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </Link>
                    )}

                    {newAnamnesis.map((item) => (
                      <Link
                        key={item.id}
                        href={`/dashboard/patients/${item.patient_id}?tab=anamnesis`}
                        className="group flex items-center gap-3 rounded-2xl border border-transparent p-3 transition-all duration-200 hover:border-border/60 hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/30 text-accent-foreground">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold">Anamnese Preenchida</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {item.patients?.name} preencheu: {item.anamnesis_templates?.title}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </Link>
                    ))}

                    {pendingPaymentsCount > 0 && (
                      <Link
                        href="/dashboard/finances"
                        className="group flex items-center gap-3 rounded-2xl border border-transparent p-3 transition-all duration-200 hover:border-border/60 hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-warning/40 text-warning-foreground">
                          <Wallet className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold">Pagamentos Pendentes</p>
                          <p className="text-[11px] text-muted-foreground">
                            {pendingPaymentsCount}{" "}
                            {pendingPaymentsCount === 1
                              ? "recebimento pendente"
                              : "recebimentos pendentes"}{" "}
                            a confirmar.
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </Link>
                    )}
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <div className="hidden items-center gap-3 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 shadow-[var(--shadow-sm)] md:flex">
            <Avatar className="h-10 w-10 ring-2 ring-primary/10">
              {profile?.avatar_url && (
                <AvatarImage src={profile.avatar_url} alt={profile.full_name || ""} />
              )}
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{profileMeta}</p>
            </div>
          </div>

          <Avatar className="h-10 w-10 ring-2 ring-primary/20 md:hidden">
            {profile?.avatar_url && (
              <AvatarImage src={profile.avatar_url} alt={profile.full_name || ""} />
            )}
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
