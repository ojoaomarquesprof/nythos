"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, ShieldCheck, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const plans = [
  {
    name: "Starter",
    price: 49.0,
    description: "Ideal para quem está começando sua jornada clínica.",
    features: ["Até 10 pacientes ativos", "Agenda inteligente", "Prontuário eletrônico", "Suporte via e-mail"],
    buttonText: "Assinar Starter",
    icon: Zap,
    popular: false,
  },
  {
    name: "Growth",
    price: 97.0,
    description: "Perfeito para clínicas em expansão e alta demanda.",
    features: [
      "Até 30 pacientes ativos",
      "Tudo do Starter",
      "Relatórios financeiros básicos",
      "Suporte prioritário",
      "Lembretes via WhatsApp",
    ],
    buttonText: "Assinar Growth",
    icon: Sparkles,
    popular: true,
  },
  {
    name: "Unlimited",
    price: 149.0,
    description: "Liberdade total para focar no que realmente importa.",
    features: [
      "Pacientes ilimitados",
      "Tudo do Growth",
      "Relatórios avançados",
      "Customização de marca",
      "Exportação completa de dados",
    ],
    buttonText: "Assinar Unlimited",
    icon: Crown,
    popular: false,
  },
];

export default function BillingPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSubscribe = async (planName: string, price: number) => {
    console.log("Iniciando assinatura para:", planName);

    try {
      setLoadingPlan(planName);
      console.log("Chamando /api/checkout...");
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: planName, price }),
      });

      console.log("Resposta recebida. Status:", response.status);
      const data = await response.json();

      if (!response.ok) {
        console.error("Erro na API:", data);
        alert("Erro na API: " + (data.error || "Erro desconhecido"));
        throw new Error(data.error || "Erro ao iniciar checkout");
      }

      if (data.checkoutUrl) {
        console.log("Redirecionando para:", data.checkoutUrl);
        window.location.href = data.checkoutUrl;
      } else {
        console.error("Checkout URL ausente na resposta");
        alert("Erro: A URL de checkout não foi gerada.");
      }
    } catch (error: any) {
      console.error("Erro no checkout:", error);
      alert("Falha no processo: " + error.message);
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl py-10 px-4 animate-fade-in">
      <div className="flex flex-col items-center text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
          <ShieldCheck className="w-3.5 h-3.5" />
          Pagamento Seguro via Asaas
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-4 text-foreground">
          Escolha o Plano Ideal
        </h1>
        <p className="text-muted-foreground max-w-2xl text-lg">
          Invista na gestão da sua clínica com transparência e segurança. 
          Alavanque sua carreira com as ferramentas certas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan, index) => {
          const Icon = plan.icon;
          return (
            <Card
              key={plan.name}
              className={`flex flex-col relative overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl border-2 ${
                plan.popular 
                  ? "border-primary shadow-xl scale-105 z-10" 
                  : "border-border shadow-md"
              } animate-slide-up`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0">
                  <Badge className="rounded-none rounded-bl-xl px-4 py-1.5 font-bold gradient-primary text-white border-0 shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    MAIS POPULAR
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-8">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${
                  plan.popular ? "gradient-primary text-white" : "bg-muted text-muted-foreground"
                }`}>
                  <Icon className="w-6 h-6" />
                </div>
                <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                <CardDescription className="min-h-[48px] mt-2 text-base leading-relaxed">
                  {plan.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 pb-8">
                <div className="mb-8">
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-medium text-muted-foreground">R$</span>
                    <span className="text-5xl font-black tracking-tight">{plan.price.toFixed(2)}</span>
                    <span className="text-sm font-medium text-muted-foreground">/mês</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    O que está incluído:
                  </p>
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start text-sm group">
                        <div className={`mr-3 mt-0.5 rounded-full p-0.5 transition-colors ${
                          plan.popular ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                        }`}>
                          <Check className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-foreground/80 group-hover:text-foreground transition-colors">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>

              <CardFooter className="pt-0">
                <Button
                  className={`w-full h-12 text-base font-bold transition-all duration-300 ${
                    plan.popular
                      ? "gradient-primary text-white shadow-[0_10px_20px_-10px_rgba(var(--primary),0.5)] hover:shadow-[0_15px_25px_-10px_rgba(var(--primary),0.6)]"
                      : "hover:bg-muted"
                  }`}
                  variant={plan.popular ? "default" : "outline"}
                  disabled={loadingPlan !== null}
                  onClick={() => handleSubscribe(plan.name, plan.price)}
                >
                  {loadingPlan === plan.name ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    plan.buttonText
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="mt-20 glass-card rounded-3xl p-10 text-center border border-border shadow-sm">
        <h3 className="text-2xl font-bold mb-3">Possui uma clínica grande?</h3>
        <p className="text-muted-foreground max-w-2xl mx-auto mb-8 text-lg">
          Oferecemos soluções personalizadas para clínicas com múltiplos profissionais, 
          unidades de atendimento e necessidades avançadas de integração.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button variant="default" className="gradient-sage text-white h-12 px-8 font-bold rounded-xl shadow-md">
            Falar com um Especialista
          </Button>
          <Button variant="ghost" className="h-12 px-8 font-semibold rounded-xl">
            Ver FAQ de Faturamento
          </Button>
        </div>
      </div>
    </div>
  );
}
