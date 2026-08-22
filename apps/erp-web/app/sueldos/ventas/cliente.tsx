'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { semanasConMeta, type SemanaMeta } from '@scilb/core';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Aviso, Input, Label, LabelGrupo, Select } from '../../../components/ui/form';
import { OpcionBotones } from '../../../components/ui/opcion-botones';
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui/table';
import { DialogoConfirmar, useConfirmacion } from '../../../components/ui/confirmar';
import { cn } from '../../../lib/cn';
import { hoyPeru } from '../../../lib/fechas';
import type { VentaSueldo } from '../../../lib/sueldos-repo';
import { accionAsignarVendedor, accionCrearVenta, accionEliminarVenta } from './actions';

type Emp = { id: string; nombre: string; rol: string; sedeCod: string | null };
type Periodo = { desde: string; hasta: string };

const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TIPOS_VENTA: { value: 'venta' | 'alquiler'; label: string }[] = [
  { value: 'venta', label: 'Venta' },
  { value: 'alquiler', label: 'Alquiler' },
];

/** Una tarjeta del semáforo semanal (RN-12): verde si esa semana superó su meta, gris si no. */
function TarjetaSemana({ s }: { s: SemanaMeta }) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        s.cumplida ? 'border-exito-line bg-exito-soft text-exito-deep' : 'border-line bg-paper text-muted',
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide">Semana {s.numero}</p>
      <p className="mt-0.5 text-xs">
        {s.desde} → {s.hasta}
        {s.dias > 7 && ` · ${s.dias} días`}
      </p>
      <p className="mt-2 text-lg font-semibold tabular-nums text-navy">{soles(s.vendido)}</p>
      <p className="text-xs tabular-nums">meta {soles(s.meta)}</p>
    </div>
  );
}

