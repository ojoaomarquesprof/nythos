"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Wallet,
  Settings,
  LogOut,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useSubscription } from "@/hooks/use-subscription";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/patients", label: "Pacientes", icon: Users },
  { href: "/dashboard/schedule", label: "Agenda", icon: CalendarDays },
  { href: "/dashboard/finances", label: "Financeiro", icon: Wallet },
];

const bottomItems = [
  { href: "/dashboard/settings", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const { hasSubscription, isTrial, daysLeft } = useSubscription();
  const supabase = createClient() as any;

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        const mergedProfile = {
          ...data,
          id: user.id,
          full_name: data?.full_name || user.user_metadata?.full_name || "Psicóloga",
          crp: data?.crp || user.user_metadata?.crp,
        };

        setProfile(mergedProfile as any);
      }
    }

    loadProfile();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "PS";
  const profileLabel = profile?.crp ? `CRP ${profile.crp}` : "Perfil profissional";

  return (
    <aside className="hidden overflow-hidden border-r border-sidebar-border/80 bg-sidebar/90 supports-backdrop-filter:backdrop-blur-xl md:sticky md:top-0 md:flex md:h-screen md:w-64 md:flex-col lg:w-72">
      <div className="flex h-full min-h-0 flex-col gap-3 px-3 py-3 lg:px-4 lg:py-4 max-[820px]:gap-2.5 max-[820px]:py-2.5">
        <div className="px-0.5 pb-1 pt-1.5 max-[820px]:px-0 max-[820px]:pb-0.5 max-[820px]:pt-1">
          <img
            src="/logo-horizontal.png"
            alt="Nythos"
            className="-ml-1 h-auto w-[172.5%] max-w-none object-contain object-left max-h-24 max-[820px]:w-[166.75%] max-[820px]:max-h-16"
          />
        </div>

        <nav className="scrollbar-hide min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 max-[820px]:space-y-2.5">
          <div className="rounded-[24px] border border-sidebar-border/70 bg-white/40 p-1.5 shadow-[var(--shadow-sm)] max-[820px]:rounded-[22px] max-[820px]:p-1">
            <p className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 max-[820px]:px-2.5 max-[820px]:pb-1">
              Navegação
            </p>
            <div className="space-y-0.5">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sidebar-ring/20 max-[820px]:gap-2 max-[820px]:px-2.5 max-[820px]:py-2 max-[820px]:text-xs",
                      isActive
                        ? "bg-white/90 text-sidebar-primary shadow-[var(--shadow-sm)] ring-1 ring-sidebar-primary/10"
                        : "text-muted-foreground hover:bg-white/70 hover:text-foreground hover:shadow-[var(--shadow-sm)]"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute bottom-1.5 left-0 top-1.5 w-1 rounded-r-full transition-all max-[820px]:bottom-1 max-[820px]:top-1",
                        isActive ? "bg-sidebar-primary" : "bg-transparent"
                      )}
                    />
                    <span
                      className={cn(
                        "relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition-all max-[820px]:h-8 max-[820px]:w-8",
                        isActive
                          ? "border-sidebar-primary/15 bg-sidebar-primary/12 text-sidebar-primary"
                          : "border-transparent bg-transparent text-muted-foreground group-hover:border-white/80 group-hover:bg-white/80 group-hover:text-foreground"
                      )}
                    >
                      <Icon
                        className="h-4 w-4 max-[820px]:h-4 max-[820px]:w-4"
                        strokeWidth={isActive ? 2.2 : 1.9}
                      />
                    </span>
                    <span className="relative min-w-0 flex-1 truncate">{item.label}</span>
                    <span
                      className={cn(
                        "relative ml-auto h-2 w-2 rounded-full transition-all",
                        isActive
                          ? "bg-sidebar-primary shadow-[0_0_0_5px_rgba(124,58,237,0.12)]"
                          : "bg-transparent"
                      )}
                    />
                  </Link>
                );
              })}
            </div>
          </div>

          {(!hasSubscription || isTrial) && (
            <div
              className={cn(
                "mx-1 rounded-[24px] border p-4 text-center shadow-[var(--shadow-sm)] transition-all max-[820px]:rounded-[22px] max-[820px]:p-3",
                isTrial
                  ? "border-primary/20 bg-primary/10 ring-4 ring-primary/5"
                  : "border-primary/15 bg-white/55"
              )}
            >
              <div className="mb-2.5 flex justify-center max-[820px]:mb-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 text-primary shadow-[var(--shadow-sm)] max-[820px]:h-9 max-[820px]:w-9">
                  {isTrial ? (
                    <Clock className="h-5 w-5 animate-pulse-slow max-[820px]:h-4 max-[820px]:w-4" />
                  ) : (
                    <ShieldCheck className="h-5 w-5 opacity-85 max-[820px]:h-4 max-[820px]:w-4" />
                  )}
                </span>
              </div>
              <p
                className={cn(
                  "mb-1 text-[13px] font-black max-[820px]:text-xs",
                  isTrial ? "uppercase tracking-tight text-foreground" : "text-foreground"
                )}
              >
                {isTrial ? "Período de Teste" : "Acesso Limitado"}
              </p>
              <p
                className={cn(
                  "mb-3 text-[11px] leading-tight max-[820px]:mb-2 max-[820px]:text-[10px]",
                  isTrial ? "font-bold text-foreground/80" : "text-muted-foreground"
                )}
              >
                {isTrial
                  ? `Você tem ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"} de acesso total liberado!`
                  : "Assine um plano para liberar todas as funções."}
              </p>
              <Button
                size="sm"
                className={cn(
                  "h-8 w-full text-[11px] font-bold text-white max-[820px]:h-7 max-[820px]:text-[10px]",
                  isTrial ? "bg-primary hover:bg-primary/90" : "gradient-primary"
                )}
                onClick={() => router.push("/dashboard/settings/billing")}
              >
                {isTrial ? "Ativar Assinatura" : "Ver Planos"}
              </Button>
            </div>
          )}
        </nav>

        <div className="shrink-0 rounded-[24px] border border-sidebar-border/70 bg-white/45 p-1.5 shadow-[var(--shadow-sm)] max-[820px]:rounded-[22px] max-[820px]:p-1">
          <div className="px-3 pb-1.5 pt-0.5 max-[820px]:px-2.5 max-[820px]:pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
              Conta
            </p>
          </div>

          <div className="space-y-0.5">
            {bottomItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sidebar-ring/20 max-[820px]:gap-2 max-[820px]:px-2.5 max-[820px]:py-2 max-[820px]:text-xs",
                    isActive
                      ? "bg-white/90 text-sidebar-primary shadow-[var(--shadow-sm)] ring-1 ring-sidebar-primary/10"
                      : "text-muted-foreground hover:bg-white/75 hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition-all max-[820px]:h-8 max-[820px]:w-8",
                      isActive
                        ? "border-sidebar-primary/15 bg-sidebar-primary/12 text-sidebar-primary"
                        : "border-transparent bg-transparent text-muted-foreground group-hover:border-white/80 group-hover:bg-white/80 group-hover:text-foreground"
                    )}
                  >
                    <Icon
                      className="h-4 w-4 max-[820px]:h-4 max-[820px]:w-4"
                      strokeWidth={isActive ? 2.1 : 1.8}
                    />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}

            {profile?.role === "admin" && (
              <Link
                href="/admin"
                className="group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-teal-700 transition-all duration-200 hover:bg-emerald-50/90 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 max-[820px]:gap-2 max-[820px]:px-2.5 max-[820px]:py-2 max-[820px]:text-xs"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-teal-700 transition-all group-hover:border-emerald-200 group-hover:bg-emerald-100/80 max-[820px]:h-8 max-[820px]:w-8">
                  <ShieldCheck
                    className="h-4 w-4 max-[820px]:h-4 max-[820px]:w-4"
                    strokeWidth={1.9}
                  />
                </span>
                <span className="truncate">Painel Super Admin</span>
              </Link>
            )}
          </div>

          <Separator className="my-2.5 bg-sidebar-border/70 max-[820px]:my-2" />

          <div className="rounded-[20px] border border-white/80 bg-white/70 p-2.5 shadow-[var(--shadow-sm)] max-[820px]:rounded-[18px] max-[820px]:p-2">
            <div className="mb-2.5 flex items-start gap-2.5 max-[820px]:mb-2 max-[820px]:gap-2">
              <Avatar className="h-10 w-10 ring-2 ring-primary/10 max-[820px]:h-9 max-[820px]:w-9">
                {profile?.avatar_url && (
                  <AvatarImage src={profile.avatar_url} alt={profile.full_name || ""} />
                )}
                <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-foreground max-[820px]:text-xs">
                  {profile?.full_name || "Psicóloga"}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {profileLabel}
                </p>
              </div>
              <Badge variant="secondary" className="h-5 rounded-full px-2 text-[9px] max-[820px]:hidden">
                Perfil
              </Badge>
            </div>

            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-[13px] font-medium text-muted-foreground transition-all duration-200 hover:border-primary/15 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 max-[820px]:px-2.5 max-[820px]:py-1.5 max-[820px]:text-xs"
              title="Sair"
              aria-label="Sair da conta"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
