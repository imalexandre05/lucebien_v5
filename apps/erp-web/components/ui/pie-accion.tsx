import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

// Pie pegajoso de formulario: acción primaria, estado de guardado y motivo de bloqueo (spec §7
// "Seis de estructura") — reemplaza el bloque de botones al final de cada formulario.
//
// `motivo` se ve TAMBIÉN en el teléfono, sin `hidden sm:inline` — ya costó una vez, en el
// formulario del turno, justo donde más falta hacía (sistema-de-diseno.md §6, "Un control
// deshabilitado dice por qué").
export function PieAccion({
  motivo,
  estado,
  children,
  className,
}: {
  /** Por qué la acción primaria está bloqueada, o `null` si no lo está. */
  motivo?: string | null;
  /** Texto corto de guardado en curso ("Se guarda automáticamente"), independiente del motivo. */
  estado?: ReactNode;
  /** Los botones — la acción primaria y las que hagan falta. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-0 flex flex-wrap items-center gap-3 rounded-r-grande border border-line bg-superficie px-4 py-3 shadow-elev-2',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 text-apoyo">
        {motivo ? (
          <span id="motivo-pie-accion" className="text-aviso-deep">
            {motivo}
          </span>
        ) : (
          estado && <span className="text-muted">{estado}</span>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
