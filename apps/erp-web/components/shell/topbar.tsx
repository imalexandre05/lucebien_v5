import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { ROL_LABEL, type MatrizPermisos } from '@scilb/core';
import { cerrarSesion } from '../../app/login/actions';
import { getSesion } from '../../lib/auth';
import { listarNotificaciones, type Notificacion } from '../../lib/notificaciones-repo';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { LogoMark } from '../brand/logo';
import { MobileNav } from './mobile-nav';
import { NotificacionesBell } from './notificaciones-popover';

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
  const rol = sesion?.usuario.rol;

  // Notificaciones (para la campana) y matriz de permisos; nunca deben tumbar el topbar
  // (fallback seguro: matriz vacía = solo admin/dueno ven módulos no-operativos).
  let notificaciones: Notificacion[] = [];
  let matriz: MatrizPermisos = {};
  const esAdmin = rol === 'admin' || rol === 'dueno';
  if (sesion) {
    try {
      notificaciones = await listarNotificaciones(false, 30);
    } catch {
      notificaciones = [];
    }
    try {
      matriz = await leerMatrizPermisos();
    } catch {
      matriz = {};
    }
  }

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-paper/85 px-4 backdrop-blur sm:px-7 print:hidden">
      <div className="flex items-center gap-2.5 text-sm text-muted">
        {rol && <MobileNav rol={rol} matriz={matriz} />}
        <LogoMark size="sm" className="lg:hidden" />
        <span className="hidden md:inline">Confecciones Aliaga · Huancayo</span>
      </div>
      <div className="flex items-center gap-3">
        {sesion && <NotificacionesBell notificaciones={notificaciones} esAdmin={esAdmin} />}
        {sede && (
          <span className="hidden rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-navy sm:inline">
            Sede · {sede}
          </span>
        )}
        {rol && (
          <span className="hidden rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-[#7a6e0e] md:inline">
            {ROL_LABEL[rol] ?? rol}
          </span>
        )}
        {nombre && (
          <Link
            href="/mi-desempeno"
            title="Mi desempeño"
            aria-label="Mi desempeño"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-semibold text-paper outline-none transition-transform duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-gold/70 active:scale-95"
          >
            {iniciales(nombre)}
          </Link>
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
