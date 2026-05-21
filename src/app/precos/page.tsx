import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  HelpCircle,
  LockKeyhole,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { PLAN_DEFINITIONS, type SubscriptionPlanId } from "@/lib/subscription/plan-rules";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Precos | Nythos",
  description:
    "Conheca os planos Starter, Professional e Clinic do Nythos para gestao clinica com agenda, prontuario, financeiro, pacotes e portal do paciente.",
  openGraph: {
    type: "website",
    siteName: "Nythos",
    title: "Planos para cada momento da sua rotina clinica | Nythos",
    description:
      "Comece gratis e evolua para uma gestao completa com agenda, prontuario, financeiro, pacotes, documentos e portal.",
  },
};

type PublicPlan = {
  id: SubscriptionPlanId;
  eyebrow: string;
  description: string;
  cta: string;
  badge?: string;
  tone: "quiet" | "featured" | "scale";
  highlights: string[];
  details: string[];
};

const publicPlans: PublicPlan[] = [
  {
    id: "free",
    eyebrow: "Para comecar",
    description: "Para testar o Nythos e organizar os primeiros atendimentos sem compromisso.",
    cta: "Comecar gratis",
    tone: "quiet",
    highlights: [
      "Ate 5 pacientes ativos",
      "Agenda basica",
      "Prontuario basico",
      "Financeiro simples",
    ],
    details: [
      "Documentos limitados",
      "Recibos e historico de acoes criticas",
      "Sem equipe",
    ],
  },
  {
    id: "professional",
    eyebrow: "Rotina profissional",
    description: "Para psicologos que querem usar o Nythos como base da gestao diaria.",
    cta: "Comecar teste profissional",
    badge: "Mais indicado",
    tone: "featured",
    highlights: [
      "Ate 100 pacientes ativos",
      "Agenda e Google Calendar",
      "Prontuario e evolucao",
      "Financeiro clinico e pacotes",
    ],
    details: [
      "Portal do paciente",
      "Documentos e consentimentos",
      "Recibos e audit log",
      "Teste profissional por 14 dias para novos owners",
    ],
  },
  {
    id: "clinic",
    eyebrow: "Clinicas e equipes",
    description: "Para clinicas pequenas que precisam de mais escala, equipe e acompanhamento.",
    cta: "Criar conta",
    tone: "scale",
    highlights: [
      "Ate 500 pacientes ativos",
      "Equipe e secretaria",
      "Armazenamento maior",
      "Relatorios avancados",
    ],
    details: [
      "Recursos profissionais incluidos",
      "Mais documentos e volume de uso",
      "Plano sob consulta enquanto o checkout online e preparado",
    ],
  },
];

const comparisonRows = [
  {
    feature: "Pacientes ativos",
    starter: "5",
    professional: "100",
    clinic: "500",
  },
  {
    feature: "Equipe / secretaria",
    starter: false,
    professional: false,
    clinic: "Ate 10 membros",
  },
  {
    feature: "Agenda",
    starter: "Basica",
    professional: "Completa",
    clinic: "Completa",
  },
  {
    feature: "Prontuario e evolucao",
    starter: "Basico",
    professional: true,
    clinic: true,
  },
  {
    feature: "Financeiro clinico",
    starter: "Simples",
    professional: true,
    clinic: true,
  },
  {
    feature: "Pacotes de sessoes",
    starter: false,
    professional: true,
    clinic: true,
  },
  {
    feature: "Portal do paciente",
    starter: false,
    professional: true,
    clinic: true,
  },
  {
    feature: "Documentos",
    starter: "20 documentos",
    professional: "500 documentos",
    clinic: "5.000 documentos",
  },
  {
    feature: "Google Calendar",
    starter: false,
    professional: true,
    clinic: true,
  },
  {
    feature: "Recibos",
    starter: true,
    professional: true,
    clinic: true,
  },
  {
    feature: "Audit log",
    starter: true,
    professional: true,
    clinic: true,
  },
  {
    feature: "Relatorios avancados",
    starter: false,
    professional: false,
    clinic: true,
  },
];

