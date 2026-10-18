'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Shirt, ClipboardList, ClipboardCheck, Files, AlertTriangle, Settings, Laptop, PackagePlus, HeartHandshake, History, Send, Truck, Fingerprint, UsersRound, GraduationCap, type LucideIcon } from 'lucide-react';
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
  /**
   * Exceptúa a esta entrada del filtro por perfil de sede (permiteModuloPerfil), sin exceptuarla
   * del permiso: puede() se sigue evaluando igual. Sirve cuando UNA pantalla de un módulo con
   * perfil sí corresponde al otro perfil — el caso es /pipeline/envios, que es la confirmación
   * que hace la TIENDA de lo que le llegó del almacén, dentro del módulo 'pipeline' que
   * MODULOS_SOLO_ALMACEN esconde en las sedes 'pos'. Se marca la entrada del menú y no se toca
   * MODULOS_SOLO_ALMACEN: sacar 'pipeline' de esa lista devolvería además el kanban completo del
   * almacén a las tres tiendas, que es justo lo que el perfil de sede quiere evitar.
   */
  neutralPerfil?: boolean;
};

const NAV: { section: string; items: Item[] }[] = [
  {
    section: 'Interno',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard, modulo: 'dashboard' },
      // Fase 4 tarea 1: acceso operativo al formulario del turno — vive en "Interno" (uso diario),
      // separado del historial administrativo de abajo. Mismo permiso 'reportes' de siempre.
      { label: 'Reporte de Actividades', href: '/reportes/nuevo', icon: ClipboardList, modulo: 'reportes' },
      // Fase 11: tienda → almacén. Neutral en permiteModuloPerfil (ni MODULOS_SOLO_POS ni
      // MODULOS_SOLO_ALMACEN) a propósito — el plan pide que se vea en AMBOS perfiles de sede.
      { label: 'Solicitudes', href: '/solicitudes', icon: PackagePlus, modulo: 'solicitudes' },
      { label: 'Pipeline', href: '/pipeline', icon: Shirt, modulo: 'pipeline' },
      // Única pantalla del módulo 'pipeline' que se usa DESDE la tienda: acá se acepta u observa
      // lo que mandó el almacén. Sin entrada propia sólo se llegaba entrando al kanban, que en
      // una sede 'pos' está escondido — la pantalla existía y no se podía alcanzar. El permiso
      // 'pipeline' ya está concedido a encargado_tienda y a los dos ventas_junior en
      // permisos_modulos; lo único que faltaba era la puerta.
      { label: 'Envíos a tienda', href: '/pipeline/envios', icon: Truck, modulo: 'pipeline', neutralPerfil: true },
      // INVENTARIO SALIÓ DEL MENÚ (18-oct-2026, decisión del dueño n.º 9): no tiene que ver con
      // este sistema y se conectará por API. Revierte la excepción del 21-ago. La ruta sigue viva.
      // Spec: docs/superpowers/specs/erp/2026-10-18-ocultar-pos-inventario-design.md
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
      { label: 'Capacitación', href: '/capacitacion', icon: GraduationCap, modulo: 'evaluaciones' },
      { label: 'Historial de reportes', href: '/administracion/reportes', icon: Files, modulo: 'reportes_admin' },
      { label: 'Evaluar reportes', href: '/evaluar-reportes', icon: ClipboardCheck, modulo: 'evaluar_reportes' },
      { label: 'Incidencias', href: '/incidencias', icon: AlertTriangle, modulo: 'incidencias' },
      { label: 'Dispositivos', href: '/dispositivos', icon: Laptop, modulo: 'dispositivos' },
      // Único lugar donde se mapea un identificador del huellero a una persona, se ve la cola sin
      // asignar y se ve si el equipo está al día; sin entrada de menú las marcas se acumulan sin
      // que nadie las vea. Reusa el módulo 'dispositivos' —que no tiene fila en permisos_modulos,
      // así que puede() sólo deja pasar a admin/dueño— porque es exactamente el mismo gate que la
      // página ya aplica por dentro (page.tsx redirige a /asistencias a quien no es admin).
      { label: 'Huellero', href: '/asistencias/huellero', icon: Fingerprint, modulo: 'dispositivos' },
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
// Con /pipeline y /pipeline/envios en el mismo menú, el startsWith de siempre marcaría las dos
// filas a la vez. Gana la coincidencia más larga, así la ruta anidada se resalta sola y el padre
// sólo cuando no hay una entrada más específica.
export const HREFS = NAV.flatMap((g) => g.items.map((i) => i.href));
function hrefActivo(path: string): string | null {
  const coinciden = HREFS.filter((h) => (h === '/' ? path === '/' : path.startsWith(h)));
  if (coinciden.length === 0) return null;
  return coinciden.reduce((a, b) => (b.length > a.length ? b : a));
}

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
  const activo = hrefActivo(path ?? '');
  // Contador corrido entre las dos secciones: la entrada escalonada se lee como un solo listado
  // que aparece de arriba a abajo, no como dos listas que arrancan cada una desde cero.
  let indice = 0;
  return (
    <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-6">
      {NAV.map((group) => {
        // Si el filtro de permisos deja la sección vacía, no se renderiza ni el encabezado
        // (Fase 3) — antes quedaba un título "Administración" o "Comercial" huérfano, sin ítems
        // debajo, para roles que no ven ninguno de sus módulos.
        const items = group.items.filter((it) => {
          const candidatos = [it.modulo, ...(it.modulosAlternos ?? [])];
          return candidatos.some(
            (m) =>
              puede(matriz, rol, m, 'ver', rolCod) &&
              (it.neutralPerfil || permiteModuloPerfil(m, perfilSede)),
          );
        });
        if (items.length === 0) return null;
        return (
          <div key={group.section}>
            {/* paper/40 se perdía contra el navy. Con /60 y un guion dorado delante, la sección
                se lee de un vistazo y la barra deja de ser un bloque uniforme de texto gris. */}
            <div className="flex items-center gap-2 px-3 pb-2 text-rotulo font-semibold uppercase text-paper/60">
              <span aria-hidden className="h-px w-3 shrink-0 bg-gold/70" />
              {group.section}
            </div>
            <ul className="space-y-0.5">
              {items.map((it) => {
                const active = it.href === activo;
                const Icon = it.icon;
                const idx = indice++;
                return (
                  <li
                    key={it.href}
                    className="animate-rise"
                    style={{ animationDelay: `${Math.min(idx, 12) * 30}ms` }}
                  >
                    <Link
                      href={it.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        // El activo ya no es un gris blanco lavado: lleva el oro de la casa
                        // (fondo tenue + borde + resplandor). Con `bg-white/10` la barra dorada de
                        // la izquierda era lo único que decía "estás acá", y sobre navy oscuro eso
                        // se leía apagado. El hover también tira a oro en vez de a blanco.
                        'group relative flex items-center gap-3 rounded-r-chico px-3 py-2.5 text-cuerpo transition-[background-color,color,transform,box-shadow] duration-150 ease-out-expo hover-fine:translate-x-0.5',
                        active
                          ? 'bg-gold/15 font-medium text-paper shadow-[inset_0_0_0_1px_rgba(184,165,21,.35)]'
                          : 'text-paper/60 hover:bg-gold/10 hover:text-paper',
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gold shadow-[0_0_10px_rgba(184,165,21,.6)]" />
                      )}
                      <Icon
                        className={cn(
                          'h-4 w-4 transition-[color,transform] duration-150 group-hover:scale-110',
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
    <div className="border-t border-white/10 px-6 py-4 text-micro leading-relaxed text-paper/40">
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
    // El navy plano se leía apagado. Ahora la barra tiene profundidad: un degradado vertical
    // (arriba más claro, abajo más profundo) y un halo dorado muy tenue detrás del logo, que es
    // donde la marca tiene que pesar. Sigue siendo el mismo navy de la casa, no un color nuevo.
    <aside className="sticky top-0 hidden h-screen w-60 flex-col bg-gradient-to-b from-navy via-navy-deep to-navy-deep text-paper/80 lg:flex print:hidden">
      <Link
        href="/"
        aria-label="Ir al inicio"
        className="group relative flex items-center px-5 py-6 transition-transform duration-150 ease-out-expo hover-fine:translate-x-0.5 active:scale-[0.98]"
      >
        {/* Halo dorado detrás del sello: da el brillo sin tocar el PNG oficial de la marca. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-6 -top-6 h-32 w-32 rounded-r-pastilla bg-gold/20 blur-2xl transition-opacity duration-300 group-hover:bg-gold/30"
        />
        {/* `tagline={false}`: el "SCI · LB" al lado del lockup competía con la marca en una barra
            de 240px y no decía nada que el usuario necesite. `lg` en vez de `md` para que el
            lockup ocupe el ancho que le corresponde ahora que está solo. */}
        <Logo tone="onDark" size="lg" tagline={false} className="relative" />
        {/* Filete de sastre, versión oscura: la misma firma dorada que el login y el hilo del
            dashboard, adaptada al fondo navy — reemplaza el borde plano blanco/10. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-gold via-gold/40 to-transparent" />
      </Link>
      <SidebarNav rol={rol} matriz={matriz} rolCod={rolCod} perfilSede={perfilSede} />
      <SidebarFooter />
    </aside>
  );
}
