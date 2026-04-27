"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Wallet,
  Settings,
  Brain,
  LogOut,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { useEffect, useState } from "react";
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
  const { hasSubscription, isTrial, daysLeft, loading: subLoading } = useSubscription();
  const supabase = createClient() as any;

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Busca perfil
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        
        // Se o perfil estiver faltando algum dado essencial, tenta complementar com o metadata do auth
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

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 lg:w-72 border-r border-border bg-sidebar h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow-md">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Nythos
          </h1>
          <p className="text-[11px] text-muted-foreground -mt-0.5">
            Gestão Clínica
          </p>
        </div>
      </div>

      <Separator className="mx-4" />

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon
                className="w-5 h-5 flex-shrink-0"
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span>{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}

        {(!hasSubscription || isTrial) && (
          <div className={cn(
            "mt-6 mx-2 p-4 rounded-2xl border flex flex-col items-center text-center",
            isTrial ? "bg-indigo-50/50 border-indigo-100" : "bg-primary/5 border-primary/10"
          )}>
            {isTrial ? (
              <Clock className="w-8 h-8 text-indigo-600 mb-2 opacity-80" />
            ) : (
              <ShieldCheck className="w-8 h-8 text-primary mb-2 opacity-80" />
            )}
            <p className="text-xs font-bold mb-1">
              {isTrial ? "Período de Teste" : "Acesso Limitado"}
            </p>
            <p className="text-[10px] text-muted-foreground mb-3 leading-tight">
              {isTrial 
                ? `Você tem ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} de acesso total liberado!`
                : "Assine um plano para liberar todas as funções."}
            </p>
            <Button 
              size="sm" 
              className={cn(
                "w-full h-8 text-[11px] font-bold text-white",
                isTrial ? "bg-indigo-600 hover:bg-indigo-700" : "gradient-primary"
              )}
              onClick={() => router.push('/dashboard/settings/billing')}
            >
              {isTrial ? "Ativar Assinatura" : "Ver Planos"}
            </Button>
          </div>
        )}
      </nav>

      {/* Bottom Section */}
      <div className="px-3 pb-4 space-y-1">
        <Separator className="mb-3" />
        {bottomItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* User card */}
        <div className="mt-3 flex items-center gap-3 px-3 py-3 rounded-xl bg-muted/30 border border-border/50">
          <Avatar className="w-9 h-9">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {profile?.full_name || "Psicóloga"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {profile?.crp ? `CRP ${profile.crp}` : "CRP não informado"}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
