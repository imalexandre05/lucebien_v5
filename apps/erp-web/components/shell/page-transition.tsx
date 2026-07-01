'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Transición entre módulos: el contenido de la ruta entra con un "rise" (fade + subida) cada vez
// que cambia el pathname → el cambio de módulo se siente inmediato y con vida. La sidebar y la
// topbar quedan fijas (no se reanima el shell). Respeta prefers-reduced-motion (globals.css).
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-enter">
      {children}
    </div>
  );
}
