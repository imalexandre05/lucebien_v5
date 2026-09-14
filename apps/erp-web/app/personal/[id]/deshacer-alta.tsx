'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Undo2 } from 'lucide-react';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { Button } from '../../../components/ui/button';
import { Aviso } from '../../../components/ui/form';
import { accionBorrarAltaPrevio, accionBorrarAlta } from '../../empleados/actions';
import type { BorrarAltaPrevio } from '../../../lib/empleados-repo';

// «Deshacer alta» (docs/superpowers/specs/empleados/2026-08-25-borrar-alta-por-error-design.md).
// NO es «Suspender»: eso sigue viviendo en la pestaña Datos y sigue siendo lo correcto para
// alguien que trabajó. Esto es la única salida que Suspender no cubre — la fila que nunca debió
// existir —, y por eso vive en la CABECERA y no en Datos: se ofrece desde cualquier sección de la
// ficha, con ícono y texto que no se puede confundir con Suspender (Undo2, no UserX).
//
// Flujo de dos pasos (C-1, spec §3):
//   1. Al abrir, se pide empleado_borrar_alta_previo() — sólo lee — y se muestra qué se perdería
//      ANTES de ofrecer confirmar.
//   2. Si hay bloqueos, el diálogo los lista y NO ofrece un botón de borrar, sólo «Cerrar»: la
//      RPC ya decidió que no se puede.
//   3. Si no hay bloqueos, se listan los conteos > 0 (traducidos a texto llano) y recién ahí
//      aparece el botón irreversible, con el tono de "Anular" en
//      app/sueldos/liquidaciones/cliente.tsx (rojo, no el primario).
//   4. Si empleado_borrar_alta() falla (condición de carrera real: algo bloqueó entre el paso 1 y
//      la confirmación), el error se muestra tal cual DENTRO del diálogo y éste no se cierra solo.

// Traducción de las ~31 claves que devuelve empleado_borrar_alta_previo() (0099) a texto que un
// administrador no técnico entienda. Enumeradas a mano y no generadas: una clave nueva que la RPC
// agregue en el futuro cae al `fallback` de abajo en vez de mostrarse en silencio con su nombre de
// columna — es ruidoso a propósito, mismo criterio que "enumerar, no descubrir" de la migración.
const ETIQUETAS_CONTEO: Record<string, [uno: string, varios: string]> = {
  asistencias: ['día de asistencia', 'días de asistencia'],
  empleado_tiendas: ['sede asignada', 'sedes asignadas'],
  huellero_mapeos: ['identificador del huellero asignado', 'identificadores del huellero asignados'],
  marcas_huellero: ['marca del huellero', 'marcas del huellero'],
  pipeline_puntos: ['punto del pipeline de prendas', 'puntos del pipeline de prendas'],
  reporte_trabajadores: ['turno donde figura como trabajador/a', 'turnos donde figura como trabajador/a'],
  reportes_como_encargado: ['turno donde figura como encargado/a', 'turnos donde figura como encargado/a'],
  reportes_como_evaluador: ['turno donde figura como evaluador/a', 'turnos donde figura como evaluador/a'],
  reporte_drafts: ['borrador de reporte sin enviar', 'borradores de reporte sin enviar'],
  reporte_extras: ['actividad extra que registró', 'actividades extra que registró'],
  incidencias_reportadas: ['incidencia que reportó', 'incidencias que reportó'],
  incidencias_como_responsable: ['incidencia donde figura como responsable', 'incidencias donde figura como responsable'],
  prenda_historial: ['movimiento de prenda en el historial', 'movimientos de prenda en el historial'],
  prenda_pasada_como_lavador: ['prenda que pasó como lavador/a', 'prendas que pasó como lavador/a'],
  prenda_pasada_como_planchador: ['prenda que pasó como planchador/a', 'prendas que pasó como planchador/a'],
  prenda_calificacion: ['calificación de prenda registrada', 'calificaciones de prenda registradas'],
  dispositivos_aprobados: ['dispositivo que aprobó', 'dispositivos que aprobó'],
  solicitudes_aprobadas: ['solicitud al almacén que aprobó', 'solicitudes al almacén que aprobó'],
  solicitudes_confirmadas: ['solicitud que confirmó', 'solicitudes que confirmó'],
  solicitudes_entregadas: ['solicitud que entregó', 'solicitudes que entregó'],
  solicitudes_rechazadas: ['solicitud que rechazó', 'solicitudes que rechazó'],
  caja_movimientos: ['movimiento de caja que registró', 'movimientos de caja que registró'],
  caja_sesiones_abiertas: ['sesión de caja que abrió', 'sesiones de caja que abrió'],
  caja_sesiones_cerradas: ['sesión de caja que cerró', 'sesiones de caja que cerró'],
  compras: ['compra donde figura como responsable', 'compras donde figura como responsable'],
  pedidos: ['pedido que creó', 'pedidos que creó'],
  pedido_garantias: ['garantía de pedido que creó', 'garantías de pedido que creó'],
  envios_accesorios_como_responsable: [
    'envío de accesorios donde figura como responsable',
    'envíos de accesorios donde figura como responsable',
  ],
  envios_accesorios_validados: ['envío de accesorios que validó', 'envíos de accesorios que validó'],
  envios_prendas: ['envío de prendas donde figura como responsable', 'envíos de prendas donde figura como responsable'],
  stock_movimientos: ['movimiento de stock que registró', 'movimientos de stock que registró'],
  accesorios_log: ['registro del historial de accesorios', 'registros del historial de accesorios'],
};

