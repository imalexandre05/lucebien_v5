import { features, type Feature } from '@scilb/adapter-lucebien';

type Item = { label: string; href: string; flag?: Feature };

// Items con `flag` solo aparecen si esa feature está ON (todas OFF en Fase 1).
const ITEMS: Item[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Pipeline', href: '/pipeline' },
  { label: 'Empleados', href: '/empleados' },
  { label: 'Inventario', href: '/inventario', flag: 'INVENTARIO_V2' },
  { label: 'Clientes', href: '/clientes', flag: 'CLIENTES_V2' },
  { label: 'Pedidos', href: '/pedidos', flag: 'PEDIDOS_ALQUILER_V2' },
];

export function Nav() {
  const visibles = ITEMS.filter((i) => !i.flag || features[i.flag]);
  return (
    <nav className="flex gap-4 bg-navy px-6 py-3 font-body text-white">
      {visibles.map((i) => (
        <a key={i.href} href={i.href} className="hover:text-gold">
          {i.label}
        </a>
      ))}
    </nav>
  );
}