const faqItems = [
  {
    question: "Posso comecar gratis?",
    answer:
      "Sim. O plano Starter permite testar o Nythos e organizar os primeiros pacientes com limites menores de uso.",
  },
  {
    question: "O plano Professional tem teste?",
    answer:
      "Sim. Novos owners recebem 14 dias de teste no Professional, conforme a fundacao atual de assinatura do produto.",
  },
  {
    question: "Preciso cadastrar cartao agora?",
    answer:
      "Nao nesta fase. O checkout online ainda nao esta ativo, entao os CTAs levam para cadastro ou para a tela de planos da conta.",
  },
  {
    question: "O Nythos substitui meu julgamento clinico?",
    answer:
      "Nao. O Nythos e uma ferramenta de gestao clinica para organizar agenda, prontuario, financeiro, documentos e comunicacao. As decisoes clinicas continuam sendo responsabilidade do profissional.",
  },
  {
    question: "Posso usar com pacientes menores de idade?",
    answer:
      "Pode, desde que o uso respeite seus deveres profissionais, consentimentos, responsaveis e registros adequados. Dados sensiveis exigem cuidado extra e uso responsavel.",
  },
  {
    question: "O pagamento online ja esta ativo?",
    answer:
      "Ainda nao. A estrutura de planos esta pronta para comunicacao e organizacao, mas a cobranca online esta em preparacao.",
  },
  {
    question: "Meus dados ficam protegidos?",
    answer:
      "O Nythos adota rotinas de produto voltadas a privacidade, controle de acesso e rastreabilidade. Ainda assim, a protecao de dados tambem depende de configuracoes corretas e boas praticas de uso pela equipe.",
  },
];

const featurePillars = [
  ["Agenda", "Sessoes, bloqueios e rotina semanal em uma leitura clara.", CalendarCheck2],
  ["Prontuario", "Evolucoes e historico do paciente no contexto certo.", FileText],
  ["Financeiro", "Recebimentos, pendencias, recibos e pacotes conectados.", WalletCards],
  ["Portal", "Tarefas, documentos e acompanhamento para o paciente.", BadgeCheck],
] as const;

const scaleSteps: Array<[string, string, LucideIcon]> = [
  ["Starter", "5 pacientes ativos", FileCheck2],
  ["Professional", "100 pacientes, portal, pacotes e calendario", PackageCheck],
  ["Clinic", "500 pacientes, equipe e relatorios avancados", UsersRound],
  ["Billing", "Checkout online em preparacao", LockKeyhole],
];

function formatPrice(value: number | null): string {
  if (value === null) return "Sob consulta";
  if (value === 0) return "R$ 0";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function limitLabel(value: number | null, suffix: string) {
  if (value === null) return "Ilimitado";
  return `${new Intl.NumberFormat("pt-BR").format(value)} ${suffix}`;
}

async function getAccountCtaHref() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user ? "/dashboard/settings/billing" : "/register";
  } catch {
    return "/register";
  }
}

function SectionLabel({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={cn("text-sm font-semibold uppercase tracking-[0.2em]", light ? "text-teal-200" : "text-teal-700")}>
      {children}
    </p>
  );
}

function ComparisonValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-2 font-semibold text-teal-700">
        <CheckCircle2 className="size-4" />
        Incluso
      </span>
    );
  }

  if (value === false) {
    return (
      <span className="inline-flex items-center gap-2 text-slate-400">
        <X className="size-4" />
        Nao incluso
      </span>
    );
  }

  return <span>{value}</span>;
}

