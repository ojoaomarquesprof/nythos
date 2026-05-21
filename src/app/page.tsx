import { existsSync } from "fs";
import { join } from "path";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  FileText,
  Layers3,
  LockKeyhole,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Nythos | Gestao clinica premium para psicologos",
  description:
    "Uma central moderna para psicologos organizarem agenda, prontuario, financeiro, pacotes, documentos e portal do paciente.",
  openGraph: {
    type: "website",
    siteName: "Nythos",
    title: "Nythos | Gestao clinica premium para psicologos",
    description:
      "Agenda, prontuario, financeiro, pacotes, documentos e portal do paciente em uma experiencia segura, conectada e premium.",
  },
};

type ScreenshotId = "dashboard" | "schedule" | "record" | "finance" | "portal";

type ScreenshotAsset = {
  id: ScreenshotId;
  title: string;
  description: string;
  frameLabel: string;
  bullets: string[];
  aspectClass: string;
  imageClassName?: string;
  image: string;
  alt: string;
};

const screenshotAssets: ScreenshotAsset[] = [
  {
    id: "dashboard",
    title: "Dashboard com pulso da clinica",
    description: "Veja agenda do dia, atencoes pendentes e financeiro sem abrir tres ferramentas.",
    frameLabel: "Dashboard clinico",
    bullets: ["Resumo do dia em poucos segundos", "Alertas de rotina em destaque", "Financeiro junto da agenda"],
    aspectClass: "aspect-[16/9]",
    imageClassName: "object-cover object-top",
    image: "/landing/dashboard-overview.png",
    alt: "Dashboard do Nythos com indicadores de agenda, financeiro e atencoes pendentes.",
  },
  {
    id: "schedule",
    title: "Agenda conectada",
    description: "Visualize sessoes, status, pacotes e bloqueios em uma semana mais facil de ler.",
    frameLabel: "Visao da agenda",
    bullets: ["Sessoes e bloqueios na mesma tela", "Status claros para cada atendimento", "Google Calendar integrado a rotina"],
    aspectClass: "aspect-[16/9]",
    image: "/landing/schedule-screen.png",
    alt: "Agenda semanal do Nythos com sessoes, bloqueios e controles de calendario.",
  },
  {
    id: "record",
    title: "Prontuario no contexto certo",
    description: "Evolucao, documentos e historico ficam organizados na pagina do paciente.",
    frameLabel: "Prontuario do paciente",
    bullets: ["Historico clinico organizado por paciente", "Documentos e consentimentos no fluxo", "Evolucao vinculada ao atendimento"],
    aspectClass: "aspect-[4/3]",
    image: "/landing/patient-record.png",
    alt: "Area do paciente no Nythos com prontuario, documentos e historico.",
  },
  {
    id: "finance",
    title: "Financeiro e pacotes sem planilha",
    description: "Acompanhe recebimentos, pendencias, recibos e saldos de pacote no mesmo fluxo.",
    frameLabel: "Painel financeiro",
    bullets: ["Recebimentos e pendencias visiveis", "Pacotes acompanhados por saldo", "Recibos conectados ao atendimento"],
    aspectClass: "aspect-[4/3]",
    image: "/landing/finance-packages.png",
    alt: "Financeiro do Nythos com recebimentos, pendencias e pacotes de sessoes.",
  },
  {
    id: "portal",
    title: "Portal do paciente",
    description: "Tarefas, documentos, check-ins e respostas em uma experiencia organizada.",
    frameLabel: "Portal do paciente",
    bullets: ["Tarefas e check-ins entre sessoes", "Documentos importantes em um lugar", "Contato mais organizado com o paciente"],
    aspectClass: "aspect-[3/4]",
    image: "/landing/patient-portal.png",
    alt: "Portal do paciente no Nythos com tarefas, documentos e acompanhamento.",
  },
];

