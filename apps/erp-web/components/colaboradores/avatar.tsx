import { cn } from '../../lib/cn';

// Iniciales en un disco dorado. La columna `iniciales` de `empleados` manda cuando está cargada
// (alguien la eligió); si no, se derivan del nombre.
//
// Se derivan del PRIMER nombre y del PRIMER apellido, no de las dos primeras palabras: "María del
// Carmen Aliaga" tiene que dar MA, no MD.

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'di']);

export function inicialesDe(nombre: string, guardadas?: string | null): string {
  const g = (guardadas ?? '').trim();
  if (g) return g.slice(0, 2).toUpperCase();
  const partes = nombre
    .trim()
    .split(/\s+/)
    .filter((p) => p && !PARTICULAS.has(p.toLowerCase()));
  if (!partes.length) return '—';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * SEIS TONOS PARA QUE UNA PERSONA SE RECONOZCA SIN LEER.
 *
 * Todos los avatares eran el mismo disco dorado, así que una lista de dieciocho personas se veía
 * como dieciocho discos iguales y había que leer el nombre en cada uno. El color no dice nada del
 * estado de nadie —no es «bien» ni «mal»—: es identidad, que es justo para lo que existen los
 * categóricos del sistema (docs/sistema-de-diseno.md §2).
 *
 * El tono sale del nombre, así que la misma persona sale siempre del mismo color, en cualquier
 * pantalla y sin guardar nada en la base.
 */
const TONOS_AVATAR = [
  'bg-navy text-paper',
  'bg-cat-lila text-paper',
  'bg-cat-arcilla text-paper',
  'bg-cat-mar text-paper',
  'bg-gold text-navy-deep',
  'bg-navy-deep text-gold',
] as const;

export function tonoAvatar(clave: string): string {
  let h = 0;
  for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) >>> 0;
  return TONOS_AVATAR[h % TONOS_AVATAR.length];
}

const tamanos = {
  sm: 'h-8 w-8 text-micro',
  md: 'h-10 w-10 text-apoyo',
  lg: 'h-14 w-14 text-base',
} as const;

export function Avatar({
  nombre,
  iniciales,
  size = 'md',
  className,
}: {
  nombre: string;
  iniciales?: string | null;
  size?: keyof typeof tamanos;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-r-pastilla font-semibold tracking-wide',
        tonoAvatar(nombre),
        tamanos[size],
        className,
      )}
    >
      {inicialesDe(nombre, iniciales)}
    </span>
  );
}