/** La celda de vendedor: el nombre si ya está asignado, o el selector que saca la boleta de la cola. */
function FilaVendedor({
  venta,
  empleados,
  onAsignar,
}: {
  venta: VentaSueldo;
  empleados: Emp[];
  onAsignar: (ventaId: string, empleadoId: string) => void;
}) {
  return (
    <>
      {venta.empleadoId ? (
        venta.empleadoNombre ?? '—'
      ) : (
        <Select
          value=""
          onChange={(e) => onAsignar(venta.id, e.target.value)}
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
      {venta.vendedorExterno && (
        <span className="ml-2 text-xs text-muted">vino como “{venta.vendedorExterno}”</span>
      )}
    </>
  );
}

/** Borrar (si no está liquidada) o el candado de liquidada, igual que en las demás tablas de sueldos. */
function AccionesVenta({ venta, onEliminar }: { venta: VentaSueldo; onEliminar: (v: VentaSueldo) => void }) {
  if (venta.liquidacionId) {
    return (
      <Badge tone="green">
        <Lock className="mr-1 inline h-3 w-3" />
        liquidada
      </Badge>
    );
  }
  return (
    <Button variant="ghost" onClick={() => onEliminar(venta)} aria-label="Eliminar venta">
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

export function VentasCliente({
  empleados,
  ventas,
  ventasSinAsignar,
  periodo,
  metaSemanal,
  montoMinimoComision,
}: {
  empleados: Emp[];
  ventas: VentaSueldo[];
  ventasSinAsignar: VentaSueldo[];
  periodo: Periodo;
  metaSemanal: number;
  montoMinimoComision: number;
}) {
  const router = useRouter();
  // El error del FORMULARIO vive con el formulario. El de una acción de la TABLA (asignar,
  // eliminar) no cabe ahí: en ese momento el formulario ya no está a la vista y el mensaje se
  // renderizaría donde nadie lo ve (sistema-de-diseno.md §6) — por eso es un estado aparte, arriba
  // de todo y siempre visible.
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const conf = useConfirmacion();

  const sedes = useMemo(
    () => [...new Set(empleados.map((e) => e.sedeCod).filter((s): s is string => Boolean(s)))].sort(),
    [empleados],
  );

  // Fecha, sede y tipo NO se limpian entre cargas, a propósito: transcribir veinte boletas de la
  // misma tienda es escribir veinte montos, no repetir veinte veces fecha/sede/tipo.
  const [venta, setVenta] = useState({
    fecha: hoyPeru(),
    sedeCod: '',
    tipo: 'venta' as 'venta' | 'alquiler',
    monto: '',
    empleadoId: '',
  });

  const semanas = useMemo(
    () => semanasConMeta(periodo.desde, periodo.hasta, ventas, metaSemanal),
    [periodo.desde, periodo.hasta, ventas, metaSemanal],
  );

  // La cola (global, no acotada al periodo) ya muestra todo lo sin asignar. La tabla de "lo
  // cargado" excluye esas mismas filas para no repetir el mismo selector de asignar dos veces en
  // la pantalla.
  const idsEnCola = useMemo(() => new Set(ventasSinAsignar.map((v) => v.id)), [ventasSinAsignar]);
  const cargadas = useMemo(() => ventas.filter((v) => !idsEnCola.has(v.id)), [ventas, idsEnCola]);

  const motivoBloqueo =
    venta.monto === '' || !Number.isFinite(Number(venta.monto)) || Number(venta.monto) < 0
      ? 'Falta el monto de la boleta.'
      : null;

  const guardarVenta = () => {
    setErrorForm(null);
    empezar(async () => {
      const r = await accionCrearVenta({
        fecha: venta.fecha,
        monto: Number(venta.monto),
        tipo: venta.tipo,
        sedeCod: venta.sedeCod || null,
        empleadoId: venta.empleadoId || null,
      });
      if (r.ok) {
        // Sólo el monto y el vendedor se limpian: fecha, sede y tipo quedan como estaban, listos
        // para la boleta siguiente de la misma tienda — es el punto de esta pantalla.
        setVenta((v) => ({ ...v, monto: '', empleadoId: '' }));
        router.refresh();
      } else setErrorForm(r.error ?? 'No se pudo guardar la venta.');
    });
  };

  const asignar = (ventaId: string, empleadoId: string) => {
    if (!empleadoId) return;
    setErrorAccion(null);
    empezar(async () => {
      const r = await accionAsignarVendedor(ventaId, empleadoId);
      if (r.ok) router.refresh();
      else setErrorAccion(r.error ?? 'No se pudo asignar el vendedor.');
    });
  };

  const pedirEliminar = (v: VentaSueldo) => {
    conf.pedir({
      titulo: `¿Eliminar la venta de ${soles(v.monto)} del ${v.fecha}?`,
      detalle: 'No se puede deshacer. Si ya tenía vendedor asignado, esa boleta sale de su comisión.',
      confirmarLabel: 'Eliminar',
      alConfirmar: () => {
        setErrorAccion(null);
        empezar(async () => {
          const r = await accionEliminarVenta(v.id);
          if (r.ok) {
            conf.cerrar();
            router.refresh();
          } else setErrorAccion(r.error ?? 'No se pudo eliminar.');
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      <DialogoConfirmar {...conf.props} pending={pendiente} error={errorAccion ?? undefined} />
      {errorAccion && <Aviso tono="error">{errorAccion}</Aviso>}

      {/* ── Semáforo semanal (RN-12) ─────────────────────────────────────────────────────── */}
      <div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {semanas.map((s) => (
            <TarjetaSemana key={s.numero} s={s} />
          ))}
        </div>
        {metaSemanal === 0 && (
          <p className="mt-2 text-xs text-muted">
            Ningún contrato vigente tiene todavía una meta semanal pactada: el semáforo no está
            comparando contra nada real.
          </p>
        )}
      </div>

      {/* ── Carga rápida ─────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Transcribir boletas de tuxedo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted">
            Se carga el <strong>total de la boleta</strong>, no el de un producto: la comisión mira
            el monto de la boleta contra el mínimo configurado (hoy {soles(montoMinimoComision)}).
            Una venta sin vendedor asignado se guarda igual y queda en la cola de abajo — nada se
            descarta en silencio.
          </p>
          {errorForm && <Aviso tono="error">{errorForm}</Aviso>}
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
              <LabelGrupo>Tipo</LabelGrupo>
              <OpcionBotones
                ariaLabel="Tipo de venta"
                opciones={TIPOS_VENTA}
                value={venta.tipo}
                onChange={(tipo) => setVenta((v) => ({ ...v, tipo }))}
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

          <div>
            <span id="motivo-venta" className="text-xs text-muted">
              {motivoBloqueo ?? 'Se guarda y el formulario queda listo para la boleta siguiente.'}
            </span>
            <div className="mt-2">
              <Button
                onClick={guardarVenta}
                pending={pendiente}
                disabled={motivoBloqueo != null}
                aria-describedby="motivo-venta"
              >
                <Plus className="h-4 w-4" /> Registrar venta
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Cola de ventas sin vendedor: destacada, nada se descarta en silencio ────────────── */}
      {ventasSinAsignar.length > 0 && (
        <Card className="border-aviso-line bg-aviso-soft">
          <CardHeader>
            <CardTitle className="text-aviso-deep">Ventas sin vendedor ({ventasSinAsignar.length})</CardTitle>
          </CardHeader>
          <div className="border-t border-aviso-line">
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
                {ventasSinAsignar.map((v) => (
                  <TR key={v.id}>
                    <TD className="whitespace-nowrap">{v.fecha}</TD>
                    <TD>{v.sedeCod ?? '—'}</TD>
                    <TD className="capitalize">{v.tipo}</TD>
                    <TD className="text-right tabular-nums">{soles(v.monto)}</TD>
                    <TD>
                      <FilaVendedor venta={v} empleados={empleados} onAsignar={asignar} />
                    </TD>
                    <TD className="text-right">
                      <AccionesVenta venta={v} onEliminar={pedirEliminar} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ── Tabla de lo cargado ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Ventas del periodo</CardTitle>
        </CardHeader>
        <div className="border-t border-line">
          {cargadas.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">
              Todavía no hay ninguna boleta con vendedor asignado en este periodo.
            </p>
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
                {cargadas.map((v) => (
                  <TR key={v.id}>
                    <TD className="whitespace-nowrap">{v.fecha}</TD>
                    <TD>{v.sedeCod ?? '—'}</TD>
                    <TD className="capitalize">{v.tipo}</TD>
                    <TD className="text-right tabular-nums">
                      {soles(v.monto)}
                      {v.monto > montoMinimoComision && (
                        <Badge tone="gold" className="ml-2">
                          comisiona
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <FilaVendedor venta={v} empleados={empleados} onAsignar={asignar} />
                    </TD>
                    <TD className="text-right">
                      <AccionesVenta venta={v} onEliminar={pedirEliminar} />
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
