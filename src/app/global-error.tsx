"use client";

import { useEffect } from "react";
import { logSafeError } from "@/lib/errors/safe-error";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    logSafeError("[app/global-error] Unhandled application error", "global_error_boundary", {
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <main className="relative flex min-h-screen overflow-hidden bg-[#070917] px-4 py-10 text-white md:px-6">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.42),transparent_36%),radial-gradient(ellipse_at_bottom_right,rgba(20,184,166,0.26),transparent_38%),linear-gradient(135deg,#070917_0%,#151033_48%,#061d2b_100%)]" />
          <section className="relative z-10 mx-auto flex w-full max-w-2xl flex-col items-center justify-center text-center">
            <div className="mb-8 flex items-center gap-3">
              <img
                src="/logo-icon.png"
                alt=""
                className="h-11 w-11 rounded-2xl object-contain"
              />
              <span className="text-xl font-semibold tracking-tight">Nythos</span>
            </div>

            <div className="w-full rounded-[2rem] border border-white/12 bg-white/[0.08] p-8 shadow-[0_30px_100px_rgba(0,0,0,0.35)] ring-1 ring-white/10 backdrop-blur-2xl md:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-200">
                Erro inesperado
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Nao foi possivel carregar o Nythos
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-violet-100/72">
                A aplicacao encontrou uma falha temporaria. Nenhum detalhe
                tecnico foi exibido por seguranca.
              </p>

              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/35"
                >
                  Tentar novamente
                </button>
                <a
                  href="/"
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/18 bg-white/[0.06] px-5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/25"
                >
                  Voltar ao inicio
                </a>
              </div>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
