import { NextResponse, type NextRequest } from 'next/server'
import {
  verifyAdminAccess,
  verifyClinicAccess,
  verifyPatientAccess,
  verifyAuthRoutes
} from '@/lib/auth/middleware-checks'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Padrão Chain of Responsibility (Roteamento de validação)
  if (pathname.startsWith('/admin')) {
    return await verifyAdminAccess(request)
  }

  if (pathname.startsWith('/dashboard')) {
    return await verifyClinicAccess(request)
  }

  if (pathname.startsWith('/patient')) {
    return await verifyPatientAccess(request)
  }

  if (pathname.startsWith('/login') || pathname.startsWith('/register')) {
    return await verifyAuthRoutes(request)
  }

  // /p/[token] é público — qualquer um com o link pode acessar
  if (pathname.startsWith('/p/')) {
    return NextResponse.next()
  }

  // Rotas públicas (como /, /public/...) passam direto
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Ignora rotas que não precisam de proteção (otimização massiva):
     * - _next/static (arquivos estáticos)
     * - _next/image (imagens otimizadas)
     * - favicon.ico, /icons/ (assets)
     * - manifest.json, sw.js (PWA)
     * - extensões de arquivo variadas (.svg, .png, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
