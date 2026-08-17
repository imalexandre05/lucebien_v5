'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input, Label, Select } from '../../../components/ui/form';
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui/table';
import { esConteo, type MovimientoSueldo, type TipoMovimiento, type VentaSueldo } from '../../../lib/sueldos-repo';
import {
  accionAsignarVendedor,
  accionCrearMovimiento,
  accionCrearVenta,
  accionEliminarMovimiento,
  accionEliminarVenta,
} from './actions';

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

const hoy = (): string => new Date().toISOString().slice(0, 10);

export function MovimientosCliente({
  empleados,
  movimientos,
  ventas,
}: {
  empleados: Emp[];
  movimientos: MovimientoSueldo[];
  ventas: VentaSueldo[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const sedes = useMemo(
    () => [...new Set(empleados.map((e) => e.sedeCod).filter((s): s is string => Boolean(s)))].sort(),
    [empleados],
  );

  const [mov, setMov] = useState({
    empleadoId: '',
    fecha: hoy(),
    tipo: 'adelanto' as TipoMovimiento,
    monto: '',
    cantidad: '1',
    motivo: '',
  });

  const [venta, setVenta] = useState({
    fecha: hoy(),
    monto: '',
    tipo: 'venta' as 'venta' | 'alquiler',
    sedeCod: '',
    empleadoId: '',
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

  const guardarVenta = () =>
    correr(
      () =>
        accionCrearVenta({
          fecha: venta.fecha,
          monto: Number(venta.monto),
          tipo: venta.tipo,
          sedeCod: venta.sedeCod || null,
          empleadoId: venta.empleadoId || null,
        }),
      () => setVenta((v) => ({ ...v, monto: '' })),
    );

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}

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

      {/* ── Ventas ───────────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Ventas del periodo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted">
            Se carga el <strong>total de la boleta</strong>, no el de un producto: la comisión mira
            el monto de la boleta contra el mínimo configurado. Una venta sin vendedor asignado se
            guarda igual y queda en la cola de abajo — nada se descarta en silencio.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label htmlFor="v-fecha">Fecha</Label>
              <Input
                id="v-fecha"
                type="date"
                value={venta.fecha}
                onChange={(e) => setVenta((v) => ({ ...v, fecha: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="v-monto">Total de la boleta (S/)</Label>
              <Input
                id="v-monto"
                type="number"
                min={0}
                step="0.01"
                value={venta.monto}
                onChange={(e) => setVenta((v) => ({ ...v, monto: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="v-tipo">Tipo</Label>
              <Select
                id="v-tipo"
                value={venta.tipo}
                onChange={(e) => setVenta((v) => ({ ...v, tipo: e.target.value as 'venta' | 'alquiler' }))}
              >
                <option value="venta">Venta</option>
                <option value="alquiler">Alquiler</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="v-sede">Sede</Label>
              <Select
                id="v-sede"
                value={venta.sedeCod}
                onChange={(e) => setVenta((v) => ({ ...v, sedeCod: e.target.value }))}
              >
                <option value="">Sin sede</option>
                {sedes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="v-emp">Vendedor</Label>
              <Select
                id="v-emp"
                value={venta.empleadoId}
                onChange={(e) => setVenta((v) => ({ ...v, empleadoId: e.target.value }))}
              >
                <option value="">Sin asignar</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Button onClick={guardarVenta} pending={pendiente} disabled={venta.monto === ''}>
            <Plus className="h-4 w-4" /> Registrar venta
          </Button>
        </CardContent>

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
                      {v.empleadoId ? (
                        v.empleadoNombre ?? '—'
                      ) : (
                        <Select
                          value=""
                          onChange={(e) => correr(() => accionAsignarVendedor(v.id, e.target.value))}
                          aria-label="Asignar vendedor"
                          className="w-48"
                        >
                          <option value="">Sin asignar — elegir</option>
                          {empleados.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.nombre}
                            </option>
                          ))}
                        </Select>
                      )}
                      {v.vendedorExterno && (
                        <span className="ml-2 text-xs text-muted">vino como “{v.vendedorExterno}”</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      {v.liquidacionId ? (
                        <Badge tone="green">
                          <Lock className="mr-1 inline h-3 w-3" />
                          liquidada
                        </Badge>
                      ) : (
                        <Button variant="ghost" onClick={() => correr(() => accionEliminarVenta(v.id))} aria-label="Borrar">
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
    </div>
  );
}
