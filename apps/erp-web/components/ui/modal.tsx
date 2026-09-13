'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

// Modal compartido: overlay con fade + panel centrado con scale-in (origen centro, como debe ser
// para modales — no anclados a un trigger). Añade lo que los modales a mano no tenían: cerrar con
// Escape, bloqueo de scroll del fondo, foco al abrir y a11y (role=dialog, aria-modal). Consistente
// en todo el ERP: mismo overlay, misma curva, mismo header/footer.

type Size = 'sm' | 'md' | 'lg' | 'xl';
const SIZES: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  size?: Size;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // POR QUÉ `onClose` VA EN UN REF Y NO EN LAS DEPENDENCIAS. Éste era el bug de "escribo una letra
  // y el campo se deselecciona", y estaba acá, en una pieza compartida, así que pasaba en TODOS los
  // modales del sistema.
  //
  // Las 27 pantallas que abren un modal pasan `onClose={() => setAbierto(null)}`: una función nueva
  // en cada render. Con `onClose` en las dependencias, el efecto se volvía a ejecutar en cada
  // render — y el efecto termina en `panelRef.current?.focus()`. O sea: escribías una letra, el
  // estado cambiaba, React re-renderizaba, y el efecto le robaba el foco al input y se lo daba al
  // panel. La letra siguiente ya no llegaba al campo.
  //
  // El ref guarda siempre la última versión de `onClose` sin entrar en las dependencias, así que
  // Escape sigue llamando a la función correcta y el efecto corre una sola vez: al abrir.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // POR QUÉ VA POR PORTAL A <body> (12-sep-2026). `PageTransition` envuelve TODO el contenido de
  // la ruta en un `animate-page-enter`, y una animación con `transform` crea un contexto de
  // apilamiento propio. El modal vivía dentro de ese contexto, así que su `z-50` no competía con
  // la página: competía con sus hermanos. Resultado visible en /solicitudes — el velo oscurecía
  // todo MENOS la franja de la topbar, que se dibujaba por encima. Sacarlo al body lo devuelve al
  // contexto raíz y su z-50 vuelve a valer contra header (z-30) y popovers (z-40).
  //
  // `montado` evita tocar `document` en el render del servidor.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !montado) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex animate-fade items-center justify-center bg-navy-deep/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          // EL MODAL NO SE PASA DE LA PANTALLA.
          //
          // No tenía alto máximo ni scroll: un modal largo —el de evaluar, el de una solicitud con
          // varias prendas— crecía hacia abajo y el pie con los botones quedaba fuera de la
          // ventana, sin forma de llegar. No se podía ni guardar ni cancelar.
          //
          // `dvh` y no `vh`: en el celular la barra del navegador aparece y desaparece, y con `vh`
          // el pie queda tapado justo cuando la barra está.
          //
          // Columna flex: la cabecera y el pie quedan fijos y lo único que scrollea es el cuerpo.
          // Un modal donde el título se va al scrollear pierde de qué estabas hablando.
          'flex w-full max-h-[calc(100dvh-2rem)] flex-col animate-scale-in rounded-r-grande border border-line bg-superficie shadow-elev-3 outline-none',
          SIZES[size],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || icon) && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              {icon}
              <div className="min-w-0">
                {title && (
                  <div className="truncate text-seccion font-display font-semibold text-navy">{title}</div>
                )}
                {subtitle && <div className="truncate text-apoyo text-muted">{subtitle}</div>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-r-pastilla text-muted transition-colors duration-150 hover:bg-navy/5 hover:text-navy active:scale-[0.95]"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

// El cuerpo es lo único que scrollea. `min-h-0` hace falta: sin eso, un hijo flex se niega a
// achicarse por debajo de su contenido y el scroll nunca aparece.
export function ModalBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', className)}>{children}</div>;
}

export function ModalFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
