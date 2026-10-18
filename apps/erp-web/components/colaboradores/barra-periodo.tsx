'use client';

import { useEffect, useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { calcularCiclo, pagoQueContiene } from '@scilb/core';
import { hoyPeru } from '../../lib/fechas';
import { campoCls } from '../ui/form';
import { diasDelPeriodo, etiquetaPeriodo, leerPeriodo, mesCalendario, rangoCorto, type Periodo } from '../../lib/periodo';
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

/** Un pago programado, lo mínimo que la barra necesita para ofrecerlo. */
export type PagoDeBarra = { desde: string; hasta: string; estado: 'por_cerrar' | 'cerrado' | 'pagado' };

const ESTADO_PAGO: Record<PagoDeBarra['estado'], { texto: string; punto: string }> = {
  pagado: { texto: 'Pagado', punto: 'bg-exito' },
  cerrado: { texto: 'Cerrado', punto: 'bg-gold' },
  por_cerrar: { texto: 'Por cerrar', punto: 'bg-muted' },
};

export function BarraPeriodo({
  fechaIngreso,
  pagos = [],
  className,
}: {
  /** Habilita «Ciclo personal»: el ciclo aniversario de esa persona. */
  fechaIngreso?: string | null;
  /** Los pagos programados de su contrato (sólo si quien mira puede ver sueldos). */
  pagos?: PagoDeBarra[];
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

  // Sin período en la dirección, la ficha abre en el pago que contiene hoy (default de pantalla,
  // spec pagos-programados §8). Si hoy no cae en ningún pago, queda el mes actual de siempre.
  const sinPeriodo = !sp.get('desde') && !sp.get('hasta');
  useEffect(() => {
    if (!sinPeriodo || pagos.length === 0) return;
    const p = pagoQueContiene(pagos, hoyPeru());
    if (p) {
      const q = new URLSearchParams(sp.toString());
      q.set('desde', p.desde);
      q.set('hasta', p.hasta);
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinPeriodo, pagos, pathname]);

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
        'anillo cursor-pointer rounded-r-pastilla px-2.5 py-1.5 text-apoyo font-medium transition-colors duration-150',
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

      {pagos.length > 0 && (
        <div className="w-full min-w-0">
          <p className="mb-1 text-rotulo font-medium uppercase text-muted">Sus pagos</p>
          {/* Con muchos pagos la fila se desliza hacia el costado dentro de la barra: no ensancha la página. */}
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {pagos.map((p) => {
              const activo = esIgual(p);
              const e = ESTADO_PAGO[p.estado];
              return (
                <button
                  key={`${p.desde}-${p.hasta}`}
                  type="button"
                  onClick={() => ir(p)}
                  aria-pressed={activo}
                  title={e.texto}
                  className={cn(
                    'anillo flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-r-pastilla border px-2.5 py-1.5 text-apoyo font-medium tabular-nums transition-colors duration-150',
                    activo ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:bg-navy/5',
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-r-pastilla', e.punto)} aria-hidden />
                  {rangoCorto(p.desde, p.hasta)}
                  <span className="sr-only">: {e.texto}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="ml-auto flex items-center gap-1.5 text-apoyo text-muted">
        <CalendarRange className="h-3.5 w-3.5" aria-hidden />
        <span>{etiquetaPeriodo(periodo)}</span>
        <span className="tabular-nums">· {diasDelPeriodo(periodo)} días</span>
      </p>
    </div>
  );
}
