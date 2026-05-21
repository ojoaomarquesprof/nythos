import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LegalSection = {
  id: string;
  title: string;
  body: string[];
};

type LegalPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt: string;
  sections: LegalSection[];
  variant: "terms" | "privacy";
};

export function LegalPage({
  eyebrow,
  title,
  description,
  updatedAt,
  sections,
  variant,
}: LegalPageProps) {
  const Icon = variant === "privacy" ? ShieldCheck : FileText;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080b1d] text-white">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#080b1d]/72 backdrop-blur-2xl">
        <header className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-6">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/35"
            aria-label="Nythos"
          >
            <Image
              src="/logo-icon.png"
              alt=""
              width={38}
              height={38}
              className="size-9 rounded-2xl object-contain shadow-[0_0_26px_rgba(45,212,191,0.28)]"
              priority
            />
            <span className="text-lg font-semibold tracking-tight text-white">
              Nythos
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-violet-100/70 md:flex">
            <Link href="/" className="transition-colors hover:text-white">
              Inicio
            </Link>
            <Link href="/termos" className="transition-colors hover:text-white">
              Termos
            </Link>
            <Link href="/privacidade" className="transition-colors hover:text-white">
              Privacidade
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "rounded-2xl text-violet-50 hover:bg-white/10 hover:text-white"
              )}
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className={cn(
                buttonVariants({ size: "lg" }),
                "hidden rounded-2xl bg-white text-slate-950 hover:bg-teal-100 sm:inline-flex"
              )}
            >
              Criar conta
            </Link>
          </div>
        </header>
      </div>

      <section className="relative isolate overflow-hidden px-4 pb-16 pt-28 md:px-6 md:pb-24 md:pt-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.42),transparent_38%),linear-gradient(135deg,#080b1d_0%,#17113a_45%,#051d2b_100%)]" />
        <div className="absolute left-1/2 top-10 -z-10 h-[520px] w-[1100px] -translate-x-1/2 -skew-y-6 bg-[linear-gradient(90deg,transparent,rgba(124,58,237,0.42),rgba(20,184,166,0.32),rgba(129,140,248,0.32),transparent)] opacity-80 blur-3xl" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-35" />

        <div className="mx-auto w-full max-w-7xl">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-sm font-semibold text-violet-100/80 transition-colors hover:bg-white/[0.12] hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Voltar ao inicio
          </Link>

          <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
            <aside className="lg:sticky lg:top-24">
              <div className="rounded-[2rem] border border-white/12 bg-white/[0.07] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.28)] ring-1 ring-white/10 backdrop-blur-xl">
                <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-teal-300/14 text-teal-100 ring-1 ring-teal-300/25">
                  <Icon className="size-6" />
                </div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-200">
                  {eyebrow}
                </p>
                <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-white md:text-5xl">
                  {title}
                </h1>
                <p className="mt-5 text-base leading-7 text-violet-100/74">
                  {description}
                </p>
                <div className="mt-6 rounded-2xl border border-amber-200/20 bg-amber-200/10 p-4 text-sm leading-6 text-amber-50/86">
                  Este texto e uma base inicial para comunicacao publica e deve
                  ser revisado por assessoria juridica antes do uso comercial
                  final.
                </div>
                <p className="mt-5 text-sm font-medium text-violet-100/58">
                  Ultima atualizacao: {updatedAt}
                </p>

                <div className="mt-8">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/48">
                    Nesta pagina
                  </p>
                  <nav className="space-y-1">
                    {sections.map((section) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-violet-100/68 transition-colors hover:bg-white/[0.07] hover:text-white"
                      >
                        <span>{section.title}</span>
                        <ArrowRight className="size-3.5 shrink-0 opacity-50" />
                      </a>
                    ))}
                  </nav>
                </div>
              </div>
            </aside>

            <div className="space-y-4">
              {sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-24 rounded-[1.5rem] border border-slate-200 bg-white p-6 text-slate-950 shadow-[0_20px_70px_rgba(15,23,42,0.1)] md:p-8"
                >
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {section.title}
                  </h2>
                  <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600">
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#070917] px-4 py-8 text-white md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo-icon.png"
              alt=""
              width={34}
              height={34}
              className="size-9 rounded-2xl object-contain"
            />
            <div>
              <div className="font-semibold">Nythos</div>
              <div className="text-xs text-violet-100/55">
                Gestao clinica com clareza.
              </div>
            </div>
          </Link>
          <div className="flex flex-wrap gap-4 text-sm font-medium text-violet-100/65">
            <Link href="/" className="transition-colors hover:text-white">
              Inicio
            </Link>
            <Link href="/termos" className="transition-colors hover:text-white">
              Termos
            </Link>
            <Link href="/privacidade" className="transition-colors hover:text-white">
              Privacidade
            </Link>
            <Link href="/login" className="transition-colors hover:text-white">
              Entrar
            </Link>
            <Link href="/register" className="transition-colors hover:text-white">
              Criar conta
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
