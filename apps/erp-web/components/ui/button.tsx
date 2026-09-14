import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './spinner';

type Variant = 'primary' | 'gold' | 'outline' | 'ghost';

// Los dos botones con fondo se levantan al pasar el mouse (sombra teñida del acento + 1px hacia
// arriba) y ceden al presionar. Antes sólo cambiaban de color, que sobre navy o sobre oro casi no
// se nota: el botón principal de cada pantalla se sentía inerte.
const variants: Record<Variant, string> = {
  primary: 'bg-navy text-paper shadow-elev-1 hover:bg-navy-dark hover-fine:-translate-y-px hover:shadow-elev-2',
  gold: 'bg-gold text-navy-deep shadow-elev-1 hover:bg-gold-soft hover-fine:-translate-y-px hover:shadow-elev-2',
  outline: 'border border-navy/25 text-navy hover:border-gold hover:bg-gold/10',
  ghost: 'text-navy hover:bg-acento-soft',
};

// transition acotada (no `all`) + curva propia + feedback al presionar. `duration-instante` +
// `scale(.985)` son la pieza `presion` del catálogo de movimiento (spec §6, ítem 1): en
// pantalla táctil no hay `:hover`, así que esto es la única confirmación de que el toque llegó.
// El foco es `.anillo` — dorado siempre, es la única señal de accesibilidad del sistema.
const base =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-r-pastilla px-4 py-2 text-cuerpo font-medium transition-[transform,background-color,color,box-shadow,border-color] duration-instante ease-estado active:scale-[.985] anillo disabled:cursor-not-allowed disabled:opacity-50';

// `grande` (44px de alto tocable) es para lo que se llena de pie — formularios de operario
// (spec §3.11). El tamaño por defecto no cambia: sigue siendo el de siempre.
const tamanos = {
  normal: '',
  grande: 'min-h-[44px] px-5 text-base',
};

export function buttonVariants({ variant = 'primary', size = 'normal' }: { variant?: Variant; size?: keyof typeof tamanos } = {}) {
  return cn(base, variants[variant], tamanos[size]);
}

// `pending` (Fase 3): antes NINGÚN botón del proyecto mostraba que una acción estaba en curso —
// el usuario solo veía "se bugea o demora". Con `pending` el botón se deshabilita solo, marca
// `aria-busy` y antepone un Spinner que hereda el color del texto vía currentColor. Los call
// sites que ya alternaban su propio texto ("Guardando…") lo pueden seguir haciendo tal cual: el
// spinner es un añadido, no un reemplazo del label.
export function Button({
  variant = 'primary',
  size = 'normal',
  pending = false,
  disabled,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof tamanos; pending?: boolean }) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
