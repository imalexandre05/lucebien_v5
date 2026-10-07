'use client';

import { useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  desplazarRango,
  diasDelRango,
  rangoDeVista,
  sumarDias,
  type RangoFechas,
  type VistaRango,
} from '@scilb/core';
import { hoyPeru } from '../../lib/fechas';
import { etiquetaPeriodo, leerVistaRango } from '../../lib/periodo';
import { campoCls } from './form';
import { cn } from '../../lib/cn';

// Selector de rango para mirar datos por día, semana (lunes a domingo), mes o un rango a mano,
// con anterior/siguiente (spec asistencias/2026-10-03-filtros-rango-design.md).
//
// El estado vive en la URL (`?vista=…&desde=…&hasta=…`), igual que la barra de período del
// módulo de colaboradores: el servidor lee la misma dirección con la misma función
// (`leerVistaRango`), así que coinciden, y un enlace copiado muestra lo mismo.
//
// `push` para los botones —atrás deshace un «siguiente»— y `replace` para los campos de fecha,
// que disparan un cambio por tecla y llenarían el historial de estados que nadie eligió.

const VISTAS: { value: VistaRango; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'rango', label: 'Rango' },
];

const TZ = 'America/Lima';
const fecha = (iso: string) => new Date(`${iso}T12:00:00-05:00`);

function etiqueta(vista: VistaRango, r: RangoFechas): string {
  if (vista === 'dia') {
    const s = new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeZone: TZ }).format(fecha(r.desde));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (vista === 'mes') {
    const s = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: TZ }).format(fecha(r.desde));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return etiquetaPeriodo(r);
}

const pill = (activo: boolean) =>
  cn(
    'anillo cursor-pointer rounded-r-pastilla px-2.5 py-1.5 text-apoyo font-medium transition-colors duration-150',
    activo ? 'bg-navy text-paper' : 'text-navy hover:bg-navy/5',
  );

export function SelectorRango({
  porDefecto,
  sinRango,
  className,
}: {
  /** La vista cuando la URL no trae ninguna. `null`: se muestra la opción `sinRango`. */
  porDefecto: VistaRango | null;
  /** Etiqueta de la opción «sin rango» (p. ej. «Contrato»). Sólo tiene sentido con `porDefecto: null`. */
  sinRango?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, iniciar] = useTransition();

  const actual = useMemo(() => leerVistaRango(new URLSearchParams(sp.toString()), porDefecto), [sp, porDefecto]);

  const ir = (vista: VistaRango | null, r: RangoFechas | null, modo: 'push' | 'replace' = 'push') => {
    const q = new URLSearchParams(sp.toString());
    if (vista && r) {
      q.set('vista', vista);
      q.set('desde', r.desde);
      q.set('hasta', r.hasta);
    } else {
      q.delete('vista');
      q.delete('desde');
      q.delete('hasta');
    }
    const url = q.toString() ? `${pathname}?${q.toString()}` : pathname;
    iniciar(() => (modo === 'push' ? router.push(url, { scroll: false }) : router.replace(url, { scroll: false })));
  };

  // Cambiar de vista conserva el ancla: de la semana del 28-sep a «Mes» va a septiembre, no a hoy.
  const cambiarVista = (v: VistaRango) => {
    const ancla = actual?.rango.desde ?? hoyPeru();
    ir(v, v === 'rango' ? (actual?.rango ?? { desde: ancla, hasta: ancla }) : rangoDeVista(v, ancla));
  };

  const irAHoy = () => {
    if (!actual) return;
    const hoy = hoyPeru();
    if (actual.vista === 'rango') {
      // Un rango a mano se corre hasta terminar hoy, conservando su largo.
      ir('rango', { desde: sumarDias(hoy, -(diasDelRango(actual.rango) - 1)), hasta: hoy });
    } else ir(actual.vista, rangoDeVista(actual.vista, hoy));
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-r-medio border border-line bg-white px-4 py-3 shadow-card',
        pendiente && 'opacity-60',
        className,
      )}
    >
      <div className="flex items-center gap-1" role="group" aria-label="Vista">
        {sinRango && porDefecto === null && (
          <button type="button" onClick={() => ir(null, null)} aria-pressed={!actual} className={pill(!actual)}>
            {sinRango}
          </button>
        )}
        {VISTAS.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => cambiarVista(v.value)}
            aria-pressed={actual?.vista === v.value}
            className={pill(actual?.vista === v.value)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {actual && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => ir(actual.vista, desplazarRango(actual.vista, actual.rango, -1))}
            className={pill(false)}
            aria-label="Anterior"
            title="Anterior"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <button type="button" onClick={irAHoy} className={pill(false)}>
            Hoy
          </button>
          <button
            type="button"
            onClick={() => ir(actual.vista, desplazarRango(actual.vista, actual.rango, 1))}
            className={pill(false)}
            aria-label="Siguiente"
            title="Siguiente"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      )}

      {actual?.vista === 'rango' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={actual.rango.desde}
            onChange={(e) => e.target.value && ir('rango', { ...actual.rango, desde: e.target.value }, 'replace')}
            className={cn(campoCls, 'tabular-nums')}
            aria-label="Desde"
          />
          <span className="text-apoyo text-muted">a</span>
          <input
            type="date"
            value={actual.rango.hasta}
            onChange={(e) => e.target.value && ir('rango', { ...actual.rango, hasta: e.target.value }, 'replace')}
            className={cn(campoCls, 'tabular-nums')}
            aria-label="Hasta"
          />
        </div>
      )}

      {actual && (
        <p className="ml-auto flex items-center gap-1.5 text-apoyo text-muted">
          <CalendarRange className="h-3.5 w-3.5" aria-hidden />
          <span>{etiqueta(actual.vista, actual.rango)}</span>
          {actual.vista !== 'dia' && <span className="tabular-nums">· {diasDelRango(actual.rango)} días</span>}
        </p>
      )}
    </div>
  );
}
