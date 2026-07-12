'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Shirt, Users, Package, Contact, ShoppingBag, ClipboardList, ClipboardCheck, AlertTriangle, CalendarCheck, Award, Wallet, Banknote, LineChart, Settings, Laptop, Truck, Boxes, ShoppingCart, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Logo } from '../brand/logo';

type Item = { label: string; href: string; icon: LucideIcon; admin?: boolean };

const NAV: { section: string; items: Item[] }[] = [
  {
    section: 'Interno',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Pipeline', href: '/pipeline', icon: Shirt },
      { label: 'Reportes', href: '/reportes', icon: ClipboardList },
      { label: 'Evaluar reportes', href: '/evaluar-reportes', icon: ClipboardCheck },
      { label: 'Incidencias', href: '/incidencias', icon: AlertTriangle },
      { label: 'Asistencias', href: '/asistencias', icon: CalendarCheck },
      { label: 'Evaluaciones', href: '/evaluaciones', icon: Award },
      { label: 'Pagos', href: '/pagos', icon: Wallet },
      { label: 'Empleados', href: '/empleados', icon: Users, admin: true },
      { label: 'Configuración', href: '/configuracion', icon: Settings, admin: true },
      { label: 'Dispositivos', href: '/dispositivos', icon: Laptop, admin: true },
    ],
  },
  {
    section: 'Comercial',
    items: [
      { label: 'Inventario', href: '/inventario', icon: Package },
      { label: 'Clientes', href: '/clientes', icon: Contact },
      { label: 'Pedidos', href: '/pedidos', icon: ShoppingBag },
      { label: 'Caja', href: '/caja', icon: Banknote },
      { label: 'Finanzas', href: '/finanzas', icon: LineChart },
    ],
  },
  {
    section: 'Abastecimiento',
    items: [
      { label: 'Proveedores', href: '/proveedores', icon: Truck },
      { label: 'Materiales', href: '/materiales', icon: Boxes },
      { label: 'Compras', href: '/compras', icon: ShoppingCart },
    ],
  },
];

// Listado de navegación (compartido entre la sidebar de escritorio y el drawer móvil).
export function SidebarNav({ esAdmin }: { esAdmin: boolean }) {
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
              .filter((it) => !it.admin || esAdmin)
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
export function Sidebar({ esAdmin }: { esAdmin: boolean }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 flex-col bg-navy-deep text-paper/80 lg:flex print:hidden">
      <Link
        href="/"
        aria-label="Ir al inicio"
        className="flex items-center border-b border-white/10 px-5 py-6 transition-transform duration-150 ease-out-expo hover:translate-x-0.5 active:scale-[0.98]"
      >
        <Logo tone="onDark" size="md" />
      </Link>
      <SidebarNav esAdmin={esAdmin} />
      <SidebarFooter />
    </aside>
  );
}
