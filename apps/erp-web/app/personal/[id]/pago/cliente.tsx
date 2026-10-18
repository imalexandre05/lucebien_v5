'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Ban, Wallet } from 'lucide-react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Aviso, Input, Label } from '../../../../components/ui/form';
import { DialogoConfirmar, useConfirmacion } from '../../../../components/ui/confirmar';
import { Modal, ModalBody, ModalFooter } from '../../../../components/ui/modal';
import { OpcionBotones } from '../../../../components/ui/opcion-botones';
import { Table, TBody, TD, TH, THead, TR } from '../../../../components/ui/table';
import { cn } from '../../../../lib/cn';
import { hoyPeru } from '../../../../lib/fechas';
import type { EstadoLiquidacion, LiquidacionResumen, PagoLiquidacion } from '../../../../lib/sueldos-repo';
import { accionAnularPagoLiquidacion, accionPagarLiquidacion } from './actions';

/**
 * La pestaña Liquidación y pago (spec §2.6): por cada liquidación de la persona, total · pagado
 * · saldo, la lista de abonos y —sólo sobre una `cerrada` con saldo— el formulario para cargar
 * uno nuevo.
 *
 * EL SALDO ES ARITMÉTICA DE PANTALLA, NO UNA REGLA NUEVA. `total` sale de
 * `sueldo_liquidaciones.total`, ya congelado al cerrar; `pagado` es la suma de los pagos NO
 * anulados que trae el servidor. Restar los dos acá es mostrar un número que ya está en la base
 * dos veces, no inventar de cuánto se puede pagar — eso lo decide `sueldo_liquidacion_pagar(...)`
 * con su propio `select … for update` (anti-sobrepago de verdad, con concurrencia).
 */

const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TONO: Record<EstadoLiquidacion, 'gray' | 'green' | 'red'> = {
  borrador: 'gray',
  cerrada: 'green',
  anulada: 'red',
};

const EXPLICACION_ESTADO: Record<'borrador' | 'anulada', string> = {
  borrador: 'Un borrador todavía cambia: se paga recién cuando se cierra, desde Liquidaciones.',
  anulada: 'Esta liquidación está anulada. No se le registra ningún pago.',
};

