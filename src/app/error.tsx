"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Home, LayoutDashboard, RefreshCcw } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { logSafeError } from "@/lib/errors/safe-error";
import { cn } from "@/lib/utils";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    logSafeError("[app/error] Unhandled route error", "route_error_boundary", {
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#070917] px-4 py-10 text-white md:px-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.42),transparent_36%),radial-gradient(ellipse_at_bottom_right,rgba(20,184,166,0.26),transparent_38%),linear-gradient(135deg,#070917_0%,#151033_48%,#061d2b_100%)]" />
      <div className="absolute left-1/2 top-8 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,rgba(124,58,237,0.34),rgba(20,184,166,0.24),rgba(129,140,248,0.24))] blur-3xl" />
      <section className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center justify-center text-center">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/35"
          aria-label="Nythos"
        >
          <Image
            src="/logo-icon.png"
            alt=""
            width={42}
            height={42}
            className="size-11 rounded-2xl object-contain shadow-[0_0_34px_rgba(45,212,191,0.3)]"
            priority
          />
          <span className="text-xl font-semibold tracking-tight">Nythos</span>
        </Link>

        <div className="w-full rounded-[2rem] border border-white/12 bg-white/[0.08] p-8 shadow-[0_30px_100px_rgba(0,0,0,0.35)] ring-1 ring-white/10 backdrop-blur-2xl md:p-10">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-300/14 text-amber-100 ring-1 ring-amber-300/25">
            <AlertTriangle className="size-7" />
          </div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.22em] text-teal-200">
            Instabilidade temporaria
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Algo nao saiu como esperado
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-violet-100/72">
            Nao foi possivel carregar esta area agora. Tente novamente em
            alguns instantes ou volte para uma area segura do Nythos.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className={cn(
                buttonVariants({ size: "lg" }),
                "rounded-2xl bg-white text-slate-950 hover:bg-teal-100"
              )}
            >
              <RefreshCcw className="size-4" />
              Tentar novamente
            </button>
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "rounded-2xl border-white/18 bg-white/[0.06] text-white hover:bg-white/[0.12] hover:text-white"
              )}
            >
              <LayoutDashboard className="size-4" />
              Ir para o dashboard
            </Link>
            <Link
              href="/"
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "rounded-2xl text-violet-50 hover:bg-white/10 hover:text-white"
              )}
            >
              <Home className="size-4" />
              Inicio
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
