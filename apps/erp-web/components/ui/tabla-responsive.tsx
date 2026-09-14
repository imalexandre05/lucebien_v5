import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Table, THead, TBody, TR, TH, TD } from './table';
import { Rotulo } from './rotulo';

export type ColumnaResponsiva<T> = {
  clave: string;
  rotulo: string;
  render: (fila: T) => ReactNode;
  /** Las columnas titulares se muestran arriba de la tarjeta en el corte móvil — máximo dos. */
  titular?: boolean;
  num?: boolean;
};

// La tabla que a 768px (`md`) se vuelve lista de tarjetas — el piso móvil que desbloquea el
// arquetipo B (spec §7). Recibe las columnas como DATOS, no como JSX: sin esa forma, la
// transformación habría que escribirla pantalla por pantalla, y no se escribiría.
//
// Dos vistas, la misma info, una decide por CSS (`md:hidden`/`hidden md:table`) — sin JS ni
// `matchMedia`, así que no hay parpadeo de hidratación entre SSR y cliente.
export function TablaResponsive<T extends { id: string | number }>({
  columnas,
  filas,
  seleccionada,
  onFila,
  className,
}: {
  columnas: ColumnaResponsiva<T>[];
  filas: T[];
  seleccionada?: (fila: T) => boolean;
  onFila?: (fila: T) => void;
  className?: string;
}) {
  const titulares = columnas.filter((c) => c.titular).slice(0, 2);
  const resto = columnas.filter((c) => !c.titular);

  return (
    <div className={className}>
      {/* ── Escritorio y tablet: la tabla de siempre ── */}
      <div className="hidden md:block">
        <Table>
          <THead>
            <TR>
              {columnas.map((c) => (
                <TH key={c.clave} className={c.num ? 'text-right' : undefined}>
                  {c.rotulo}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {filas.map((f) => (
              <TR
                key={f.id}
                seleccionada={seleccionada?.(f)}
                onClick={onFila ? () => onFila(f) : undefined}
                className={onFila ? 'cursor-pointer' : undefined}
              >
                {columnas.map((c) => (
                  <TD key={c.clave} num={c.num}>
                    {c.render(f)}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {/* ── Teléfono: lista de tarjetas. Dos titulares arriba, el resto en pares rótulo/valor. ── */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {filas.map((f) => (
          <div
            key={f.id}
            onClick={onFila ? () => onFila(f) : undefined}
            className={cn(
              'rounded-r-medio border border-line bg-superficie p-3.5 shadow-elev-1',
              seleccionada?.(f) && 'hilo-fila bg-superficie-hundida/60',
              onFila && 'cursor-pointer',
            )}
          >
            {titulares.length > 0 && (
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                {titulares.map((c, i) => (
                  <span
                    key={c.clave}
                    className={cn(
                      i === 0 ? 'text-sub font-display font-semibold text-navy' : 'text-dato',
                      c.num && 'text-right',
                    )}
                  >
                    {c.render(f)}
                  </span>
                ))}
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {resto.map((c) => (
                <div key={c.clave} className="contents">
                  <dt>
                    <Rotulo as="span">{c.rotulo}</Rotulo>
                  </dt>
                  <dd className={cn('text-dato', c.num && 'text-right')}>{c.render(f)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
