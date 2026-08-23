'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, Users } from 'lucide-react';
import { ROL_LABEL, type Rol } from '@scilb/core';
import type { Colaborador } from '../../lib/colaboradores-repo';
import {
  corteDelHilo,
  estadoVacio,
  pendientesDelPeriodo,
  type EstadoPeriodo,
} from '../../lib/colaboradores-pasos';
import { queryPeriodo, type Periodo } from '../../lib/periodo';
import { campoCls } from '../../components/ui/form';
import { BarraPeriodo } from '../../components/colaboradores/barra-periodo';
import { Avatar } from '../../components/colaboradores/avatar';
import { HiloPago } from '../../components/colaboradores/hilo-pago';
import { EmptyState } from '../../components/ui/empty-state';
import { cn } from '../../lib/cn';

// La lista contesta UNA pregunta: ¿a quién le falta algo este período?
//
// Por eso el orden por defecto no es alfabético. Alfabético es predecible pero obliga a recorrer
// las dieciocho filas para encontrar las tres que importan. Acá suben primero las que tienen un
// corte, y dentro de cada grupo sí manda el nombre, que es lo que hace que la fila de alguien no
// salte de lugar todos los días.

type Filtro = 'pendientes' | 'listos' | 'todos';

const FILTROS: { clave: Filtro; label: string }[] = [
  { clave: 'pendientes', label: 'Con algo pendiente' },
  { clave: 'listos', label: 'Listos para pagar' },
  { clave: 'todos', label: 'Todos' },
];

// Quita tildes para que buscar "jose" encuentre "José". El mapa explícito sigue el precedente de
// slugRol() en el core: nada de rangos unicode de marcas combinantes.
const ACENTOS: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
};
const normalizar = (s: string) =>
  s
    .toLowerCase()
    .split('')
    .map((c) => ACENTOS[c] ?? c)
    .join('');

export function ListaColaboradores({
  colaboradores,
  estado,
  periodo,
}: {
  colaboradores: Colaborador[];
  estado: Record<string, EstadoPeriodo>;
  periodo: Periodo;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const query = queryPeriodo(periodo);

  const filas = useMemo(
    () =>
      colaboradores.map((c) => {
        const e = estado[c.id] ?? estadoVacio(c.id);
        const pasos = pendientesDelPeriodo(e);
        return { c, e, pasos, corte: corteDelHilo(pasos) };
      }),
    [colaboradores, estado],
  );

  const conPendientes = filas.filter((f) => f.corte).length;

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return filas
      .filter((f) => (filtro === 'todos' ? true : filtro === 'pendientes' ? f.corte : !f.corte))
      .filter((f) => !q || normalizar(f.c.nombre).includes(q) || normalizar(f.c.sedeCod ?? '').includes(q))
      .sort((a, b) => {
        if (Boolean(a.corte) !== Boolean(b.corte)) return a.corte ? -1 : 1;
        return a.c.nombre.localeCompare(b.c.nombre, 'es');
      });
  }, [filas, filtro, busqueda]);

  return (
    <div className="space-y-4">
      <BarraPeriodo />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o sede"
            aria-label="Buscar colaborador"
            // pl-8 deja lugar a la lupa; el resto lo pone el sistema.
            className={cn(campoCls, 'w-full pl-8')}
          />
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              type="button"
              onClick={() => setFiltro(f.clave)}
              aria-pressed={filtro === f.clave}
              className={cn(
                'cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60',
                filtro === f.clave ? 'bg-navy text-paper' : 'text-navy hover:bg-navy/5',
              )}
            >
              {f.label}
              {f.clave === 'pendientes' && conPendientes > 0 && (
                <span className="ml-1.5 tabular-nums opacity-80">{conPendientes}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-lg border border-line bg-white shadow-card">
          <EmptyState icon={Users} titulo={filtro === 'pendientes' ? 'No falta nada en este período' : 'Nadie coincide'}>
            {filtro === 'pendientes'
              ? 'Los cinco pasos están resueltos para todo el equipo en el rango elegido.'
              : 'Probá con otro nombre, otro filtro u otro período.'}
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line bg-white shadow-card">
          {visibles.map(({ c, e, pasos, corte }, i) => (
            <li key={c.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <Link
                href={`/personal/${c.id}?${query}`}
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 outline-none transition-colors duration-150 hover:bg-paper/70 focus-visible:bg-paper/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/60 active:bg-line/50 active:duration-75 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]"
              >
                <Avatar nombre={c.nombre} iniciales={c.iniciales} />

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy">{c.nombre}</p>
                  <p className="truncate text-xs text-muted">
                    {ROL_LABEL[c.rol as Rol] ?? c.rol}
                    {c.sedeCod ? ` · ${c.sedeCod}` : ''}
                  </p>
                </div>

                <div className="col-span-3 flex items-center gap-3 sm:col-span-1 sm:justify-self-end">
                  <HiloPago pasos={pasos} compacto />
                  <span
                    className={cn(
                      'text-xs',
                      corte ? 'font-medium text-aviso-deep' : 'text-exito-deep',
                    )}
                  >
                    {corte ? corte.titulo : 'Listo para pagar'}
                  </span>
                </div>

                <div className="hidden text-right sm:block">
                  <span className="block tabular-nums text-base font-semibold text-navy">
                    {e.nota != null ? e.nota.toFixed(2) : '—'}
                  </span>
                  <span className="block text-[11px] text-muted">nota /20</span>
                </div>

                {/* La flecha se acerca al pasar: dice "esto lleva a algún lado" sin ocupar texto.
                    Sólo transform, y se queda quieta con prefers-reduced-motion. */}
                <ChevronRight
                  className="hidden h-4 w-4 text-muted transition-transform duration-200 ease-out-expo group-hover-fine:translate-x-0.5 group-hover:text-navy motion-reduce:transform-none sm:block"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
