'use client';

import { useState, useTransition } from 'react';
import { Check, Lock } from 'lucide-react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { campoCls } from '../../../../components/ui/form';
import { OpcionBotones } from '../../../../components/ui/opcion-botones';
import { cn } from '../../../../lib/cn';
import { accionGuardarMetaMes, accionGuardarVentaSemana } from './actions';

export type FilaSemana = {
  desde: string;
  hasta: string;
  /** La semana cae en un pago cerrado: solo lectura. */
  cerrada: boolean;
  /** Meta de la semana según el cálculo de prueba; null si todavía no se puede calcular. */
  meta: number | null;
  carga: { totalBoletasMayores: number; metaCumplida: boolean | null; montoVendido: number | null } | null;
  /** Boletas sueltas (de /sueldos/ventas) que caen en esta semana. */
  boletasSueltas: number;
};

// 1364 → «1.364»; 1000.5 → «1.000,5». Hasta 2 decimales, sin ceros de relleno (mismo formato que
// el desglose del pago).
function num(n: number): string {
  const [ent, dec = ''] = (Math.round(n * 100) / 100).toFixed(2).split('.');
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const resto = dec.replace(/0+$/, '');
  return resto ? `${miles},${resto}` : miles;
}
const soles = (n: number) => `S/${num(n)}`;

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// '2026-10-05' → 'lun 05'. Aritmética con UTC fijo: sin zona horaria ni reloj.
function diaCorto(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, '0')}`;
}
function etiquetaSemana(desde: string, hasta: string): string {
  const m0 = Number(desde.split('-')[1]);
  const m = Number(hasta.split('-')[1]);
  const ini = m0 === m ? diaCorto(desde) : `${diaCorto(desde)} ${MESES[m0 - 1]}`;
  return `${ini} – ${diaCorto(hasta)} ${MESES[m - 1]}`;
}

// Texto del campo → número ≥ 0, o null si está vacío; NaN si no se entiende.
function leer(t: string): number | null {
  const s = t.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

type Decision = 'si' | 'no' | '';

function FilaCarga({
  empleadoId,
  fila,
  pct,
  bono,
}: {
  empleadoId: string;
  fila: FilaSemana;
  pct: number | null;
  bono: number | null;
}) {
  const c = fila.carga;
  const [total, setTotal] = useState(c ? String(c.totalBoletasMayores) : '');
  const [decision, setDecision] = useState<Decision>(c?.metaCumplida == null ? '' : c.metaCumplida ? 'si' : 'no');
  const [monto, setMonto] = useState(c?.montoVendido != null ? String(c.montoVendido) : '');
  const [verMonto, setVerMonto] = useState(c?.montoVendido != null);
  // Lo último que quedó guardado, para saber si hay cambios sin guardar.
  const [guardado, setGuardado] = useState({ total, decision, monto });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const totalN = leer(total);
  const montoN = leer(monto);
  const hayMonto = verMonto && montoN !== null;
  const sinCambios = total === guardado.total && decision === guardado.decision && monto === guardado.monto;
  const yaGuardada = c !== null || guardado.total !== '' || guardado.decision !== '' || guardado.monto !== '';

  // Lo que aporta esta semana, como referencia.
  const cumplida =
    hayMonto && montoN !== null && !Number.isNaN(montoN) && fila.meta !== null
      ? montoN > fila.meta
      : !hayMonto && decision !== ''
        ? decision === 'si'
        : null;
  const base = totalN !== null && !Number.isNaN(totalN) ? totalN : 0;

  function guardar() {
    setError(null);
    if (Number.isNaN(totalN) || Number.isNaN(montoN)) {
      setError('Escribe solo números, por ejemplo 1000 o 1000,50.');
      return;
    }
    const envioMonto = verMonto ? montoN : null;
    empezar(async () => {
      const r = await accionGuardarVentaSemana({
        empleadoId,
        desde: fila.desde,
        hasta: fila.hasta,
        totalBoletasMayores: totalN ?? 0,
        // Si hay monto, el sí/no lo decide el monto.
        metaCumplida: envioMonto !== null ? null : decision === '' ? null : decision === 'si',
        montoVendido: envioMonto,
      });
      if (!r.ok) {
        setError(r.error ?? 'No se pudo guardar la semana. Intenta de nuevo.');
        return;
      }
      if (envioMonto !== null) setDecision('');
      setGuardado({ total, decision: envioMonto !== null ? '' : decision, monto: verMonto ? monto : '' });
    });
  }

  const cerrada = fila.cerrada;

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-cuerpo font-semibold text-navy">{etiquetaSemana(fila.desde, fila.hasta)}</p>
        <div className="flex items-center gap-2">
          {fila.meta !== null && <span className="text-apoyo tabular-nums text-muted">Meta: {soles(fila.meta)}</span>}
          {cerrada && (
            <Badge tone="green">
              <Lock className="mr-1 inline h-3 w-3" />
              Pagado
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,12rem)]">
        <label className="block">
          <span className="mb-1 block text-apoyo text-muted">Total de boletas mayores a S/120</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 tabular-nums text-muted">S/</span>
            <input
              type="text"
              inputMode="decimal"
              disabled={cerrada || pendiente}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="0"
              aria-invalid={Number.isNaN(totalN)}
              className={cn(campoCls, 'w-full pl-8 text-right tabular-nums')}
            />
          </div>
        </label>

        <div>
          <span className="mb-1 block text-apoyo text-muted">¿Cumplió la meta semanal?</span>
          {hayMonto ? (
            <p className="py-2 text-cuerpo text-muted">Lo decide el monto vendido.</p>
          ) : (
            <OpcionBotones<Decision>
              ariaLabel="¿Cumplió la meta semanal?"
              tamano="grande"
              disabled={cerrada || pendiente}
              value={decision}
              onChange={setDecision}
              opciones={[
                { value: 'si', label: 'Sí' },
                { value: 'no', label: 'No' },
              ]}
            />
          )}
          {verMonto ? (
            <label className="mt-2 block">
              <span className="mb-1 block text-apoyo text-muted">Monto vendido en la semana</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 tabular-nums text-muted">S/</span>
                <input
                  type="text"
                  inputMode="decimal"
                  disabled={cerrada || pendiente}
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0"
                  aria-invalid={Number.isNaN(montoN)}
                  className={cn(campoCls, 'w-full pl-8 text-right tabular-nums')}
                />
              </div>
              {!cerrada && (
                <button
                  type="button"
                  className="mt-1 text-apoyo text-gold-deep underline"
                  onClick={() => {
                    setVerMonto(false);
                    setMonto('');
                  }}
                >
                  mejor decir sí o no
                </button>
              )}
            </label>
          ) : (
            !cerrada && (
              <button type="button" className="mt-2 text-apoyo text-gold-deep underline" onClick={() => setVerMonto(true)}>
                o poner el monto vendido
              </button>
            )
          )}
        </div>

        <div className="text-apoyo tabular-nums text-muted sm:text-right">
          <p className="mb-1 text-rotulo uppercase">Referencia</p>
          <p>{cumplida === null ? 'Meta: sin decidir' : cumplida ? (bono !== null ? `+ ${soles(bono)} por la meta` : 'Cumplió la meta') : 'No cumplió la meta'}</p>
          {pct !== null && (
            <p>
              {num(pct * 100)} % de {soles(base)} = {soles(base * pct)}
            </p>
          )}
        </div>
      </div>

      {fila.carga && fila.boletasSueltas > 0 && (
        <p className="mt-3 text-apoyo text-muted">Esta semana usa la carga semanal; las boletas sueltas no se suman.</p>
      )}

      {!cerrada && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={guardar} disabled={pendiente || sinCambios}>
            {pendiente ? 'Guardando…' : 'Guardar'}
          </Button>
          {!pendiente && sinCambios && yaGuardada && !error && (
            <span className="inline-flex items-center gap-1 text-apoyo text-exito-deep" role="status">
              <Check className="h-4 w-4" /> Guardado
            </span>
          )}
          {!pendiente && !sinCambios && !error && <span className="text-apoyo text-muted">Hay cambios sin guardar.</span>}
          {error && (
            <span className="text-apoyo text-error-deep" role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

export function VentasSemanaCliente({
  empleadoId,
  filas,
  pctComision,
  bonoMetaSemanal,
  primeraComision,
  segundaComision,
}: {
  empleadoId: string;
  filas: FilaSemana[];
  pctComision: number | null;
  bonoMetaSemanal: number | null;
  primeraComision: number | null;
  segundaComision: number | null;
}) {
  return (
    <div className="space-y-3">
      <Card>
        <ul className="divide-y divide-line">
          {filas.map((f) => (
            <FilaCarga
              key={`${f.desde}|${f.carga?.totalBoletasMayores ?? ''}|${f.carga?.metaCumplida ?? ''}|${f.carga?.montoVendido ?? ''}`}
              empleadoId={empleadoId}
              fila={f}
              pct={pctComision}
              bono={bonoMetaSemanal}
            />
          ))}
        </ul>
      </Card>
      {primeraComision !== null && segundaComision !== null ? (
        <p className="text-cuerpo tabular-nums text-navy">
          Comisiones de este período (referencia): 1.ª {soles(primeraComision)} · 2.ª {soles(segundaComision)}
        </p>
      ) : (
        <p className="text-apoyo text-muted">
          El total estimado aparecerá cuando estén declarados los días del período.
        </p>
      )}
    </div>
  );
}

const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «¿Cumplió la meta del mes?» — desbloquea la 1.ª comisión (2%). Se guarda al marcar. */
export function MetaMesCasilla({
  empleadoId,
  mes,
  marcada,
  cerrada,
}: {
  empleadoId: string;
  /** Primer día del mes, 'YYYY-MM-01'. */
  mes: string;
  marcada: boolean;
  cerrada: boolean;
}) {
  const [valor, setValor] = useState(marcada);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const nombreMes = `${MESES_LARGO[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;

  const cambiar = (nuevo: boolean) => {
    setError(null);
    setValor(nuevo);
    empezar(async () => {
      const r = await accionGuardarMetaMes(empleadoId, mes, nuevo);
      if (!r.ok) {
        setValor(!nuevo);
        setError(r.error ?? 'No se pudo guardar.');
      }
    });
  };

  return (
    <Card>
      <div className="p-3 sm:p-4">
        <label className={cn('flex min-h-[44px] items-center gap-3 text-sub font-semibold text-navy', cerrada && 'opacity-70')}>
          <input
            type="checkbox"
            className="h-5 w-5 accent-navy"
            checked={valor}
            disabled={cerrada || pendiente}
            onChange={(e) => cambiar(e.target.checked)}
          />
          ¿Cumplió la meta del mes? <span className="font-normal text-muted">({nombreMes})</span>
        </label>
        <p className="mt-1 text-apoyo text-muted">
          {cerrada
            ? 'Ese mes ya está en un pago cerrado: no se puede cambiar.'
            : valor
              ? 'Se paga la comisión del 2% sobre las boletas mayores a S/120.'
              : 'Sin marcarla, no se paga la comisión del 2%. El bono por meta de cada semana no depende de esta casilla.'}
        </p>
        {error && (
          <p className="mt-1 text-apoyo text-error-deep" role="alert">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}
