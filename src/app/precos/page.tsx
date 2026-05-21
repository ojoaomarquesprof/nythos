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
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  getNythosProAnnualSavings,
  PLAN_DEFINITIONS,
} from "@/lib/subscription/plan-rules";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Precos | Nythos",
  description:
    "Teste o Nythos PRO por 14 dias. Depois, continue no plano mensal, anual ou fale sobre Nythos Clinic para maior volume.",
  openGraph: {
    type: "website",
    siteName: "Nythos",
    title: "Teste o Nythos PRO por 14 dias | Nythos",
    description:
      "Planos simples para psicologos: teste gratuito, Nythos PRO mensal ou anual, e Nythos Clinic sob consulta.",
  },
};

const pro = PLAN_DEFINITIONS.professional;
const clinic = PLAN_DEFINITIONS.clinic;
const annualSavings = getNythosProAnnualSavings();

const includedFeatures: Array<[string, string, LucideIcon]> = [
  ["Agenda", "Sessoes, bloqueios e rotina semanal.", CalendarCheck2],
  ["Google Calendar", "Compromissos externos como bloqueios.", BadgeCheck],
  ["Prontuario", "Evolucao e historico do paciente.", FileText],
  ["Financeiro clinico", "Recebimentos, pendencias e recibos.", WalletCards],
  ["Pacotes", "Saldos e uso de sessoes no fluxo clinico.", PackageCheck],
  ["Documentos", "Arquivos e consentimentos organizados.", FileCheck2],
  ["Portal do paciente", "Tarefas, check-ins e documentos.", UsersRound],
  ["Audit log", "Historico de acoes criticas.", ShieldCheck],
];

const comparisonRows = [
  ["Teste", "14 dias de Nythos PRO", "Plano mensal ou anual", "Condicoes personalizadas"],
  ["Pacientes ativos", "Ate 100", "Ate 100", "Acima de 100"],
  ["Profissional", "1 profissional", "1 profissional", "Equipe maior sob condicoes personalizadas"],
  ["Secretaria/assistente", "Ate 1", "Ate 1", "Equipe personalizada"],
  ["Recursos principais", true, true, true],
  ["Documentos", "Limite PRO", "Limite PRO", "Volume maior sob consulta"],
  ["Relatorios", "Basicos", "Basicos", "Necessidades especificas sob consulta"],
] as const;

const faqItems = [
  {
    question: "Como funciona o teste gratuito?",
    answer:
      "Novas contas owner comecam com 14 dias de experiencia Nythos PRO, com os recursos principais liberados e limite de ate 100 pacientes ativos.",
  },
  {
    question: "Posso escolher mensal ou anual agora?",
    answer:
      "A comunicacao comercial ja esta preparada para mensal e anual. Nesta fase, criar conta nao inicia cobranca ativa nem altera assinatura real automaticamente.",
  },
  {
    question: "Quando faz sentido falar sobre Nythos Clinic?",
    answer:
      "Quando a operacao precisa de mais de 100 pacientes ativos, mais equipe, maior volume de documentos ou condicoes especificas para uma clinica.",
  },
  {
    question: "O Nythos substitui meu julgamento clinico?",
    answer:
      "Nao. O Nythos organiza agenda, prontuario, financeiro, documentos e relacionamento com pacientes. As decisoes clinicas continuam sendo responsabilidade do profissional.",
  },
];

function formatCurrency(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  }).format(value);
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

  return <span>{value}</span>;
}

