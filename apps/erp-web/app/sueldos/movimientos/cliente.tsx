'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
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
import { correrAccion, mensajeIncierto, planTrasFallo, restaurarSiVacio, sinId } from '../../../lib/movimientos-optimista';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import type { DecisionPeriodo, EstadoFechaMovimiento } from '../../../lib/sueldos-repo';
import { accionCrearMovimiento, accionEliminarMovimiento, accionEstadoFechaMovimiento } from './actions';

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
   * `app/personal/[id]/movimientos/page.tsx` reutiliza este componente para mostrar las
   * ventas de una persona en su período (fuera del alcance de esa tarea, no se toca ese archivo),
   * y sin este prop dejaría de compilar. `/sueldos/movimientos` no lo pasa: acá esta sección
   * simplemente no se renderiza.
   */
  ventas?: VentaSueldo[];
}) {
  // Sólo para resincronizar tras un fallo incierto (ver planTrasFallo). En el camino normal
  // NO se usa: el árbol nuevo llega en la respuesta de la acción.
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  // ── Actualización optimista (spec 2026-10-03-adelantos-rendimiento-design.md) ────────────
  // Una fila recién registrada se muestra al instante como «guardando…». Cuando la acción
  // responde trae el id real; la fila provisoria se quita cuando ese id ya llegó en `movimientos`
  // (el árbol nuevo viaja en la misma respuesta de la acción, no hace falta `router.refresh()`).
  // Es sólo presentación: lo que se escribe en la base es exactamente lo de siempre.
  type Provisoria = MovimientoSueldo & { idReal?: string };
  const [provisorias, setProvisorias] = useState<Provisoria[]>([]);
  const [borrando, setBorrando] = useState<Set<string>>(() => new Set());
  const ultimos = useRef(movimientos);
  ultimos.current = movimientos;

  useEffect(() => {
    // Llegó un árbol nuevo del servidor: lo que ya tiene id real dejó de ser provisorio.
    setProvisorias((ps) => (ps.some((p) => p.idReal) ? ps.filter((p) => !p.idReal) : ps));
  }, [movimientos]);

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

  // Pregunta «¿a qué período lo cargo?» (0136): la fecha cae en un período cerrado o sin contrato.
  // Se guarda lo tipeado para repetir el alta con la decisión elegida; nada se escribe sin ella.
  const [pregunta, setPregunta] = useState<{ tipeado: typeof mov; estado: EstadoFechaMovimiento } | null>(null);

  const fechaCorta = (iso: string) => iso.split('-').reverse().join('/');

  const guardarMovimiento = (tipeado = mov, decision: DecisionPeriodo | null = null) => {
    setError(null);
    setPregunta(null);
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setProvisorias((ps) => [
      {
        id: tmpId,
        empleadoId: tipeado.empleadoId,
        empleadoNombre: empleados.find((e) => e.id === tipeado.empleadoId)?.nombre ?? null,
        fecha: tipeado.fecha,
        tipo: tipeado.tipo,
        monto: conteo ? null : Number(tipeado.monto),
        cantidad: conteo ? Number(tipeado.cantidad) : 1,
        motivo: tipeado.motivo.trim(),
        liquidacionId: null,
        creadoEn: '',
      },
      ...ps,
    ]);
    // El formulario se limpia ya, para poder seguir cargando. Si la base rechaza, vuelve lo tipeado.
    setMov((v) => ({ ...v, monto: '', cantidad: '1', motivo: '' }));

    empezar(async () => {
      // correrAccion: un fallo de transporte también tiene que deshacer lo optimista.
      const r = await correrAccion(
        () =>
          accionCrearMovimiento({
            empleadoId: tipeado.empleadoId,
            fecha: tipeado.fecha,
            tipo: tipeado.tipo,
            monto: conteo ? undefined : Number(tipeado.monto),
            cantidad: conteo ? Number(tipeado.cantidad) : undefined,
            motivo: tipeado.motivo,
          }, decision),
        'No se pudo confirmar el registro.',
      );
      if (r.ok) {
        // Guardado. Sin id (no debería pasar) se marca igual como resuelta: nunca se deshace ni se
        // devuelve al formulario algo que la base sí guardó, porque volver a registrarlo lo duplica.
        const idReal = r.id ?? tmpId;
        // Si el árbol nuevo ya llegó antes que esta continuación, se quita ahora; si no, la quita
        // el efecto de arriba cuando llegue.
        setProvisorias((ps) =>
          ultimos.current.some((m) => m.id === idReal)
            ? ps.filter((p) => p.id !== tmpId)
            : ps.map((p) => (p.id === tmpId ? { ...p, idReal } : p)),
        );
      } else if (r.codigo === 'PERIODO') {
        // Nada se escribió: se quita la fila provisoria y se pregunta a qué período cargarla.
        setProvisorias((ps) => ps.filter((p) => p.id !== tmpId));
        setMov((actual) => restaurarSiVacio(actual, tipeado));
        const q = await accionEstadoFechaMovimiento(tipeado.empleadoId, tipeado.fecha);
        if (q.ok && q.estado) setPregunta({ tipeado, estado: q.estado });
        else setError(q.error ?? r.error ?? 'Esa fecha está en un período cerrado.');
      } else {
        const plan = planTrasFallo(r);
        setProvisorias((ps) => ps.filter((p) => p.id !== tmpId));
        if (plan.restaurarFormulario) setMov((actual) => restaurarSiVacio(actual, tipeado));
        setError(mensajeIncierto(r, 'No se pudo confirmar el registro.'));
        if (plan.refrescar) router.refresh();
      }
    });
  };

  // Borrar oculta la fila al instante. Si la base corta (p. ej. `CONGELADA`), vuelve a verse. Si
  // sale bien, el id queda en el conjunto sin hacer daño: ya no viene en `movimientos`.
  const borrarMovimiento = (id: string) => {
    setError(null);
    setBorrando((b) => new Set(b).add(id));
    empezar(async () => {
      const r = await correrAccion(() => accionEliminarMovimiento(id), 'No se pudo confirmar el borrado.');
      if (!r.ok) {
        setBorrando((b) => sinId(b, id));
        setError(
          mensajeIncierto(r, 'No se pudo confirmar el borrado.', 'Revise la lista: si la fila sigue ahí, no se borró.'),
        );
        // Si no se sabe si se borró (corte, o error de la base), la lista real lo dice.
        if (planTrasFallo(r).refrescar) router.refresh();
      }
    });
  };

  // Lo provisorio arriba (es lo más nuevo), lo real sin lo que se está borrando. Una provisoria con
  // id real ya no se muestra: la fila de verdad llega en el mismo árbol de la respuesta (o, en la
  // ficha, puede no llegar nunca si su fecha cae fuera del período — y no debe quedar colgada).
  const visibles: Provisoria[] = [
    ...provisorias.filter((p) => !p.idReal),
    ...movimientos.filter((m) => !borrando.has(m.id)),
  ];

  return (
    <div className="space-y-6">
      <Modal
        open={pregunta !== null}
        onClose={() => setPregunta(null)}
        title="Esa fecha ya está cerrada"
        subtitle={pregunta ? `${fechaCorta(pregunta.tipeado.fecha)} · ${pregunta.estado.estado === 'cerrado' ? 'período ya liquidado' : 'sin contrato'}` : undefined}
      >
        {pregunta && (
          <>
            <ModalBody className="space-y-3 text-cuerpo">
              <p>
                Si lo guardas con esa fecha, ninguna liquidación lo tomaría y no se descontaría ni se pagaría.
                ¿A qué período lo cargamos?
              </p>
              {pregunta.estado.siguiente ? (
                <p className="text-muted">
                  Al siguiente período abierto: se carga con fecha {fechaCorta(pregunta.estado.siguiente)} y queda
                  anotada la fecha original.
                </p>
              ) : (
                <p className="text-error-deep">
                  No hay un período siguiente abierto. Crea primero el contrato siguiente
                  {pregunta.estado.estado === 'cerrado' ? ' o anula el cierre.' : '.'}
                </p>
              )}
              {pregunta.estado.estado === 'cerrado' && (
                <p className="text-muted">
                  Anular el cierre reabre la liquidación del {fechaCorta(pregunta.estado.desde ?? '')} al{' '}
                  {fechaCorta(pregunta.estado.hasta ?? '')} para volver a calcularla. No se puede si ya tiene pagos.
                </p>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onClick={() => setPregunta(null)}>Cancelar</Button>
              {pregunta.estado.estado === 'cerrado' && (
                <Button variant="outline" onClick={() => guardarMovimiento(pregunta.tipeado, 'anular_cierre')}>
                  Anular el cierre
                </Button>
              )}
              <Button
                disabled={!pregunta.estado.siguiente}
                onClick={() => guardarMovimiento(pregunta.tipeado, 'siguiente')}
              >
                Cargar al siguiente período
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
      {error && <p className="rounded-r-chico bg-error/10 px-3 py-2 text-cuerpo text-error-deep">{error}</p>}

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

          <p className="text-apoyo text-muted">{ayudaTipo}</p>
          {!conteo && (
            <p className="text-apoyo text-muted">
              El monto va <strong>siempre en positivo</strong>, también en un adelanto o un
              descuento: el signo lo pone la regla, no el dato. Un adelanto tipeado en negativo
              pasaría de descontar S/100 a sumarlos.
            </p>
          )}

          <Button onClick={() => guardarMovimiento()} pending={pendiente} disabled={!mov.empleadoId || !mov.motivo.trim()}>
            <Plus className="h-4 w-4" /> Registrar
          </Button>
        </CardContent>

        <div className="border-t border-line">
          {visibles.length === 0 ? (
            <p className="px-5 py-6 text-center text-cuerpo text-muted">Todavía no hay ninguno.</p>
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
                {visibles.map((m) => (
                  <TR key={m.id} className={m.id.startsWith('tmp-') ? 'opacity-60' : undefined}>
                    <TD className="whitespace-nowrap">{m.fecha}</TD>
                    <TD className="text-navy">{m.empleadoNombre ?? '—'}</TD>
                    <TD>{LABEL_TIPO[m.tipo] ?? m.tipo}</TD>
                    <TD className="text-right tabular-nums">
                      {m.monto == null ? `${m.cantidad} u.` : soles(m.monto)}
                    </TD>
                    <TD className="text-cuerpo text-muted">{m.motivo}</TD>
                    <TD className="text-right">
                      {m.id.startsWith('tmp-') ? (
                        <span className="text-apoyo text-muted">guardando…</span>
                      ) : m.liquidacionId ? (
                        <Badge tone="green">
                          <Lock className="mr-1 inline h-3 w-3" />
                          liquidado
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          onClick={() => borrarMovimiento(m.id)}
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
          <p className="px-5 pb-3 text-cuerpo text-muted">
            Sólo lectura: cargar una venta nueva o asignar un vendedor se hace desde{' '}
            <a className="text-gold-deep underline" href="/sueldos/ventas">
              Ventas y metas
            </a>
            .
          </p>
          <div className="border-t border-line">
            {ventas.length === 0 ? (
              <p className="px-5 py-6 text-center text-cuerpo text-muted">Todavía no hay ninguna.</p>
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
        <p className="text-cuerpo text-muted">
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