const painPoints = [
  "A agenda fica em um lugar.",
  "O financeiro mora em outra aba.",
  "O prontuario perde contexto.",
  "Pacotes viram controles paralelos.",
  "Documentos e consentimentos se espalham.",
  "O paciente responde por canais soltos.",
];

const operatingSystem = [
  {
    title: "Antes da sessao",
    description: "Agenda, confirmacao, preparo e contexto do paciente sem montar tudo de novo.",
    items: ["Agenda organizada", "Contexto do paciente", "Preparacao rapida"],
    icon: CalendarCheck2,
  },
  {
    title: "Durante",
    description: "Evolucao, plano e tarefas no mesmo lugar em que a historia clinica acontece.",
    items: ["Evolucao vinculada", "Plano terapeutico", "Tarefas e acompanhamento"],
    icon: FileText,
  },
  {
    title: "Depois",
    description: "Cobranca, recibo, pacote e portal conectados ao atendimento realizado.",
    items: ["Cobranca", "Pacote", "Recibo e portal"],
    icon: ReceiptText,
  },
];

const resources = [
  {
    title: "Agenda inteligente",
    description: "Sessoes, remarcacoes, recorrencias e bloqueios com leitura rapida.",
    icon: CalendarCheck2,
  },
  {
    title: "Prontuario conectado",
    description: "Evolucao e historico clinico no contexto do paciente.",
    icon: FileText,
  },
  {
    title: "Financeiro clinico",
    description: "Recebimentos, pendencias e recibos ligados a rotina.",
    icon: WalletCards,
  },
  {
    title: "Pacotes de sessoes",
    description: "Saldo, uso, pagamento e status sem controles paralelos.",
    icon: PackageCheck,
  },
  {
    title: "Portal do paciente",
    description: "Tarefas, check-ins e acompanhamento entre encontros.",
    icon: UserRoundCheck,
  },
  {
    title: "Documentos e consentimentos",
    description: "Arquivos e termos importantes dentro do fluxo certo.",
    icon: FileCheck2,
  },
  {
    title: "Rastreabilidade",
    description: "Historico de acoes criticas para uma rotina responsavel.",
    icon: ShieldCheck,
  },
  {
    title: "Google Calendar",
    description: "Compromissos externos como bloqueios para reduzir conflitos.",
    icon: BadgeCheck,
  },
];

const securityPoints = [
  ["Historico de acoes criticas", "Rastreabilidade operacional para eventos importantes.", ReceiptText],
  ["Acesso controlado", "Rotinas pensadas para separar areas e papeis.", LockKeyhole],
  ["Documentos privados", "Organizacao com cuidado para arquivos sensiveis.", FileCheck2],
  ["Dados sensiveis", "Boas praticas para apoiar privacidade e responsabilidade.", ShieldCheck],
] as const;