export function LiquidacionPagoCliente({
  empleadoId,
  liquidaciones,
  pagosPorLiquidacion,
  metodos,
  migrado,
}: {
  empleadoId: string;
  liquidaciones: LiquidacionResumen[];
  pagosPorLiquidacion: Record<string, PagoLiquidacion[]>;
  metodos: string[];
  /** false si la migración 0080 todavía no está en esta base (ver page.tsx). */
  migrado: boolean;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  // Formulario de abono: uno solo abierto a la vez, así el estado no se multiplica por tarjeta.
  const [abonoAbierto, setAbonoAbierto] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoyPeru());
  // El monto se guarda como texto: con Number(...) en un input controlado, escribir «1.50» lo
  // reescribía a «1.5» mientras se tipeaba (ver docs/aprendizajes.md).
  const [montoTxt, setMontoTxt] = useState('');
  const monto = Number.isFinite(Number(montoTxt)) ? Number(montoTxt) : 0;
  const conf = useConfirmacion();
  const [metodo, setMetodo] = useState(metodos[0] ?? '');
  const [nota, setNota] = useState('');
  const [errorAbono, setErrorAbono] = useState<string | null>(null);
  const [codigoAbono, setCodigoAbono] = useState<string | null>(null);

  // Anular un pago: motivo obligatorio en un modal aparte — DialogoConfirmar no tiene forma de
  // pedir un dato, así que se arma como el modal de anular liquidación en /sueldos/liquidaciones.
  const [anulando, setAnulando] = useState<PagoLiquidacion | null>(null);
  const [motivo, setMotivo] = useState('');
  const [errorAnular, setErrorAnular] = useState<string | null>(null);

  const opcionesMetodo = metodos.map((m) => ({ value: m, label: m }));

  function alternarAbono(liquidacionId: string) {
    setAbonoAbierto((v) => (v === liquidacionId ? null : liquidacionId));
    setFecha(hoyPeru());
    setMontoTxt('');
    setMetodo(metodos[0] ?? '');
    setNota('');
    setErrorAbono(null);
    setCodigoAbono(null);
  }

  function pagar(liquidacionId: string) {
    setErrorAbono(null);
    setCodigoAbono(null);
    empezar(async () => {
      const r = await accionPagarLiquidacion(empleadoId, {
        liquidacionId,
        fecha,
        monto,
        metodo,
        nota: nota.trim() || undefined,
      });
      if (r.ok) {
        setAbonoAbierto(null);
        router.refresh();
      } else {
        setErrorAbono(r.error ?? 'No se pudo registrar el pago.');
        setCodigoAbono(r.codigo ?? null);
      }
    });
  }

  // Registrar un abono mueve plata y no se edita después (sólo se anula con motivo): se confirma.
  function pedirPagar(liquidacionId: string) {
    conf.pedir({
      titulo: `¿Registrar un abono de ${soles(monto)}?`,
      detalle: `${metodo} · ${fecha}. Queda a nombre de quien lo registra; si hay un error, se anula con motivo.`,
      confirmarLabel: 'Registrar abono',
      tono: 'aviso',
      alConfirmar: () => {
        conf.cerrar();
        pagar(liquidacionId);
      },
    });
  }

  function pedirAnular(pago: PagoLiquidacion) {
    setAnulando(pago);
    setMotivo('');
    setErrorAnular(null);
  }

  function anular() {
    if (!anulando) return;
    setErrorAnular(null);
    empezar(async () => {
      const r = await accionAnularPagoLiquidacion(empleadoId, anulando.id, motivo);
      if (r.ok) {
        setAnulando(null);
        setMotivo('');
        router.refresh();
      } else {
        setErrorAnular(r.error ?? 'No se pudo anular el pago.');
      }
    });
  }

  return (
    <div className="space-y-4">
      <DialogoConfirmar {...conf.props} />
      {!migrado && (
        <Aviso tono="aviso" titulo="Falta aplicar la migración 0080">
          El registro de pagos de liquidación todavía no funciona en esta base: se muestra el
          total de cada liquidación cerrada, pero lo pagado y el saldo no se pueden calcular
          todavía. El resto de la pestaña —incluidos los pagos de antes, más abajo— funciona
          igual.
        </Aviso>
      )}

      {liquidaciones.length === 0 ? (
        <Card>
          {/* El vacío tiene que decir a dónde ir. Acá no hay nada que hacer —el pago se registra
              sobre una liquidación CERRADA (0080) y calcular y cerrar se hace en otra pantalla—,
              así que sin este enlace la pestaña era un callejón: el paso «Pago» del hilo mandaba
              para acá y acá no había ninguna salida. */}
          <CardContent className="space-y-3 py-8 text-center text-cuerpo text-muted">
            <p>Esta persona todavía no tiene ninguna liquidación guardada.</p>
            <p>
              La liquidación se calcula y se cierra en{' '}
              <Link href="/sueldos/liquidaciones" className="text-gold-deep underline">
                Liquidar el periodo
              </Link>
              . Recién sobre una liquidación cerrada se registra el pago acá.
            </p>
          </CardContent>
        </Card>
      ) : (
        liquidaciones.map((l) => {
          const pagos = pagosPorLiquidacion[l.id] ?? [];
          const pagado = pagos.filter((p) => !p.anulado).reduce((s, p) => s + p.monto, 0);
          const saldo = Number((l.total - pagado).toFixed(2));
          const cerrada = l.estado === 'cerrada';
          // Verificador adversarial de la 0080 (spec §2.6, commit c02c41a): con total ≤ 0
          // (descuentos ≥ ingresos) la RPC rechaza CUALQUIER abono con SALDO, así que saldo ≤ 0
          // acá no significa "se pagó" — significa "no había nada que pagar". «Pagada» exige
          // total > 0 y saldo saldado; total ≤ 0 muestra su propio badge neutral y no ofrece
          // formulario, porque ofrecerlo sería prometer un pago que la base nunca va a aceptar.
          const sinMontoAPagar = cerrada && l.total <= 0;
          const saldada = migrado && cerrada && !sinMontoAPagar && saldo <= 0;
          const puedePagar = migrado && cerrada && !sinMontoAPagar && saldo > 0;

          return (
            <Card key={l.id}>
              <CardHeader className="items-start">
                <div>
                  <CardTitle>
                    {l.periodoDesde} → {l.periodoHasta}
                  </CardTitle>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge tone={TONO[l.estado]}>{l.estado}</Badge>
                    {saldada && <Badge tone="green">pagada</Badge>}
                    {sinMontoAPagar && <Badge tone="gray">sin monto a pagar</Badge>}
                  </div>
                </div>
                <a
                  className="whitespace-nowrap text-cuerpo text-gold-deep underline"
                  href={`/sueldos/liquidaciones/${l.id}/comprobante`}
                >
                  Ver desglose
                </a>
              </CardHeader>
              <CardContent className="space-y-3">
                {!cerrada ? (
                  <>
                    <p className="text-cuerpo text-muted">
                      {EXPLICACION_ESTADO[l.estado === 'borrador' ? 'borrador' : 'anulada']}
                    </p>
                    {l.estado === 'borrador' && pagado > 0 && (
                      <p className="text-cuerpo text-navy">
                        Ya pagado en la liquidación anterior: <span className="tabular-nums">{soles(pagado)}</span>. Al
                        cerrar esta, ese monto se descuenta solo y queda el saldo.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3 sm:max-w-md">
                      <div>
                        <p className="text-apoyo text-muted">Total</p>
                        <p className="tabular-nums text-navy">{soles(l.total)}</p>
                      </div>
                      <div>
                        <p className="text-apoyo text-muted">Pagado</p>
                        <p className="tabular-nums text-navy">{migrado ? soles(pagado) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-apoyo text-muted">Saldo</p>
                        <p
                          className={cn(
                            'tabular-nums font-medium',
                            migrado && !sinMontoAPagar && saldo <= 0 ? 'text-exito-deep' : 'text-navy',
                          )}
                        >
                          {/* total ≤ 0 nunca fue pagado: un saldo negativo ahí no es "a favor" de
                              nadie, es sólo total menos cero. No se muestra ese número. */}
                          {sinMontoAPagar ? '—' : migrado ? soles(saldo) : '—'}
                        </p>
                      </div>
                    </div>

                    {sinMontoAPagar && (
                      <p className="text-apoyo text-muted">
                        Los descuentos igualan o superan los ingresos de este período: no hay
                        monto que pagar, así que no admite abonos.
                      </p>
                    )}

                    {pagos.length > 0 && (
                      <Table>
                        <THead>
                          <TR>
                            <TH>Fecha</TH>
                            <TH>Método</TH>
                            <TH>Nota</TH>
                            <TH>Quién</TH>
                            <TH className="text-right">Monto</TH>
                            <TH />
                          </TR>
                        </THead>
                        <TBody>
                          {pagos.map((p) => (
                            <TR key={p.id} className={p.anulado ? 'opacity-60' : undefined}>
                              <TD className="tabular-nums text-dato text-muted">{p.fecha}</TD>
                              <TD>
                                {p.metodo}
                                {p.deLiquidacionAnterior && (
                                  <span className="block text-apoyo text-muted">liquidación anterior</span>
                                )}
                              </TD>
                              <TD className="text-apoyo text-muted">
                                {p.anulado ? `Anulado: ${p.anuladoMotivo ?? '—'}` : p.nota || '—'}
                              </TD>
                              <TD className="text-apoyo text-muted">{p.registradoPor ?? '—'}</TD>
                              <TD className={cn('text-right tabular-nums', p.anulado && 'line-through')}>
                                {soles(p.monto)}
                              </TD>
                              <TD className="text-right">
                                {!p.anulado && !p.deLiquidacionAnterior && (
                                  <Button variant="ghost" onClick={() => pedirAnular(p)} aria-label="Anular pago">
                                    <Ban className="h-4 w-4" />
                                  </Button>
                                )}
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    )}

                    {puedePagar && (
                      <div className="border-t border-line pt-3">
                        {abonoAbierto === l.id ? (
                          <div className="space-y-3">
                            <p className="text-apoyo leading-relaxed text-muted">
                              Los adelantos ya están descontados dentro del total — acá se registra
                              lo pagado del total.
                            </p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <Label htmlFor={`fecha-${l.id}`}>Fecha</Label>
                                <Input
                                  id={`fecha-${l.id}`}
                                  type="date"
                                  value={fecha}
                                  onChange={(e) => setFecha(e.target.value)}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`monto-${l.id}`}>Monto (S/)</Label>
                                <Input
                                  id={`monto-${l.id}`}
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  inputMode="decimal"
                                  className="tabular-nums"
                                  value={montoTxt}
                                  onChange={(e) => setMontoTxt(e.target.value)}
                                />
                                <Button
                                  variant="ghost"
                                  className="mt-1"
                                  onClick={() => setMontoTxt(String(saldo))}
                                  disabled={pendiente}
                                >
                                  Pagar el saldo · {soles(saldo)}
                                </Button>
                              </div>
                            </div>
                            <div>
                              <Label>Método</Label>
                              <OpcionBotones
                                opciones={opcionesMetodo}
                                value={metodo}
                                onChange={setMetodo}
                                ariaLabel="Método de pago"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`nota-${l.id}`}>Nota (opcional)</Label>
                              <Input
                                id={`nota-${l.id}`}
                                value={nota}
                                onChange={(e) => setNota(e.target.value)}
                                placeholder="Referencia, número de operación…"
                              />
                            </div>
                            {errorAbono && (
                              <div>
                                <Aviso tono="error">{errorAbono}</Aviso>
                                {codigoAbono === 'SALDO' && (
                                  <p className="mt-1 text-apoyo text-muted">
                                    Este abono se pasaría del total: el saldo pendiente es {soles(saldo)}.
                                  </p>
                                )}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <Button onClick={() => pedirPagar(l.id)} pending={pendiente} disabled={monto <= 0 || !metodo}>
                                Registrar abono · {soles(monto)}
                              </Button>
                              <Button variant="outline" onClick={() => alternarAbono(l.id)} disabled={pendiente}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button variant="outline" onClick={() => alternarAbono(l.id)}>
                            <Wallet className="h-4 w-4" /> Registrar abono
                          </Button>
                        )}
                      </div>
                    )}

                    {!migrado && (
                      <p className="text-apoyo text-muted">
                        Sin la migración 0080 todavía no se puede registrar ni ver pagos de esta
                        liquidación.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Anular un pago: motivo obligatorio, nunca se edita ni se borra. */}
      <Modal
        open={anulando != null}
        onClose={() => !pendiente && setAnulando(null)}
        title="Anular el pago"
        subtitle="No se borra: queda a la vista, marcado como anulado."
      >
        <ModalBody>
          {anulando && (
            <p className="mb-3 text-cuerpo text-ink">
              {anulando.fecha} · {soles(anulando.monto)} · {anulando.metodo}
            </p>
          )}
          <Label htmlFor="motivo-anular-pago" required>
            Motivo
          </Label>
          <Input
            id="motivo-anular-pago"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué se anula este pago…"
          />
          <p className="mt-2 text-apoyo text-muted">Es obligatorio: sin motivo se pierde el rastro de por qué.</p>
          {errorAnular && (
            <Aviso tono="error" className="mt-3">
              {errorAnular}
            </Aviso>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setAnulando(null)} disabled={pendiente}>
            Cancelar
          </Button>
          <Button onClick={anular} pending={pendiente} disabled={motivo.trim().length === 0}>
            Anular
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
