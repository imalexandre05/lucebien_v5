import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { Luz } from '../../lib/dashboard-semaforos';

// Semáforo del dashboard. El color nunca va solo: cada luz lleva icono y palabra, para que se lea
// igual con daltonismo y en blanco y negro (sesión 8B).
const LUZ: Record<Luz, { cls: string; icono: LucideIcon; texto: string }> = {
  verde: { cls: 'border-exito-line bg-exito-soft text-exito-deep', icono: CheckCircle2, texto: 'Al día' },
  ambar: { cls: 'border-aviso-line bg-aviso-soft text-aviso-deep', icono: AlertTriangle, texto: 'Atención' },
  rojo: { cls: 'border-error-line bg-error-soft text-error-deep', icono: XCircle, texto: 'Urgente' },
};

export function PuntoLuz({ luz }: { luz: Luz }) {
  const { cls, icono: Icono, texto } = LUZ[luz];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-r-pastilla border px-2 py-0.5 text-micro font-semibold', cls)}>
      <Icono className="h-3 w-3" strokeWidth={2} aria-hidden />
      {texto}
    </span>
  );
}

/** Tarjeta de métrica con semáforo y enlace a donde se resuelve. */
export function TarjetaLuz({
  titulo,
  valor,
  detalle,
  luz,
  href,
  icono: Icono,
}: {
  titulo: string;
  valor: ReactNode;
  detalle: string;
  luz: Luz;
  href: string;
  icono: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'anillo group flex flex-col gap-2 rounded-r-medio border p-4 shadow-elev-1 transition-transform duration-150 hover:-translate-y-0.5',
        LUZ[luz].cls,
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-apoyo font-semibold">
          <Icono className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {titulo}
        </span>
        <PuntoLuz luz={luz} />
      </span>
      <span className="tabular-nums font-display text-cifra font-semibold leading-none">{valor}</span>
      <span className="text-apoyo opacity-90">{detalle}</span>
      <span className="text-micro font-medium opacity-80 group-hover:underline">Ver y resolver →</span>
    </Link>
  );
}