function publicAssetExists(src: string) {
  return existsSync(join(process.cwd(), "public", src.replace(/^\//, "")));
}

async function redirectAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");
}

function findShot(shots: (ScreenshotAsset & { exists: boolean })[], id: ScreenshotId) {
  return shots.find((shot) => shot.id === id) ?? shots[0];
}

function SectionLabel({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={cn("text-sm font-semibold uppercase tracking-[0.2em]", light ? "text-teal-200" : "text-teal-600")}>
      {children}
    </p>
  );
}

function BrowserFrame({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.65rem] border border-white/14 bg-white/[0.08] shadow-[0_32px_110px_rgba(5,8,29,0.42)] ring-1 ring-white/10 backdrop-blur-xl",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0c1028]/82 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-rose-400" />
          <span className="size-2.5 rounded-full bg-amber-300" />
          <span className="size-2.5 rounded-full bg-emerald-300" />
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-violet-100">
          {label}
        </div>
      </div>
      {children}
    </div>
  );
}

function ScreenshotFrame({
  shot,
  compact = false,
  priority = false,
  className,
}: {
  shot: ScreenshotAsset & { exists: boolean };
  compact?: boolean;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div className="absolute -inset-3 rounded-[2rem] bg-[linear-gradient(135deg,rgba(124,58,237,0.28),rgba(20,184,166,0.2),rgba(99,102,241,0.2))] blur-2xl" />
      <BrowserFrame label={shot.frameLabel} className="relative">
        {shot.exists ? (
          <div className={cn("relative bg-[#f8f7ff]", compact ? "aspect-[16/10]" : shot.aspectClass)}>
            <Image
              src={shot.image}
              alt={shot.alt}
              fill
              sizes={compact ? "(min-width: 1024px) 42vw, 92vw" : "(min-width: 1024px) 62vw, 92vw"}
              priority={priority}
              className={cn("object-contain", shot.imageClassName)}
            />
          </div>
        ) : (
          <ProductInterfacePreview kind={shot.id} compact={compact} label={shot.alt} />
        )}
      </BrowserFrame>
    </div>
  );
}

function ProductInterfacePreview({
  kind,
  compact = false,
  label,
}: {
  kind: ScreenshotId;
  compact?: boolean;
  label: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "bg-[#f8f7ff] text-slate-950",
        compact ? "min-h-[250px] p-4" : "min-h-[430px] p-4 sm:p-5"
      )}
    >
      {kind === "dashboard" && <DashboardInterfacePreview compact={compact} />}
      {kind === "schedule" && <ScheduleInterfacePreview compact={compact} />}
      {kind === "record" && <RecordInterfacePreview compact={compact} />}
      {kind === "finance" && <FinanceInterfacePreview compact={compact} />}
      {kind === "portal" && <PortalInterfacePreview compact={compact} />}
    </div>
  );
}

function DashboardInterfacePreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("grid h-full gap-4", compact ? "" : "lg:grid-cols-[1.2fr_0.9fr]")}>
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">Dashboard</div>
            <div className="mt-1 text-2xl font-semibold">Rotina do dia</div>
          </div>
          <div className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
            Tudo em ordem
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["Sessoes hoje", "3", "Agenda organizada", "violet"],
            ["Pacientes ativos", "18", "Em acompanhamento", "teal"],
            ["Receita do mes", "R$ 7.420", "Confirmado", "amber"],
            ["Pendencias", "2", "Para revisar", "rose"],
          ].map(([title, value, caption, color]) => (
            <div key={title} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(76,63,132,0.08)]">
              <div className={cn("mb-4 size-3 rounded-full", color === "violet" && "bg-violet-500", color === "teal" && "bg-teal-500", color === "amber" && "bg-amber-500", color === "rose" && "bg-rose-500")} />
              <div className="text-sm text-slate-600">{title}</div>
              <div className="mt-1 text-2xl font-semibold">{value}</div>
              <div className="mt-1 text-sm text-slate-500">{caption}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={cn("grid gap-4", compact && "hidden sm:grid")}>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(76,63,132,0.08)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Atencao clinica</div>
              <div className="text-sm text-slate-500">Itens que pedem cuidado.</div>
            </div>
            <FileText className="size-5 text-teal-600" />
          </div>
          <div className="mt-6 space-y-3">
            {["Anamnese aguardando resposta", "Evolucao registrada", "Documento pendente"].map((item) => (
              <div key={item} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                <span className="text-sm font-medium">{item}</span>
                <span className="rounded-full bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700">status</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(76,63,132,0.08)]">
          <div className="mb-5 flex items-center justify-between">
            <div className="font-semibold">Financeiro</div>
            <WalletCards className="size-5 text-violet-600" />
          </div>
          <div className="flex h-24 items-end gap-3">
            {[24, 44, 36, 78, 92, 48].map((height, index) => (
              <div key={index} className="flex-1 rounded-t-2xl bg-gradient-to-t from-violet-500 to-teal-300" style={{ height }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleInterfacePreview({ compact = false }: { compact?: boolean }) {
  const days = ["Seg", "Ter", "Qua", "Qui", "Sex"];
  return (
    <div className={cn("grid h-full gap-4", compact ? "" : "md:grid-cols-[210px_1fr]")}>
      <aside className={cn("rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(76,63,132,0.08)]", compact && "hidden md:block")}>
        <div className="mb-4 flex items-center justify-between">
          <div className="font-semibold">Maio</div>
          <CalendarCheck2 className="size-5 text-violet-600" />
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-xs text-slate-500">
          {Array.from({ length: 28 }).map((_, index) => (
            <span
              key={index}
              className={cn(
                "rounded-full py-1",
                index === 16 && "bg-violet-600 font-semibold text-white shadow-lg shadow-violet-500/25",
                [4, 9, 18, 25].includes(index) && "font-semibold text-slate-950"
              )}
            >
              {index + 1}
            </span>
          ))}
        </div>
        <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-700">
          Google Calendar conectado
        </div>
      </aside>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_34px_rgba(76,63,132,0.08)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Visao semanal</div>
            <div className="font-semibold">Agenda clinica</div>
          </div>
          <div className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">Semana</div>
        </div>
        <div className="grid grid-cols-5 border-b border-slate-200 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {days.map((day) => (
            <div key={day} className="border-r border-slate-200 px-2 py-3 last:border-r-0">{day}</div>
          ))}
        </div>
        <div className={cn("grid grid-cols-5", compact ? "h-44" : "h-64")}>
          {days.map((day, dayIndex) => (
            <div key={day} className="relative border-r border-slate-200 bg-[linear-gradient(#e5e7eb_1px,transparent_1px)] bg-[size:100%_52px] last:border-r-0">
              {dayIndex === 0 && <SessionPill top="58%" label="Paciente" time="13:00" />}
              {dayIndex === 2 && <SessionPill top="34%" label="Paciente" time="10:30" />}
              {dayIndex === 4 && <SessionPill top="50%" label="Paciente" time="11:00" />}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SessionPill({ top, label, time }: { top: string; label: string; time: string }) {
  return (
    <div
      className="absolute left-2 right-2 rounded-2xl border border-violet-200 bg-violet-50 p-2 text-xs shadow-[0_12px_26px_rgba(124,58,237,0.12)]"
      style={{ top }}
    >
      <div className="truncate font-semibold text-violet-700">{label}</div>
      <div className="mt-1 text-slate-600">{time}</div>
    </div>
  );
}

function RecordInterfacePreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("grid h-full gap-4", compact ? "" : "lg:grid-cols-[0.86fr_1.14fr]")}>
      <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(76,63,132,0.08)]">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
            <UserRoundCheck className="size-6" />
          </div>
          <div>
            <div className="font-semibold">Paciente</div>
            <div className="text-sm text-slate-500">Acompanhamento ativo</div>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {["Sessoes", "Documentos", "Consentimentos"].map((item) => (
            <div key={item} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <span className="text-sm font-medium">{item}</span>
              <CheckCircle2 className="size-4 text-teal-600" />
            </div>
          ))}
        </div>
      </aside>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(76,63,132,0.08)]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">Prontuario</div>
            <div className="font-semibold">Evolucoes e plano</div>
          </div>
          <FileText className="size-5 text-violet-600" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="h-3 w-28 rounded-full bg-slate-300" />
                <span className="rounded-full bg-teal-100 px-2 py-1 text-[11px] font-semibold text-teal-700">registrado</span>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-2 rounded-full bg-slate-200" />
                <div className="h-2 w-4/5 rounded-full bg-slate-200" />
                {!compact && <div className="h-2 w-2/3 rounded-full bg-slate-200" />}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FinanceInterfacePreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(76,63,132,0.08)]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">Financeiro</div>
          <div className="font-semibold">Recebimentos e pacotes</div>
        </div>
        <WalletCards className="size-5 text-teal-600" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Entradas", "R$ 7.420", "teal"],
          ["Pendentes", "2", "amber"],
          ["Pacotes ativos", "6", "violet"],
        ].map(([label, value, color]) => (
          <div key={label} className={cn("rounded-2xl border p-4", color === "teal" && "border-teal-200 bg-teal-50", color === "amber" && "border-amber-200 bg-amber-50", color === "violet" && "border-violet-200 bg-violet-50")}>
            <div className="text-xs font-semibold text-slate-600">{label}</div>
            <div className="mt-1 text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className={cn("mt-8 flex items-end gap-4", compact ? "h-28" : "h-44")}>
        {[36, 58, 42, 92, 120, 66].map((height, index) => (
          <div key={index} className="flex flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-t-3xl bg-gradient-to-t from-violet-600 to-teal-300" style={{ height }} />
            <span className="text-[11px] font-medium text-slate-500">{["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"][index]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortalInterfacePreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("grid h-full gap-4", compact ? "" : "lg:grid-cols-[1fr_0.85fr]")}>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(76,63,132,0.08)]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-600">Portal</div>
            <div className="font-semibold">Acompanhamento entre sessoes</div>
          </div>
          <UserRoundCheck className="size-5 text-violet-600" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {["Tarefa enviada", "Check-in recebido", "Documento disponivel", "Consentimento assinado"].map((item) => (
            <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <CheckCircle2 className="size-4 text-teal-600" />
              <div className="mt-4 text-sm font-semibold">{item}</div>
            </div>
          ))}
        </div>
      </section>

      <aside className={cn("rounded-3xl border border-slate-200 bg-gradient-to-br from-violet-50 to-teal-50 p-5 shadow-[0_14px_34px_rgba(76,63,132,0.08)]", compact && "hidden sm:block")}>
        <div className="text-sm font-semibold text-slate-700">Resumo seguro</div>
        <div className="mt-5 space-y-3">
          {[72, 54, 86].map((width, index) => (
            <div key={index} className="rounded-2xl bg-white/80 p-3">
              <div className="h-2 rounded-full bg-slate-200" style={{ width: `${width}%` }} />
              <div className="mt-2 h-2 w-1/2 rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function HeroProductShot({ shot }: { shot: ScreenshotAsset & { exists: boolean } }) {
  return (
    <div className="landing-float relative mx-auto w-full max-w-[760px] lg:mx-0">
      <ScreenshotFrame shot={shot} priority />

      <div className="landing-float-delayed absolute -right-3 top-16 hidden w-60 rounded-3xl border border-white/16 bg-white/14 p-4 text-white shadow-[0_24px_70px_rgba(5,8,29,0.42)] backdrop-blur-2xl md:block">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-teal-300/20 text-teal-100">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Sessao realizada</div>
            <div className="text-xs text-violet-100/70">evolucao registrada</div>
          </div>
        </div>
      </div>

      <div className="landing-float-reverse absolute -bottom-6 left-4 hidden w-64 rounded-3xl border border-white/16 bg-[#f9fafb]/95 p-4 shadow-[0_24px_70px_rgba(5,8,29,0.28)] sm:block">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Financeiro</div>
            <div className="mt-1 text-base font-semibold text-slate-950">Cobranca pendente</div>
          </div>
          <WalletCards className="size-5 text-violet-600" />
        </div>
        <div className="mt-4 h-2 rounded-full bg-slate-200">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-violet-600 to-teal-400" />
        </div>
      </div>
    </div>
  );
}

function ProductShowcaseBlock({
  shot,
  index,
}: {
  shot: ScreenshotAsset & { exists: boolean };
  index: number;
}) {
  const imageFirstOnDesktop = index % 2 === 1;

  return (
    <article className="rounded-[2rem] border border-violet-100 bg-white p-4 shadow-[0_22px_70px_rgba(63,42,120,0.12)] md:p-6">
      <div className={cn("grid gap-8 lg:items-center", imageFirstOnDesktop ? "lg:grid-cols-[1.18fr_0.82fr]" : "lg:grid-cols-[0.82fr_1.18fr]")}>
        <div className={cn("p-1 md:p-4", imageFirstOnDesktop && "lg:order-2")}>
          <div className="mb-5 inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            {shot.frameLabel}
          </div>
          <h3 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            {shot.title}
          </h3>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
            {shot.description}
          </p>
          <div className="mt-6 space-y-3">
            {shot.bullets.map((bullet) => (
              <div key={bullet} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal-600" />
                <span className="text-sm font-medium leading-6 text-slate-700">{bullet}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={cn(imageFirstOnDesktop && "lg:order-1")}>
          <ScreenshotFrame shot={shot} />
        </div>
      </div>
    </article>
  );
}

export default async function LandingPage() {
  await redirectAuthenticatedUser();

  const shots = screenshotAssets.map((shot) => ({
    ...shot,
    exists: publicAssetExists(shot.image),
  }));
  const heroShot = findShot(shots, "dashboard");

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080b1d] text-white">
      <style>{`
        @keyframes landingFloat {
          0%, 100% { transform: translateY(0) rotateX(0deg); }
          50% { transform: translateY(-12px) rotateX(1deg); }
        }
        @keyframes landingFloatReverse {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(10px); }
        }
        @keyframes landingGlow {
          0%, 100% { opacity: 0.72; transform: translate3d(0, 0, 0) skewY(-5deg); }
          50% { opacity: 0.98; transform: translate3d(0, -16px, 0) skewY(-2deg); }
        }
        .landing-float { animation: landingFloat 8s ease-in-out infinite; }
        .landing-float-delayed { animation: landingFloat 9s ease-in-out infinite; animation-delay: -2s; }
        .landing-float-reverse { animation: landingFloatReverse 7s ease-in-out infinite; animation-delay: -1s; }
        .landing-aurora { animation: landingGlow 11s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .landing-float,
          .landing-float-delayed,
          .landing-float-reverse,
          .landing-aurora {
            animation: none;
          }
        }
      `}</style>

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#080b1d]/72 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/35" aria-label="Nythos">
            <Image src="/logo-icon.png" alt="" width={38} height={38} className="size-9 rounded-2xl object-contain shadow-[0_0_26px_rgba(45,212,191,0.28)]" priority />
            <span className="text-lg font-semibold tracking-tight text-white">Nythos</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-violet-100/70 md:flex">
            <a href="#produto" className="transition-colors hover:text-white">Produto</a>
            <a href="#recursos" className="transition-colors hover:text-white">Recursos</a>
            <a href="#seguranca" className="transition-colors hover:text-white">Seguranca</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "rounded-2xl text-violet-50 hover:bg-white/10 hover:text-white")}>
              Entrar
            </Link>
            <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "rounded-2xl bg-white text-slate-950 hover:bg-teal-100")}>
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <section className="relative isolate min-h-[100svh] overflow-hidden px-4 pb-16 pt-28 md:px-6 md:pb-24 md:pt-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.42),transparent_38%),linear-gradient(135deg,#080b1d_0%,#17113a_45%,#051d2b_100%)]" />
        <div className="landing-aurora absolute left-1/2 top-10 -z-10 h-[520px] w-[1100px] -translate-x-1/2 -skew-y-6 bg-[linear-gradient(90deg,transparent,rgba(124,58,237,0.48),rgba(20,184,166,0.36),rgba(129,140,248,0.38),transparent)] blur-3xl" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-40" />

        <div className="mx-auto grid min-h-[calc(100svh-9rem)] w-full max-w-7xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="max-w-3xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-4 py-2 text-sm font-semibold text-teal-100 shadow-[0_0_32px_rgba(20,184,166,0.16)]">
              <Sparkles className="size-4" />
              Feito para a rotina real de psicologos.
            </div>

            <h1 className="text-4xl font-semibold leading-[1.02] tracking-tight text-white md:text-6xl lg:text-7xl">
              Gestao clinica moderna, com a clareza que sua rotina merece.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-violet-100/78 md:text-xl md:leading-8">
              O Nythos conecta agenda, prontuario, financeiro, pacotes e portal do paciente em uma experiencia segura, bonita e simples de usar.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-2xl bg-teal-300 px-6 font-semibold text-slate-950 shadow-[0_18px_42px_rgba(20,184,166,0.26)] hover:-translate-y-0.5 hover:bg-teal-200")}>
                Comecar agora
                <ArrowRight className="size-4" />
              </Link>
              <a href="#recursos" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 rounded-2xl border-white/18 bg-white/[0.08] px-6 text-white hover:bg-white/[0.14] hover:text-white")}>
                Ver recursos
              </a>
            </div>

            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
              {[
                ["Agenda", "sessoes e bloqueios"],
                ["Prontuario", "evolucao no contexto"],
                ["Financeiro", "pacotes e recibos"],
              ].map(([value, label]) => (
                <div key={value} className="rounded-2xl border border-white/10 bg-white/[0.055] p-3 backdrop-blur">
                  <div className="text-sm font-semibold text-white">{value}</div>
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100/55">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <HeroProductShot shot={heroShot} />
        </div>
      </section>

      <section id="produto" className="relative overflow-hidden bg-[#f7f4ff] px-4 py-20 text-slate-950 md:px-6 md:py-24">
        <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(124,58,237,0.16),transparent)]" />
        <div className="relative mx-auto max-w-7xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <SectionLabel>Veja o Nythos em acao</SectionLabel>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                Produto em tela grande, do jeito que a rotina precisa ser vista.
              </h2>
            </div>
            <p className="max-w-lg text-sm leading-6 text-slate-600">
              Veja como agenda, paciente, financeiro e portal se conectam em uma rotina mais clara.
            </p>
          </div>

          <div className="mt-10 space-y-8">
            {shots.slice(1).map((shot, index) => (
              <ProductShowcaseBlock key={shot.id} shot={shot} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-white px-4 py-20 text-slate-950 md:px-6 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <SectionLabel>O problema real</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              O psicologo nao deveria perder energia juntando informacoes soltas.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              Agenda em uma ferramenta, financeiro em outra, documentos em pastas e respostas do paciente em mensagens. O cuidado clinico fica competindo com retrabalho.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {painPoints.map((point, index) => (
              <div
                key={point}
                className="group rounded-3xl border border-violet-100 bg-[#fbfaff] p-5 shadow-[0_18px_42px_rgba(63,42,120,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-violet-200 hover:shadow-[0_24px_64px_rgba(63,42,120,0.14)]"
              >
                <div className="mb-5 flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 text-sm font-semibold text-white shadow-lg shadow-violet-500/20">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <p className="text-lg font-semibold tracking-tight text-slate-950">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="sistema" className="bg-[#0d1028] px-4 py-20 text-white md:px-6 md:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <SectionLabel light>Sistema operacional da clinica</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Do atendimento ao financeiro, tudo conectado.
            </h2>
            <p className="mt-5 text-base leading-7 text-violet-100/70">
              O Nythos organiza o que acontece antes, durante e depois da sessao para que o cuidado tenha mais espaco.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {operatingSystem.map((stage) => {
              const Icon = stage.icon;
              return (
                <article key={stage.title} className="group rounded-[1.7rem] border border-white/10 bg-white/[0.055] p-6 shadow-[0_24px_70px_rgba(4,7,29,0.24)] transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.075]">
                  <div className="flex items-center justify-between">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-teal-300/14 text-teal-200 ring-1 ring-teal-300/20">
                      <Icon className="size-6" />
                    </div>
                    <ChevronRight className="size-5 text-violet-100/40 transition-transform group-hover:translate-x-1 group-hover:text-teal-200" />
                  </div>
                  <div>
                    <h3 className="mt-6 text-xl font-semibold">{stage.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-violet-100/68">{stage.description}</p>
                    <ul className="mt-6 space-y-3">
                      {stage.items.map((item) => (
                        <li key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm font-medium text-violet-100/82">
                          <CheckCircle2 className="size-4 shrink-0 text-teal-200" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="recursos" className="relative overflow-hidden bg-[#f9fafb] px-4 py-20 text-slate-950 md:px-6 md:py-24">
        <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(124,58,237,0.16),transparent)]" />
        <div className="relative mx-auto max-w-7xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <SectionLabel>Recursos principais</SectionLabel>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                Recursos com cheiro de consultorio em movimento.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-slate-600">
              Menos promessa abstrata. Mais coisas que aparecem na rotina: sessao, evolucao, cobranca, pacote, documento e portal.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {resources.map((resource) => {
              const Icon = resource.icon;
              return (
                <article key={resource.title} className="group rounded-[1.55rem] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-violet-200 hover:shadow-[0_24px_70px_rgba(88,55,180,0.14)]">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 text-white shadow-lg shadow-violet-500/18">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-950">{resource.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{resource.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#f7f4ff] px-4 py-20 text-slate-950 md:px-6 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <SectionLabel>Mais humano</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              A operacao fica mais leve quando as informacoes param de se espalhar.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              O Nythos nao tenta substituir o olhar do psicologo. Ele organiza o entorno do atendimento: agenda, prontuario, cobranca, documentos e contato com o paciente.
            </p>
          </div>
          <div className="rounded-[2rem] border border-violet-100 bg-white p-4 shadow-[0_26px_70px_rgba(63,42,120,0.12)]">
            <ScreenshotFrame shot={findShot(shots, "dashboard")} compact />
            <div className="grid gap-3 p-2 pt-5 sm:grid-cols-3">
              {["Agende", "Atenda", "Receba"].map((item) => (
                <div key={item} className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                  <CheckCircle2 className="mb-3 size-4 text-teal-600" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="seguranca" className="relative overflow-hidden bg-[#0a0d21] px-4 py-20 text-white md:px-6 md:py-24">
        <div className="landing-aurora absolute left-1/2 top-8 h-80 w-[900px] -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(20,184,166,0.24),rgba(124,58,237,0.3),transparent)] blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <SectionLabel light>Seguranca</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Projetado para uma rotina que exige privacidade, rastreabilidade e responsabilidade.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-violet-100/70">
              Sem promessas absolutas. Com escolhas de produto voltadas para uma rotina clinica mais protegida e organizada.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {securityPoints.map(([title, description, Icon]) => (
              <article key={title} className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.085]">
                <Icon className="size-6 text-teal-200" />
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-violet-100/65">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#080b1d] px-4 py-20 text-white md:px-6 md:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(124,58,237,0.28),transparent_42%),linear-gradient(315deg,rgba(20,184,166,0.2),transparent_42%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 rounded-[2rem] border border-white/12 bg-white/[0.065] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-10 lg:grid-cols-[1fr_0.92fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-4 py-2 text-sm font-semibold text-teal-100">
              <Layers3 className="size-4" />
              Nythos como base operacional
            </div>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
              Organize sua clinica com a experiencia que seus atendimentos merecem.
            </h2>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-2xl bg-teal-300 px-6 font-semibold text-slate-950 hover:bg-teal-200")}>
                Criar conta
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 rounded-2xl border-white/18 bg-white/[0.08] px-6 text-white hover:bg-white/[0.14] hover:text-white")}>
                Entrar
              </Link>
            </div>
          </div>
          <ScreenshotFrame shot={findShot(shots, "schedule")} compact />
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
            <Link href="/termos" className="transition-colors hover:text-white">Termos</Link>
            <Link href="/privacidade" className="transition-colors hover:text-white">Privacidade</Link>
            <Link href="/login" className="transition-colors hover:text-white">Entrar</Link>
            <Link href="/register" className="transition-colors hover:text-white">Criar conta</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
