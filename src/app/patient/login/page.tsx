import Link from "next/link";
import { Heart, ShieldCheck, Link2, ArrowRight } from "lucide-react";

export default function PatientLoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[oklch(0.97_0.02_290)] via-[oklch(0.96_0.03_310)] to-[oklch(0.95_0.04_160)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-[oklch(0.78_0.1_160)]/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-[oklch(0.72_0.18_280)]/15 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6 py-10">
        <div className="glass-panel rounded-3xl p-8 shadow-2xl shadow-violet-900/10">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-violet-500/30 mb-4">
              <Heart className="w-8 h-8 text-white fill-white/30" />
            </div>
            <h1 className="text-2xl font-bold text-[oklch(0.22_0.02_280)] tracking-tight">
              Área do Paciente
            </h1>
            <p className="text-sm text-[oklch(0.5_0.02_280)] mt-1">
              Acesso por link seguro enviado pelo terapeuta.
            </p>
          </div>

          <div className="rounded-3xl bg-white/60 border border-white/70 p-5 text-center space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center mx-auto">
              <Link2 className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-800">
              Use o link de acesso recebido
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              O acesso por email foi desativado. Para entrar, abra o link enviado pelo seu terapeuta e confirme sua data de nascimento.
            </p>
          </div>

          <Link
            href="/login"
            className="mt-6 w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl bg-white/70 border border-white/80 text-[oklch(0.35_0.04_280)] font-semibold text-sm hover:bg-white transition-colors"
          >
            Acesso de terapeutas
            <ArrowRight className="w-4 h-4" />
          </Link>

          <div className="mt-8 pt-5 border-t border-[oklch(0.92_0.01_290)]/60 flex items-center justify-center gap-2 text-xs text-[oklch(0.6_0.01_290)]">
            <ShieldCheck className="w-3.5 h-3.5 text-[oklch(0.55_0.18_160)]" />
            <span>Acesso seguro · Dados protegidos pela LGPD</span>
          </div>
        </div>
      </div>
    </main>
  );
}
