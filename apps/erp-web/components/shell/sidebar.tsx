'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Shirt, Users, Package, Contact, ShoppingBag, ClipboardList, ClipboardCheck, AlertTriangle, CalendarCheck, Award, Wallet, Banknote, LineChart, BarChart3, Settings, Laptop, Truck, Boxes, ShoppingCart, type LucideIcon } from 'lucide-react';
import { puede, type MatrizPermisos, type Rol } from '@scilb/core';
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
      { label: 'Pipeline', href: '/pipeline', icon: Shirt, modulo: 'pipeline' },
      { label: 'Reporte de Actividades', href: '/reportes', icon: ClipboardList, modulo: 'reportes' },
      { label: 'Evaluar reportes', href: '/evaluar-reportes', icon: ClipboardCheck, modulo: 'evaluar_reportes' },
      { label: 'Incidencias', href: '/incidencias', icon: AlertTriangle, modulo: 'incidencias' },
      { label: 'Asistencias', href: '/asistencias', icon: CalendarCheck, modulo: 'asistencias' },
      { label: 'Evaluaciones', href: '/evaluaciones', icon: Award, modulo: 'evaluaciones' },
      { label: 'Pagos', href: '/pagos', icon: Wallet, modulo: 'pagos' },
      { label: 'Empleados', href: '/empleados', icon: Users, modulo: 'empleados' },
      { label: 'Configuración', href: '/configuracion', icon: Settings, modulo: 'configuracion' },
      { label: 'Dispositivos', href: '/dispositivos', icon: Laptop, modulo: 'dispositivos' },
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
export function SidebarNav({ rol, matriz }: { rol: Rol; matriz: MatrizPermisos }) {
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-6">
      {NAV.map((group) => (
        <div key={group.section}>
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-paper/40">
            {group.section}
          </div>
          <ul className="space-y-0.5">
            {group.items
              .filter((it) => puede(matriz, rol, it.modulo, 'ver'))
              .map((it) => {
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
      ))}
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
export function Sidebar({ rol, matriz }: { rol: Rol; matriz: MatrizPermisos }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 flex-col bg-navy-deep text-paper/80 lg:flex print:hidden">
      <Link
        href="/"
        aria-label="Ir al inicio"
        className="flex items-center border-b border-white/10 px-5 py-6 transition-transform duration-150 ease-out-expo hover:translate-x-0.5 active:scale-[0.98]"
      >
        <Logo tone="onDark" size="md" />
      </Link>
      <SidebarNav rol={rol} matriz={matriz} />
      <SidebarFooter />
    </aside>
  );
}
