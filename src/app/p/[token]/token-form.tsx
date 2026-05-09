"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Heart,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { verifyPatientToken } from "@/app/actions/patient-auth";

interface Props {
  token: string;
  firstName: string | null;
  initialError?: string | null;
}

export function PatientTokenForm({ token, firstName, initialError = null }: Props) {
  const [dob, setDob] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [pending, startTransition] = useTransition();
  const blocked = Boolean(initialError);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (blocked) return;
    if (!dob) {
      setError("Informe sua data de nascimento.");
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await verifyPatientToken(token, dob);
      if (!result.success) {
        setError(result.error ?? "Erro ao verificar. Tente novamente.");
      }
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[oklch(0.97_0.02_290)] via-[oklch(0.96_0.03_310)] to-[oklch(0.95_0.04_160)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-[oklch(0.78_0.1_160)]/20 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-[oklch(0.72_0.18_280)]/15 blur-3xl animate-pulse [animation-delay:1.5s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[oklch(0.75_0.15_340)]/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6 py-10">
        <div className="glass-panel rounded-3xl p-8 shadow-2xl shadow-violet-900/10">
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Heart className="w-8 h-8 text-white fill-white/30" />
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-[oklch(0.78_0.1_160)] rounded-full flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
            </div>

            {firstName && !blocked ? (
              <>
                <h1 className="text-2xl font-bold text-[oklch(0.22_0.02_280)] tracking-tight text-center">
                  Ola, {firstName}!
                </h1>
                <p className="text-sm text-[oklch(0.5_0.02_280)] mt-1 text-center">
                  Para acessar sua area, confirme sua data de nascimento.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-[oklch(0.22_0.02_280)] tracking-tight">
                  Area do Paciente
                </h1>
                <p className="text-sm text-[oklch(0.5_0.02_280)] mt-1 text-center">
                  Nythos · Espaco clinico seguro
                </p>
              </>
            )}
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="dob"
                className="text-[10px] font-black uppercase tracking-widest text-[oklch(0.5_0.02_280)] flex items-center gap-1.5"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Data de Nascimento
              </label>
              <input
                id="dob"
                type="date"
                value={dob}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => {
                  setDob(e.target.value);
                  if (!initialError) setError("");
                }}
                required
                disabled={blocked}
                className="w-full px-5 py-3.5 rounded-2xl bg-white/70 border border-[oklch(0.92_0.01_290)] text-[oklch(0.22_0.02_280)] text-sm font-semibold focus:outline-none focus:border-[oklch(0.55_0.2_280)] focus:ring-4 focus:ring-[oklch(0.55_0.2_280)]/10 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50/80 border border-rose-200/60 text-rose-700 text-sm"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-xs font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={blocked || pending || !dob}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl gradient-primary text-white font-semibold text-sm shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Verificando...
                </>
              ) : blocked ? (
                "Link indisponivel"
              ) : (
                <>
                  Acessar minha area <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-5 border-t border-[oklch(0.92_0.01_290)]/60 flex items-center justify-center gap-2 text-xs text-[oklch(0.6_0.01_290)]">
            <ShieldCheck className="w-3.5 h-3.5 text-[oklch(0.55_0.18_160)]" />
            <span>Acesso seguro · Dados protegidos pela LGPD</span>
          </div>
        </div>
      </div>
    </main>
  );
}
