"use client";

import { useState } from "react";
import {
  Check, Loader2, CreditCard, ShieldCheck,
  Calendar, Lock, User, Hash, Sparkles, Crown, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// ── Planos ────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "monthly" as const,
    label: "Mensal",
    price: 89,
    priceLabel: "R$ 89",
    period: "/mês",
    badge: null,
    features: [
      "Pacientes ilimitados",
      "Prontuários criptografados",
      "Agenda inteligente",
      "Relatórios financeiros",
      "Área do paciente (Magic Link)",
      "Suporte prioritário",
    ],
    icon: Sparkles,
  },
  {
    id: "yearly" as const,
    label: "Anual",
    price: 890,
    priceLabel: "R$ 890",
    period: "/ano",
    badge: "2 meses grátis",
    perMonth: "≈ R$ 74/mês",
    features: [
      "Tudo do plano Mensal",
      "Economia de R$ 178 no ano",
      "Prioridade máxima no suporte",
      "Acesso antecipado a novidades",
      "Backup completo de dados",
    ],
    icon: Crown,
  },
] as const;

type PlanId = "monthly" | "yearly";

// ── Utilitários de formatação ─────────────────────────────────────────────────

function formatCardNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + "/" + digits.slice(2);
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function BillingPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("monthly");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campos do formulário
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [expiry, setExpiry] = useState("");        // "MM/YYYY"
  const [cvv, setCvv] = useState("");
  const [holderCpf, setHolderCpf] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const [expiryMonth, expiryYear] = expiry.split("/");
    if (!expiryMonth || !expiryYear || expiryYear.length < 4) {
      setError("Informe a validade no formato MM/AAAA.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planType: selectedPlan,
          cardNumber: cardNumber.replace(/\s/g, ""),
          cardHolder,
          expiryMonth,
          expiryYear,
          cvv,
          holderCpf: holderCpf.replace(/\D/g, ""),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Ocorreu um erro. Tente novamente.");
        return;
      }

      setSuccess(true);
      // Recarregar após 2 s para atualizar o status de assinatura
      setTimeout(() => window.location.reload(), 2000);
    } catch {
      setError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center animate-fade-in">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-[oklch(0.78_0.1_160)]/15 flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-[oklch(0.55_0.18_160)]" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Assinatura ativada! 🎉</h2>
          <p className="text-muted-foreground">
            Seu plano {selectedPlan === "yearly" ? "Anual" : "Mensal"} está ativo.
            Redirecionando…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-10 px-4 animate-fade-in">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
          <ShieldCheck className="w-3.5 h-3.5" />
          Checkout Seguro · Dados criptografados
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Ativar Assinatura</h1>
        <p className="text-muted-foreground">
          Escolha seu plano e pague com cartão de crédito sem sair do painel.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* ── Coluna esquerda: seleção de plano ── */}
        <div className="lg:col-span-2 space-y-4">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Escolha o plano
          </p>

          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isSelected = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                id={`plan-${plan.id}`}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full text-left rounded-2xl border-2 p-5 transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                    : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    isSelected ? "gradient-primary text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    isSelected ? "border-primary bg-primary" : "border-border"
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>

                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-2xl font-black">{plan.priceLabel}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>

                {plan.badge && (
                  <Badge className="mb-2 bg-[oklch(0.78_0.1_160)]/15 text-[oklch(0.45_0.12_160)] border-0 text-xs font-semibold">
                    {plan.badge}
                  </Badge>
                )}
                {"perMonth" in plan && (
                  <p className="text-xs text-muted-foreground">{plan.perMonth}</p>
                )}

                <ul className="mt-3 space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-foreground/70">
                      <Check className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* ── Coluna direita: formulário de cartão ── */}
        <div className="lg:col-span-3">
          <Card className="border-2 border-border shadow-lg">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Dados do Cartão</CardTitle>
                  <CardDescription>Pagamento processado com segurança pelo Asaas</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                {/* Número do cartão */}
                <div className="space-y-1.5">
                  <Label htmlFor="cardNumber" className="text-sm font-medium flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                    Número do Cartão
                  </Label>
                  <Input
                    id="cardNumber"
                    inputMode="numeric"
                    placeholder="0000 0000 0000 0000"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    maxLength={19}
                    required
                    className="font-mono tracking-widest text-base h-11"
                  />
                </div>

                {/* Nome do titular */}
                <div className="space-y-1.5">
                  <Label htmlFor="cardHolder" className="text-sm font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    Nome do Titular
                  </Label>
                  <Input
                    id="cardHolder"
                    placeholder="Como está no cartão"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                    required
                    className="uppercase tracking-wide h-11"
                  />
                </div>

                {/* Validade + CVV */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="expiry" className="text-sm font-medium flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      Validade
                    </Label>
                    <Input
                      id="expiry"
                      inputMode="numeric"
                      placeholder="MM/AAAA"
                      value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      maxLength={7}
                      required
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cvv" className="text-sm font-medium flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                      CVV
                    </Label>
                    <Input
                      id="cvv"
                      inputMode="numeric"
                      placeholder="000"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      maxLength={4}
                      required
                      className="h-11"
                    />
                  </div>
                </div>

                {/* CPF do titular */}
                <div className="space-y-1.5">
                  <Label htmlFor="holderCpf" className="text-sm font-medium flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
                    CPF do Titular
                  </Label>
                  <Input
                    id="holderCpf"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={holderCpf}
                    onChange={(e) => setHolderCpf(formatCpf(e.target.value))}
                    maxLength={14}
                    required
                    className="h-11"
                  />
                </div>

                {/* Erro */}
                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 p-4 rounded-xl bg-destructive/8 border border-destructive/20 text-destructive text-sm animate-fade-in"
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                {/* Resumo + botão */}
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center justify-between text-sm mb-4">
                    <span className="text-muted-foreground">
                      Plano {selectedPlan === "yearly" ? "Anual" : "Mensal"}
                    </span>
                    <span className="font-bold text-foreground">
                      {selectedPlan === "yearly" ? "R$ 890,00/ano" : "R$ 89,00/mês"}
                    </span>
                  </div>

                  <Button
                    id="btn-confirm-payment"
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 text-base font-bold gradient-primary text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-60 disabled:transform-none"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Processando pagamento…
                      </>
                    ) : (
                      <>
                        <Lock className="mr-2 h-4 w-4" />
                        Confirmar Assinatura
                      </>
                    )}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[oklch(0.55_0.18_160)]" />
                    Dados do cartão não são armazenados em nossos servidores
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
