'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Ban, Calculator, Eye, Lock, RefreshCw, Save, Trash2 } from 'lucide-react';
import { finDePeriodo, type LineaLiquidacion } from '@scilb/core';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input, Label, Select } from '../../../components/ui/form';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui/table';
import { DialogoConfirmar, useConfirmacion } from '../../../components/ui/confirmar';
import type { AcuerdoSueldo, EstadoLiquidacion, LiquidacionDetalle, LiquidacionResumen } from '../../../lib/sueldos-repo';
import {
  accionAnular,
  accionCalcular,
  accionCerrar,
  accionCorregir,
  accionCrearBorrador,
  accionEliminarBorrador,
  accionVerDetalle,
  type Preview,
} from './actions';

const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TONO: Record<EstadoLiquidacion, 'gray' | 'green' | 'red'> = {
  borrador: 'gray',
  cerrada: 'green',
  anulada: 'red',
};

const GRUPO_LABEL: Record<string, string> = {
  ingreso: 'Ingresos',
  descuento: 'Descuentos',
  ajuste: 'Ajustes',
  // F3 (validador de flujo 23-ago-2026): el grupo trae tardanzas, reportes y bonos además del
  // total — "Total" a secas prometía una sola cifra donde hay varias líneas.
  final: 'Cierre y total',
};

/** El desglose, agrupado como lo lee una persona: primero lo que suma, después lo que resta. */
function Desglose({ lineas }: { lineas: (LineaLiquidacion | { grupo: string; concepto: string; detalle: string; regla: string; monto: number })[] }) {
  const grupos = ['ingreso', 'descuento', 'ajuste', 'final'];
  return (
    <Table>
      <THead>
        <TR>
          <TH>Concepto</TH>
          <TH>De dónde sale</TH>
          <TH>Regla</TH>
          <TH className="text-right">Monto</TH>
        </TR>
      </THead>
      <TBody>
        {grupos.map((g) => {
          const delGrupo = lineas.filter((l) => l.grupo === g);
          if (delGrupo.length === 0) return null;
          return (
            // Fragment CON key: el `<>` corto no acepta key, y sin ella React avisa en consola por
            // cada grupo. Envolver en <tbody> no sirve: rompería el <table>.
            <Fragment key={g}>
              <TR>
                <TD colSpan={4} className="bg-paper text-xs font-medium uppercase tracking-wide text-muted">
                  {GRUPO_LABEL[g] ?? g}
                </TD>
              </TR>
              {delGrupo.map((l, i) => (
                <TR key={`${g}-${i}`} className={g === 'final' ? 'font-medium text-navy' : undefined}>
                  <TD>{l.concepto}</TD>
                  <TD className="text-sm text-muted">{l.detalle}</TD>
                  <TD className="text-xs text-muted">{l.regla}</TD>
                  <TD className={`text-right tabular-nums ${l.monto < 0 ? 'text-error-deep' : ''}`}>
                    {soles(l.monto)}
                  </TD>
                </TR>
              ))}
            </Fragment>
          );
        })}
      </TBody>
    </Table>
  );
}

// El día siguiente a 'YYYY-MM-DD'. Aritmética en UTC para que la zona del proceso no la corra —
// mismo patrón que `diaSiguiente()` de lib/colaboradores-repo.ts, duplicado acá a propósito: ese
// archivo es de servidor (importa getServerClient) y no se puede traer a un componente cliente.
const diaSiguiente = (dia: string): string =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * La sugerencia de rango al elegir un contrato (spec liquidación-por-tramos, C-4). No es una regla
 * de negocio: es un punto de partida editable, el administrador puede pisar cualquiera de las dos
 * fechas.
 *
 * - Si el acuerdo ya tiene liquidaciones no anuladas, sugiere desde el día siguiente al
 *   `periodoHasta` más reciente de ellas.
 * - Si no tiene ninguna, sugiere desde `fechaInicio` del acuerdo.
 * - El «hasta» sale de `finDePeriodo(desde, acuerdo.modalidad, acuerdo.fechaFin)` — UN tramo de la
 *   modalidad del contrato (mensual o semanal) que arranca en `desde`, recortado a `fechaFin` si se
 *   pasara del final. Addendum F-1/F-1b (revisión adversarial, 24-ago-2026): acá ANTES se usaba
 *   `calcularCiclo(desde, hoyPeru())`, que contesta "¿qué ciclo contiene HOY?" y no "qué período
 *   arranca en `desde`" — con un acuerdo vencido sugería el acuerdo ENTERO como un solo tramo, y
 *   nunca miraba `modalidad` (una `semanal` recibía una sugerencia de un mes).
 */
