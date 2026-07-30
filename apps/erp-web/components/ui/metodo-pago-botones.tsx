'use client';

import { OpcionBotones } from './opcion-botones';

// Métodos de pago del POS. Extraído del `OPC_METODO` que vivía suelto en app/caja/cliente.tsx
// (Fase 9, plan: "Extraer a compartidos... metodo-pago-botones.tsx") para que /caja y el
// constructor de /pedidos usen el mismo componente y la misma lista.
//
// Fase 10: configurable desde `config` (`pos_metodos_pago`, ver lib/pos-config.ts) — el server
// component de cada página lee y parsea la lista y la pasa por `opciones`; este componente
// 'use client' no puede leer `config` directo (arrastraría next/headers al bundle). Sin
// `opciones`, cae a esta MISMA lista que ya usaba /caja antes de la Fase 10 — nunca se rompe por
// falta de prop en algún lugar que aún no se actualizó.
export const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'yape', label: 'Yape' },
  { value: 'transferencia', label: 'Transferencia' },
] as const;

export type MetodoPago = (typeof METODOS_PAGO)[number]['value'];

export function MetodoPagoBotones({
  value,
  onChange,
  opciones,
  ariaLabel = 'Método de pago',
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  opciones?: { value: string; label: string }[];
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <OpcionBotones
      opciones={opciones ?? (METODOS_PAGO as unknown as { value: string; label: string }[])}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      disabled={disabled}
      className={className}
    />
  );
}
