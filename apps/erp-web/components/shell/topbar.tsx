import Link from 'next/link';
import { AlertTriangle, KeyRound, LogOut, Search } from 'lucide-react';
import { puede, ROL_LABEL, sedesPermitidas, type MatrizPermisos } from '@scilb/core';
import { cerrarSesion } from '../../app/login/actions';
import { getSesion } from '../../lib/auth';
import { listarNotificaciones, type Notificacion } from '../../lib/notificaciones-repo';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { listarSedes, getPerfilSede } from '../../lib/sedes-repo';
import { LogoMark } from '../brand/logo';
import { tonoAvatar } from '../colaboradores/avatar';
import { cn } from '../../lib/cn';
import { MobileNav } from './mobile-nav';
import { NotificacionesBell } from './notificaciones-popover';
import { SedePopover } from './sede-popover';

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
  const rolCod = sesion?.usuario.rolCod;

  // Notificaciones (para la campana), matriz de permisos y sedes elegibles para el popover;
  // nunca deben tumbar el topbar (fallback seguro: matriz vacía = solo admin/dueno ven módulos
  // no-operativos; sin sedes = el popover degrada solo al badge de lectura).
  let notificaciones: Notificacion[] = [];
  let matriz: MatrizPermisos = {};
  let sedesDisponibles: { cod: string; nombre: string }[] = [];
  let perfilSede: Awaited<ReturnType<typeof getPerfilSede>> = null;
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
    try {
      // admin/dueño (sedesPermitidas → null) eligen entre TODAS las sedes; el resto, solo las suyas.
      const permitidas = sedesPermitidas(sesion.usuario);
      const todas = await listarSedes();
      sedesDisponibles = (permitidas === null ? todas : todas.filter((s) => permitidas.includes(s.cod))).map((s) => ({
        cod: s.cod,
        nombre: s.nombre,
      }));
    } catch {
      sedesDisponibles = [];
    }
    try {
      perfilSede = await getPerfilSede(sede);
    } catch {
      perfilSede = null;
    }
  }

  // Acceso rápido a «Nueva incidencia» (tablero#6): mismo gate que la página /incidencias
  // (puede … 'incidencias' 'ver'); sin él, el botón llevaría a un redirect a /reportes/nuevo.
  const puedeIncidencias = rol ? puede(matriz, rol, 'incidencias', 'ver', rolCod) : false;

  // z-30 y no z-10: `backdrop-blur` hace del header un CONTEXTO DE APILAMIENTO propio, así que el
  // z-40 del panel de SedePopover no sale hacia afuera — hacia el resto de la página el header
  // entero vale lo que diga ESTE z-index. Con z-10 empataba con la fila de tiles del dashboard
  // (`relative z-10` en app/page.tsx, puesta para solapar la banda de módulo) y, al empatar,
  // ganaba la que viene después en el DOM: el desplegable de sede aparecía cortado justo donde
  // empezaban las tarjetas. Modales y drawer (z-50) siguen por encima.
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper/85 px-4 backdrop-blur sm:px-7 print:hidden">
      <div className="flex items-center gap-2.5 text-cuerpo text-muted">
        {rol && <MobileNav rol={rol} matriz={matriz} rolCod={rolCod} perfilSede={perfilSede} />}
        <LogoMark size="sm" className="lg:hidden" />
        <span className="hidden md:inline">Confecciones Aliaga · Huancayo</span>
      </div>
      <div className="flex items-center gap-3">
        {sesion && (
          <Link
            href="/buscar"
            title="Buscar un terno (código, tipo, talla, color)"
            aria-label="Buscar"
            className="anillo flex h-8 w-8 items-center justify-center rounded-r-pastilla text-muted transition-colors duration-150 hover:bg-navy/5 hover:text-navy active:scale-[0.97]"
          >
            <Search className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        )}
        {sesion && puedeIncidencias && (
          <Link
            href="/incidencias?nueva=1"
            title="Registrar una incidencia nueva"
            aria-label="Nueva incidencia"
            className="anillo flex h-8 w-8 items-center justify-center rounded-r-pastilla text-muted transition-colors duration-150 hover:bg-navy/5 hover:text-navy active:scale-[0.97]"
          >
            <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        )}
        {sesion && <NotificacionesBell notificaciones={notificaciones} />}
        {sesion && <SedePopover sedeActual={sede} sedes={sedesDisponibles} />}
        {rol && (
          <span className="hidden rounded-r-pastilla border border-gold/40 bg-gold/10 px-3 py-1 text-apoyo font-medium text-gold-deep md:inline">
            {ROL_LABEL[rol] ?? rol}
          </span>
        )}
        {nombre && (
          <Link
            href="/mi-desempeno"
            title="Mi desempeño"
            aria-label="Mi desempeño"
            className={cn(
              'anillo flex h-8 w-8 items-center justify-center rounded-r-pastilla text-apoyo font-semibold transition-transform duration-150 hover-fine:scale-105 active:scale-95',
              tonoAvatar(nombre),
            )}
          >
            {iniciales(nombre)}
          </Link>
        )}
        {sesion && (
          <Link
            href="/cambiar-contrasena"
            title="Cambiar mi contraseña"
            aria-label="Cambiar mi contraseña"
            className="anillo flex h-8 w-8 items-center justify-center rounded-r-pastilla text-muted transition-colors duration-150 hover:bg-navy/5 hover:text-navy active:scale-[0.97]"
          >
            <KeyRound className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        )}
        {sesion && (
          <form action={cerrarSesion}>
            <button
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="anillo flex h-8 w-8 items-center justify-center rounded-r-pastilla text-muted transition-colors duration-150 hover:bg-navy/5 hover:text-navy active:scale-[0.97]"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
