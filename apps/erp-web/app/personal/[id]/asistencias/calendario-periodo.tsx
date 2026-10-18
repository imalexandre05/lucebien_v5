import { cn } from '../../../../lib/cn';
import { fechaAmable } from '../../../../lib/asistencia-revisar-texto';

export type EstadoDia = 'trabajo' | 'revisar' | 'falta' | 'sin_horario';

const COLOR: Record<EstadoDia, string> = {
  trabajo: 'border-exito-line bg-exito-soft text-exito-deep',
  revisar: 'border-gold bg-gold/20 text-navy',
  falta: 'border-error-line bg-error-soft text-error-deep',
  sin_horario: 'border-line bg-paper text-muted',
};

const TEXTO: Record<EstadoDia, string> = {
  trabajo: 'trabajó',
  revisar: 'por revisar',
  falta: 'falta',
  sin_horario: 'sin horario o aún no llega',
};

/** Un cuadrito por día, con su color: se lee de un vistazo cómo va el período. */
export function CalendarioPeriodo({ dias }: { dias: { fecha: string; estado: EstadoDia }[] }) {
  if (dias.length === 0) return null;
  return (
    <div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Calendario del período">
        {dias.map((d) => (
          <li
            key={d.fecha}
            title={`${fechaAmable(d.fecha)}: ${TEXTO[d.estado]}`}
            aria-label={`${fechaAmable(d.fecha)}: ${TEXTO[d.estado]}`}
            className={cn(
              'flex h-11 w-11 flex-col items-center justify-center rounded-r-chico border text-center leading-none tabular-nums',
              COLOR[d.estado],
            )}
          >
            <span className="text-dato font-semibold">{d.fecha.slice(8)}</span>
            <span className="mt-0.5 text-micro">{fechaAmable(d.fecha).slice(0, 3)}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-micro text-muted">
        {(Object.keys(COLOR) as EstadoDia[]).map((e) => (
          <li key={e} className="flex items-center gap-1.5">
            <span className={cn('inline-block h-3 w-3 rounded-r-chico border', COLOR[e])} aria-hidden />
            {TEXTO[e][0].toUpperCase() + TEXTO[e].slice(1)}
          </li>
        ))}
      </ul>
    </div>
  );
}
