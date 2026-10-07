'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { validarCadaDias, type ModalidadPago } from '@scilb/core';
import { Button } from '../../../components/ui/button';
import { Aviso, Input, Label } from '../../../components/ui/form';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import type { AcuerdoSueldo } from '../../../lib/sueldos-repo';
import { accionCambiarFrecuencia, accionPlanDeCambio, type PlanCambio } from './actions';
import { ComoSePaga, fechaCorta, nombreFrecuencia, soles } from './como-se-paga';

/** Cuántos pagos caen en un mes promedio con cada frecuencia (semanal = 52/12, cada N días = 365/12/N). */
function pagosPorMes(f: { modalidad: ModalidadPago; cadaDias: number | null }): number {
  if (f.modalidad === 'mensual') return 1;
  if (f.modalidad === 'quincenal') return 2;
  if (f.modalidad === 'semanal') return 52 / 12;
  const n = validarCadaDias(f.cadaDias);
  return 365 / 12 / n;
}

/**
 * La cuota que se SUGIERE al cambiar de frecuencia: la misma plata por mes repartida en más o menos
 * pagos (S/650 mensual → S/325 quincenal). Es un default anotado en docs/pendientes-negocio.md y
 * sólo un punto de partida: el administrador la confirma o la cambia, nunca se aplica sola
 * (no-negociable 5). No depende de cuántos días tenga el mes en que arranca el cambio.
 */
function cuotaProporcional(
  actual: PlanCambio['frecuenciaActual'],
  nueva: { modalidad: ModalidadPago; cadaDias: number | null },
): number | null {
  try {
    return Math.round(((actual.sueldoPactado * pagosPorMes(actual)) / pagosPorMes(nueva)) * 100) / 100;
  } catch {
    return null;
  }
}

/**
 * «Cambiar cómo se paga» (spec frecuencia-pago-flexible §3.2 y §6). Un panel corto: nueva
 * frecuencia, cuota sugerida editable, «desde el próximo pago» y la vista previa de los pagos que
 * cambian. Lo ya pagado no se toca.
 */
export function CambiarFrecuencia({ acuerdo, onClose }: { acuerdo: AcuerdoSueldo; onClose: () => void }) {
  const router = useRouter();
  const [plan, setPlan] = useState<PlanCambio | null>(null);
  const [modalidad, setModalidad] = useState<ModalidadPago>('quincenal');
  const [cadaDias, setCadaDias] = useState('');
  const [cuota, setCuota] = useState('');
  // La cuota sugerida se vuelve a calcular al cambiar la frecuencia hasta que el administrador la
  // toca a mano: desde ahí es suya.
  const [cuotaTocada, setCuotaTocada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<{ periodoDesde: string; periodoHasta: string }[] | null>(null);
  const [guardando, empezar] = useTransition();

  useEffect(() => {
    accionPlanDeCambio(acuerdo.id).then((r) => {
      if (!r.ok || !r.plan) return setError(r.error ?? 'No se pudo preparar el cambio.');
      setPlan(r.plan);
      const sug = r.plan.desde
        ? cuotaProporcional(r.plan.frecuenciaActual, { modalidad: 'quincenal', cadaDias: null })
        : null;
      setCuota(sug == null ? '' : String(sug));
    });
  }, [acuerdo.id]);

  const elegir = (m: ModalidadPago, n: string) => {
    setModalidad(m);
    setCadaDias(n);
    if (!cuotaTocada && plan?.desde) {
      const sug = cuotaProporcional(plan.frecuenciaActual, {
        modalidad: m,
        cadaDias: m === 'dias' ? Number(n) : null,
      });
      if (sug != null) setCuota(String(sug));
    }
  };

  const confirmar = () => {
    if (!plan?.desde) return;
    setError(null);
    try {
      if (modalidad === 'dias') validarCadaDias(Number(cadaDias));
    } catch (e) {
      return setError(e instanceof Error ? e.message : 'Revisa cada cuántos días se paga.');
    }
    empezar(async () => {
      const r = await accionCambiarFrecuencia(acuerdo.id, {
        desde: plan.desde as string,
        modalidad,
        cadaDias: modalidad === 'dias' ? Number(cadaDias) : null,
        sueldoPactado: Number(cuota),
      });
      if (!r.ok) return setError(r.error ?? 'No se pudo cambiar cómo se paga.');
      router.refresh();
      if (r.borradores && r.borradores.length > 0) setPendientes(r.borradores);
      else onClose();
    });
  };

  const actual = plan?.frecuenciaActual;

  return (
    <Modal open onClose={onClose} title="Cambiar cómo se paga" size="lg">
      <ModalBody>
        {pendientes ? (
          <Aviso tono="aviso" titulo="Cambio guardado">
            Hay {pendientes.length === 1 ? 'un borrador' : `${pendientes.length} borradores`} de liquidación que se cruza
            con el cambio (
            {pendientes.map((b) => `${fechaCorta(b.periodoDesde)} al ${fechaCorta(b.periodoHasta)}`).join('; ')}
            ). Elimínalo y vuelve a calcularlo en Liquidaciones para que use la cuota nueva.
          </Aviso>
        ) : !plan ? (
          <p className="text-cuerpo text-muted">{error ?? 'Preparando…'}</p>
        ) : !plan.desde ? (
          <Aviso tono="info">Todos los pagos de este contrato ya están pagados: no hay nada que cambiar.</Aviso>
        ) : (
          <div className="space-y-4">
            <p className="text-cuerpo text-navy">
              Hoy: <strong>{nombreFrecuencia(actual!.modalidad, actual!.cadaDias)}</strong>,{' '}
              <span className="tabular-nums">{soles(actual!.sueldoPactado)}</span> cada pago. El cambio rige{' '}
              <strong>desde el próximo pago (<span className="tabular-nums">{fechaCorta(plan.desde)}</span>)</strong>; lo ya
              pagado no se toca.
            </p>
            <ComoSePaga
              modalidad={modalidad}
              cadaDias={cadaDias}
              onChange={elegir}
              fechaInicio={plan.desde}
              fechaFin={plan.fechaFin}
              cuota={Number(cuota)}
            />
            <div>
              <Label htmlFor="cuota-nueva" required>Cuota de cada pago</Label>
              <Input
                id="cuota-nueva"
                type="number"
                min={0}
                step="0.01"
                value={cuota}
                onChange={(e) => {
                  setCuotaTocada(true);
                  setCuota(e.target.value);
                }}
                className="tabular-nums"
              />
              <p className="mt-1 text-apoyo text-muted">
                Es una sugerencia proporcional a los días de cada pago. Confírmala o cámbiala: no se aplica sola.
              </p>
            </div>
            {plan.borradores.length > 0 && (
              <Aviso tono="aviso">
                Ya hay un borrador de liquidación que se cruza con el cambio. Al confirmar tendrás que eliminarlo y volver a calcularlo.
              </Aviso>
            )}
            {error && <Aviso tono="error">{error}</Aviso>}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {pendientes || !plan?.desde ? (
          <Button onClick={onClose}>Entendido</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={confirmar} pending={guardando} disabled={!(Number(cuota) > 0)}>
              Confirmar cambio
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
