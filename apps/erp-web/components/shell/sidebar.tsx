'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Shirt, Users, Package, Contact, ShoppingBag, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

type Item = { label: string; href: string; icon: LucideIcon };

const NAV: { section: string; items: Item[] }[] = [
  {
    section: 'Interno',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Pipeline', href: '/pipeline', icon: Shirt },
      { label: 'Empleados', href: '/empleados', icon: Users },
    ],
  },
  {
    section: 'Comercial',
    items: [
      { label: 'Inventario', href: '/inventario', icon: Package },
      { label: 'Clientes', href: '/clientes', icon: Contact },
      { label: 'Pedidos', href: '/pedidos', icon: ShoppingBag },
    ],
  },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-60 flex-col bg-navy-deep text-paper/80">
      <div className="border-b border-white/10 px-6 py-6">
        <div className="font-display text-2xl font-semibold leading-none text-paper">LuceBien</div>
        <div className="mt-1.5 font-mono text-[10px] tracking-brand text-gold">SCI · LB</div>
      </div>

      <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-6">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-paper/40">
              {group.section}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((it) => {
                const active = it.href === '/' ? path === '/' : path.startsWith(it.href);
                const Icon = it.icon;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-[background-color,color] duration-150 ease-out-expo',
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

      <div className="border-t border-white/10 px-6 py-4 text-[11px] leading-relaxed text-paper/40">
        Fase 1 · demo
        <br />
        Confecciones Aliaga E.I.R.L.
      </div>
    </aside>
  );
}
