'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Shirt, Package, ClipboardList, ClipboardCheck, Files, AlertTriangle, Settings, Laptop, Bell, PackagePlus, HeartHandshake, History, Send, UsersRound, type LucideIcon } from 'lucide-react';
import { puede, permiteModuloPerfil, type MatrizPermisos, type Rol, type SedePerfil } from '@scilb/core';
import { cn } from '../../lib/cn';
import { Logo } from '../brand/logo';

// `modulo` es la clave que evalúa puede(matriz, rol, modulo, 'ver') — un solo mecanismo de gating
// (antes había un flag `admin` aparte para 3 ítems; ahora todo pasa por la misma matriz, admin/dueno
// siempre pasan por el mecanismo del core, el resto según lo que el admin configuró en /configuracion/permisos).
type Item = {
  label: string;
  href: string;
  icon: LucideIcon;
  modulo: string;
  /**
   * Módulos alternativos que también abren esta entrada: alcanza con pasar uno solo. Sirve para
   * fusionar el menú de varias pantallas con permisos distintos sin que un rol pierda acceso —
   * pero sólo si cada alternativa de verdad abre algo alcanzable para un rol no-admin. Si la
   * pantalla de destino hardcodea admin/dueño por dentro (soloAdmin en colaboradores-secciones.ts),
   * la alternativa sólo sirve para admin/dueño, que ya pasan por mecanismo sin necesitar esto — y
   * un rol no-admin se queda con una entrada de menú que abre y no lo deja abrir a nadie (hotfix
   * R1.1, ver Personal más abajo).
   */
  modulosAlternos?: string[];
};

const NAV: { section: string; items: Item[] }[] = [
  {
    section: 'Interno',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard, modulo: 'dashboard' },
      { label: 'Notificaciones', href: '/notificaciones', icon: Bell, modulo: 'notificaciones' },
      // Fase 4 tarea 1: acceso operativo al formulario del turno — vive en "Interno" (uso diario),
      // separado del historial administrativo de abajo. Mismo permiso 'reportes' de siempre.
      { label: 'Reporte de Actividades', href: '/reportes/nuevo', icon: ClipboardList, modulo: 'reportes' },
      // Fase 11: tienda → almacén. Neutral en permiteModuloPerfil (ni MODULOS_SOLO_POS ni
      // MODULOS_SOLO_ALMACEN) a propósito — el plan pide que se vea en AMBOS perfiles de sede.
      { label: 'Solicitudes', href: '/solicitudes', icon: PackagePlus, modulo: 'solicitudes' },
      { label: 'Pipeline', href: '/pipeline', icon: Shirt, modulo: 'pipeline' },
      // INVENTARIO SE QUEDA, aunque el resto de lo comercial salió del menú el 20-ago-2026.
      // Confirmado por Alexander el 21-ago: conectar el otro sistema va a tomar un tiempo y
      // mientras tanto el equipo tiene que poder trabajar con esto. Vive en «Interno» y no en una
      // sección comercial propia porque acá se usa como herramienta de almacén —dónde está cada
      // prenda— y no como inventario de venta.
      { label: 'Inventario', href: '/inventario', icon: Package, modulo: 'inventario' },
      // Módulo portado del sistema viejo (routes/lavanderia.js): lo usan las TIENDAS para mandar
      // ternos sucios + accesorios a granel al pipeline. En MODULOS_SOLO_POS (@scilb/core) — no
      // aparece en sedes de perfil 'almacen'.
      { label: 'Envío a Lavandería', href: '/envio-lavanderia', icon: Send, modulo: 'lavanderia_envio' },
      // Fase 12: Valores 360° es TODO el equipo evaluando a TODO el equipo (peer review), no un
      // reporte administrativo — vive en "Interno" junto a las tareas operativas de todos, no en
      // "Administración" con Evaluaciones/Pagos (esos siguen siendo confidenciales).
      { label: 'Valores 360°', href: '/valores', icon: HeartHandshake, modulo: 'valores' },
    ],
  },
  {
    // Administración (Fase 3): agrupa todo lo administrativo/de seguimiento, antes disuelto en
    // "Interno" junto a Dashboard/Pipeline. Fase 4: el historial de reportes se muda de ruta acá
    // (/administracion/reportes) con permiso propio 'reportes_admin' — /reportes ya no es la
    // lista, es el formulario operativo (arriba, en "Interno").
    section: 'Administración',
    items: [
      // PERSONAL (23-ago-2026): Colaboradores, Sueldos, Liquidaciones y Empleados se funden en una
      // sola entrada. Se entra por la persona y adentro está todo el flujo; lo masivo queda como
      // herramientas del período dentro del apartado. Las rutas viejas siguen funcionando —nada se
      // borró— pero salen del menú para que la respuesta a "¿qué pasa con esta persona?" sea una
      // sola.
      //
      // SIN modulosAlternos (hotfix R1.1, 23-ago-2026). La primera versión sumaba 'pagos',
      // 'sueldos' y 'empleados' para que un rol que sólo tenía uno de esos tres no perdiera el
      // acceso que ya tenía. Pero adentro de /personal cada pestaña sigue exigiendo el permiso de
      // su pantalla original, y las de sueldos/pagos/datos hardcodean admin/dueño por dentro
      // (soloAdmin, colaboradores-secciones.ts): un rol no-admin con sólo uno de esos tres módulos
      // entraba a la lista y no podía abrir a NADIE — la entrada del menú era un callejón sin
      // salida. admin/dueño no pierden nada: puede() los deja pasar por mecanismo sin mirar
      // modulosAlternos (packages/core/src/auth.ts). 'evaluaciones' es el único módulo que de
      // verdad abre una pestaña alcanzable para un rol no-admin (resumen/evaluación/valores).
      {
        label: 'Personal',
        href: '/personal',
        icon: UsersRound,
        modulo: 'evaluaciones',
      },
      { label: 'Historial de reportes', href: '/administracion/reportes', icon: Files, modulo: 'reportes_admin' },
      { label: 'Evaluar reportes', href: '/evaluar-reportes', icon: ClipboardCheck, modulo: 'evaluar_reportes' },
      { label: 'Incidencias', href: '/incidencias', icon: AlertTriangle, modulo: 'incidencias' },
      { label: 'Dispositivos', href: '/dispositivos', icon: Laptop, modulo: 'dispositivos' },
      // Fase 13 tarea 4: sin filas propias en permisos_modulos (mismo criterio que empleados/
      // configuracion/dispositivos arriba) → puede() solo deja pasar a admin/dueño por mecanismo.
      { label: 'Auditoría', href: '/administracion/auditoria', icon: History, modulo: 'auditoria' },
      { label: 'Configuración', href: '/configuracion', icon: Settings, modulo: 'configuracion' },
    ],
  },
  // ── LO COMERCIAL SALIÓ DEL MENÚ (20-ago-2026, decisión de Alexander) ───────────────────────
  //
  // POS (Pedidos, Caja), Comercial (Inventario, Clientes, Finanzas, Estadísticas) y Abastecimiento
  // (Proveedores, Materiales, Compras) ya no se muestran. Dinero, ventas, POS e inventario los va
  // a manejar otro programador en un sistema aparte; este ERP quedó en control interno: procesos,
  // recursos humanos, sueldos, evaluación y el pipeline de prendas.
  //
  // SE OCULTAN, NO SE BORRAN. Las nueve rutas siguen existiendo y funcionando si alguien escribe
  // la dirección: hay datos vivos detrás y el traspaso al otro sistema todavía no ocurrió. Borrar
  // el código sería una decisión distinta, y de un solo sentido.
];

