'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input, Label, Select } from '../../../components/ui/form';
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui/table';
import { hoyPeru } from '../../../lib/fechas';
import { esConteo, type TipoMovimiento } from '../../../lib/sueldos-tipos';
import type { MovimientoSueldo, VentaSueldo } from '../../../lib/sueldos-repo';
import { accionCrearMovimiento, accionEliminarMovimiento } from './actions';

type Emp = { id: string; nombre: string; rol: string; sedeCod: string | null };

const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Los cinco tipos, con la unidad de cada uno bien a la vista.
 *
 * Tres son PLATA y dos son CONTEO, y la base los hace excluyentes con un `check`. La distinción no
 * es cosmética: cargar «10 almuerzos» como S/80 deja `almuerzosEntregados = 80`, y como
 * `almuerzosAPagar = max(0, díasConDerecho − entregados)`, la persona pierde el reintegro de todos
 * sus almuerzos con una advertencia que se lee como cosmética.
 */
const TIPOS: { valor: TipoMovimiento; label: string; ayuda: string }[] = [
  { valor: 'adelanto', label: 'Adelanto', ayuda: 'dinero entregado antes del pago. Se descuenta del total' },
  { valor: 'reporte', label: 'Descuento', ayuda: 'descuento administrativo. Se resta del total' },
  { valor: 'bono_extra', label: 'Bono extra', ayuda: 'dinero que se suma, fuera de las metas' },
  { valor: 'capacitacion', label: 'Capacitación', ayuda: 'cuántas personas capacitó. El valor sale de Configuración' },
  { valor: 'almuerzo_entregado', label: 'Almuerzo entregado', ayuda: 'cuántos almuerzos se entregaron en especie' },
];

const LABEL_TIPO = Object.fromEntries(TIPOS.map((t) => [t.valor, t.label])) as Record<string, string>;

