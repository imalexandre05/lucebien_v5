'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
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
export type PagoDeBarra = {
  desde: string;
  hasta: string;
  estado: 'por_cerrar' | 'cerrado' | 'pagado';
  /** Monto a mostrar: el total liquidado, o el estimado si aún no se cierra. null = sin dato. */
  monto?: number | null;
  /** true cuando el monto es una estimación (todavía no hay liquidación cerrada). */
  estimado?: boolean;
};

const ESTADO_PAGO: Record<PagoDeBarra['estado'], { texto: string; punto: string; borde: string; pastilla: string }> = {
  pagado: { texto: 'Pagado', punto: 'bg-exito', borde: 'border-exito/40', pastilla: 'bg-exito/10 text-exito' },
  cerrado: { texto: 'Cerrado', punto: 'bg-gold', borde: 'border-gold/50', pastilla: 'bg-gold/15 text-gold-deep' },
  por_cerrar: { texto: 'Por cerrar', punto: 'bg-muted', borde: 'border-line', pastilla: 'bg-navy/5 text-muted' },
};

const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BarraPeriodo({
  fechaIngreso,
  pagos: pagosEntrada = [],
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
  const [otroRango, setOtroRango] = useState(false);

  const pagos = useMemo(() => [...pagosEntrada].sort((a, b) => a.desde.localeCompare(b.desde)), [pagosEntrada]);

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

  // ── «Sus pagos»: el pago elegido, destacado, con flechas; debajo, todos agrupados por año ──────
  const idxElegido = pagos.findIndex(esIgual);
  const hayPagos = pagos.length > 0;
  const elegido = idxElegido >= 0 ? pagos[idxElegido] : null;
  // Con un rango suelto, las flechas saltan al pago más cercano a ese rango.
  const idxAnterior = idxElegido >= 0 ? idxElegido - 1 : pagos.reduce((a, p, i) => (p.hasta < periodo.desde ? i : a), -1);
  const idxSiguiente = idxElegido >= 0 ? idxElegido + 1 : pagos.findIndex((p) => p.desde > periodo.hasta);
  const anterior = idxAnterior >= 0 ? pagos[idxAnterior] : null;
  const siguiente = idxSiguiente >= 0 && idxSiguiente < pagos.length ? pagos[idxSiguiente] : null;

  const porAnio = useMemo(() => {
    const m = new Map<string, PagoDeBarra[]>();
    for (const p of pagos) {
      const a = p.desde.slice(0, 4);
      m.set(a, [...(m.get(a) ?? []), p]);
    }
    return [...m.entries()];
  }, [pagos]);

  const flecha = (destino: PagoDeBarra | null, lado: 'izq' | 'der') => (
    <button
      type="button"
      onClick={() => destino && ir(destino)}
      disabled={!destino}
      aria-label={lado === 'izq' ? 'Pago anterior' : 'Pago siguiente'}
      title={destino ? rangoCorto(destino.desde, destino.hasta) : lado === 'izq' ? 'No hay un pago anterior' : 'No hay un pago siguiente'}
      className="anillo flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-r-pastilla border border-line text-navy transition-colors duration-150 hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {lado === 'izq' ? <ChevronLeft className="h-5 w-5" aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}
    </button>
  );

  const rangoAbierto = otroRango || !hayPagos;

  return (
    <div
      className={cn(
        'space-y-3 rounded-r-medio border border-line bg-white px-4 py-3 shadow-card',
        pendiente && 'opacity-60',
        className,
      )}
    >
      {hayPagos && (
        <div className="min-w-0">
          <p className="mb-2 text-rotulo font-medium uppercase text-muted">Sus pagos</p>
          <div className="flex items-stretch gap-2">
            {flecha(anterior, 'izq')}
            <div
              className={cn(
                'min-w-0 flex-1 rounded-r-medio border-2 px-4 py-2.5',
                elegido ? ESTADO_PAGO[elegido.estado].borde : 'border-line',
              )}
              aria-live="polite"
            >
              {elegido ? (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <div>
                    <p className="font-display text-titulo text-navy tabular-nums">{rangoCorto(elegido.desde, elegido.hasta)}</p>
                    <p className="text-apoyo text-muted tabular-nums">{diasDelPeriodo(elegido)} días</p>
                  </div>
                  <div className="text-right">
                    <span className={cn('inline-flex items-center gap-1.5 rounded-r-pastilla px-2.5 py-0.5 text-apoyo font-medium', ESTADO_PAGO[elegido.estado].pastilla)}>
                      <span className={cn('h-2 w-2 rounded-r-pastilla', ESTADO_PAGO[elegido.estado].punto)} aria-hidden />
                      {ESTADO_PAGO[elegido.estado].texto}
                    </span>
                    <p className="mt-1 text-cuerpo font-semibold text-navy tabular-nums">
                      {elegido.monto != null ? `${elegido.estimado ? '≈ ' : ''}${soles(elegido.monto)}` : 'Se calcula al cerrar'}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="font-display text-titulo text-navy tabular-nums">{etiquetaPeriodo(periodo)}</p>
                  <p className="text-apoyo text-muted">Rango a tu medida · elige un pago de la lista para volver a uno programado</p>
                </div>
              )}
            </div>
            {flecha(siguiente, 'der')}
          </div>

          <div className="mt-3 space-y-2">
            {porAnio.map(([anio, lista]) => (
              <div key={anio} className="flex items-start gap-3">
                <span className="w-10 shrink-0 pt-1.5 text-apoyo font-semibold text-muted tabular-nums">{anio}</span>
                <div className="flex flex-wrap gap-1">
                  {lista.map((p) => {
                    const activo = esIgual(p);
                    const actual = p.desde <= hoy && hoy <= p.hasta;
                    const futuro = p.desde > hoy;
                    const e = ESTADO_PAGO[p.estado];
                    return (
                      <button
                        key={`${p.desde}-${p.hasta}`}
                        type="button"
                        onClick={() => ir(p)}
                        aria-pressed={activo}
                        aria-current={actual ? 'date' : undefined}
                        title={`${e.texto}${actual ? ' · el de hoy' : futuro ? ' · todavía no llega' : ''}`}
                        className={cn(
                          'anillo flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-r-pastilla border px-2 py-1 text-apoyo font-medium tabular-nums transition-colors duration-150',
                          activo ? 'border-navy bg-navy text-paper' : cn(e.borde, 'text-navy hover:bg-navy/5'),
                          actual && !activo && 'ring-2 ring-gold/60',
                          futuro && !activo && 'opacity-50 hover:opacity-100',
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
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {hayPagos && (
          <button
            type="button"
            onClick={() => setOtroRango((v) => !v)}
            aria-expanded={otroRango}
            className="anillo cursor-pointer text-apoyo text-muted underline underline-offset-2 hover:text-navy"
          >
            {otroRango ? 'Ocultar otro rango de fechas' : 'Otro rango de fechas'}
          </button>
        )}
        <p className="ml-auto flex items-center gap-1.5 text-apoyo text-muted">
          <CalendarRange className="h-3.5 w-3.5" aria-hidden />
          <span>{etiquetaPeriodo(periodo)}</span>
          <span className="tabular-nums">· {diasDelPeriodo(periodo)} días</span>
        </p>
      </div>

      {rangoAbierto && (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-t border-line pt-3">
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
        </div>
      )}
    </div>
  );
}
