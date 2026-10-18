'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Ban, Calculator, Check, Eye, RefreshCw, Trash2 } from 'lucide-react';
import { finDePeriodo, frecuenciaVigente, type LineaLiquidacion } from '@scilb/core';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input, Label, Select } from '../../../components/ui/form';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui/table';
import { HorasDelPago } from '../../../components/liquidacion/horas-del-pago';
import { detalleHoras } from '../../../lib/horas-del-pago';
import { DialogoConfirmar, useConfirmacion } from '../../../components/ui/confirmar';
import { fraseDeError } from '../../../lib/errores-cierre';
import type { AcuerdoSueldo, EstadoLiquidacion, LiquidacionDetalle, LiquidacionResumen } from '../../../lib/sueldos-repo';
import {
  accionAnular,
  accionCalcular,
  accionConfirmarYCerrar,
  accionCorregirYCerrar,
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

// Una liquidación guardada sin cerrar es interna: en pantalla es «Por cerrar».
const ETIQUETA: Record<EstadoLiquidacion, string> = {
  borrador: 'Por cerrar',
  cerrada: 'Cerrada',
  anulada: 'Anulada',
};

const ETIQUETA_CONTRATO: Record<string, string> = {
  borrador: 'en preparación',
  vigente: 'vigente',
  liquidado: 'liquidado',
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
function Desglose({
  lineas,
  sinRegla = false,
}: {
  lineas: (LineaLiquidacion | { grupo: string; concepto: string; detalle: string; regla: string; monto: number })[];
  /** Pago por horas: sin la columna de reglas (códigos internos). */
  sinRegla?: boolean;
}) {
  const grupos = ['ingreso', 'descuento', 'ajuste', 'final'];
  return (
    <Table>
      <THead>
        <TR>
          <TH>Concepto</TH>
          <TH>De dónde sale</TH>
          {!sinRegla && <TH>Regla</TH>}
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
                <TD colSpan={sinRegla ? 3 : 4} className="bg-paper text-rotulo font-medium uppercase text-muted">
                  {GRUPO_LABEL[g] ?? g}
                </TD>
              </TR>
              {delGrupo.map((l, i) => (
                <TR key={`${g}-${i}`} className={g === 'final' ? 'font-medium text-navy' : undefined}>
                  <TD>{l.concepto}</TD>
                  <TD className="text-cuerpo text-muted">{l.detalle}</TD>
                  {!sinRegla && <TD className="text-apoyo text-muted">{l.regla}</TD>}
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
 * - El «hasta» sale de `finDePeriodo(desde, frecuencia vigente en desde, acuerdo.fechaFin)` — UN tramo de la
 *   frecuencia vigente del contrato (mensual, quincenal, semanal o cada N días) que arranca en `desde`, recortado a `fechaFin` si se
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

  // La frecuencia vigente en `desde` (0120): puede haber cambiado a mitad del contrato.
  const vigente = frecuenciaVigente(acuerdo, acuerdo.cambios, desde);
  const hastaRecortado = finDePeriodo(desde, vigente, acuerdo.fechaFin, vigente.ancla);
  // Si el acuerdo ya está cubierto de punta a punta, el recorte puede dejar `hasta` antes que
  // `desde`: es un contrato ya liquidado por completo, no hay un tramo sano que sugerir. Se evita
  // mostrar un rango invertido por defecto; el administrador de todas formas puede editarlo.
  const hasta = hastaRecortado < desde ? desde : hastaRecortado;

  return { desde, hasta };
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div>
      <p className="text-apoyo text-muted">{etiqueta}</p>
      <p className="tabular-nums text-navy">{valor}</p>
    </div>
  );
}

export function LiquidacionesCliente({
  acuerdos,
  liquidaciones,
  acuerdoInicial,
}: {
  acuerdos: AcuerdoSueldo[];
  liquidaciones: LiquidacionResumen[];
  /** Contrato pedido por la URL (`?acuerdo=`, p.ej. desde una notificación). Si no existe, el primero. */
  acuerdoInicial?: string;
}) {
  const router = useRouter();
  const inicial = acuerdos.find((a) => a.id === acuerdoInicial) ?? acuerdos[0];
  const [acuerdoId, setAcuerdoId] = useState(inicial?.id ?? '');
  // C-4 (liquidación por tramos): el rango que se va a liquidar, con una sugerencia calculada al
  // elegir el contrato. Editable sin más restricción que la que ya impone la RPC/el trigger.
  const [rango, setRango] = useState(() => sugerirRango(inicial, liquidaciones));
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
  const [pendiente, empezar] = useTransition();
  const conf = useConfirmacion();

  const fallo = (r: { error?: string; codigo?: string }) => {
    setError(fraseDeError(r));
  };
  const limpiar = () => {
    setError(null);
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

  // «Confirmar y cerrar»: un solo paso. El servidor vuelve a calcular el rango, lo guarda y lo cierra.
  const confirmar = (contrato: string, desde: string, hasta: string) => {
    limpiar();
    empezar(async () => {
      const r = await accionConfirmarYCerrar(contrato, desde, hasta);
      if (r.ok) {
        setPreview(null);
        router.refresh();
      } else fallo(r);
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
      titulo: '¿Descartar este cálculo?',
      detalle: 'No deja rastro: todavía no se cerró ni se pagó nada. El período se puede volver a calcular.',
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
   * «Corregir» en un solo paso (decisión del dueño n.º 7): anula la liquidación cerrada, con motivo,
   * y cierra la nueva calculada con los datos de hoy. Lo ya abonado se conserva. Si el cierre falla,
   * el pago queda «Por cerrar» y el mensaje dice qué resolver; «Confirmar y cerrar» lo termina.
   */
  const corregir = () => {
    if (!corrigiendo) return;
    setErrorCorregir(null);
    empezar(async () => {
      const r = await accionCorregirYCerrar(corrigiendo.id, motivoCorregir);
      if (r.ok && r.datos) {
        cerrarModalCorregir();
        router.refresh();
        const d = await accionVerDetalle(r.datos.id);
        if (d.ok && d.datos) setDetalle(d.datos);
        return;
      }
      setErrorCorregir(fraseDeError(r));
      router.refresh();
    });
  };

  const liq = preview?.liquidacion;
  // Pago por horas: las tres filas y el día por día. Null = sueldo fijo, todo como siempre.
  const horasPreview = liq
    ? detalleHoras({ modo: liq.modo, asistencia: liq.asistencia, referencia: liq.base.referencia, dias: liq.dias, lineas: liq.lineas })
    : null;
  const horasDetalle = detalle
    ? detalleHoras({
        modo: detalle.resultado.modo,
        asistencia: detalle.resultado.asistencia,
        referencia: detalle.resultado.base?.referencia,
        dias: detalle.resultado.dias,
        lineas: detalle.lineas.length > 0 ? detalle.lineas : detalle.resultado.lineas,
      })
    : null;

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
                  {a.empleadoNombre ?? 'Sin nombre'} · {a.fechaInicio} → {a.fechaFin} ({ETIQUETA_CONTRATO[a.estado] ?? a.estado})
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
        <div className="mb-5 rounded-r-chico bg-error/10 px-4 py-3 text-cuerpo text-error-deep">
          <p>{error}</p>
        </div>
      )}

      {/* ── Vista previa ─────────────────────────────────────────────────────────────────── */}
      {liq && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>El cálculo — todavía no se cerró</CardTitle>
            <Button
              onClick={() => confirmar(acuerdoId, rango.desde, rango.hasta)}
              pending={pendiente}
              // F-5: sólo se cierra el rango que de verdad se calculó. Sin este guard, cambiar
              // Desde/Hasta después de "Calcular" (sin volver a apretarlo) cerraba un período que
              // nadie vio en pantalla.
              disabled={
                !preview ||
                preview.entrada.fechaInicio !== rango.desde ||
                preview.entrada.fechaFin !== rango.hasta
              }
            >
              <Check className="h-4 w-4" /> Confirmar y cerrar
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <Dato etiqueta="Días del periodo" valor={liq.periodo.dias} />
              {horasPreview ? (
                <Dato etiqueta="Tarifa por hora" valor={soles(liq.base.tarifaHora ?? liq.base.valorPorHora)} />
              ) : (
                <>
                  <Dato etiqueta="Horas contratadas" valor={liq.base.horasContratadas.toFixed(2)} />
                  <Dato etiqueta="Horas trabajadas" valor={liq.asistencia.horasTrabajadas.toFixed(2)} />
                  <Dato etiqueta="Valor de la hora" valor={soles(liq.base.valorPorHora)} />
                </>
              )}
              <Dato etiqueta="Tardanzas" valor={`${liq.asistencia.tardanzas} (${liq.asistencia.tardanzasInjustificadas} cobradas)`} />
              <Dato etiqueta="Faltas" valor={`${liq.asistencia.faltas} (${liq.asistencia.faltasInjustificadas} sin justificar)`} />
              <Dato etiqueta="Ventas" valor={soles(liq.ventas.total)} />
              <Dato etiqueta="Meta del periodo" valor={soles(liq.ventas.metaPeriodo)} />
              <Dato
                etiqueta="Semanas cumplidas"
                valor={`${liq.ventas.semanasCumplidas} de ${liq.ventas.semanas.length}`}
              />
              <Dato etiqueta="Almuerzos a pagar" valor={liq.asistencia.almuerzosAPagar} />
              {!horasPreview && (
                <Dato etiqueta="Horas fuera de contrato" valor={liq.asistencia.horasFueraDeContrato.toFixed(2)} />
              )}
              <Dato etiqueta="Total" valor={soles(liq.total)} />
            </div>

            {horasPreview && <HorasDelPago h={horasPreview} />}

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
                      className="mb-4 rounded-r-chico border border-error-line bg-error-soft px-4 py-3 text-cuerpo text-error-deep"
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
                    <div role="status" className="rounded-r-chico bg-aviso/10 px-3 py-2">
                      {otrasAdvertencias.map((a) => (
                        <p key={a} className="flex gap-2 text-cuerpo text-aviso-deep">
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
            <Desglose lineas={liq.lineas} sinRegla={Boolean(horasPreview)} />
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
            <p className="px-5 py-8 text-center text-cuerpo text-muted">
              Todavía no hay ninguna. Elige un contrato, mira el cálculo y confirma para cerrarlo.
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
                      <Badge tone={TONO[l.estado]}>{ETIQUETA[l.estado]}</Badge>
                      {l.anuladaMotivo && (
                        <span className="ml-2 text-apoyo text-muted">{l.anuladaMotivo}</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">{soles(l.total)}</TD>
                    <TD className="text-apoyo text-muted">{l.motorVersion}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => verDetalle(l.id)} aria-label="Ver el desglose">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {l.estado === 'borrador' && (
                          <>
                            <Button
                              variant="outline"
                              onClick={() => confirmar(l.acuerdoId, l.periodoDesde, l.periodoHasta)}
                              pending={pendiente}
                            >
                              <Check className="h-4 w-4" /> Confirmar y cerrar
                            </Button>
                            <Button variant="ghost" onClick={() => descartar(l)} aria-label="Descartar">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {l.estado === 'cerrada' && (
                          <>
                            {/* Sólo cerradas: un borrador todavía puede cambiar, y un papel
                                impreso de algo que después cambia es el problema del Excel. */}
                            <a
                              className="self-center text-cuerpo text-gold-deep underline"
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
            ? `${detalle.periodoDesde} → ${detalle.periodoHasta} · ${ETIQUETA[detalle.estado]} · motor ${detalle.motorVersion}`
            : ''
        }
        size="lg"
      >
        <ModalBody>
          {detalle && (
            <>
              <p className="mb-3 text-apoyo text-muted">
                Esto es el desglose tal como se emitió. No se recalcula al abrirlo: si mañana cambia
                un parámetro de Configuración, este recibo sigue diciendo lo mismo.
              </p>
              {horasDetalle && (
                <div className="mb-3">
                  <HorasDelPago h={horasDetalle} />
                </div>
              )}
              <Desglose
                lineas={detalle.lineas.length > 0 ? detalle.lineas : detalle.resultado.lineas}
                sinRegla={Boolean(horasDetalle)}
              />
              {detalle.resultado.advertencias.length > 0 && (
                <div className="mt-3 rounded-r-chico bg-aviso/10 px-3 py-2">
                  {detalle.resultado.advertencias.map((a) => (
                    <p key={a} className="text-cuerpo text-aviso-deep">
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
          <p className="mt-2 text-apoyo text-muted">
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
        subtitle="Anula esta liquidación y cierra otra para el mismo contrato y el mismo período, recalculada con los datos de hoy. Lo ya abonado se conserva."
      >
        <ModalBody>
          {errorCorregir && (
            <div role="alert" className="mb-3 rounded-r-chico bg-error/10 px-3 py-2 text-cuerpo text-error-deep">
              {errorCorregir}
            </div>
          )}
          <p className="mb-3 text-apoyo text-muted">
            Una liquidación cerrada no se edita: corregir es esto — anularla, con motivo, y volver a
            cerrarla de nuevo desde cero. Las dos quedan en la lista, con el rastro completo.
          </p>
          <Label htmlFor="motivo-corregir">Motivo de la corrección</Label>
          <Input
            id="motivo-corregir"
            value={motivoCorregir}
            onChange={(e) => setMotivoCorregir(e.target.value)}
            placeholder="Qué estaba mal en esta liquidación…"
          />
          <p className="mt-2 text-apoyo text-muted">
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
