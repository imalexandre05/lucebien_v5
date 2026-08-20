import Link from 'next/link';
import { Check } from 'lucide-react';
import { corteDelHilo, type Pendiente } from '../../lib/colaboradores-pasos';
import { cn } from '../../lib/cn';

// EL HILO. Los cinco pasos que separan a una persona de su pago, dibujados como un hilo que se
// enhebra de izquierda a derecha: dorado donde ya está cosido, gris donde falta.
//
// POR QUÉ ASÍ Y NO UNA LISTA DE CHECKS. La pregunta que el administrador se hace no es "¿cuáles
// están listos?" sino "¿dónde se cortó?". Un hilo tiene una dirección y un punto de corte; una
// lista de checks hay que leerla entera. Y el punto de corte es lo único accionable: el motor de
// sueldos ya se niega a liquidar el período si falta un día por declarar, así que no tiene sentido
// mirar la evaluación antes de resolver eso.
//
// Es además la metáfora de la casa: LuceBien confecciona. El hilo dorado ya es vocabulario del
// sistema, no un adorno traído de afuera.
//
// El mismo componente sirve en la lista (compacto, sin etiquetas) y en la persona (completo). Dos
// piezas distintas se irían desincronizando en cuanto cambie un paso.

const TONO = {
  listo: {
    circulo: 'border-navy bg-navy text-paper',
    linea: 'bg-gold',
  },
  corte: {
    circulo: 'border-aviso bg-white text-aviso-deep ring-4 ring-aviso/20',
    linea: 'bg-line',
  },
  pendiente: {
    circulo: 'border-line bg-white text-muted',
    linea: 'bg-line',
  },
} as const;

type Estado = keyof typeof TONO;

/** El primer paso sin resolver es el corte; los siguientes son pendientes, no problemas. */
function estados(pasos: Pendiente[]): Estado[] {
  let yaHuboCorte = false;
  return pasos.map((p) => {
    if (p.listo) return 'listo';
    if (yaHuboCorte) return 'pendiente';
    yaHuboCorte = true;
    return 'corte';
  });
}

export function HiloPago({
  pasos,
  hrefDe,
  compacto = false,
  className,
}: {
  pasos: Pendiente[];
  /** Enlace a la sección que resuelve cada paso. Sin él el hilo es sólo informativo. */
  hrefDe?: (paso: Pendiente) => string;
  compacto?: boolean;
  className?: string;
}) {
  const est = estados(pasos);
  const corte = corteDelHilo(pasos);
  const resumen = corte ? `Falta: ${corte.titulo.toLowerCase()}` : 'Listo para pagar';

  if (compacto) {
    return (
      <div className={cn('flex items-center gap-1', className)} title={resumen}>
        <span className="sr-only">{resumen}</span>
        {pasos.map((p, i) => (
          <span
            key={p.clave}
            aria-hidden
            className={cn(
              'h-1.5 w-6 rounded-full transition-colors duration-200',
              est[i] === 'listo' ? 'bg-gold' : est[i] === 'corte' ? 'bg-aviso' : 'bg-line',
            )}
          />
        ))}
      </div>
    );
  }

  return (
    // En pantalla chica cinco pasos con etiqueta no entran: el hilo scrollea en su propia caja en
    // vez de apretujar las palabras hasta partirlas. La página no scrollea de costado.
    <div className="-mx-1 overflow-x-auto px-1">
      <ol className={cn('flex min-w-[34rem] items-start', className)}>
      {pasos.map((paso, i) => {
        const e = est[i];
        const href = hrefDe?.(paso);
        const contenido = (
          <>
            <span
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-mono text-xs font-semibold transition-colors duration-200',
                TONO[e].circulo,
              )}
            >
              {e === 'listo' ? <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : i + 1}
            </span>
            <span className="mt-2 block text-xs font-medium leading-tight text-ink">{paso.titulo}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted">{paso.detalle}</span>
          </>
        );

        return (
          <li
            key={paso.clave}
            aria-current={e === 'corte' ? 'step' : undefined}
            className="relative flex-1 text-center"
          >
            {/* El hilo entre este nodo y el anterior. Se dibuja de izquierda a derecha en la
                entrada; con transform, nunca con width, para que no haga reflow. */}
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  // top-5 y no top-4: el contenedor de cada paso tiene py-1, así que el centro
                  // del círculo de 32px cae a 20px del borde. Cuatro pixeles de más se ven.
                  'absolute left-[-50%] top-5 h-0.5 w-full origin-left animate-draw-x motion-reduce:animate-none',
                  TONO[est[i - 1] === 'listo' && e !== 'pendiente' ? 'listo' : e].linea,
                )}
                style={{ animationDelay: `${i * 80}ms`, animationDuration: '400ms' }}
              />
            )}
            {href ? (
              <Link
                href={href}
                className="flex flex-col items-center rounded-md px-1 py-1 outline-none transition-colors duration-150 hover:bg-paper/70 focus-visible:ring-2 focus-visible:ring-gold/60"
              >
                {contenido}
              </Link>
            ) : (
              <span className="flex flex-col items-center px-1 py-1">{contenido}</span>
            )}
          </li>
        );
      })}
      </ol>
    </div>
  );
}
