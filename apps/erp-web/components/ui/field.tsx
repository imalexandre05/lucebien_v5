'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Label } from './form';

// `Field` vive aparte de form.tsx y no por gusto: usa `useId`, así que es cliente, y tres páginas
// de servidor importan Input/Label de allá. Mezclarlos arrastraría esas páginas al bundle del
// navegador sin necesidad.
//
// Consecuencia a tener presente: `children` es una función, y una función no cruza de servidor a
// cliente. `Field` se usa dentro de componentes de cliente. Para un formulario de servidor van
// Label e Input sueltos, como hasta ahora.

/**
 * Un campo completo: etiqueta, control, y su ayuda o su error.
 *
 * POR QUÉ ENVUELVE EN VEZ DE DEJARLO SUELTO. Atar la etiqueta al control y el error al control es
 * un `id` y un `aria-describedby` que hay que acertar en cada formulario; con veinte pantallas,
 * alguno se escribe mal y nadie se entera hasta que alguien navega con teclado. Acá se genera una
 * sola vez.
 *
 * `children` recibe las props ya armadas, así que el control sigue siendo el que cada pantalla
 * quiera —Input, Select, Textarea o uno propio— y no hay que enumerarlos acá.
 */
export function Field({
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  /** Cuando hay error, la ayuda se calla: dos mensajes compitiendo confunden más que uno solo. */
  error?: string | null;
  hint?: ReactNode;
  className?: string;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const hayError = Boolean(error);

  return (
    <div className={className}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({
        id,
        'aria-invalid': hayError,
        'aria-describedby': hayError || hint ? idAyuda : undefined,
      })}
      {hayError ? (
        // `role="alert"` para que el lector de pantalla lo anuncie al aparecer, sin esperar a que
        // alguien navegue hasta ahí.
        <p id={idAyuda} role="alert" className="mt-1 flex items-start gap-1 text-xs text-error-deep">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={idAyuda} className="mt-1 text-xs leading-relaxed text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
