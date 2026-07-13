import Link from 'next/link';
import { Bell, LogOut } from 'lucide-react';
import { cerrarSesion } from '../../app/login/actions';
import { getSesion } from '../../lib/auth';
import { contarNoLeidas } from '../../lib/notificaciones-repo';
import { LogoMark } from '../brand/logo';
import { MobileNav } from './mobile-nav';

function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  return (parts.map((w) => w[0]).slice(0, 2).join('') || '·').toUpperCase();
}

// Topbar: contexto de empresa + sede activa + usuario reales (de la sesión Supabase).
// En <lg la navegación vive aquí (hamburguesa → drawer); el crest solo se muestra en
// móvil para no duplicar el de la sidebar.
export async function Topbar() {
  const sesion = await getSesion();
  const nombre = sesion?.nombre ?? '';
  const sede = sesion?.usuario.sede ?? '';
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';

  // Contador de no leídas para la campana; nunca debe tumbar el topbar.
  let noLeidas = 0;
  if (sesion) {
    try {
      noLeidas = await contarNoLeidas();
    } catch {
      noLeidas = 0;
    }
  }

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-paper/85 px-4 backdrop-blur sm:px-7 print:hidden">
      <div className="flex items-center gap-2.5 text-sm text-muted">
        <MobileNav esAdmin={esAdmin} />
        <LogoMark size="sm" className="lg:hidden" />
        <span className="hidden md:inline">Confecciones Aliaga · Huancayo</span>
      </div>
      <div className="flex items-center gap-3">
        {sesion && (
          <Link
            href="/notificaciones"
            title="Notificaciones"
            aria-label={noLeidas > 0 ? `Notificaciones, ${noLeidas} sin leer` : 'Notificaciones'}
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted outline-none transition-colors duration-150 hover:bg-navy/5 hover:text-navy focus-visible:ring-2 focus-visible:ring-gold/70 active:scale-[0.97]"
          >
            <Bell className="h-4 w-4" strokeWidth={1.75} />
            {noLeidas > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                {noLeidas > 99 ? '99+' : noLeidas}
              </span>
            )}
          </Link>
        )}
        {sede && (
          <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-navy">
            Sede · {sede}
          </span>
        )}
        {nombre && (
          <div
            title={nombre}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-semibold text-paper"
          >
            {iniciales(nombre)}
          </div>
        )}
        {sesion && (
          <form action={cerrarSesion}>
            <button
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted outline-none transition-colors duration-150 hover:bg-navy/5 hover:text-navy focus-visible:ring-2 focus-visible:ring-gold/70 active:scale-[0.97]"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
