'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Ban, ChevronDown, Wallet } from 'lucide-react';
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
import { fechaCorta, leerPeriodo, rangoCorto } from '../../../../lib/periodo';
import { CierreDePago } from '../../../../components/liquidacion/cierre-de-pago';
import type { PagoFicha } from '../../../../lib/pagos-ficha';
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

// Una liquidación guardada sin cerrar es interna (decisión del dueño n.º 7): nunca se lista aquí.
const TONO: Record<EstadoLiquidacion, 'gray' | 'green' | 'red'> = {
  borrador: 'gray',
  cerrada: 'green',
  anulada: 'red',
};
const ETIQUETA: Record<EstadoLiquidacion, string> = {
  borrador: 'Por cerrar',
  cerrada: 'Cerrada',
  anulada: 'Anulada',
};

const ESTADO_PAGO = {
  por_cerrar: { texto: 'Por cerrar', tono: 'gray', punto: 'bg-muted' },
  cerrado: { texto: 'Cerrado', tono: 'gold', punto: 'bg-gold' },
  pagado: { texto: 'Pagado', tono: 'green', punto: 'bg-exito' },
} as const;

export function LiquidacionPagoCliente({
  empleadoId,
  liquidaciones,
  pagos: pagosProgramados,
  acuerdoId,
  hoy,
  pagosPorLiquidacion,
  metodos,
  migrado,
}: {
  empleadoId: string;
  liquidaciones: LiquidacionResumen[];
  /** Los pagos programados de su contrato, con su estado (calculados en el servidor). */
  pagos: PagoFicha[];
  /** El contrato al que se le ofrece cerrar un rango suelto. Nulo = sin contrato. */
  acuerdoId: string | null;
  /** Hoy en hora Perú, del servidor: así servidor y navegador coinciden. */
  hoy: string;
  pagosPorLiquidacion: Record<string, PagoLiquidacion[]>;
  metodos: string[];
  /** false si la migración 0080 todavía no está en esta base (ver page.tsx). */
  migrado: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, empezar] = useTransition();
  // El período elegido arriba, de la dirección (la misma lectura que usa la barra).
  const periodo = leerPeriodo({ desde: sp.get('desde') ?? undefined, hasta: sp.get('hasta') ?? undefined });
  const fijarPeriodo = (desde: string, hasta: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set('desde', desde);
    q.set('hasta', hasta);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

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


  // Lo de siempre de un pago cerrado: total, pagado, saldo, abonos y comprobante.
  function cuerpoCerrada(l: LiquidacionResumen) {
    const pagos = pagosPorLiquidacion[l.id] ?? [];
    const pagado = pagos.filter((p) => !p.anulado).reduce((s, p) => s + p.monto, 0);
    const saldo = Number((l.total - pagado).toFixed(2));
    // Con total <= 0 (descuentos >= ingresos) la base rechaza cualquier abono: saldo <= 0 acá no
    // significa «se pagó», significa «no había nada que pagar».
    const sinMontoAPagar = l.total <= 0;
    const saldada = migrado && !sinMontoAPagar && saldo <= 0;
    const puedePagar = migrado && !sinMontoAPagar && saldo > 0;
    return (
      <div key={l.id} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-cuerpo font-medium text-navy tabular-nums">{rangoCorto(l.periodoDesde, l.periodoHasta)}</span>
            {saldada && <Badge tone="green">Pagado</Badge>}
            {sinMontoAPagar && <Badge tone="gray">Sin monto a pagar</Badge>}
          </div>
          <a
            className="whitespace-nowrap text-cuerpo text-gold-deep underline"
            href={`/sueldos/liquidaciones/${l.id}/comprobante`}
          >
            Ver comprobante
          </a>
        </div>
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
                    Registrar pago · {soles(monto)}
                  </Button>
                  <Button variant="outline" onClick={() => alternarAbono(l.id)} disabled={pendiente}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => alternarAbono(l.id)}>
                <Wallet className="h-4 w-4" /> Registrar pago
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
      </div>
    );
  }

  const haySeleccion = pagosProgramados.some((p) => p.desde === periodo.desde && p.hasta === periodo.hasta);
  const acuerdoDelRango =
    pagosProgramados.find((p) => p.desde <= periodo.hasta && p.hasta >= periodo.desde)?.acuerdoId ?? acuerdoId;
  const historial = liquidaciones.filter((l) => l.estado !== 'borrador');

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

      {pagosProgramados.length === 0 && !acuerdoId && (
        <Card>
          <CardContent className="space-y-2 py-8 text-center text-cuerpo text-muted">
            <p>Esta persona todavía no tiene un contrato con pagos programados.</p>
            <p>Cuando se cree su contrato, aquí aparecerán sus pagos con su estado.</p>
          </CardContent>
        </Card>
      )}

      {pagosProgramados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sus pagos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pagosProgramados.map((p) => {
              const sel = p.desde === periodo.desde && p.hasta === periodo.hasta;
              const e = ESTADO_PAGO[p.estado];
              // Sólo se cierra hasta ayer (spec pagos-programados §9.1).
              const terminado = p.hasta < hoy;
              return (
                <div
                  key={`${p.acuerdoId}-${p.desde}`}
                  className={cn(
                    'rounded-r-medio border',
                    sel ? 'border-navy bg-paper shadow-card' : 'border-line bg-white',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => fijarPeriodo(p.desde, p.hasta)}
                    aria-pressed={sel}
                    className="anillo flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-r-medio px-4 py-3 text-left"
                  >
                    <span className={cn('h-2 w-2 shrink-0 rounded-r-pastilla', e.punto)} aria-hidden />
                    <span className="text-cuerpo font-medium text-navy tabular-nums">{rangoCorto(p.desde, p.hasta)}</span>
                    <Badge tone={e.tono}>{e.texto}</Badge>
                    {p.parcial && <span className="text-apoyo text-muted">Una parte ya se cerró</span>}
                    {p.referencia != null && (
                      <span className="text-apoyo text-muted tabular-nums">
                        ≈ {soles(p.referencia)} si cumple su horario
                      </span>
                    )}
                    <ChevronDown
                      className={cn('ml-auto h-4 w-4 shrink-0 text-muted transition-transform', sel && 'rotate-180')}
                      aria-hidden
                    />
                  </button>

                  {sel && (
                    <div className="space-y-4 border-t border-line px-4 py-4">
                      {p.estado === 'por_cerrar' &&
                        (terminado ? (
                          // Pago parcial: se cierra sólo lo que falta (spec §9.5), un tramo por vez.
                          p.pendientes.map((r) => (
                            <div key={`${p.acuerdoId}-${r.desde}-${r.hasta}`} className="space-y-2">
                              {p.parcial && (
                                <p className="text-apoyo font-medium text-navy tabular-nums">
                                  Falta cerrar del {fechaCorta(r.desde)} al {fechaCorta(r.hasta)}
                                </p>
                              )}
                              <CierreDePago acuerdoId={p.acuerdoId} desde={r.desde} hasta={r.hasta} />
                            </div>
                          ))
                        ) : (
                          <p className="text-cuerpo text-muted">Se cierra cuando termine, el {fechaCorta(p.hasta)}.</p>
                        ))}
                      {p.liquidaciones.map((x) => {
                          const l = liquidaciones.find((q) => q.id === x.id);
                          if (!l) return null;
                          return (
                            <div key={l.id} className="space-y-3">
                              {cuerpoCerrada(l)}
                              <CierreDePago
                                modo="corregir"
                                liquidacionId={l.id}
                                acuerdoId={l.acuerdoId}
                                desde={l.periodoDesde}
                                hasta={l.periodoHasta}
                              />
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {!haySeleccion && acuerdoDelRango && (
        <Card>
          <CardHeader>
            <CardTitle>Este rango no es uno de sus pagos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-cuerpo text-muted tabular-nums">
              Del {fechaCorta(periodo.desde)} al {fechaCorta(periodo.hasta)}. Puedes cerrarlo igual si termina ayer o antes.
            </p>
            <CierreDePago key={`${periodo.desde}-${periodo.hasta}`} acuerdoId={acuerdoDelRango} desde={periodo.desde} hasta={periodo.hasta} />
          </CardContent>
        </Card>
      )}

      {historial.length > 0 && (
        <details className="group rounded-r-medio border border-line bg-white">
          <summary className="cursor-pointer select-none px-5 py-3 text-cuerpo font-medium text-navy marker:content-none">
            Historial de liquidaciones ({historial.length})
          </summary>
          <div className="overflow-x-auto border-t border-line">
            <Table>
              <THead>
                <TR>
                  <TH>Periodo</TH>
                  <TH>Estado</TH>
                  <TH className="text-right">Total</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {historial.map((l) => (
                  <TR key={l.id} className={l.estado === 'anulada' ? 'opacity-60' : undefined}>
                    <TD className="whitespace-nowrap tabular-nums">{rangoCorto(l.periodoDesde, l.periodoHasta)}</TD>
                    <TD>
                      <Badge tone={TONO[l.estado]}>{ETIQUETA[l.estado]}</Badge>
                      {l.anuladaMotivo && <span className="ml-2 text-apoyo text-muted">{l.anuladaMotivo}</span>}
                    </TD>
                    <TD className="text-right tabular-nums">{soles(l.total)}</TD>
                    <TD className="text-right">
                      <a className="whitespace-nowrap text-cuerpo text-gold-deep underline" href={`/sueldos/liquidaciones/${l.id}/comprobante`}>
                        Ver comprobante
                      </a>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </details>
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
