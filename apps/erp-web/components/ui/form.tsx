import type {
  HTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  LabelHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// Los campos del ERP. Acá se pasa el día la gente, así que cada estado cuenta.
//
// QUÉ LES FALTABA. Tenían foco y nada más: ni respuesta al pasar el mouse, ni forma de verse
// deshabilitados, ni manera de decir "este campo está mal". El error terminaba siendo un párrafo
// rojo suelto arriba del formulario, lejos del campo que lo causó y sin que un lector de pantalla
// lo relacione con nada.
//
// El estado de error se pinta desde `aria-invalid`, no desde una prop propia. Así la marca visual y
// la que anuncia el lector de pantalla son EL MISMO dato: no se pueden desincronizar.
const fieldBase =
  'w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 ' +
  'transition-[border-color,box-shadow,background-color] duration-150 ease-out-expo ' +
  'hover:border-navy/25 ' +
  'focus:border-navy/40 focus:outline-none focus:ring-2 focus:ring-gold/30 ' +
  'disabled:cursor-not-allowed disabled:border-line disabled:bg-paper disabled:text-muted ' +
  'aria-[invalid=true]:border-error aria-[invalid=true]:bg-error-soft/50 ' +
  'aria-[invalid=true]:focus:ring-error/25';

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn(fieldBase, className)} {...p} />
);

export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(fieldBase, 'cursor-pointer disabled:cursor-not-allowed', className)} {...p} />
);

export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cn(fieldBase, 'min-h-[80px] resize-y', className)} {...p} />
);

export const Label = ({
  className,
  required,
  children,
  ...p
}: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) => (
  <label className={cn('mb-1 block text-xs font-medium text-muted', className)} {...p}>
    {children}
    {required && (
      // El asterisco es dorado y no rojo: obligatorio no es un error todavía. El texto entre
      // paréntesis es para quien no ve el color — un asterisco solo no dice nada en voz alta.
      <span className="ml-0.5 font-semibold text-gold-deep">
        *<span className="sr-only"> (obligatorio)</span>
      </span>
    )}
  </label>
);

/**
 * El título de un GRUPO de controles: un picker compuesto, un radiogroup, una sección de campos.
 *
 * POR QUÉ NO ALCANZA CON `Label`. Un `<label>` sin `htmlFor` y sin control adentro no rotula nada:
 * el lector de pantalla lo anuncia suelto o lo ignora, y la persona escucha el campo sin saber de
 * qué es. Pasaba en tres lugares de Contratos —«Persona», «Modalidad de pago», «Horario
 * contratado»—, que no rotulan un control sino un widget entero.
 *
 * Se ve igual que `Label`. Lo que cambia es que no promete una relación que no existe: al grupo lo
 * nombra su propio `aria-label`, que es donde el lector sí lo busca.
 */
export const LabelGrupo = ({ className, ...p }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('mb-1 block text-xs font-medium text-muted', className)} {...p} />
);

/**
 * El aviso de una operación: lo que salió mal, lo que salió bien, lo que hay que mirar.
 *
 * Estaba escrito a mano en cada pantalla, con un rojo distinto cada vez. Acá usa los semánticos del
 * manual y sale igual en todos lados.
 */
export function Aviso({
  tono = 'error',
  titulo,
  children,
  className,
}: {
  tono?: 'error' | 'aviso' | 'exito' | 'info';
  titulo?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tonos = {
    error: 'border-error-line bg-error-soft text-error-deep',
    aviso: 'border-aviso-line bg-aviso-soft text-aviso-deep',
    exito: 'border-exito-line bg-exito-soft text-exito-deep',
    info: 'border-info-line bg-info-soft text-info-deep',
  } as const;

  return (
    <div
      // Sólo el error interrumpe. Un acierto o un dato se leen cuando la persona llegue: anunciar
      // todo con la misma urgencia enseña a ignorar los avisos.
      role={tono === 'error' ? 'alert' : 'status'}
      className={cn('animate-fade rounded-md border px-3 py-2 text-xs leading-relaxed', tonos[tono], className)}
    >
      {titulo && <p className="font-semibold">{titulo}</p>}
      {children}
    </div>
  );
}
