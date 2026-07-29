'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Shirt, Users, Package, Contact, ShoppingBag, ClipboardList, ClipboardCheck, Files, AlertTriangle, CalendarCheck, Award, Wallet, Banknote, LineChart, BarChart3, Settings, Laptop, Truck, Boxes, ShoppingCart, Bell, PackagePlus, type LucideIcon } from 'lucide-react';
import { puede, permiteModuloPerfil, type MatrizPermisos, type Rol, type SedePerfil } from '@scilb/core';
import { cn } from '../../lib/cn';
import { Logo } from '../brand/logo';

// `modulo` es la clave que evalúa puede(matriz, rol, modulo, 'ver') — un solo mecanismo de gating
// (antes había un flag `admin` aparte para 3 ítems; ahora todo pasa por la misma matriz, admin/dueno
// siempre pasan por el mecanismo del core, el resto según lo que el admin configuró en /configuracion/permisos).
type Item = { label: string; href: string; icon: LucideIcon; modulo: string };

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
    ],
  },
  {
    // Administración (Fase 3): agrupa todo lo administrativo/de seguimiento, antes disuelto en
    // "Interno" junto a Dashboard/Pipeline. Fase 4: el historial de reportes se muda de ruta acá
    // (/administracion/reportes) con permiso propio 'reportes_admin' — /reportes ya no es la
    // lista, es el formulario operativo (arriba, en "Interno").
    section: 'Administración',
    items: [
      { label: 'Historial de reportes', href: '/administracion/reportes', icon: Files, modulo: 'reportes_admin' },
      { label: 'Evaluar reportes', href: '/evaluar-reportes', icon: ClipboardCheck, modulo: 'evaluar_reportes' },
      { label: 'Evaluaciones', href: '/evaluaciones', icon: Award, modulo: 'evaluaciones' },
      { label: 'Pagos', href: '/pagos', icon: Wallet, modulo: 'pagos' },
      { label: 'Incidencias', href: '/incidencias', icon: AlertTriangle, modulo: 'incidencias' },
      { label: 'Asistencias', href: '/asistencias', icon: CalendarCheck, modulo: 'asistencias' },
      { label: 'Empleados', href: '/empleados', icon: Users, modulo: 'empleados' },
      { label: 'Dispositivos', href: '/dispositivos', icon: Laptop, modulo: 'dispositivos' },
      { label: 'Configuración', href: '/configuracion', icon: Settings, modulo: 'configuracion' },
    ],
  },
  {
    // POS (Fase 9): Pedidos + Caja agrupados — es el mismo mostrador, un pedido nuevo y un cobro
    // son parte del mismo flujo de atención al cliente.
    section: 'POS',
    items: [
      { label: 'Pedidos', href: '/pedidos', icon: ShoppingBag, modulo: 'pedidos' },
      { label: 'Caja', href: '/caja', icon: Banknote, modulo: 'caja' },
    ],
  },
  {
    section: 'Comercial',
    items: [
      { label: 'Inventario', href: '/inventario', icon: Package, modulo: 'inventario' },
      { label: 'Clientes', href: '/clientes', icon: Contact, modulo: 'clientes' },
      { label: 'Finanzas', href: '/finanzas', icon: LineChart, modulo: 'finanzas' },
      { label: 'Estadísticas', href: '/estadisticas', icon: BarChart3, modulo: 'estadisticas' },
    ],
  },
  {
    section: 'Abastecimiento',
    items: [
      { label: 'Proveedores', href: '/proveedores', icon: Truck, modulo: 'proveedores' },
      { label: 'Materiales', href: '/materiales', icon: Boxes, modulo: 'materiales' },
      { label: 'Compras', href: '/compras', icon: ShoppingCart, modulo: 'compras' },
    ],
  },
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
        const items = group.items.filter(
          (it) => puede(matriz, rol, it.modulo, 'ver', rolCod) && permiteModuloPerfil(it.modulo, perfilSede),
        );
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
                        'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-[background-color,color,transform] duration-150 ease-out-expo hover:translate-x-0.5',
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

export function SidebarFooter() {
  return (
    <div className="border-t border-white/10 px-6 py-4 text-[11px] leading-relaxed text-paper/40">
      Fase 1 · demo
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
        className="flex items-center border-b border-white/10 px-5 py-6 transition-transform duration-150 ease-out-expo hover:translate-x-0.5 active:scale-[0.98]"
      >
        <Logo tone="onDark" size="md" />
      </Link>
      <SidebarNav rol={rol} matriz={matriz} rolCod={rolCod} perfilSede={perfilSede} />
      <SidebarFooter />
    </aside>
  );
}
