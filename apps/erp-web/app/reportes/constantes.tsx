import type { EstadoReporte, Reporte } from '@scilb/core';
import type { Tone } from '../../components/ui/badge';
import { cn } from '../../lib/cn';

// Compartido entre la lista de administración (lista.tsx), el detalle ([id]/page.tsx) y "Mis
// reportes" (mis-reportes.tsx) -- un solo lugar para el color de cada estado y el badge de
// puntaje, en vez de que cada pantalla nueva agregue su propia copia.
export const ESTADO_TONE: Record<EstadoReporte, Tone> = {
  evaluado: 'green',
  pendiente: 'amber',
  no_evaluable: 'gray',
};

export function Puntaje({ r }: { r: Reporte }) {
  if (!r.evaluado) return <span className="text-muted">—</span>;
  const p = r.puntajeEval ?? r.puntaje;
  const cls =
    p >= 85 ? 'bg-exito/10 text-exito-deep' : p >= 60 ? 'bg-gold/20 text-gold-deep' : 'bg-error-soft text-error-deep';
  return <span className={cn('rounded-r-pastilla px-2.5 py-0.5 tabular-nums text-dato font-bold', cls)}>{p}%</span>;
}
