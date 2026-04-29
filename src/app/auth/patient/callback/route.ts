import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * GET /auth/patient/callback
 *
 * Callback de Magic Link EXCLUSIVO para pacientes.
 * Com o novo modelo de provisionamento server-side, este callback é simples:
 *   1. Troca o código PKCE pela sessão.
 *   2. Verifica que o usuário é um paciente (user_type = 'patient' nos metadados).
 *   3. Redireciona para /patient/dashboard.
 *
 * NÃO há mais RPC de vinculação: auth_user_id já foi inserido em
 * public.patients no momento do cadastro via /api/patients/create.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/patient/dashboard";

  if (!code) {
    return NextResponse.redirect(
      new URL("/patient/login?error=missing_code", requestUrl.origin)
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  // 1. Trocar código PKCE por sessão autenticada
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("[patient/callback] Falha no exchangeCodeForSession:", exchangeError);
    return NextResponse.redirect(
      new URL(
        `/patient/login?error=auth_failed&message=${encodeURIComponent(exchangeError.message)}`,
        requestUrl.origin
      )
    );
  }

  // 2. Verificar que o usuário autenticado é de fato um paciente
  //    (guarda de segurança: impede terapeuta de cair no dashboard errado)
  const { data: { user } } = await supabase.auth.getUser();

  if (user?.user_metadata?.user_type !== "patient") {
    console.warn("[patient/callback] Usuário não é paciente. Encerrando sessão.", {
      userId: user?.id,
      userType: user?.user_metadata?.user_type,
    });
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/patient/login?error=wrong_account_type", requestUrl.origin)
    );
  }

  // 3. Sucesso — redirecionar para área do paciente
  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