export function MovimientosCliente({
  empleados,
  movimientos,
  ventas,
}: {
  empleados: Emp[];
  movimientos: MovimientoSueldo[];
  /**
   * Opcional y de SOLO LECTURA — la carga y la asignación de vendedor viven en `/sueldos/ventas`
   * desde la Tarea 3 del rediseño F1 (22-ago-2026). Este prop existe únicamente porque
   * `app/colaboradores/[id]/movimientos/page.tsx` reutiliza este componente para mostrar las
   * ventas de una persona en su período (fuera del alcance de esa tarea, no se toca ese archivo),
   * y sin este prop dejaría de compilar. `/sueldos/movimientos` no lo pasa: acá esta sección
   * simplemente no se renderiza.
   */
  ventas?: VentaSueldo[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const [mov, setMov] = useState({
    empleadoId: '',
    fecha: hoyPeru(),
    tipo: 'adelanto' as TipoMovimiento,
    monto: '',
    cantidad: '1',
    motivo: '',
  });

  const conteo = esConteo(mov.tipo);
  const ayudaTipo = TIPOS.find((t) => t.valor === mov.tipo)?.ayuda ?? '';

  const correr = (fn: () => Promise<{ ok: boolean; error?: string }>, alTerminar?: () => void) => {
    setError(null);
    empezar(async () => {
      const r = await fn();
      if (r.ok) {
        alTerminar?.();
        router.refresh();
      } else setError(r.error ?? 'No se pudo guardar.');
    });
  };

  const guardarMovimiento = () =>
    correr(
      () =>
        accionCrearMovimiento({
          empleadoId: mov.empleadoId,
          fecha: mov.fecha,
          tipo: mov.tipo,
          monto: conteo ? undefined : Number(mov.monto),
          cantidad: conteo ? Number(mov.cantidad) : undefined,
          motivo: mov.motivo,
        }),
      () => setMov((v) => ({ ...v, monto: '', cantidad: '1', motivo: '' })),
    );

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error-deep">{error}</p>}

      {/* ── Movimientos ──────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Adelantos, descuentos y bonos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Label htmlFor="m-emp">Persona</Label>
              <Select
                id="m-emp"
                value={mov.empleadoId}
                onChange={(e) => setMov((v) => ({ ...v, empleadoId: e.target.value }))}
              >
                <option value="">Elegir…</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="m-fecha">Fecha</Label>
              <Input
                id="m-fecha"
                type="date"
                value={mov.fecha}
                onChange={(e) => setMov((v) => ({ ...v, fecha: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="m-tipo">Tipo</Label>
              <Select
                id="m-tipo"
                value={mov.tipo}
                onChange={(e) => setMov((v) => ({ ...v, tipo: e.target.value as TipoMovimiento }))}
              >
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="m-valor">{conteo ? 'Cantidad' : 'Monto (S/)'}</Label>
              <Input
                id="m-valor"
                type="number"
                min={conteo ? 1 : 0}
                step={conteo ? 1 : '0.01'}
                value={conteo ? mov.cantidad : mov.monto}
                onChange={(e) =>
                  setMov((v) => (conteo ? { ...v, cantidad: e.target.value } : { ...v, monto: e.target.value }))
                }
              />
            </div>
            <div className="lg:col-span-1">
              <Label htmlFor="m-motivo">Motivo</Label>
              <Input
                id="m-motivo"
                value={mov.motivo}
                onChange={(e) => setMov((v) => ({ ...v, motivo: e.target.value }))}
                placeholder="Obligatorio"
              />
            </div>
          </div>

          <p className="text-xs text-muted">{ayudaTipo}</p>
          {!conteo && (
            <p className="text-xs text-muted">
              El monto va <strong>siempre en positivo</strong>, también en un adelanto o un
              descuento: el signo lo pone la regla, no el dato. Un adelanto tipeado en negativo
              pasaría de descontar S/100 a sumarlos.
            </p>
          )}

          <Button onClick={guardarMovimiento} pending={pendiente} disabled={!mov.empleadoId || !mov.motivo.trim()}>
            <Plus className="h-4 w-4" /> Registrar
          </Button>
        </CardContent>

        <div className="border-t border-line">
          {movimientos.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">Todavía no hay ninguno.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Persona</TH>
                  <TH>Tipo</TH>
                  <TH className="text-right">Valor</TH>
                  <TH>Motivo</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {movimientos.map((m) => (
                  <TR key={m.id}>
                    <TD className="whitespace-nowrap">{m.fecha}</TD>
                    <TD className="text-navy">{m.empleadoNombre ?? '—'}</TD>
                    <TD>{LABEL_TIPO[m.tipo] ?? m.tipo}</TD>
                    <TD className="text-right tabular-nums">
                      {m.monto == null ? `${m.cantidad} u.` : soles(m.monto)}
                    </TD>
                    <TD className="text-sm text-muted">{m.motivo}</TD>
                    <TD className="text-right">
                      {m.liquidacionId ? (
                        <Badge tone="green">
                          <Lock className="mr-1 inline h-3 w-3" />
                          liquidado
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          onClick={() => correr(() => accionEliminarMovimiento(m.id))}
                          aria-label="Borrar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </Card>

      {/* ── Ventas: sólo lectura acá, opcional (ver el comentario del prop) ────────────────── */}
      {ventas ? (
        <Card>
          <CardHeader>
            <CardTitle>Ventas del periodo</CardTitle>
          </CardHeader>
          <p className="px-5 pb-3 text-sm text-muted">
            Sólo lectura: cargar una venta nueva o asignar un vendedor se hace desde{' '}
            <a className="text-gold-deep underline" href="/sueldos/ventas">
              Ventas y metas
            </a>
            .
          </p>
          <div className="border-t border-line">
            {ventas.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted">Todavía no hay ninguna.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH>Sede</TH>
                    <TH>Tipo</TH>
                    <TH className="text-right">Monto</TH>
                    <TH>Vendedor</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {ventas.map((v) => (
                    <TR key={v.id}>
                      <TD className="whitespace-nowrap">{v.fecha}</TD>
                      <TD>{v.sedeCod ?? '—'}</TD>
                      <TD className="capitalize">{v.tipo}</TD>
                      <TD className="text-right tabular-nums">{soles(v.monto)}</TD>
                      <TD>
                        {v.empleadoNombre ?? (v.vendedorExterno ? `vino como “${v.vendedorExterno}”` : 'sin asignar')}
                      </TD>
                      <TD className="text-right">
                        {v.liquidacionId && (
                          <Badge tone="green">
                            <Lock className="mr-1 inline h-3 w-3" />
                            liquidada
                          </Badge>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Card>
      ) : (
        <p className="text-sm text-muted">
          Las ventas se cargan en{' '}
          <a className="text-gold-deep underline" href="/sueldos/ventas">
            Ventas y metas
          </a>
          .
        </p>
      )}
    </div>
  );
}
