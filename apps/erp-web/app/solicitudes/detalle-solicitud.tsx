'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import { esGestorSolicitudes, puedeConfirmarSolicitud, puedeDeshacerSolicitud, motivoRechazoValido, type Rol } from '@scilb/core';
import {
  accionAprobarSolicitud,
  accionRechazarSolicitud,
  accionEntregarSolicitud,
  accionConfirmarSolicitud,
  accionDeshacerSolicitud,
} from './actions';
import { ESTADO_LABEL, ESTADO_TONE, URGENCIA_LABEL, URGENCIA_TONE, fechaHora } from './constantes';
import type { Solicitud } from '../../lib/solicitudes-repo';
import type { ColorSolicitud } from '../../lib/solicitud-catalogos-repo';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Aviso } from '../../components/ui/form';
import { cn } from '../../lib/cn';

type Emp = { id: string; nombre: string; sedeCod: string | null };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Detalle + transiciones de una solicitud (Fase 11). Portado de verDetalleSolicitud/soliAAprobar/
// soliARechazar/soliAEntregar/soliAConfirmar en public/js/solicitudes.js, con dos diferencias
// deliberadas frente al viejo:
//  1. No reintroduce el prompt de "código de empleado" (soliCode()) — la sesión ya identifica al
//     actor (auth.uid()), así que las RPC de la migración 0056 lo registran solas.
//  2. No cierra el modal tras cada transición (el viejo sí, y compensaba con un toast+undo de 8s
//     que este ERP no tiene en ningún otro módulo). Aquí se refresca en el sitio y "Deshacer" queda
//     siempre visible como botón, sin ventana de tiempo — más simple y nada se pierde por lentitud.
export function DetalleSolicitudModal({
  solicitud,
  onClose,
  rol,
  sedeActual,
  empleados,
  colores,
}: {
  solicitud: Solicitud | null;
  onClose: () => void;
  rol: Rol;
  sedeActual: string;
  empleados: Emp[];
  colores: ColorSolicitud[];
}) {
  return (
    <Modal
      open={Boolean(solicitud)}
      onClose={onClose}
      title={solicitud ? `Sede ${solicitud.sedeCod} · ${fechaHora(solicitud.createdAt)}` : ''}
      subtitle={solicitud ? `Solicitó ${solicitud.solicitanteNombre ?? '—'}` : undefined}
      size="xl"
    >
      {solicitud && (
        <Contenido key={solicitud.id} solicitud={solicitud} rol={rol} sedeActual={sedeActual} empleados={empleados} colores={colores} onClose={onClose} />
      )}
    </Modal>
  );
}

