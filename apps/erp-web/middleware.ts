import { NextResponse, type NextRequest } from 'next/server';
import { features } from '@scilb/adapter-lucebien';

// Gate de autenticación. Solo se activa con la feature AUTH_V2 (OFF en Fase 1 → demo abierta).
// Cuando se prenda: sin sesión → redirige a /login.
export function middleware(req: NextRequest) {
  if (!features.AUTH_V2) return NextResponse.next();

  const tieneSesion = Boolean(req.cookies.get('sci_sesion'));
  const enLogin = req.nextUrl.pathname.startsWith('/login');

  if (!tieneSesion && !enLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
