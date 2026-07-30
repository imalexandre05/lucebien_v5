'use client';

import { OpcionBotones } from './opcion-botones';

// Métodos de pago del POS. Extraído del `OPC_METODO` que vivía suelto en app/caja/cliente.tsx
// (Fase 9, plan: "Extraer a compartidos... metodo-pago-botones.tsx") para que /caja y el
// constructor de /pedidos usen el mismo componente y la misma lista. La Fase 10 los hace
// configurables desde `config` (`pos_metodos_pago`) — hasta entonces, esta es la lista real que
// ya usaba /caja, sin inventar ninguna nueva.
export const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'yape', label: 'Yape' },
  { value: 'transferencia', label: 'Transferencia' },
] as const;

export type MetodoPago = (typeof METODOS_PAGO)[number]['value'];

export function MetodoPagoBotones({
  value,
  onChange,
  ariaLabel = 'Método de pago',
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <OpcionBotones
      opciones={METODOS_PAGO as unknown as { value: string; label: string }[]}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      disabled={disabled}
      className={className}
    />
  );
}