function etiquetaConteo(clave: string, n: number): string {
  const par = ETIQUETAS_CONTEO[clave];
  if (!par) return `${clave.replaceAll('_', ' ')} (sin traducir — avisar)`;
  return n === 1 ? par[0] : par[1];
}

export function BotonDeshacerAlta({ personaId, personaNombre }: { personaId: string; personaNombre: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [previo, setPrevio] = useState<BorrarAltaPrevio | null>(null);
  const [errorPrevio, setErrorPrevio] = useState('');
  const [errorBorrar, setErrorBorrar] = useState('');
  const [pendingBorrar, startBorrar] = useTransition();

  async function abrir() {
    setAbierto(true);
    setPrevio(null);
    setErrorPrevio('');
    setErrorBorrar('');
    setCargando(true);
    const r = await accionBorrarAltaPrevio(personaId);
    setCargando(false);
    if (!r.ok || !r.datos) {
      setErrorPrevio(r.error ?? 'No se pudo consultar qué se perdería.');
      return;
    }
    setPrevio(r.datos);
  }

  function cerrar() {
    if (pendingBorrar) return; // la acción está corriendo: no se abandona a mitad de camino
    setAbierto(false);
  }

  function confirmar() {
    startBorrar(async () => {
      setErrorBorrar('');
      const r = await accionBorrarAlta(personaId);
      if (!r.ok) {
        // Condición de carrera real (spec §3, paso 4): algo bloqueó entre el paso 1 y esta
        // confirmación. El diálogo se queda abierto con el motivo a la vista.
        setErrorBorrar(r.error ?? 'No se pudo borrar. Vuelve a intentarlo.');
        return;
      }
      setAbierto(false);
      // La persona ya no existe: quedarse en /personal/{id} sería un 404. La lista es lo único
      // que sigue teniendo sentido después de esto.
      router.push('/personal');
    });
  }

  const bloqueado = previo != null && previo.bloqueos.length > 0;
  const conteosVisibles = previo ? Object.entries(previo.conteos).filter(([, n]) => n > 0) : [];
  const puedeBorrar = !cargando && !errorPrevio && previo != null && !bloqueado;

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="anillo toque inline-flex items-center gap-1.5 whitespace-nowrap rounded-r-pastilla border border-line px-2.5 py-1.5 text-apoyo font-medium text-muted transition-colors duration-150 hover:border-error-line hover:bg-error-soft hover:text-error-deep"
        title="Deshacer un alta de personal hecha por error. Sólo funciona si la persona no tiene pagos, contratos ni evaluaciones."
      >
        <Undo2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Deshacer alta
      </button>

      <Modal
        open={abierto}
        onClose={cerrar}
        title={bloqueado ? 'No se puede deshacer esta alta' : 'Deshacer el alta de esta persona'}
        subtitle={personaNombre}
        size="sm"
      >
        <ModalBody>
          {cargando && <p className="text-cuerpo text-muted">Comprobando qué se perdería…</p>}

          {!cargando && errorPrevio && <Aviso tono="error">{errorPrevio}</Aviso>}

          {!cargando && previo && (
            <div className="space-y-3 text-cuerpo">
              {bloqueado ? (
                <>
                  <p className="text-ink">
                    No se puede borrar a <strong>{personaNombre}</strong>: ya tiene algo que la
                    empresa necesita conservar.
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-error-deep">
                    {previo.bloqueos.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <p className="text-apoyo text-muted">
                    Si esta persona ya no trabaja acá, usa «Suspender» en la pestaña Datos — corta
                    el acceso y conserva todo.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-ink">
                    Vas a borrar a <strong>{personaNombre}</strong>. Esto no se puede deshacer.
                  </p>
                  {conteosVisibles.length === 0 ? (
                    <p className="text-muted">
                      No tiene ningún rastro en el sistema: se borra sin dejar nada suelto.
                    </p>
                  ) : (
                    <>
                      <p className="text-muted">Esto se pierde de su historial y no se recupera:</p>
                      <ul className="list-disc space-y-1 pl-5 text-muted">
                        {conteosVisibles.map(([clave, n]) => (
                          <li key={clave}>
                            {n} {etiquetaConteo(clave, n)}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {errorBorrar && (
            <Aviso tono="error" className="mt-3">
              {errorBorrar}
            </Aviso>
          )}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={cerrar} disabled={pendingBorrar}>
            {puedeBorrar ? 'Cancelar' : 'Cerrar'}
          </Button>
          {puedeBorrar && (
            <Button type="button" onClick={confirmar} pending={pendingBorrar} className="bg-error hover:bg-error-deep">
              Borrar definitivamente
            </Button>
          )}
        </ModalFooter>
      </Modal>
    </>
  );
}
