"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getBillingDocumentValidationMessage,
  normalizeCpfCnpj,
} from "@/lib/billing/billing-document";
import { createClient } from "@/lib/supabase/client";

const benefits = [
  ["Agenda, prontuario e financeiro conectados", CalendarCheck2],
  ["Pacotes, recibos e portal do paciente", ReceiptText],
  ["Organizacao para atender com mais clareza", FileText],
  ["Seguranca e rastreabilidade para sua rotina", ShieldCheck],
] as const;

const setupSteps = [
  ["01", "Crie sua conta", "Dados profissionais para abrir seu espaco."],
  ["02", "Configure o essencial", "Perfil, agenda, identidade e financeiro."],
  ["03", "Comece a atender", "Pacientes, sessoes e acompanhamento em ordem."],
] as const;

const fieldClassName =
  "h-11 rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 shadow-sm outline-none transition-all duration-300 placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15";

const labelClassName =
  "ml-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function BrandColumn() {
  return (
    <aside className="relative overflow-hidden bg-[#0b1027] p-6 text-white sm:p-8 lg:p-8 xl:p-10">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.46),transparent_42%),radial-gradient(ellipse_at_bottom_right,rgba(20,184,166,0.28),transparent_40%),linear-gradient(135deg,#080b1d_0%,#17113a_52%,#061d2b_100%)]" />
      <div className="absolute left-1/2 top-0 h-96 w-[760px] -translate-x-1/2 -skew-y-6 bg-[linear-gradient(90deg,transparent,rgba(124,58,237,0.38),rgba(20,184,166,0.28),rgba(129,140,248,0.3),transparent)] opacity-80 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/35" aria-label="Nythos">
            <Image src="/logo-icon.png" alt="" width={40} height={40} className="size-10 rounded-2xl object-contain shadow-[0_0_30px_rgba(45,212,191,0.28)]" priority />
            <span className="text-xl font-semibold tracking-tight">Nythos</span>
          </Link>
          <Link href="/login" className="hidden rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-violet-50 transition-colors hover:bg-white/[0.12] sm:inline-flex">
            Entrar
          </Link>
        </div>

        <div className="mt-10 max-w-xl lg:mt-12">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-4 py-2 text-sm font-semibold text-teal-100">
            <Sparkles className="size-4" />
            Comece com o essencial
          </div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Comece sua rotina clinica no Nythos.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-violet-100/76 sm:text-base">
            Crie sua conta profissional e configure sua agenda, pacientes e financeiro em poucos passos.
          </p>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {benefits.map(([label, Icon]) => (
            <div key={label} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-sm font-medium leading-5 text-violet-50 backdrop-blur">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-300/14 text-teal-200">
                <Icon className="size-4" />
              </div>
              {label}
            </div>
          ))}
        </div>

        <div className="mt-7 rounded-[1.5rem] border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">3 passos para comecar</p>
              <p className="mt-1 text-xs text-violet-100/58">Sem bloquear seu uso do produto.</p>
            </div>
            <LockKeyhole className="size-5 text-teal-200" />
          </div>
          <div className="grid gap-3">
            {setupSteps.map(([number, title, description]) => (
              <div key={number} className="grid grid-cols-[42px_1fr] gap-3 rounded-2xl bg-[#101735]/72 p-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-teal-300/12 text-xs font-semibold text-teal-100 ring-1 ring-teal-300/20">
                  {number}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-violet-100/58">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 flex items-center gap-2 text-xs leading-5 text-violet-100/58">
          <ShieldCheck className="size-4 shrink-0 text-teal-200" />
          Seus dados ajudam a configurar seu espaco profissional no Nythos.
        </p>
      </div>
    </aside>
  );
}

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [crp, setCrp] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient() as any;

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("As senhas nao coincidem.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    const billingDocumentError = getBillingDocumentValidationMessage(cpf);
    if (billingDocumentError) {
      setError(billingDocumentError);
      return;
    }

    setIsLoading(true);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          crp: crp,
          cpf: normalizeCpfCnpj(cpf),
        },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (signUpError) {
      setError(
        signUpError.message === "User already registered"
          ? "Este e-mail ja esta cadastrado. Tente fazer login."
          : signUpError.message
      );
      setIsLoading(false);
      return;
    }

    setSuccess(true);
    setIsLoading(false);
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#080b1d] px-4 py-6 text-white sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.42),transparent_38%),linear-gradient(135deg,#080b1d_0%,#17113a_45%,#051d2b_100%)]" />
        <div className="absolute left-1/2 top-10 h-[520px] w-[900px] -translate-x-1/2 -skew-y-6 bg-[linear-gradient(90deg,transparent,rgba(124,58,237,0.42),rgba(20,184,166,0.3),rgba(129,140,248,0.32),transparent)] opacity-80 blur-3xl" />

        <section className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl items-center justify-center">
          <div className="w-full rounded-[2rem] border border-white/12 bg-white/[0.08] p-6 text-center shadow-[0_30px_100px_rgba(4,7,29,0.42)] ring-1 ring-white/10 backdrop-blur-2xl sm:p-8">
            <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-teal-300/14 text-teal-100 ring-1 ring-teal-300/25">
              <CheckCircle2 className="size-10" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Conta criada com sucesso</h1>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-violet-100/74">
              Verifique seu e-mail para confirmar a conta. Depois, entre no Nythos e continue a configuracao do seu espaco profissional.
            </p>
            <Button
              onClick={() => router.push("/login")}
              className="mt-8 h-12 w-full rounded-2xl border-0 bg-teal-300 font-semibold text-slate-950 shadow-[0_18px_42px_rgba(20,184,166,0.26)] hover:bg-teal-200"
            >
              Ir para login
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#070917] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.34),transparent_38%),radial-gradient(ellipse_at_bottom_right,rgba(20,184,166,0.2),transparent_36%),linear-gradient(135deg,#070917_0%,#0d1028_48%,#061d2b_100%)]" />
      <div className="absolute left-1/2 top-0 h-[520px] w-[1040px] -translate-x-1/2 -skew-y-6 bg-[linear-gradient(90deg,transparent,rgba(124,58,237,0.3),rgba(20,184,166,0.22),rgba(129,140,248,0.24),transparent)] opacity-80 blur-3xl" />

      <section className="relative mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl items-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/14 bg-white/[0.08] shadow-[0_34px_120px_rgba(4,7,29,0.52)] ring-1 ring-white/10 backdrop-blur-2xl lg:grid-cols-[0.96fr_1.04fr]">
          <BrandColumn />

          <section className="bg-[#fbfaff]/95 p-5 text-slate-950 sm:p-7 lg:p-8">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-violet-700">
                  <ShieldCheck className="size-3.5" />
                  Dados profissionais
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  Criar conta profissional
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Use seus dados profissionais para iniciar seu espaco clinico.
                </p>
              </div>
              <Link href="/login" className="hidden rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:text-teal-700 sm:inline-flex">
                Ja tem conta? Entrar
              </Link>
            </div>

            <form onSubmit={handleRegister} className="space-y-3.5">
              {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-semibold text-rose-700 shadow-sm">
                  <div className="mt-2 size-1.5 shrink-0 rounded-full bg-rose-500" />
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="fullName" className={labelClassName}>Nome completo</Label>
                <Input
                  id="fullName"
                  placeholder="Dra. Maria Silva"
                  className={fieldClassName}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="crp" className={labelClassName}>CRP</Label>
                  <Input
                    id="crp"
                    placeholder="06/123456"
                    className={fieldClassName}
                    value={crp}
                    onChange={(e) => setCrp(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cpf" className={labelClassName}>CPF ou CNPJ</Label>
                  <Input
                    id="cpf"
                    placeholder="000.000.000-00"
                    className={fieldClassName}
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className={labelClassName}>E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className={fieldClassName}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className={labelClassName}>Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Minimo 6 caracteres"
                      className={`${fieldClassName} pr-11`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-teal-50 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/20"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className={labelClassName}>Confirmar senha</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Repita a senha"
                    className={fieldClassName}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium leading-5 text-slate-500">
                Voce podera completar perfil, identidade da clinica e configuracoes depois do cadastro.
              </p>

              <Button
                type="submit"
                className="h-12 w-full rounded-2xl border-0 bg-gradient-to-r from-violet-600 to-teal-500 text-base font-semibold text-white shadow-[0_18px_42px_rgba(20,184,166,0.22)] transition-all hover:-translate-y-0.5 hover:from-violet-700 hover:to-teal-500"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="size-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <>
                    Criar minha conta
                    <ArrowRight className="size-5 opacity-80" />
                  </>
                )}
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-[0.16em]">
                  <span className="rounded-full bg-[#fbfaff] px-3 text-slate-400">Ou cadastre-se com</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                className="h-11 w-full rounded-2xl border-slate-200 bg-white text-base font-semibold text-slate-700 shadow-sm transition-all hover:bg-white hover:shadow-md"
                disabled={isLoading}
              >
                <GoogleIcon />
                Google
              </Button>

              <div className="pt-1 text-center sm:hidden">
                <p className="text-sm font-semibold text-slate-500">
                  Ja tem conta?{" "}
                  <Link href="/login" className="text-teal-700 transition-colors hover:text-teal-900">
                    Entrar
                  </Link>
                </p>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-500">
              <Link href="/termos" className="transition-colors hover:text-teal-700">
                Termos
              </Link>
              <Link href="/privacidade" className="transition-colors hover:text-teal-700">
                Privacidade
              </Link>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
