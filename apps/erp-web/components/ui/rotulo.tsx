import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// `text-rotulo` con su semántica (spec §7). Un rótulo NOMBRA — cabecera de tabla, título de
// grupo de formulario, sección de sidebar—; si el texto ACOMPAÑA (una fecha, un contador), es
// `text-micro`, no esto. Hoy los dos se escriben igual (`text-xs font-semibold uppercase
// tracking-wide text-muted`, repetido en la cabecera de `Table` y en `LabelGrupo`) y por eso
// ninguno de los dos se lee como lo que es.
export const Rotulo = ({ className, as: Tag = 'div', ...p }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'span' | 'h3' }) => (
  <Tag className={cn('text-rotulo font-display uppercase text-muted', className)} {...p} />
);
