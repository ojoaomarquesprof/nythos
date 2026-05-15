"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Plus, UserPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DashboardHero() {
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    );
  }, []);

  return (
    <section className="animate-fade-in overflow-hidden rounded-3xl border border-primary/10 bg-card/90 shadow-[0_18px_50px_rgba(41,31,67,0.08)] ring-1 ring-white/80">
      <div className="relative grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-5 md:p-6">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-40 bg-[radial-gradient(circle_at_25%_20%,rgba(124,58,237,0.18),transparent_42%),radial-gradient(circle_at_40%_86%,rgba(16,185,129,0.16),transparent_36%)]" />
        <div className="relative max-w-2xl space-y-2">
          <p className="min-h-4 text-xs font-medium uppercase tracking-[0.16em] text-primary/70">
            {today}
          </p>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-3xl">
              Sua prática clínica em ordem
            </h1>
            <p className="max-w-xl text-sm leading-5 text-muted-foreground md:leading-6">
              Um resumo calmo para priorizar sessões, pendências e finanças do dia.
            </p>
          </div>
        </div>

        <div className="relative flex flex-col gap-2 sm:flex-row sm:flex-wrap md:justify-end">
          <Link
            href="/dashboard/schedule"
            className={cn(buttonVariants({ size: "lg" }), "h-10 w-full justify-center rounded-2xl shadow-primary/20 sm:w-auto")}
          >
            <Plus className="size-4" />
            Nova sessão
          </Link>
          <Link
            href="/dashboard/schedule"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 w-full justify-center rounded-2xl bg-white/80 sm:w-auto")}
          >
            <CalendarDays className="size-4" />
            Ver agenda
          </Link>
          <Link
            href="/dashboard/patients/new"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 w-full justify-center rounded-2xl bg-white/80 sm:w-auto")}
          >
            <UserPlus className="size-4" />
            Novo paciente
          </Link>
        </div>
      </div>
    </section>
  );
}
