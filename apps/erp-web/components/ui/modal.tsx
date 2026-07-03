'use client';

import { useEffect, useRef, type ReactNode } from 'react';
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
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
          'w-full animate-scale-in rounded-2xl border border-line bg-white shadow-lift outline-none',
          SIZES[size],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || icon) && (
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              {icon}
              <div className="min-w-0">
                {title && (
                  <div className="truncate font-display text-lg font-semibold text-navy">{title}</div>
                )}
                {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-navy/5 hover:text-navy active:scale-[0.95]"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function ModalBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

export function ModalFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 border-t border-line px-5 py-4', className)}
    >
      {children}
    </div>
  );
}