// Listado de navegación (compartido entre la sidebar de escritorio y el drawer móvil). Filtra por
// la matriz de permisos configurable (Configuración → Permisos), no por un flag hardcodeado.
// `rolCod` (Fase 1, roles derivados): si el empleado tiene un rol propio, afina qué módulos ve
// por encima de lo que dicta su rol base — ver puede() en @scilb/core.
// `perfilSede` (Fase 2): además de puede(), un módulo debe tener sentido en el PERFIL de la sede
// activa — pipeline no aparece en una sede 'pos' ni pedidos/caja/clientes en una 'almacen' (ver
// permiteModuloPerfil() en @scilb/core). null/undefined (sede sin perfil resuelto) no filtra nada.
export function SidebarNav({
  rol,
  matriz,
  rolCod,
  perfilSede,
}: {
  rol: Rol;
  matriz: MatrizPermisos;
  rolCod?: string | null;
  perfilSede?: SedePerfil | null;
}) {
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-6">
      {NAV.map((group) => {
        // Si el filtro de permisos deja la sección vacía, no se renderiza ni el encabezado
        // (Fase 3) — antes quedaba un título "Administración" o "Comercial" huérfano, sin ítems
        // debajo, para roles que no ven ninguno de sus módulos.
        const items = group.items.filter((it) => {
          const candidatos = [it.modulo, ...(it.modulosAlternos ?? [])];
          return candidatos.some(
            (m) => puede(matriz, rol, m, 'ver', rolCod) && permiteModuloPerfil(m, perfilSede),
          );
        });
        if (items.length === 0) return null;
        return (
          <div key={group.section}>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-paper/40">
              {group.section}
            </div>
            <ul className="space-y-0.5">
              {items.map((it) => {
                const active = it.href === '/' ? path === '/' : path.startsWith(it.href);
                const Icon = it.icon;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-[background-color,color,transform] duration-150 ease-out-expo hover-fine:translate-x-0.5',
                        active ? 'bg-white/10 text-paper' : 'text-paper/60 hover:bg-white/5 hover:text-paper',
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-gold" />
                      )}
                      <Icon
                        className={cn(
                          'h-4 w-4 transition-colors duration-150',
                          active ? 'text-gold' : 'text-paper/50 group-hover:text-paper/70',
                        )}
                        strokeWidth={1.75}
                      />
                      {it.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

// El pie decía «Fase 1 · demo» en todas las pantallas, incluida la de un colaborador. Mientras el
// sistema era una maqueta eso era honesto; ahora va a llevar sueldos de personas reales, y una
// pantalla que se anuncia como demo invita a no confiar en lo que muestra. Queda el nombre de la
// empresa, que es de quien es el sistema.
export function SidebarFooter() {
  return (
    <div className="border-t border-white/10 px-6 py-4 text-[11px] leading-relaxed text-paper/40">
      Sistema de Control Interno
      <br />
      Confecciones Aliaga E.I.R.L.
    </div>
  );
}

// Sidebar fija de escritorio; en anchos menores la navegación vive en el drawer (MobileNav).
export function Sidebar({
  rol,
  matriz,
  rolCod,
  perfilSede,
}: {
  rol: Rol;
  matriz: MatrizPermisos;
  rolCod?: string | null;
  perfilSede?: SedePerfil | null;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 flex-col bg-navy-deep text-paper/80 lg:flex print:hidden">
      <Link
        href="/"
        aria-label="Ir al inicio"
        className="flex items-center border-b border-white/10 px-5 py-6 transition-transform duration-150 ease-out-expo hover-fine:translate-x-0.5 active:scale-[0.98]"
      >
        <Logo tone="onDark" size="md" />
      </Link>
      <SidebarNav rol={rol} matriz={matriz} rolCod={rolCod} perfilSede={perfilSede} />
      <SidebarFooter />
    </aside>
  );
}