function PlanCard({ plan, ctaHref }: { plan: PublicPlan; ctaHref: string }) {
  const definition = PLAN_DEFINITIONS[plan.id];
  const featured = plan.tone === "featured";
  const clinic = plan.tone === "scale";

  return (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-[1.65rem] border p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 md:p-7",
        featured
          ? "border-violet-300 bg-[#11152f] text-white shadow-[0_34px_90px_rgba(88,55,180,0.24)]"
          : "border-slate-200 bg-white text-slate-950",
        clinic && "border-teal-200 bg-[#f4fffc]"
      )}
    >
      {featured && (
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#2dd4bf,#a78bfa,#38bdf8)]" />
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={cn("text-xs font-bold uppercase tracking-[0.2em]", featured ? "text-teal-200" : "text-teal-700")}>
            {plan.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">{definition.name}</h2>
        </div>
        {plan.badge && (
          <span className="rounded-full bg-teal-300 px-3 py-1 text-xs font-bold text-slate-950">
            {plan.badge}
          </span>
        )}
      </div>

      <p className={cn("mt-4 min-h-16 text-sm leading-6", featured ? "text-violet-100/78" : "text-slate-600")}>
        {plan.description}
      </p>

      <div className="mt-6">
        <p className="text-4xl font-semibold tracking-tight">
          {formatPrice(definition.monthlyPrice)}
        </p>
        <p className={cn("mt-1 text-sm", featured ? "text-violet-100/62" : "text-slate-500")}>
          {definition.monthlyPrice === null ? "para clinicas" : "por mes"}
        </p>
      </div>

      <div className={cn("mt-6 rounded-2xl p-4", featured ? "bg-white/[0.07]" : "bg-slate-50")}>
        <p className={cn("text-xs font-bold uppercase tracking-[0.18em]", featured ? "text-violet-100/60" : "text-slate-500")}>
          Limites principais
        </p>
        <div className="mt-3 grid gap-2 text-sm">
          <span>{limitLabel(definition.limits.max_active_patients, "pacientes ativos")}</span>
          <span>{limitLabel(definition.limits.max_documents, "documentos")}</span>
          <span>{limitLabel(definition.limits.max_storage_mb, "MB de armazenamento")}</span>
        </div>
      </div>

      <ul className="mt-6 space-y-3">
        {plan.highlights.map((item) => (
          <li key={item} className={cn("flex gap-3 text-sm leading-6", featured ? "text-violet-50/88" : "text-slate-700")}>
            <CheckCircle2 className={cn("mt-0.5 size-5 shrink-0", featured ? "text-teal-200" : "text-teal-600")} />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className={cn("mt-6 space-y-2 border-t pt-5 text-sm leading-6", featured ? "border-white/10 text-violet-100/72" : "border-slate-200 text-slate-600")}>
        {plan.details.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>

      <Link
        href={ctaHref}
        className={cn(
          buttonVariants({ size: "lg" }),
          "mt-auto h-12 rounded-2xl font-semibold",
          featured
            ? "bg-teal-300 text-slate-950 hover:bg-teal-200"
            : "bg-slate-950 text-white hover:bg-slate-800",
          clinic && "bg-teal-700 hover:bg-teal-800"
        )}
      >
        {plan.cta}
        <ArrowRight className="size-4" />
      </Link>
    </article>
  );
}

export default async function PricingPage() {
  const ctaHref = await getAccountCtaHref();

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f8fafc] text-slate-950">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#080b1d]/78 text-white backdrop-blur-2xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/35" aria-label="Nythos">
            <Image src="/logo-icon.png" alt="" width={38} height={38} className="size-9 rounded-2xl object-contain shadow-[0_0_26px_rgba(45,212,191,0.28)]" priority />
            <span className="text-lg font-semibold tracking-tight text-white">Nythos</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-violet-100/70 md:flex">
            <Link href="/" className="transition-colors hover:text-white">Inicio</Link>
            <a href="#planos" className="transition-colors hover:text-white">Planos</a>
            <a href="#comparacao" className="transition-colors hover:text-white">Comparacao</a>
            <a href="#faq" className="transition-colors hover:text-white">FAQ</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "rounded-2xl text-violet-50 hover:bg-white/10 hover:text-white")}>
              Entrar
            </Link>
            <Link href={ctaHref} className={cn(buttonVariants({ size: "lg" }), "hidden rounded-2xl bg-white text-slate-950 hover:bg-teal-100 sm:inline-flex")}>
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-[#080b1d] px-4 pb-16 pt-28 text-white md:px-6 md:pb-20 md:pt-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(20,184,166,0.34),transparent_35%),radial-gradient(ellipse_at_bottom_right,rgba(124,58,237,0.42),transparent_42%),linear-gradient(135deg,#080b1d_0%,#151335_50%,#062333_100%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-35" />

        <div className="mx-auto grid min-h-[calc(100svh-7rem)] w-full max-w-7xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="max-w-3xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-4 py-2 text-sm font-semibold text-teal-100 shadow-[0_0_32px_rgba(20,184,166,0.16)]">
              <Sparkles className="size-4" />
              Planos sem checkout ativo nesta fase.
            </div>

            <h1 className="text-4xl font-semibold leading-[1.04] tracking-tight text-white md:text-6xl">
              Planos para cada momento da sua rotina clinica.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-violet-100/78 md:text-xl md:leading-8">
              Comece organizando seus primeiros pacientes e evolua para uma gestao completa com agenda, prontuario, financeiro, pacotes e portal.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={ctaHref} className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-2xl bg-teal-300 px-6 font-semibold text-slate-950 shadow-[0_18px_42px_rgba(20,184,166,0.24)] hover:-translate-y-0.5 hover:bg-teal-200")}>
                Comecar gratis
                <ArrowRight className="size-4" />
              </Link>
              <a href="#planos" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 rounded-2xl border-white/18 bg-white/[0.08] px-6 text-white hover:bg-white/[0.14] hover:text-white")}>
                Comparar planos
              </a>
            </div>

            <p className="mt-5 max-w-xl text-sm leading-6 text-violet-100/58">
              Pagamento online e troca automatica de plano estao em preparacao. Esta pagina comunica os planos atuais sem iniciar cobranca real.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-[linear-gradient(135deg,rgba(45,212,191,0.22),rgba(167,139,250,0.28),rgba(56,189,248,0.16))] blur-3xl" />
            <div className="relative rounded-[2rem] border border-white/12 bg-white/[0.075] p-4 shadow-[0_36px_120px_rgba(0,0,0,0.34)] ring-1 ring-white/10 backdrop-blur-xl">
              <div className="grid gap-3 sm:grid-cols-2">
                {featurePillars.map(([title, description, Icon]) => (
                  <div key={title} className="rounded-[1.35rem] border border-white/10 bg-white/[0.075] p-5">
                    <Icon className="size-6 text-teal-200" />
                    <h2 className="mt-5 text-lg font-semibold">{title}</h2>
                    <p className="mt-2 text-sm leading-6 text-violet-100/66">{description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-[1.35rem] border border-teal-300/18 bg-teal-300/10 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-teal-100">Teste Professional</p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight">14 dias</p>
                  </div>
                  <Clock3 className="size-10 text-teal-200" />
                </div>
                <p className="mt-3 text-sm leading-6 text-violet-100/68">
                  Novas contas owner entram no periodo de teste profissional sem checkout ativo nesta etapa.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="planos" className="px-4 py-16 md:px-6 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <SectionLabel>Planos</SectionLabel>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                Escolha pelo tamanho da rotina, nao pela complexidade.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-600">
              Os valores e limites abaixo seguem os planos seedados na base SaaS atual. Clinic permanece sob consulta.
            </p>
          </div>

          <div className="mt-10 grid items-stretch gap-5 lg:grid-cols-3">
            {publicPlans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} ctaHref={ctaHref} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 md:px-6 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <SectionLabel>O que muda</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Do primeiro paciente a uma operacao com equipe.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              Starter cobre o essencial. Professional concentra a rotina completa do psicologo. Clinic amplia volume, equipe e recursos avancados.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {scaleSteps.map(([title, description, Icon]) => (
              <article key={title} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <Icon className="size-6 text-teal-700" />
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="comparacao" className="px-4 py-16 md:px-6 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <SectionLabel>Comparacao</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Diferencas principais entre os planos.
            </h2>
          </div>

          <div className="mt-10 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
            <div className="hidden grid-cols-4 border-b border-slate-200 bg-slate-950 text-sm font-semibold text-white md:grid">
              <div className="p-4">Recurso</div>
              <div className="p-4">Starter</div>
              <div className="p-4">Professional</div>
              <div className="p-4">Clinic</div>
            </div>

            <div className="divide-y divide-slate-100">
              {comparisonRows.map((row) => (
                <div key={row.feature} className="grid gap-0 md:grid-cols-4">
                  <div className="bg-slate-50 p-4 text-sm font-semibold text-slate-950 md:bg-white">
                    {row.feature}
                  </div>
                  <div className="grid grid-cols-[7rem_1fr] gap-3 p-4 text-sm text-slate-600 md:block">
                    <span className="font-semibold text-slate-400 md:hidden">Starter</span>
                    <ComparisonValue value={row.starter} />
                  </div>
                  <div className="grid grid-cols-[7rem_1fr] gap-3 p-4 text-sm text-slate-600 md:block">
                    <span className="font-semibold text-slate-400 md:hidden">Professional</span>
                    <ComparisonValue value={row.professional} />
                  </div>
                  <div className="grid grid-cols-[7rem_1fr] gap-3 p-4 text-sm text-slate-600 md:block">
                    <span className="font-semibold text-slate-400 md:hidden">Clinic</span>
                    <ComparisonValue value={row.clinic} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="bg-[#0a0d21] px-4 py-16 text-white md:px-6 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <SectionLabel light>FAQ</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Duvidas comuns antes de escolher.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {faqItems.map((item) => (
              <article key={item.question} className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
                <div className="flex gap-3">
                  <HelpCircle className="mt-0.5 size-5 shrink-0 text-teal-200" />
                  <div>
                    <h3 className="text-base font-semibold">{item.question}</h3>
                    <p className="mt-3 text-sm leading-6 text-violet-100/68">{item.answer}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#080b1d] px-4 py-16 text-white md:px-6 md:py-20">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(20,184,166,0.22),transparent_42%),linear-gradient(315deg,rgba(124,58,237,0.28),transparent_42%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 rounded-[2rem] border border-white/12 bg-white/[0.065] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <SectionLabel light>Comece agora</SectionLabel>
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
              Organize sua rotina clinica e acompanhe a evolucao dos planos.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-violet-100/70">
              A criacao de conta inicia o fluxo atual do produto. Nenhum checkout, customer ou assinatura real e criado por esta pagina.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={ctaHref} className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-2xl bg-teal-300 px-6 font-semibold text-slate-950 hover:bg-teal-200")}>
                Criar conta
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 rounded-2xl border-white/18 bg-white/[0.08] px-6 text-white hover:bg-white/[0.14] hover:text-white")}>
                Entrar
              </Link>
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.07] p-5">
            <ShieldCheck className="size-8 text-teal-200" />
            <p className="mt-5 text-xl font-semibold">Comunicacao comercial, sem cobranca ativa.</p>
            <p className="mt-3 text-sm leading-6 text-violet-100/68">
              Esta fase publica os planos e CTAs de cadastro. A ativacao de pagamento online deve acontecer em uma etapa separada.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#070917] px-4 py-8 text-white md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo-icon.png" alt="" width={34} height={34} className="size-9 rounded-2xl object-contain" />
            <div>
              <div className="font-semibold">Nythos</div>
              <div className="text-xs text-violet-100/55">Gestao clinica com clareza.</div>
            </div>
          </Link>
          <div className="flex flex-wrap gap-4 text-sm font-medium text-violet-100/65">
            <Link href="/" className="transition-colors hover:text-white">Inicio</Link>
            <Link href="/precos" className="transition-colors hover:text-white">Precos</Link>
            <Link href="/termos" className="transition-colors hover:text-white">Termos</Link>
            <Link href="/privacidade" className="transition-colors hover:text-white">Privacidade</Link>
            <Link href="/login" className="transition-colors hover:text-white">Entrar</Link>
            <Link href={ctaHref} className="transition-colors hover:text-white">Criar conta</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
