import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import Image from 'next/image';
import { cn } from '../../lib/cn';

// Estado vacío estándar (§4D): ícono sereno + título + copy útil + acción opcional.
// Un solo lenguaje para todos los módulos; nada de huecos ni "no hay datos" a secas.
//
// El sello de agua (spec "Ocho afinados") es lo que más cambia el carácter de un hueco vacío: un
// ícono gris de librería se lee como un error del navegador, la marca al 5% se lee como parte del
// sistema. Es `logo_lion_black.png` suelto —no la chapa de `LogoMark`—, que a esa opacidad se ve
// como una sombra tenue y no como un cuadro navy apagado.
export function EmptyState({
  icon: Icon,
  titulo,
  children,
  accion,
  compacto = false,
  className,
}: {
  icon: LucideIcon;
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
  compacto?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center gap-2 overflow-hidden px-5 text-center',
        compacto ? 'py-8' : 'py-12',
        className,
      )}
    >
      <Image
        src="/assets/logo_lion_black.png"
        alt=""
        width={140}
        height={134}
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-auto w-32 -translate-x-1/2 -translate-y-1/2 opacity-5"
      />
      <Icon className="relative h-9 w-9 text-line" strokeWidth={1.25} aria-hidden />
      <p className="relative text-sub font-body font-semibold text-ink">{titulo}</p>
      {children && <p className="relative max-w-sm text-apoyo text-muted">{children}</p>}
      {accion && <div className="relative mt-2">{accion}</div>}
    </div>
  );
}
