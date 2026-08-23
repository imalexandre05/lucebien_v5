'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SECCIONES } from '../../../lib/colaboradores-secciones';
import { cn } from '../../../lib/cn';

// Las secciones de la persona. Pestañas, no un submenú lateral: son siete como mucho y todas
// hablan del mismo período de la misma persona, así que conviene verlas todas a la vez.
//
// SÓLO APARECEN LAS QUE SE PUEDEN VER. La lista llega desde el servidor ya filtrada por permiso
// (lib/colaboradores-secciones.ts). Mostrar una pestaña que después rebota es peor que no
// mostrarla: enseña que el sistema no se entiende.

export function NavSecciones({
  empleadoId,
  visibles,
}: {
  empleadoId: string;
  /** Claves de sección que el usuario puede ver, en el orden del catálogo. */
  visibles: string[];
}) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const base = `/personal/${empleadoId}`;
  const secciones = SECCIONES.filter((s) => visibles.includes(s.clave));

  return (
    // El degradado del borde derecho es la única señal de que hay más pestañas a la derecha. En
    // escritorio entran las siete y no hace falta; en un celular, sin él, alguien puede usar el
    // módulo semanas sin enterarse de que Contrato existe.
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-paper to-transparent sm:hidden"
      />
      <nav aria-label="Secciones de la persona" className="-mx-1 overflow-x-auto">
        <ul className="flex min-w-max items-center gap-1 border-b border-line px-1">
        {secciones.map((s) => {
          const href = s.segmento ? `${base}/${s.segmento}` : base;
          const activa = s.segmento ? pathname.startsWith(href) : pathname === base;
          const Icon = s.icon;
          return (
            <li key={s.clave}>
              <Link
                href={query ? `${href}?${query}` : href}
                aria-current={activa ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-gold/60',
                  activa ? 'font-semibold text-navy' : 'text-muted hover:text-navy',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {s.label}
                {/* El subrayado activo se dibuja con transform desde el centro: nunca mueve nada
                    de lo que tiene al lado, ni siquiera un pixel. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-2 -bottom-px h-0.5 origin-center rounded-full bg-gold transition-transform duration-200 ease-out-expo',
                    activa ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </Link>
            </li>
          );
        })}
        </ul>
      </nav>
    </div>
  );
}