function sugerirRango(
  acuerdo: AcuerdoSueldo | undefined,
  liquidaciones: LiquidacionResumen[],
): { desde: string; hasta: string } {
  if (!acuerdo) return { desde: '', hasta: '' };

  const noAnuladas = liquidaciones.filter((l) => l.acuerdoId === acuerdo.id && l.estado !== 'anulada');
  const ultimaHasta = noAnuladas.reduce<string | null>(
    (max, l) => (max === null || l.periodoHasta > max ? l.periodoHasta : max),
    null,
  );
  const desde = ultimaHasta ? diaSiguiente(ultimaHasta) : acuerdo.fechaInicio;

  const hastaRecortado = finDePeriodo(desde, acuerdo.modalidad, acuerdo.fechaFin);
  // Si el acuerdo ya está cubierto de punta a punta, el recorte puede dejar `hasta` antes que
  // `desde`: es un contrato ya liquidado por completo, no hay un tramo sano que sugerir. Se evita
  // mostrar un rango invertido por defecto; el administrador de todas formas puede editarlo.
  const hasta = hastaRecortado < desde ? desde : hastaRecortado;

  return { desde, hasta };
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div>
      <p className="text-xs text-muted">{etiqueta}</p>
      <p className="tabular-nums text-navy">{valor}</p>
    </div>
  );
}

