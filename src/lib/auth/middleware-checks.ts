import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Utilitário para instanciar o Supabase no contexto do middleware.
 * Trata o refresh de cookies se necessário.
 */
function createMiddlewareClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )
}

/**
 * 1. Admin Access Checker
 * Domínio: /admin
 */
export async function verifyAdminAccess(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createMiddlewareClient(request, response)

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Verifica a role diretamente no JWT da sessão para evitar queries no banco de dados na Edge
  const userRole = user.user_metadata?.role || user.app_metadata?.role

  if (userRole !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

/**
 * 2. Clinic Access Checker
 * Domínio: /dashboard
 */
export async function verifyClinicAccess(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createMiddlewareClient(request, response)

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Se o metadata for explicitamente de paciente, direciona pra área do paciente
  if (user.user_metadata?.user_type === 'patient') {
    return NextResponse.redirect(new URL('/patient/login', request.url)) // Ou painel de paciente
  }

  // Observação: terapeutas, secretárias e admins acessam o dashboard. 
  // O layout interno do dashboard cuida das restrições menores.
  return response
}

/**
 * 3. Patient Access Checker
 * Domínio: /patient
 * Agora usa o cookie nythos_patient_session (HMAC) — sem Supabase Auth.
 */
export async function verifyPatientAccess(request: NextRequest) {
  // A rota /patient/login é pública (landing de redirecionamento)
  if (request.nextUrl.pathname.startsWith('/patient/login')) {
    return NextResponse.next()
  }

  // Verifica apenas presença do cookie (validação criptográfica ocorre no servidor)
  const cookieHeader = request.headers.get('cookie') ?? ''
  const hasSession = /(?:^|;\s*)nythos_patient_session=([^;]+)/.test(cookieHeader)

  if (!hasSession) {
    // Tenta redirecionar para o login legado; o terapeuta pode compartilhar o link /p/token
    return NextResponse.redirect(new URL('/patient/login', request.url))
  }

  return NextResponse.next()
}

/**
 * 4. Auth Routes Checker
 * Domínios: /login, /register
 */
export async function verifyAuthRoutes(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createMiddlewareClient(request, response)

  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    if (user.user_metadata?.user_type === 'patient') {
      return NextResponse.redirect(new URL('/patient/login', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}
