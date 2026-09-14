import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { IconoTinta } from './icono-tinta';

// La cabecera de color pleno de la fase 5 (spec §3.10 y §7 "Dos de carácter"): migas, título,
// subtítulo, acción, y el hilo de asiento debajo. Sin esta pieza propia, cada pantalla escribiría
// su propio degradado y a la tercera habría tres.
//
// EL ACENTO NO LO ELIGE ESTA PIEZA. Viene de `--acento`/`--acento-deep`, que fija la clase `.m-*`
// del grupo de módulo en el layout de la ruta (fase 5) — acá sólo se lee la variable.
//
// Alto: 96px sin subtítulo, 128px con — nunca más (spec §3.10). El botón de acción es blanco con
// texto del acento, nunca se encoge (`flex-none`): un botón que se achica y tapa el subtítulo ya
// pasó una vez.
export function BandaModulo({
  migas,
  titulo,
  subtitulo,
  icono: Icon,
  accion,
  className,
}: {
  migas?: string;
  titulo: string;
  subtitulo?: string;
  icono?: LucideIcon;
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className={cn(
          'relative overflow-hidden rounded-r-grande bg-gradient-to-br from-acento-deep to-acento px-6 shadow-elev-2 animate-page-enter',
          subtitulo ? 'py-6' : 'py-5',
        )}
      >
        <div className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rounded-r-pastilla bg-paper/10" />
        {migas && <div className="relative mb-2 text-apoyo text-paper/75">{migas}</div>}
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && <IconoTinta icon={Icon} tamano={44} claro />}
            <div className="min-w-0">
              <h1 className="truncate text-titulo font-display font-bold text-paper">{titulo}</h1>
              {subtitulo && <p className="mt-1 max-w-[46ch] truncate text-apoyo text-paper/85">{subtitulo}</p>}
            </div>
          </div>
          {accion && <div className="flex-none">{accion}</div>}
        </div>
      </div>
      {/* Hilo de asiento (spec §3.10): 2.5rem de oro (la marca, fija) + 1.5rem del acento (el
          módulo, cambia). Se muda acá abajo de la banda a propósito — sobre el fondo de color
          la firma dorada se habría perdido. Reemplaza a `.gold-rule`/`.hilo-titulo` en cualquier
          pantalla que use `BandaModulo`. */}
      <div className="mt-4 flex h-0.5 overflow-hidden rounded-r-pastilla bg-line">
        <span className="h-full w-10 bg-gold" />
        <span className="h-full w-6 bg-acento transition-colors duration-contexto ease-estado" />
      </div>
    </div>
  );
}
