'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { grupoDeRuta } from '../../lib/modulo-grupo';
import { cn } from '../../lib/cn';

// Envuelve sidebar + contenido en la clase `.m-{grupo}` que fija `--acento` para toda la
// pantalla (spec §3.3, fase 5). Tiene que ser el ancestro común de las dos cosas: la sidebar
// necesita el acento para `.hilo-activo`, y el contenido para `BandaModulo`/tiles/gráficos — si
// cada uno leyera la ruta por su cuenta, un desfasaje de un render entre los dos se vería como un
// parpadeo de color.
export function ModuloAcento({ children, className }: { children: ReactNode; className?: string }) {
  const path = usePathname();
  const grupo = grupoDeRuta(path ?? '/');
  return <div className={cn(`m-${grupo}`, className)}>{children}</div>;
}