function Contenido({
  solicitud,
  rol,
  sedeActual,
  empleados,
  colores,
  onClose,
}: {
  solicitud: Solicitud;
  rol: Rol;
  sedeActual: string;
  empleados: Emp[];
  colores: ColorSolicitud[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const [entregando, setEntregando] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [obsRespuesta, setObsRespuesta] = useState('');
  const [recibeEnTienda, setRecibeEnTienda] = useState(solicitud.recibeEnTienda ?? '');
  const [codigos, setCodigos] = useState<Record<string, string[]>>(solicitud.codigosPrenda ?? {});
  const [cantidadesEnviar, setCantidadesEnviar] = useState<Record<string, number>>(
    Object.fromEntries(solicitud.items.map((i) => [i.id, i.cantidad])),
  );
  const [cantidadesRecibir, setCantidadesRecibir] = useState<Record<string, number>>(
    Object.fromEntries(solicitud.items.map((i) => [i.id, i.cantidadEnviada])),
  );
  const [obsRecepcion, setObsRecepcion] = useState<Record<string, string>>(
    Object.fromEntries(solicitud.items.map((i) => [i.id, i.obsRecepcion ?? ''])),
  );

  const esGestor = esGestorSolicitudes(rol);
  const puedeConfirmar = puedeConfirmarSolicitud(rol, sedeActual, solicitud.sedeCod);
  const puedeDeshacerAhora = puedeDeshacerSolicitud(solicitud.estado, rol, sedeActual, solicitud.sedeCod);
  const esPendiente = solicitud.estado === 'pendiente';
  const mostrarEnviar = esPendiente && esGestor;
  const mostrarRecibir = solicitud.estado === 'entregada' && puedeConfirmar;
  const empleadosDeSede = empleados.filter((e) => e.sedeCod === solicitud.sedeCod);

  function setCodigo(itemId: string, idx: number, value: string) {
    setCodigos((p) => {
      const arr = [...(p[itemId] ?? [])];
      arr[idx] = value;
      return { ...p, [itemId]: arr };
    });
  }
  function codigosLimpios(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [id, arr] of Object.entries(codigos)) {
      const limpio = arr.map((v) => v.trim().toUpperCase()).filter(Boolean);
      if (limpio.length) out[id] = limpio;
    }
    return out;
  }

  function aprobar() {
    setError('');
    startTransition(async () => {
      const items = solicitud.items.map((i) => ({ id: i.id, cantidadEnviada: cantidadesEnviar[i.id] ?? i.cantidad }));
      const r = await accionAprobarSolicitud(solicitud.id, obsRespuesta, items);
      if (!r.ok) {
        setError(r.error ?? 'No se pudo aprobar');
        return;
      }
      router.refresh();
    });
  }
  function confirmarRechazo() {
    if (!motivoRechazoValido(motivo)) {
      setError('El motivo de rechazo es obligatorio');
      return;
    }
    setError('');
    startTransition(async () => {
      const r = await accionRechazarSolicitud(solicitud.id, motivo);
      if (!r.ok) {
        setError(r.error ?? 'No se pudo rechazar');
        return;
      }
      setRechazando(false);
      router.refresh();
    });
  }
  function confirmarEntrega() {
    if (!recibeEnTienda.trim()) {
      setError('Indica quién recibe en la tienda');
      return;
    }
    setError('');
    startTransition(async () => {
      const r = await accionEntregarSolicitud(solicitud.id, recibeEnTienda, codigosLimpios());
      if (!r.ok) {
        setError(r.error ?? 'No se pudo registrar la entrega');
        return;
      }
      setEntregando(false);
      router.refresh();
    });
  }
  function confirmarRecepcion() {
    setError('');
    startTransition(async () => {
      const items = solicitud.items.map((i) => ({
        id: i.id,
        cantidadRecibida: cantidadesRecibir[i.id] ?? i.cantidadEnviada,
        obsRecepcion: obsRecepcion[i.id] ?? '',
      }));
      const r = await accionConfirmarSolicitud(solicitud.id, items);
      if (!r.ok) {
        setError(r.error ?? 'No se pudo confirmar la recepción');
        return;
      }
      router.refresh();
    });
  }
  function deshacer() {
    if (!confirm('¿Deshacer la última acción de esta solicitud?')) return;
    setError('');
    startTransition(async () => {
      const r = await accionDeshacerSolicitud(solicitud.id);
      if (!r.ok) {
        setError(r.error ?? 'No se pudo deshacer');
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={URGENCIA_TONE[solicitud.urgencia]}>{URGENCIA_LABEL[solicitud.urgencia]}</Badge>
          <Badge tone={ESTADO_TONE[solicitud.estado]}>{ESTADO_LABEL[solicitud.estado]}</Badge>
          {solicitud.pedidoImpreso && (
            <span className="inline-flex items-center gap-1 rounded-r-pastilla bg-exito-soft px-2 py-0.5 text-micro font-medium text-exito-deep">
              <Printer className="h-3 w-3" strokeWidth={2} /> Pedido impreso
            </span>
          )}
          {solicitud.confirmacionImpresa && (
            <span className="inline-flex items-center gap-1 rounded-r-pastilla bg-navy/10 px-2 py-0.5 text-micro font-medium text-navy">
              <Printer className="h-3 w-3" strokeWidth={2} /> Confirmación impresa
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          {solicitud.obs && (
            <div className="rounded-r-chico bg-paper px-2.5 py-1.5 text-apoyo text-ink">
              <b>Obs.:</b> {solicitud.obs}
            </div>
          )}
          {solicitud.aprobadoPorNombre && (
            <div className="rounded-r-md border-l-2 border-navy bg-navy/5 px-2.5 py-1.5 text-apoyo text-navy">
              Aprobó <b>{solicitud.aprobadoPorNombre}</b> · {fechaHora(solicitud.fechaRespuesta)}
              {solicitud.obsRespuesta && <span className="block text-muted">{solicitud.obsRespuesta}</span>}
            </div>
          )}
          {solicitud.entregadoPorNombre && (
            <div className="rounded-r-md border-l-2 border-exito bg-exito-soft px-2.5 py-1.5 text-apoyo text-exito-deep">
              Entregó <b>{solicitud.entregadoPorNombre}</b> a <b>{solicitud.recibeEnTienda ?? '—'}</b> · {fechaHora(solicitud.fechaEntrega)}
            </div>
          )}
          {solicitud.confirmadoPorNombre && (
            <div className="rounded-r-md border-l-2 border-navy bg-navy/5 px-2.5 py-1.5 text-apoyo text-navy">
              Confirmó <b>{solicitud.confirmadoPorNombre}</b> · {fechaHora(solicitud.fechaConfirmacion)}
            </div>
          )}
          {solicitud.rechazadoPorNombre && (
            <div className="rounded-r-md border-l-2 border-error bg-error-soft px-2.5 py-1.5 text-apoyo text-error-deep">
              Rechazó <b>{solicitud.rechazadoPorNombre}</b> — {solicitud.motivoRechazo}
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-r-chico border border-line">
          <Table>
            <THead>
              <TR>
                <TH>Tipo</TH>
                <TH>Color</TH>
                <TH>Talla</TH>
                <TH>Tela / Modelo</TH>
                <TH className="text-right">Cant.</TH>
                {mostrarEnviar && <TH className="text-right">A enviar</TH>}
                {!esPendiente && !mostrarEnviar && <TH className="text-right">Enviado</TH>}
                {mostrarRecibir && (
                  <>
                    <TH className="text-right">Recibido</TH>
                    <TH>Obs. recepción</TH>
                  </>
                )}
                {solicitud.estado === 'confirmada' && <TH className="text-right">Recibido</TH>}
                <TH>Obs.</TH>
              </TR>
            </THead>
            <TBody>
              {solicitud.items.map((i) => {
                const dot = colores.find((c) => c.nombre === i.color)?.hex;
                return (
                  <TR key={i.id}>
                    <TD className="font-medium text-navy">{i.tipo}</TD>
                    <TD>
                      {dot && (
                        <span
                          aria-hidden
                          className="mr-1.5 inline-block h-2.5 w-2.5 rounded-r-pastilla border border-black/10 align-middle"
                          style={{ background: dot }}
                        />
                      )}
                      {i.color ?? '—'}
                    </TD>
                    <TD>{i.talla ?? '—'}</TD>
                    <TD className="text-apoyo text-muted">{[i.tela, i.modelo].filter(Boolean).join(' · ') || '—'}</TD>
                    <TD className="text-right tabular-nums font-semibold">{i.cantidad}</TD>
                    {mostrarEnviar && (
                      <TD className="text-right">
                        <input
                          type="number"
                          min={0}
                          max={i.cantidad}
                          value={cantidadesEnviar[i.id] ?? i.cantidad}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setCantidadesEnviar((p) => ({ ...p, [i.id]: clamp(Number(e.target.value) || 0, 0, i.cantidad) }))}
                          className="w-16 rounded-r-chico border border-line bg-white px-1.5 py-1 text-right text-cuerpo outline-none focus:border-gold"
                        />
                      </TD>
                    )}
                    {!esPendiente && !mostrarEnviar && (
                      <TD
                        className={cn(
                          'text-right tabular-nums font-semibold',
                          i.cantidadEnviada >= i.cantidad ? 'text-exito-deep' : i.cantidadEnviada > 0 ? 'text-aviso-deep' : 'text-error',
                        )}
                      >
                        {i.cantidadEnviada}
                      </TD>
                    )}
                    {mostrarRecibir && (
                      <>
                        <TD className="text-right">
                          <input
                            type="number"
                            min={0}
                            max={i.cantidadEnviada}
                            value={cantidadesRecibir[i.id] ?? i.cantidadEnviada}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              setCantidadesRecibir((p) => ({ ...p, [i.id]: clamp(Number(e.target.value) || 0, 0, i.cantidadEnviada) }))
                            }
                            className="w-16 rounded-r-chico border border-line bg-white px-1.5 py-1 text-right text-cuerpo outline-none focus:border-gold"
                          />
                        </TD>
                        <TD>
                          <input
                            value={obsRecepcion[i.id] ?? ''}
                            onChange={(e) => setObsRecepcion((p) => ({ ...p, [i.id]: e.target.value }))}
                            placeholder="Obs."
                            className="w-full rounded-r-chico border border-line bg-white px-1.5 py-1 text-apoyo outline-none focus:border-gold"
                          />
                        </TD>
                      </>
                    )}
                    {solicitud.estado === 'confirmada' && (
                      <TD className={cn('text-right tabular-nums font-semibold', i.cantidadRecibida >= i.cantidadEnviada ? 'text-exito-deep' : 'text-error')}>
                        {i.cantidadRecibida}
                      </TD>
                    )}
                    <TD className="text-apoyo text-muted">{i.obs || i.detalle || '—'}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>

        {esPendiente && esGestor && !rechazando && (
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Observación de respuesta (opcional)</label>
            <input
              value={obsRespuesta}
              onChange={(e) => setObsRespuesta(e.target.value)}
              placeholder="Ej: no hay stock talla XL"
              className="w-full rounded-r-chico border border-line bg-white px-2.5 py-2 text-cuerpo outline-none focus:border-gold"
            />
          </div>
        )}

        {rechazando && (
          <div className="rounded-r-chico border border-error-line bg-error-soft p-3">
            <label className="mb-1 block text-rotulo uppercase text-error-deep">Motivo del rechazo (obligatorio)</label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: no hay stock"
              autoFocus
              className="w-full rounded-r-chico border border-error-line bg-white px-2.5 py-2 text-cuerpo outline-none focus:border-error"
            />
          </div>
        )}

        {entregando && (
          <div className="space-y-3 rounded-r-chico border border-line bg-paper/60 p-3">
            <div>
              <label className="mb-1 block text-rotulo uppercase text-muted">Quién recibe en {solicitud.sedeCod}</label>
              {empleadosDeSede.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {empleadosDeSede.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setRecibeEnTienda(e.nombre)}
                      className={cn(
                        'rounded-r-pastilla border px-3 py-1.5 text-apoyo font-medium transition-colors',
                        recibeEnTienda === e.nombre ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-gold',
                      )}
                    >
                      {e.nombre}
                    </button>
                  ))}
                </div>
              )}
              <input
                value={recibeEnTienda}
                onChange={(e) => setRecibeEnTienda(e.target.value)}
                placeholder="O escribe el nombre de quien recibe…"
                className="w-full rounded-r-chico border border-line bg-white px-2.5 py-2 text-cuerpo outline-none focus:border-gold"
              />
            </div>
            {solicitud.items.some((i) => i.categoria === 'prenda' && i.cantidadEnviada > 0) && (
              <div>
                <label className="mb-1 block text-rotulo uppercase text-muted">
                  Códigos de prenda (opcional) · obligatorio para imprimir la confirmación
                </label>
                {solicitud.items
                  .filter((i) => i.categoria === 'prenda' && i.cantidadEnviada > 0)
                  .map((i) => (
                    <div key={i.id} className="mb-2 rounded-r-chico border border-line bg-white p-2.5">
                      <div className="mb-1.5 flex items-center justify-between text-apoyo">
                        <span className="font-semibold text-navy">
                          {i.tipo} {i.color} {i.talla}
                        </span>
                        <span className="text-muted">×{i.cantidadEnviada}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {Array.from({ length: i.cantidadEnviada }).map((_, k) => (
                          <input
                            key={k}
                            value={codigos[i.id]?.[k] ?? ''}
                            onChange={(e) => setCodigo(i.id, k, e.target.value.toUpperCase())}
                            placeholder={`Código ${k + 1}`}
                            className="rounded-r-chico border border-line bg-white px-2 py-1.5 tabular-nums text-dato uppercase tracking-wide outline-none focus:border-gold"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {error && <Aviso tono="error" className="text-cuerpo">{error}</Aviso>}
      </ModalBody>
      <ModalFooter className="flex-wrap justify-start gap-2">
        {esPendiente && esGestor && !rechazando && (
          <>
            <Button type="button" onClick={aprobar} pending={pending}>
              {pending ? 'Aprobando…' : 'Aprobar'}
            </Button>
            <button
              type="button"
              onClick={() => setRechazando(true)}
              disabled={pending}
              className={cn(buttonVariants({ variant: 'outline' }), 'border-error-line text-error hover:bg-error-soft')}
            >
              Rechazar
            </button>
          </>
        )}
        {rechazando && (
          <>
            <button
              type="button"
              onClick={() => {
                setRechazando(false);
                setMotivo('');
                setError('');
              }}
              disabled={pending}
              className={buttonVariants({ variant: 'ghost' })}
            >
              Cancelar
            </button>
            <Button type="button" onClick={confirmarRechazo} pending={pending} className="bg-error hover:bg-error-deep">
              {pending ? 'Rechazando…' : 'Confirmar rechazo'}
            </Button>
          </>
        )}
        {solicitud.estado === 'aprobada' && esGestor && !entregando && (
          <Button type="button" onClick={() => setEntregando(true)}>
            Registrar entrega
          </Button>
        )}
        {entregando && (
          <>
            <button type="button" onClick={() => { setEntregando(false); setError(''); }} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
              Cancelar
            </button>
            <Button type="button" onClick={confirmarEntrega} pending={pending}>
              {pending ? 'Registrando…' : 'Confirmar entrega'}
            </Button>
          </>
        )}
        {mostrarRecibir && (
          <Button type="button" onClick={confirmarRecepcion} pending={pending}>
            {pending ? 'Confirmando…' : 'Confirmar recepción'}
          </Button>
        )}
        {puedeDeshacerAhora && !entregando && !rechazando && (
          <button type="button" onClick={deshacer} disabled={pending} className={cn(buttonVariants({ variant: 'ghost' }), 'text-muted')}>
            Deshacer
          </button>
        )}
        {esGestor && (
          <Link href={`/solicitudes/${solicitud.id}/imprimir`} target="_blank" className={buttonVariants({ variant: 'outline' })}>
            <Printer className="h-4 w-4" strokeWidth={2} /> Imprimir
          </Link>
        )}
        <button type="button" onClick={onClose} disabled={pending} className={cn(buttonVariants({ variant: 'ghost' }), 'ml-auto')}>
          Cerrar
        </button>
      </ModalFooter>
    </>
  );
}
