import { NextResponse } from "next/server";

/**
 * Callback legado de Magic Link para pacientes.
 * O acesso do paciente foi consolidado em /p/[token] + data de nascimento,
 * que cria o cookie HMAC consumido por /patient/dashboard.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  return NextResponse.redirect(new URL("/patient/login", requestUrl.origin));
}