export default async function PricingPage() {
  const ctaHref = await getAccountCtaHref();

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f8fafc] text-slate-950">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#080b1d]/86 text-white backdrop-blur-2xl">
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

      <section className="bg-[#080b1d] px-4 pb-14 pt-28 text-white md:px-6 md:pb-18 md:pt-32">
        <div className="mx-auto grid min-h-[calc(100svh-7rem)] w-full max-w-7xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="max-w-3xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-4 py-2 text-sm font-semibold text-teal-100">
              <Sparkles className="size-4" />
              Trial gratuito de 14 dias
            </div>

            <h1 className="text-4xl font-semibold leading-[1.04] tracking-tight text-white md:text-6xl">
              Teste o Nythos PRO por 14 dias.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-violet-100/78 md:text-xl md:leading-8">
              Depois do teste, continue no plano mensal ou anual. Para clinicas e equipes maiores, fale conosco sobre o Nythos Clinic.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={ctaHref} className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-2xl bg-teal-300 px-6 font-semibold text-slate-950 shadow-[0_18px_42px_rgba(20,184,166,0.24)] hover:-translate-y-0.5 hover:bg-teal-200")}>
                Comecar teste gratis
                <ArrowRight className="size-4" />
              </Link>
              <a href="#planos" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 rounded-2xl border-white/18 bg-white/[0.08] px-6 text-white hover:bg-white/[0.14] hover:text-white")}>
                Ver planos
              </a>
            </div>

            <p className="mt-5 max-w-xl text-sm leading-6 text-violet-100/58">
              A criacao de conta nao cria cobranca ativa nesta etapa.
            </p>
          </div>

          <div className="relative rounded-[2rem] border border-white/12 bg-white/[0.075] p-5 shadow-[0_36px_120px_rgba(0,0,0,0.34)] ring-1 ring-white/10 backdrop-blur-xl">
            <div className="rounded-[1.35rem] border border-teal-300/18 bg-teal-300/10 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-teal-100">Nythos PRO no teste</p>
                  <p className="mt-1 text-4xl font-semibold tracking-tight">14 dias</p>
                </div>
                <Clock3 className="size-10 text-teal-200" />
              </div>
              <p className="mt-4 text-sm leading-6 text-violet-100/68">
                Agenda, Google Calendar, prontuario, financeiro clinico, pacotes, documentos, portal, tarefas, audit log e relatorios basicos.
              </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {includedFeatures.slice(0, 4).map(([title, description, Icon]) => (
                <div key={title} className="rounded-[1.1rem] border border-white/10 bg-white/[0.075] p-4">
                  <Icon className="size-5 text-teal-200" />
                  <h2 className="mt-4 text-base font-semibold">{title}</h2>
                  <p className="mt-2 text-xs leading-5 text-violet-100/66">{description}</p>
                </div>
              ))}
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
                Um modelo simples para decidir sem friccao.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-600">
              Trial gratuito, Nythos PRO mensal ou anual, e Nythos Clinic para operacoes com mais volume.
            </p>
          </div>

          <div className="mt-10 grid items-stretch gap-5 lg:grid-cols-3">
            <article className="flex h-full flex-col rounded-[1.65rem] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] md:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Comece sem compromisso</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">Trial gratuito</h2>
              <p className="mt-4 min-h-16 text-sm leading-6 text-slate-600">
                14 dias com a experiencia do Nythos PRO liberada para organizar sua rotina desde o primeiro acesso.
              </p>
              <div className="mt-6">
                <p className="text-4xl font-semibold tracking-tight">14 dias</p>
                <p className="mt-1 text-sm text-slate-500">Nythos PRO completo no periodo de teste</p>
              </div>
              <ul className="mt-6 space-y-3">
                {[
                  "Ate 100 pacientes ativos",
                  "Ate 1 secretaria/assistente",
                  "Recursos principais liberados",
                  "Sem cobranca ativa nesta etapa",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href={ctaHref} className={cn(buttonVariants({ size: "lg" }), "mt-auto h-12 rounded-2xl bg-slate-950 font-semibold text-white hover:bg-slate-800")}>
                Comecar teste gratis
                <ArrowRight className="size-4" />
              </Link>
            </article>

            <article className="relative flex h-full flex-col overflow-hidden rounded-[1.65rem] border border-violet-300 bg-[#11152f] p-6 text-white shadow-[0_34px_90px_rgba(88,55,180,0.24)] md:p-7">
              <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#2dd4bf,#a78bfa,#38bdf8)]" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-200">Mais indicado</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">{pro.name}</h2>
                </div>
                <span className="rounded-full bg-teal-300 px-3 py-1 text-xs font-bold text-slate-950">
                  PRO
                </span>
              </div>
              <p className="mt-4 min-h-16 text-sm leading-6 text-violet-100/78">
                {pro.description}
              </p>
              <div className="mt-6 grid gap-3">
                <div>
                  <p className="text-4xl font-semibold tracking-tight">{formatCurrency(pro.monthlyPrice ?? 0)}/mes</p>
                  <p className="mt-1 text-sm text-violet-100/62">Plano mensal</p>
                </div>
                <div className="rounded-2xl bg-white/[0.07] p-4">
                  <p className="text-sm font-semibold text-teal-100">{formatCurrency(pro.yearlyPrice ?? 0)}/ano</p>
                  <p className="mt-1 text-xs leading-5 text-violet-100/68">
                    12 x {formatCurrency(pro.monthlyPrice ?? 0)} = {formatCurrency(annualSavings.monthlyAnnualized)}.
                    Economia de {formatCurrency(annualSavings.savings)}/ano, equivalente a {formatCurrency(annualSavings.equivalentMonthly, 2)}/mes.
                  </p>
                </div>
              </div>
              <ul className="mt-6 space-y-3">
                {pro.features.slice(0, 5).map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-6 text-violet-50/88">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal-200" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href={ctaHref} className={cn(buttonVariants({ size: "lg" }), "mt-auto h-12 rounded-2xl bg-teal-300 font-semibold text-slate-950 hover:bg-teal-200")}>
                Criar conta
                <ArrowRight className="size-4" />
              </Link>
            </article>

            <article className="flex h-full flex-col rounded-[1.65rem] border border-teal-200 bg-[#f4fffc] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] md:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Clinicas e equipes</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">{clinic.name}</h2>
              <p className="mt-4 min-h-16 text-sm leading-6 text-slate-600">
                {clinic.description} Condicoes personalizadas para pacientes, equipe, volume e operacao.
              </p>
              <div className="mt-6">
                <p className="text-4xl font-semibold tracking-tight">Sob consulta</p>
                <p className="mt-1 text-sm text-slate-500">Para mais pacientes, equipe ou armazenamento</p>
              </div>
              <ul className="mt-6 space-y-3">
                {clinic.features.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href={ctaHref} className={cn(buttonVariants({ size: "lg" }), "mt-auto h-12 rounded-2xl bg-teal-700 font-semibold text-white hover:bg-teal-800")}>
                Falar sobre Nythos Clinic
                <ArrowRight className="size-4" />
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 md:px-6 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <SectionLabel>Incluido no PRO</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Os recursos principais entram juntos.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {includedFeatures.map(([title, description, Icon]) => (
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
              Trial gratuito, Nythos PRO e Nythos Clinic em uma leitura so.
            </h2>
          </div>

          <div className="mt-10 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
            <div className="hidden grid-cols-4 border-b border-slate-200 bg-slate-950 text-sm font-semibold text-white md:grid">
              <div className="p-4">Recurso</div>
              <div className="p-4">Trial gratuito</div>
              <div className="p-4">Nythos PRO</div>
              <div className="p-4">Nythos Clinic</div>
            </div>

            <div className="divide-y divide-slate-100">
              {comparisonRows.map(([feature, trial, proValue, clinicValue]) => (
                <div key={feature} className="grid gap-0 md:grid-cols-4">
                  <div className="bg-slate-50 p-4 text-sm font-semibold text-slate-950 md:bg-white">
                    {feature}
                  </div>
                  <div className="grid grid-cols-[8rem_1fr] gap-3 p-4 text-sm text-slate-600 md:block">
                    <span className="font-semibold text-slate-400 md:hidden">Trial gratuito</span>
                    <ComparisonValue value={trial} />
                  </div>
                  <div className="grid grid-cols-[8rem_1fr] gap-3 p-4 text-sm text-slate-600 md:block">
                    <span className="font-semibold text-slate-400 md:hidden">Nythos PRO</span>
                    <ComparisonValue value={proValue} />
                  </div>
                  <div className="grid grid-cols-[8rem_1fr] gap-3 p-4 text-sm text-slate-600 md:block">
                    <span className="font-semibold text-slate-400 md:hidden">Nythos Clinic</span>
                    <ComparisonValue value={clinicValue} />
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
              Duvidas comuns antes de comecar.
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

      <section className="bg-[#080b1d] px-4 py-16 text-white md:px-6 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 rounded-[2rem] border border-white/12 bg-white/[0.065] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <SectionLabel light>Comece agora</SectionLabel>
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
              Teste o Nythos PRO e organize sua rotina clinica.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-violet-100/70">
              A criacao de conta inicia o fluxo atual do produto. Nenhuma assinatura real e criada por esta pagina.
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
            <ReceiptText className="size-8 text-teal-200" />
            <p className="mt-5 text-xl font-semibold">Modelo comercial simples.</p>
            <p className="mt-3 text-sm leading-6 text-violet-100/68">
              Trial gratuito de 14 dias, Nythos PRO mensal ou anual, e Nythos Clinic sob consulta.
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
