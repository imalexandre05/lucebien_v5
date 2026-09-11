'use client';

import { cn } from '../../lib/cn';

export type Opcion<T extends string = string> = {
  value: T;
  label: string;
  // Color real —de una tela, no del sistema de diseño— que se dibuja como punto a la izquierda.
  // Sin él, `Azul acero` y `Azul presidente` leídos en una lista no se distinguen.
  punto?: string;
};

// Extraído del patrón de pills que ya usaba el selector de Tipo en pedidos/cliente.tsx (Fase 3):
// botones > selects para cualquier grupo de ≤5 opciones — más rápido de tocar en mostrador que
// abrir un <select>, y el valor elegido queda siempre a la vista sin abrir nada.
//
// TAMAÑO. `compacto` es el de siempre y sigue siendo el default: en una barra de filtros, al lado
// de otros controles chicos, un pill grande desentona y empuja la pantalla.
//
// `grande` es para el formulario que se llena de pie y con el pulgar —lavandería, registrar
// prenda—: llega a 44px de alto de verdad, con relleno real y no con un área invisible.
//
// POR QUÉ NO SE USA `toque` ACÁ. `toque` estira el área tocable con un ::after de 44px centrado.
// Sirve cuando los controles están apilados con aire; estos botones se envuelven en varias filas
// con 8px de separación, así que las áreas de una fila se comerían los toques de la de arriba.
// Cuando el control se toca de verdad, se agranda el control.
const TAMANOS = {
  compacto: 'px-3 py-1.5 text-apoyo',
  grande: 'px-3 py-2.5 text-cuerpo',
} as const;

// FILA vs GRILLA. En fila los botones son pills que se envuelven y ocupan lo que mide su texto:
// sirve para un grupo corto dentro de una barra.
//
// En grilla todas las celdas miden lo mismo y quedan alineadas en columnas. Es la disposición del
// sistema viejo —la que el equipo ya sabe leer— y para dieciocho tallas es la única que se
// escanea de un vistazo: con pills de ancho variable, buscar el «10» es leer la fila entera.
// Las columnas las pone quien llama, con `className`, porque dependen del largo de las etiquetas.
const LAYOUTS = {
  fila: 'flex flex-wrap gap-2',
  grilla: 'grid gap-2',
} as const;

export function OpcionBotones<T extends string = string>({
  opciones,
  value,
  onChange,
  ariaLabel,
  className,
  disabled,
  tamano = 'compacto',
  layout = 'fila',
}: {
  opciones: Opcion<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  tamano?: keyof typeof TAMANOS;
  layout?: keyof typeof LAYOUTS;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn(LAYOUTS[layout], className)}>
      {opciones.map((o) => {
        const activo = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={activo}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center justify-center gap-2 border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              layout === 'grilla' ? 'rounded-md text-center' : 'rounded-r-pastilla',
              TAMANOS[tamano],
              activo ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-gold',
            )}
          >
            {o.punto && (
              <span
                aria-hidden
                className={cn(
                  'h-3.5 w-3.5 shrink-0 rounded-r-pastilla border',
                  // El borde va siempre, no sólo en el blanco: sin él, el negro sobre el navy del
                  // botón elegido desaparece.
                  activo ? 'border-paper/60' : 'border-ink/20',
                )}
                style={{ background: o.punto }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