export function LiquidacionesCliente({
  acuerdos,
  liquidaciones,
}: {
  acuerdos: AcuerdoSueldo[];
  liquidaciones: LiquidacionResumen[];
}) {
  const router = useRouter();
  const [acuerdoId, setAcuerdoId] = useState(acuerdos[0]?.id ?? '');
  // C-4 (liquidación por tramos): el rango que se va a liquidar, con una sugerencia calculada al
  // elegir el contrato. Editable sin más restricción que la que ya impone la RPC/el trigger.
  const [rango, setRango] = useState(() => sugerirRango(acuerdos[0], liquidaciones));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [detalle, setDetalle] = useState<LiquidacionDetalle | null>(null);
  const [anulando, setAnulando] = useState<LiquidacionResumen | null>(null);
  const [motivo, setMotivo] = useState('');
  // «Corregir esta liquidación» (spec 2026-08-25-reunion-admin-hoja-de-ruta.md §3.1): estado propio,
  // deliberadamente separado del de anular — son dos modales distintos y no deben cruzarse el
  // motivo ni el error de uno con el del otro.
  const [corrigiendo, setCorrigiendo] = useState<LiquidacionResumen | null>(null);
  const [motivoCorregir, setMotivoCorregir] = useState('');
  // El modal es una superposición de pantalla completa (components/ui/modal.tsx): mientras está
  // abierto, el banner de error de arriba de la página queda tapado por el overlay. Si "corregir"
  // falla ANTES de anular (nada se escribió todavía) el modal se queda abierto para reintentar, así
  // que ese error necesita mostrarse ACÁ adentro — error/codigo (el banner de arriba) es para
  // cuando el modal ya se cerró.
  const [errorCorregir, setErrorCorregir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const conf = useConfirmacion();

  const fallo = (r: { error?: string; codigo?: string }) => {
    setError(r.error ?? 'Error desconocido.');
    setCodigo(r.codigo ?? null);
  };
  const limpiar = () => {
    setError(null);
    setCodigo(null);
  };

  const elegirAcuerdo = (id: string) => {
    setAcuerdoId(id);
    setPreview(null);
    limpiar();
    setRango(sugerirRango(acuerdos.find((a) => a.id === id), liquidaciones));
  };

  const calcular = () => {
    limpiar();
    setPreview(null);
    empezar(async () => {
      const r = await accionCalcular(acuerdoId, rango.desde, rango.hasta);
      if (r.ok && r.datos) setPreview(r.datos);
      else fallo(r);
    });
  };

  const guardarBorrador = () => {
    limpiar();
    empezar(async () => {
      const r = await accionCrearBorrador(acuerdoId, rango.desde, rango.hasta);
      if (r.ok) {
        setPreview(null);
        router.refresh();
      } else fallo(r);
    });
  };

  const cerrar = (l: LiquidacionResumen) => {
    // El monto va en el TÍTULO, no enterrado en el cuerpo: es el dato que hay que mirar antes de
    // sellar algo que no se puede modificar. El confirm nativo lo dejaba en la segunda línea de un
    // párrafo con saltos de línea.
    conf.pedir({
      titulo: `¿Cerrar la liquidación de ${l.empleadoNombre ?? 'esta persona'} por ${soles(l.total)}?`,
      detalle:
        'Una vez cerrada no se puede modificar. Sólo se puede anular, con motivo, y eso queda registrado.',
      confirmarLabel: 'Cerrar liquidación',
      alConfirmar: () => {
        limpiar();
        empezar(async () => {
          const r = await accionCerrar(l.id);
          if (r.ok) {
            conf.cerrar();
            router.refresh();
          } else fallo(r);
        });
      },
    });
  };

  const verDetalle = (id: string) => {
    limpiar();
    empezar(async () => {
      const r = await accionVerDetalle(id);
      if (r.ok && r.datos) setDetalle(r.datos);
      else fallo(r);
    });
  };

  const descartar = (l: LiquidacionResumen) => {
    conf.pedir({
      titulo: '¿Descartar este borrador?',
      detalle: 'No deja rastro: todavía no se pagó nada. El período se puede volver a calcular.',
      confirmarLabel: 'Descartar',
      tono: 'aviso',
      alConfirmar: () => {
        limpiar();
        empezar(async () => {
          const r = await accionEliminarBorrador(l.id);
          if (r.ok) {
            conf.cerrar();
            router.refresh();
          } else fallo(r);
        });
      },
    });
  };

  const anular = () => {
    if (!anulando) return;
    limpiar();
    empezar(async () => {
      const r = await accionAnular(anulando.id, motivo);
      if (r.ok) {
        setAnulando(null);
        setMotivo('');
        router.refresh();
      } else fallo(r);
    });
  };

  const abrirCorregir = (l: LiquidacionResumen) => {
    setErrorCorregir(null);
    setMotivoCorregir('');
    setCorrigiendo(l);
  };

  const cerrarModalCorregir = () => {
    setCorrigiendo(null);
    setMotivoCorregir('');
    setErrorCorregir(null);
  };

  /**
   * Anula la liquidación cerrada y crea, en el mismo paso, el borrador de reemplazo (spec
   * 2026-08-25-reunion-admin-hoja-de-ruta.md §3.1). Tres desenlaces, no dos:
   *
   * 1. Sale bien: se cierra el modal, se refresca la lista y se deja al administrador parado en el
   *    borrador nuevo (el mismo modal de "Ver el desglose" que ya existe), listo para revisar y
   *    cerrar.
   * 2. Falla ANTES de anular (nada se escribió): el modal se queda abierto, como ya hace "Anular",
   *    y el error se muestra adentro — reintentar tiene sentido acá.
   * 3. Anula y el borrador nuevo NO se pudo crear (`r.parcial`): la anulación ya quedó firme y no
   *    hay forma de deshacerla, así que reintentar ACÁ no tiene sentido — el modal se cierra, se
   *    refresca la lista para que la anulación se vea en el acto, y el contrato + período exactos
   *    quedan cargados arriba, en el selector de "Calcular", que es el camino de vuelta.
   */
  const corregir = () => {
    if (!corrigiendo) return;
    setErrorCorregir(null);
    empezar(async () => {
      const r = await accionCorregir(corrigiendo.id, motivoCorregir);

      if (r.ok && r.nuevoBorradorId) {
        cerrarModalCorregir();
        router.refresh();
        const d = await accionVerDetalle(r.nuevoBorradorId);
        if (d.ok && d.datos) setDetalle(d.datos);
        return;
      }

      if (r.parcial) {
        cerrarModalCorregir();
        router.refresh();
        if (r.acuerdoId) setAcuerdoId(r.acuerdoId);
        if (r.periodoDesde && r.periodoHasta) setRango({ desde: r.periodoDesde, hasta: r.periodoHasta });
        setPreview(null);
        setError(r.error ?? 'Error desconocido.');
        setCodigo('PARCIAL');
        return;
      }

      setErrorCorregir(r.error ?? 'Error desconocido.');
    });
  };

  const liq = preview?.liquidacion;

  return (
    <>
      <DialogoConfirmar {...conf.props} pending={pendiente} error={error ?? undefined} />
      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="min-w-[20rem] flex-1">
            <Label htmlFor="acuerdo">Contrato a liquidar</Label>
            <Select id="acuerdo" value={acuerdoId} onChange={(e) => elegirAcuerdo(e.target.value)}>
              {acuerdos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.empleadoNombre ?? 'Sin nombre'} · {a.fechaInicio} → {a.fechaFin} ({a.estado})
                </option>
              ))}
            </Select>
          </div>
          {/* C-4 (liquidación por tramos): un acuerdo largo se liquida tramo por tramo — el admin
              elige el rango de esta vez, con una sugerencia (día siguiente a la última liquidación
              no anulada del acuerdo, o el inicio del contrato si es la primera) que puede pisar. */}
          <div className="w-40">
            <Label htmlFor="rango-desde">Desde</Label>
            <Input
              id="rango-desde"
              type="date"
              value={rango.desde}
              onChange={(e) => {
                // F-5 (addendum, revisión adversarial 24-ago-2026): cambiar la fecha invalida el
                // preview ya calculado — si no, se podía calcular julio, estirar "Hasta" hasta
                // agosto sin recalcular, y guardar un borrador de un período que nadie vio en
                // pantalla. Mismo patrón que ya usa elegirAcuerdo().
                setRango((r) => ({ ...r, desde: e.target.value }));
                setPreview(null);
              }}
            />
          </div>
          <div className="w-40">
            <Label htmlFor="rango-hasta">Hasta</Label>
            <Input
              id="rango-hasta"
              type="date"
              value={rango.hasta}
              onChange={(e) => {
                setRango((r) => ({ ...r, hasta: e.target.value }));
                setPreview(null);
              }}
            />
          </div>
          <Button onClick={calcular} pending={pendiente} disabled={!acuerdoId || !rango.desde || !rango.hasta}>
            <Calculator className="h-4 w-4" /> Calcular
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="mb-5 rounded-md bg-error/10 px-4 py-3 text-sm text-error-deep">
          <p>{error}</p>
          {codigo === 'DATO' && (
            <p className="mt-1 text-xs">
              Faltan días por declarar. Andá a <strong>Declarar asistencia</strong> y decí qué pasó
              cada uno de esos días — un día sin dato no es una falta.
            </p>
          )}
          {codigo === 'DESACTUALIZADA' && (
            <p className="mt-1 text-xs">
              Se cargó algo después de calcular. Descartá el borrador, volvé a calcular y cerrá de
              nuevo: si no, esa fila quedaría sellada sin estar en el pago.
            </p>
          )}
          {codigo === 'PARCIAL' && (
            <p className="mt-1 text-xs font-medium">
              La anulación SÍ se aplicó — ya figura como «anulada» en la lista de abajo, con el
              motivo que pusiste. El contrato y el período quedaron cargados arriba: apretá{' '}
              <strong>Calcular</strong> y, si el número es el que esperás, <strong>Guardar
              borrador</strong>.
            </p>
          )}
        </div>
      )}

      {/* ── Vista previa ─────────────────────────────────────────────────────────────────── */}
      {liq && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Vista previa — nada guardado todavía</CardTitle>
            <Button
              onClick={guardarBorrador}
              pending={pendiente}
              // F-5: sólo se guarda el rango que de verdad se calculó. Sin este guard, cambiar
              // Desde/Hasta después de "Calcular" (sin volver a apretarlo) guardaba un período que
              // nadie vio en pantalla.
              disabled={
                !preview ||
                preview.entrada.fechaInicio !== rango.desde ||
                preview.entrada.fechaFin !== rango.hasta
              }
            >
              <Save className="h-4 w-4" /> Guardar borrador
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <Dato etiqueta="Días del periodo" valor={liq.periodo.dias} />
              <Dato etiqueta="Horas contratadas" valor={liq.base.horasContratadas.toFixed(2)} />
              <Dato etiqueta="Horas trabajadas" valor={liq.asistencia.horasTrabajadas.toFixed(2)} />
              <Dato etiqueta="Valor de la hora" valor={soles(liq.base.valorPorHora)} />
              <Dato etiqueta="Tardanzas" valor={`${liq.asistencia.tardanzas} (${liq.asistencia.tardanzasInjustificadas} cobradas)`} />
              <Dato etiqueta="Faltas" valor={`${liq.asistencia.faltas} (${liq.asistencia.faltasInjustificadas} sin justificar)`} />
              <Dato etiqueta="Ventas" valor={soles(liq.ventas.total)} />
              <Dato etiqueta="Meta del periodo" valor={soles(liq.ventas.metaPeriodo)} />
              <Dato
                etiqueta="Semanas cumplidas"
                valor={`${liq.ventas.semanasCumplidas} de ${liq.ventas.semanas.length}`}
              />
              <Dato etiqueta="Almuerzos a pagar" valor={liq.asistencia.almuerzosAPagar} />
              <Dato etiqueta="Horas fuera de contrato" valor={liq.asistencia.horasFueraDeContrato.toFixed(2)} />
              <Dato etiqueta="Total" valor={soles(liq.total)} />
            </div>

            {(() => {
              const sinVentas = liq.advertencias.some((a) =>
                a.includes('No hay ninguna venta registrada'),
              );
              const otrasAdvertencias = liq.advertencias.filter(
                (a) => !a.includes('No hay ninguna venta registrada'),
              );

              return (
                <>
                  {sinVentas && (
                    <div
                      role="alert"
                      className="mb-4 rounded-lg border border-error-line bg-error-soft px-4 py-3 text-sm text-error-deep"
                    >
                      <p className="font-medium">Este período no tiene ninguna venta cargada.</p>
                      <p className="mt-1">
                        Sin ventas no hay bono de meta semanal ni comisión. Si todavía no las
                        transcribiste desde tuxedo, cárgalas en{' '}
                        <a
                          className="underline"
                          href={
                            // F2 (validador de flujo 23-ago-2026), actualizado para C-4 (liquidación
                            // por tramos): el período del TRAMO que se está calculando ahora mismo
                            // —no el del acuerdo completo—, para que "cárgalas en Ventas y metas" lo
                            // lleve exacto y no a un rango más amplio que el que va a pagar.
                            preview
                              ? `/sueldos/ventas?desde=${preview.entrada.fechaInicio}&hasta=${preview.entrada.fechaFin}`
                              : '/sueldos/ventas'
                          }
                        >
                          Ventas y metas
                        </a>{' '}
                        antes de cerrar.
                      </p>
                    </div>
                  )}
                  {otrasAdvertencias.length > 0 && (
                    <div role="status" className="rounded-md bg-aviso/10 px-3 py-2">
                      {otrasAdvertencias.map((a) => (
                        <p key={a} className="flex gap-2 text-sm text-aviso-deep">
                          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                          {a}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </CardContent>
          <div className="border-t border-line">
            <Desglose lineas={liq.lineas} />
          </div>
        </Card>
      )}

      {/* ── Emitidas ─────────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Liquidaciones</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {liquidaciones.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              Todavía no se guardó ninguna. Calculá un contrato y guardá el borrador.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Persona</TH>
                  <TH>Periodo</TH>
                  <TH>Estado</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Motor</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {liquidaciones.map((l) => (
                  <TR key={l.id}>
                    <TD className="font-medium text-navy">{l.empleadoNombre ?? '—'}</TD>
                    <TD>
                      {l.periodoDesde} → {l.periodoHasta}
                    </TD>
                    <TD>
                      <Badge tone={TONO[l.estado]}>{l.estado}</Badge>
                      {l.anuladaMotivo && (
                        <span className="ml-2 text-xs text-muted">{l.anuladaMotivo}</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">{soles(l.total)}</TD>
                    <TD className="text-xs text-muted">{l.motorVersion}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => verDetalle(l.id)} aria-label="Ver el desglose">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {l.estado === 'borrador' && (
                          <>
                            <Button variant="outline" onClick={() => cerrar(l)} pending={pendiente}>
                              <Lock className="h-4 w-4" /> Cerrar
                            </Button>
                            <Button variant="ghost" onClick={() => descartar(l)} aria-label="Descartar el borrador">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {l.estado === 'cerrada' && (
                          <>
                            {/* Sólo cerradas: un borrador todavía puede cambiar, y un papel
                                impreso de algo que después cambia es el problema del Excel. */}
                            <a
                              className="self-center text-sm text-gold-deep underline"
                              href={`/sueldos/liquidaciones/${l.id}/comprobante`}
                            >
                              Resumen
                            </a>
                            {/* «Corregir esta liquidación» (spec 2026-08-25-reunion-admin-hoja-de-
                                ruta.md §3.1, D-1): no es editar la cerrada — es anular + reemitir en
                                un solo paso, el mismo camino que ya existe hecho evidente. Con texto
                                visible, no sólo ícono: es una acción poco común y no debe
                                confundirse con "Anular" a secas. */}
                            <Button variant="outline" onClick={() => abrirCorregir(l)}>
                              <RefreshCw className="h-4 w-4" /> Corregir
                            </Button>
                            <Button variant="ghost" onClick={() => setAnulando(l)} aria-label="Anular">
                              <Ban className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Detalle congelado ────────────────────────────────────────────────────────────── */}
      <Modal
        open={detalle != null}
        onClose={() => setDetalle(null)}
        title={detalle ? `${detalle.empleadoNombre ?? 'Sin nombre'} · ${soles(detalle.total)}` : ''}
        subtitle={
          detalle
            ? `${detalle.periodoDesde} → ${detalle.periodoHasta} · ${detalle.estado} · motor ${detalle.motorVersion}`
            : ''
        }
        size="lg"
      >
        <ModalBody>
          {detalle && (
            <>
              <p className="mb-3 text-xs text-muted">
                Esto es el desglose tal como se emitió. No se recalcula al abrirlo: si mañana cambia
                un parámetro de Configuración, este recibo sigue diciendo lo mismo.
              </p>
              <Desglose lineas={detalle.lineas.length > 0 ? detalle.lineas : detalle.resultado.lineas} />
              {detalle.resultado.advertencias.length > 0 && (
                <div className="mt-3 rounded-md bg-aviso/10 px-3 py-2">
                  {detalle.resultado.advertencias.map((a) => (
                    <p key={a} className="text-sm text-aviso-deep">
                      {a}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setDetalle(null)}>
            Cerrar
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── Anulación ────────────────────────────────────────────────────────────────────── */}
      <Modal
        open={anulando != null}
        onClose={() => setAnulando(null)}
        title="Anular la liquidación"
        subtitle="No se borra: queda el rastro. Los adelantos y las ventas que había consumido vuelven a quedar libres."
      >
        <ModalBody>
          <Label htmlFor="motivo">Motivo de la anulación</Label>
          <Input
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué se anula este pago…"
          />
          <p className="mt-2 text-xs text-muted">
            Es obligatorio. Sin motivo se pierde por qué se anuló un pago ya emitido.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setAnulando(null)}>
            Cancelar
          </Button>
          <Button onClick={anular} pending={pendiente} disabled={motivo.trim().length === 0}>
            Anular
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── Corrección: anula y vuelve a emitir en un solo paso (spec 2026-08-25 §3.1) ─────────── */}
      <Modal
        open={corrigiendo != null}
        onClose={cerrarModalCorregir}
        title="Corregir esta liquidación"
        subtitle="Anula esta liquidación y crea, en el momento, un borrador nuevo para el mismo contrato y el mismo período — recalculado con los datos de hoy."
      >
        <ModalBody>
          {errorCorregir && (
            <div role="alert" className="mb-3 rounded-md bg-error/10 px-3 py-2 text-sm text-error-deep">
              {errorCorregir}
            </div>
          )}
          <p className="mb-3 text-xs text-muted">
            Una liquidación cerrada no se edita: corregir es esto — anularla, con motivo, y volver a
            emitirla desde cero. Las dos quedan en la lista, con el rastro completo.
          </p>
          <Label htmlFor="motivo-corregir">Motivo de la corrección</Label>
          <Input
            id="motivo-corregir"
            value={motivoCorregir}
            onChange={(e) => setMotivoCorregir(e.target.value)}
            placeholder="Qué estaba mal en esta liquidación…"
          />
          <p className="mt-2 text-xs text-muted">
            Es el motivo con el que queda anulada la liquidación actual. Sin él no se puede continuar.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={cerrarModalCorregir}>
            Cancelar
          </Button>
          <Button onClick={corregir} pending={pendiente} disabled={motivoCorregir.trim().length === 0}>
            <RefreshCw className="h-4 w-4" /> Corregir
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
