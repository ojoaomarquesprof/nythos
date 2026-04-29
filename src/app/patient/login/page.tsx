"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Heart, Mail, ArrowRight, CheckCircle, ShieldCheck, Sparkles } from "lucide-react";

export default function PatientLoginPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"input" | "sent" | "error">("input");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // Redireciona para a rota de callback específica de pacientes.
        // O usuário JÁ existe em auth.users (criado pelo terapeuta via
        // /api/patients/create). O OTP apenas autentica quem já foi provisionado.
        emailRedirectTo: `${window.location.origin}/auth/patient/callback`,
        // shouldCreateUser: false mantido como guarda de segurança.
        // Se alguém digitar um email não provisionado, o Supabase não cria
        // uma conta nova — retorna silenciosamente sem enviar email.
        shouldCreateUser: false,
      },
    });

    setLoading(false);

    if (error) {
      // Supabase retorna erro genérico quando shouldCreateUser=false e o email não existe
      const isNotFound =
        error.message.toLowerCase().includes("user not found") ||
        error.message.toLowerCase().includes("email not confirmed") ||
        error.status === 400 ||
        error.status === 422;

      if (isNotFound) {
        setErrorMessage(
          "Este email não está cadastrado como paciente. Confirme com seu terapeuta que o email correto foi registrado."
        );
      } else {
        setErrorMessage(
          "Não foi possível enviar o link de acesso. Tente novamente em alguns instantes."
        );
      }
      setStep("error");
    } else {
      setStep("sent");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[oklch(0.97_0.02_290)] via-[oklch(0.96_0.03_310)] to-[oklch(0.95_0.04_160)]">

      {/* Background decorative blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-[oklch(0.78_0.1_160)]/20 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-[oklch(0.72_0.18_280)]/15 blur-3xl animate-pulse [animation-delay:1.5s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[oklch(0.75_0.15_340)]/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6 py-10 animate-fade-in">

        {/* Card */}
        <div className="glass-panel rounded-3xl p-8 shadow-2xl shadow-violet-900/10">

          {/* Logo / Brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Heart className="w-8 h-8 text-white fill-white/30" />
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-[oklch(0.78_0.1_160)] rounded-full flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-[oklch(0.22_0.02_280)] tracking-tight">
              Área do Paciente
            </h1>
            <p className="text-sm text-[oklch(0.5_0.02_280)] mt-1 text-center">
              Nythos · Espaço clínico seguro
            </p>
          </div>

          {/* Step: input */}
          {(step === "input" || step === "error") && (
            <>
              <div className="mb-6 text-center">
                <p className="text-[oklch(0.35_0.03_280)] text-sm leading-relaxed">
                  Digite seu email para receber um{" "}
                  <span className="font-semibold text-[oklch(0.55_0.2_280)]">
                    link de acesso seguro
                  </span>
                  . Sem senhas, sem complicações.
                </p>
              </div>

              <form onSubmit={handleSendMagicLink} noValidate>
                <div className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[oklch(0.55_0.2_280)]" />
                    <input
                      id="patient-email"
                      type="email"
                      autoComplete="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (step === "error") setStep("input");
                      }}
                      required
                      className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white/70 border border-[oklch(0.92_0.01_290)] text-[oklch(0.22_0.02_280)] placeholder-[oklch(0.65_0.01_290)] text-sm font-medium focus:outline-none focus:border-[oklch(0.55_0.2_280)] focus:ring-4 focus:ring-[oklch(0.55_0.2_280)]/10 transition-all duration-200"
                    />
                  </div>

                  {step === "error" && (
                    <div
                      role="alert"
                      className="flex items-start gap-3 p-4 rounded-2xl bg-red-50/80 border border-red-200/60 text-red-700 text-sm"
                    >
                      <span className="mt-0.5 shrink-0">⚠️</span>
                      <p className="leading-relaxed">{errorMessage}</p>
                    </div>
                  )}

                  <button
                    id="patient-send-magic-link"
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl gradient-primary text-white font-semibold text-sm shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Enviando link…
                      </>
                    ) : (
                      <>
                        Enviar link de acesso
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Step: sent */}
          {step === "sent" && (
            <div className="flex flex-col items-center text-center py-4 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-[oklch(0.78_0.1_160)]/15 flex items-center justify-center mb-5">
                <CheckCircle className="w-8 h-8 text-[oklch(0.55_0.18_160)]" />
              </div>
              <h2 className="text-lg font-bold text-[oklch(0.22_0.02_280)] mb-2">
                Link enviado! 🎉
              </h2>
              <p className="text-sm text-[oklch(0.45_0.02_280)] leading-relaxed max-w-xs">
                Verifique sua caixa de entrada em{" "}
                <span className="font-semibold text-[oklch(0.55_0.2_280)]">{email}</span>
                {" "}e clique no link para acessar sua área.
              </p>
              <p className="mt-3 text-xs text-[oklch(0.6_0.01_290)]">
                Não recebeu? Confira o spam ou{" "}
                <button
                  id="patient-resend-link"
                  onClick={() => setStep("input")}
                  className="text-[oklch(0.55_0.2_280)] underline underline-offset-2 hover:text-[oklch(0.45_0.22_280)] transition-colors"
                >
                  tente novamente
                </button>
              </p>
            </div>
          )}

          {/* Security badge */}
          <div className="mt-8 pt-5 border-t border-[oklch(0.92_0.01_290)]/60 flex items-center justify-center gap-2 text-xs text-[oklch(0.6_0.01_290)]">
            <ShieldCheck className="w-3.5 h-3.5 text-[oklch(0.55_0.18_160)]" />
            <span>Acesso seguro · Dados protegidos pela LGPD</span>
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-5 text-center text-xs text-[oklch(0.55_0.02_280)]">
          Este é um espaço exclusivo para pacientes.{" "}
          <a
            href="/login"
            className="text-[oklch(0.55_0.2_280)] font-medium hover:underline"
          >
            Acesso de terapeutas →
          </a>
        </p>
      </div>
    </main>
  );
}
