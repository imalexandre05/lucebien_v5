'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Ban, Calculator, Eye, Lock, Save, Trash2 } from 'lucide-react';
import type { LineaLiquidacion } from '@scilb/core';
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
  final: 'Total',
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
  const [preview, setPreview] = useState<Preview | null>(null);
  const [detalle, setDetalle] = useState<LiquidacionDetalle | null>(null);
  const [anulando, setAnulando] = useState<LiquidacionResumen | null>(null);
  const [motivo, setMotivo] = useState('');
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

  const calcular = () => {
    limpiar();
    setPreview(null);
    empezar(async () => {
      const r = await accionCalcular(acuerdoId);
      if (r.ok && r.datos) setPreview(r.datos);
      else fallo(r);
    });
  };

  const guardarBorrador = () => {
    limpiar();
    empezar(async () => {
      const r = await accionCrearBorrador(acuerdoId);
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

  const liq = preview?.liquidacion;

  return (
    <>
      <DialogoConfirmar {...conf.props} pending={pendiente} error={error ?? undefined} />
      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="min-w-[20rem] flex-1">
            <Label htmlFor="acuerdo">Contrato a liquidar</Label>
            <Select id="acuerdo" value={acuerdoId} onChange={(e) => setAcuerdoId(e.target.value)}>
              {acuerdos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.empleadoNombre ?? 'Sin nombre'} · {a.fechaInicio} → {a.fechaFin} ({a.estado})
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={calcular} pending={pendiente} disabled={!acuerdoId}>
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
        </div>
      )}

      {/* ── Vista previa ─────────────────────────────────────────────────────────────────── */}
      {liq && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Vista previa — nada guardado todavía</CardTitle>
            <Button onClick={guardarBorrador} pending={pendiente}>
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

            {liq.advertencias.length > 0 && (
              <div className="rounded-md bg-aviso/10 px-3 py-2">
                {liq.advertencias.map((a) => (
                  <p key={a} className="flex gap-2 text-sm text-aviso-deep">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                    {a}
                  </p>
                ))}
              </div>
            )}
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
                          <Button variant="ghost" onClick={() => setAnulando(l)} aria-label="Anular">
                            <Ban className="h-4 w-4" />
                          </Button>
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
    </>
  );
}
