'use client';

import { useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { calcularCiclo } from '@scilb/core';
import { hoyPeru } from '../../lib/fechas';
import { campoCls } from '../ui/form';
import { diasDelPeriodo, etiquetaPeriodo, leerPeriodo, mesCalendario, type Periodo } from '../../lib/periodo';
import { cn } from '../../lib/cn';

// La barra de período que comparten TODAS las secciones del módulo.
//
// Una sola barra, arriba de la navegación, es lo que hacía que el módulo viejo se sintiera simple:
// se elige una vez y todo lo de abajo habla de ese período. Cuando cada pantalla trae su propio par
// de fechas, cambiar de pantalla es volver a empezar.
//
// El período viaja en la URL (lib/periodo.ts), así que este componente sólo la reescribe, y un
// enlace conserva lo que se está mirando.
//
// Se usa `replace` y NO `push` a propósito: un input de fecha dispara un cambio por cada tecla, y
// con `push` el botón de atrás quedaría lleno de estados intermedios que nadie eligió. El precio
// es que atrás no deshace un cambio de período; los presets están para eso.

// El campo del sistema, con la mono para las fechas: un rango se lee mejor con cifras de ancho
// fijo. Todo lo demás —hover, foco, deshabilitado, error— viene de campoCls.
const campo = cn(campoCls, 'tabular-nums');

export function BarraPeriodo({
  fechaIngreso,
  className,
}: {
  /** Habilita «Ciclo personal»: el ciclo aniversario de esa persona. */
  fechaIngreso?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, iniciar] = useTransition();

  // El período sale de la URL, no de una prop. El layout de la persona no recibe searchParams, así
  // que si dependiera de que se lo pasen habría que inventar un segundo lugar donde vive. Servidor
  // y navegador leen la MISMA dirección con la misma función, así que coinciden en la hidratación.
  const periodo = useMemo(
    () => leerPeriodo({ desde: sp.get('desde') ?? undefined, hasta: sp.get('hasta') ?? undefined }),
    [sp],
  );

  const ir = (p: Periodo) => {
    const q = new URLSearchParams(sp.toString());
    q.set('desde', p.desde);
    q.set('hasta', p.hasta);
    iniciar(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
  };

  const hoy = hoyPeru();
  const mesActual = mesCalendario(hoy);
  const mesAnterior = (() => {
    const [y, m] = hoy.split('-').map(Number);
    const previo = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
    return mesCalendario(previo);
  })();
  // El core nunca llama new Date(): recibe el hoy de Perú desde acá (no-negociable 4).
  const ciclo = fechaIngreso ? calcularCiclo(fechaIngreso, hoy) : null;

  const esIgual = (p: Periodo) => p.desde === periodo.desde && p.hasta === periodo.hasta;

  const preset = (label: string, p: Periodo, titulo?: string) => (
    <button
      type="button"
      onClick={() => ir(p)}
      title={titulo}
      aria-pressed={esIgual(p)}
      className={cn(
        'anillo cursor-pointer rounded-r-pastilla px-2.5 py-1.5 text-xs font-medium transition-colors duration-150',
        esIgual(p) ? 'bg-navy text-paper' : 'text-navy hover:bg-navy/5',
      )}
    >
      {label}
    </button>
  );

  return (
    <div
      className={cn(
        'flex flex-wrap items-end gap-x-3 gap-y-2 rounded-r-medio border border-line bg-white px-4 py-3 shadow-card',
        pendiente && 'opacity-60',
        className,
      )}
    >
      <div>
        <label htmlFor="periodo-desde" className="block text-rotulo font-medium uppercase text-muted">
          Desde
        </label>
        <input
          id="periodo-desde"
          type="date"
          value={periodo.desde}
          onChange={(e) => e.target.value && ir({ ...periodo, desde: e.target.value })}
          className={campo}
        />
      </div>
      <div>
        <label htmlFor="periodo-hasta" className="block text-rotulo font-medium uppercase text-muted">
          Hasta
        </label>
        <input
          id="periodo-hasta"
          type="date"
          value={periodo.hasta}
          onChange={(e) => e.target.value && ir({ ...periodo, hasta: e.target.value })}
          className={campo}
        />
      </div>

      <div className="flex items-center gap-1">
        {preset('Mes actual', mesActual)}
        {preset('Mes anterior', mesAnterior)}
        {ciclo &&
          preset(
            'Ciclo personal',
            { desde: ciclo.desde, hasta: ciclo.hasta },
            ciclo.fuente === 'aniversario'
              ? 'Del aniversario de ingreso al día anterior al próximo'
              : 'Sin fecha de ingreso cargada: cae al mes calendario',
          )}
      </div>

      <p className="ml-auto flex items-center gap-1.5 text-xs text-muted">
        <CalendarRange className="h-3.5 w-3.5" aria-hidden />
        <span>{etiquetaPeriodo(periodo)}</span>
        <span className="tabular-nums">· {diasDelPeriodo(periodo)} días</span>
      </p>
    </div>
  );
}
