'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, ModalBody, ModalFooter } from './modal';
import { Button, buttonVariants } from './button';
import { Aviso } from './form';
import { cn } from '../../lib/cn';

// La confirmación de algo que no se puede deshacer.
//
// POR QUÉ NO `window.confirm()`. Bloquea la página, no se puede escribir en el idioma ni el tono
// del sistema, y en el celular se lee como una advertencia del navegador y no de LuceBien. Y son
// justo los diálogos que preceden a lo irreversible: eliminar una asistencia, anular un pago,
// suspender a una persona. El aviso más importante del sistema no puede ser el único que se ve
// como si viniera de afuera.
//
// El patrón ya existía a mano en reportes/[id]/acciones.tsx; acá se saca a una pieza para que
// convertir un `confirm()` sean cuatro líneas y no un rediseño.
//
// LO QUE APORTA SOBRE EL NATIVO, además del aspecto: se puede explicar la consecuencia en una
// segunda línea, el botón que confirma dice QUÉ hace («Eliminar», no «Aceptar»), el error del
// intento se muestra dentro del propio diálogo en vez de perderse, y mientras la acción corre el
// diálogo queda abierto con su botón en estado pendiente.

export type Peticion = {
  titulo: string;
  /** La consecuencia, en una línea. Es lo que el confirm nativo nunca dejó decir bien. */
  detalle?: ReactNode;
  /** Qué dice el botón que confirma. Un verbo, no «Aceptar». */
  confirmarLabel?: string;
  /** `peligro` para lo irreversible; `aviso` para lo que sólo conviene mirar dos veces. */
  tono?: 'peligro' | 'aviso';
  alConfirmar: () => void;
};

/**
 * Guarda la petición en curso. Se usa así:
 *
 * ```tsx
 * const conf = useConfirmacion();
 * <button onClick={() => conf.pedir({ titulo: '¿Eliminar?', alConfirmar: () => borrar(id) })} />
 * <DialogoConfirmar {...conf.props} pending={pending} error={error} />
 * ```
 */
export function useConfirmacion() {
  const [peticion, setPeticion] = useState<Peticion | null>(null);
  return {
    pedir: (p: Peticion) => setPeticion(p),
    cerrar: () => setPeticion(null),
    props: { peticion, onCerrar: () => setPeticion(null) },
  };
}

export function DialogoConfirmar({
  peticion,
  onCerrar,
  pending = false,
  error,
}: {
  peticion: Peticion | null;
  onCerrar: () => void;
  pending?: boolean;
  /** El error del intento. Se muestra acá adentro: cerrar el diálogo lo haría desaparecer. */
  error?: string;
}) {
  const peligro = peticion?.tono !== 'aviso';

  return (
    <Modal
      open={peticion !== null}
      // Mientras la acción corre, cerrar dejaría a la persona sin saber cómo terminó.
      onClose={() => !pending && onCerrar()}
      size="sm"
      title={peticion?.titulo}
      icon={
        <AlertTriangle
          className={cn('h-5 w-5 shrink-0', peligro ? 'text-error' : 'text-aviso')}
          strokeWidth={2}
          aria-hidden
        />
      }
    >
      <ModalBody>
        {peticion?.detalle && (
          <p className="text-sm leading-relaxed text-muted">{peticion.detalle}</p>
        )}
        {error && <Aviso tono="error" className="mt-3">{error}</Aviso>}
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          onClick={onCerrar}
          disabled={pending}
          className={buttonVariants({ variant: 'ghost' })}
        >
          Cancelar
        </button>
        <Button
          type="button"
          onClick={() => peticion?.alConfirmar()}
          pending={pending}
          className={cn(peligro && 'bg-error hover:bg-error-deep')}
        >
          {peticion?.confirmarLabel ?? 'Confirmar'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
