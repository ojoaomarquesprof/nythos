"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
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
          cpf: cpf.replace(/\D/g, ''),
        },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (signUpError) {
      setError(
        signUpError.message === "User already registered"
          ? "Este e-mail já está cadastrado. Tente fazer login."
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
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 relative overflow-hidden">
        {/* Background Orbs */}
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-teal-500/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-emerald-500/10 rounded-full blur-[120px] translate-x-1/3 translate-y-1/3 pointer-events-none" />

        <div className="w-full max-w-[520px] animate-fade-in relative z-10 flex flex-col items-center">
          <Card className="w-full max-w-[440px] border-0 shadow-2xl shadow-slate-200/50 bg-white/70 backdrop-blur-3xl overflow-hidden rounded-[40px] relative transition-all">
            <CardContent className="flex flex-col items-center py-12 px-8 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-6 shadow-inner">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">
                Cadastro realizado! 🎉
              </h2>
              <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
                Verifique seu e-mail para confirmar a conta. Depois é só fazer
                login e começar a usar o Nythos.
              </p>
              <Button
                onClick={() => router.push("/login")}
                className="w-full h-14 bg-gradient-to-r from-teal-600 to-emerald-500 hover:from-teal-700 hover:to-emerald-600 text-white rounded-2xl font-bold text-base shadow-xl shadow-teal-900/20 hover:shadow-teal-900/40 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center border-0"
              >
                Ir para o Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 relative overflow-hidden">
      {/* Background Orbs matching the Logo (Teal/Emerald) */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-teal-500/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-emerald-500/10 rounded-full blur-[120px] translate-x-1/3 translate-y-1/3 pointer-events-none" />
      
      <div className="w-full max-w-[520px] animate-fade-in relative z-10 flex flex-col items-center py-8">
        {/* Logo */}
        <div className="flex justify-center mb-1 w-full px-8">
          <img 
            src="/logo-nythos.png" 
            alt="Nythos Logo" 
            className="w-full h-auto object-contain drop-shadow-sm hover:scale-[1.02] transition-transform duration-500"
          />
        </div>

        <Card className="w-full max-w-[440px] border-0 shadow-2xl shadow-slate-200/50 bg-white/70 backdrop-blur-3xl overflow-hidden rounded-[40px] relative transition-all hover:shadow-slate-300/50">
          <CardHeader className="pb-4 pt-10 px-8">
            <h2 className="text-xl font-black text-center text-slate-800 tracking-tight">
              Dados Profissionais
            </h2>
          </CardHeader>
          <CardContent className="px-8 pb-10">
            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100/50 text-sm font-bold text-rose-600 shadow-sm animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome Completo</Label>
                <Input
                  id="fullName"
                  placeholder="Dra. Maria Silva"
                  className="h-12 rounded-2xl bg-white/60 border border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 transition-all duration-300 px-4 font-bold text-slate-800 placeholder:text-slate-400 shadow-sm outline-none hover:bg-white/80"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="crp" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">CRP</Label>
                <Input
                  id="crp"
                  placeholder="06/123456"
                  className="h-12 rounded-2xl bg-white/60 border border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 transition-all duration-300 px-4 font-bold text-slate-800 placeholder:text-slate-400 shadow-sm outline-none hover:bg-white/80"
                  value={crp}
                  onChange={(e) => setCrp(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cpf" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">CPF ou CNPJ</Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  className="h-12 rounded-2xl bg-white/60 border border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 transition-all duration-300 px-4 font-bold text-slate-800 placeholder:text-slate-400 shadow-sm outline-none hover:bg-white/80"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="h-12 rounded-2xl bg-white/60 border border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 transition-all duration-300 px-4 font-bold text-slate-800 placeholder:text-slate-400 shadow-sm outline-none hover:bg-white/80"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Mínimo 6"
                      className="h-12 rounded-2xl bg-white/60 border border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 transition-all duration-300 px-4 pr-10 font-bold text-slate-800 placeholder:text-slate-400 shadow-sm outline-none hover:bg-white/80"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-teal-50 text-slate-400 hover:text-teal-600 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Confirmar</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Repita a senha"
                    className="h-12 rounded-2xl bg-white/60 border border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 transition-all duration-300 px-4 font-bold text-slate-800 placeholder:text-slate-400 shadow-sm outline-none hover:bg-white/80"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-14 mt-6 bg-gradient-to-r from-teal-600 to-emerald-500 hover:from-teal-700 hover:to-emerald-600 text-white rounded-2xl font-bold text-base shadow-xl shadow-teal-900/20 hover:shadow-teal-900/40 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center border-0"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Criar Conta
                    <ArrowRight className="w-5 h-5 ml-2 opacity-70" />
                  </>
                )}
              </Button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                  <span className="bg-white/80 backdrop-blur px-3 text-slate-400 rounded-full">Ou cadastre-se com</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                className="w-full h-14 bg-white/80 hover:bg-white border-slate-200 text-slate-700 rounded-2xl font-bold text-base shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-3"
                disabled={isLoading}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </Button>

              <div className="pt-4 text-center">
                <p className="text-xs font-bold text-slate-500">
                  Já tem conta?{" "}
                  <a
                    href="/login"
                    className="text-teal-600 hover:text-teal-700 transition-colors border-b border-teal-600/30 hover:border-teal-600 pb-0.5"
                  >
                    Fazer login
                  </a>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
