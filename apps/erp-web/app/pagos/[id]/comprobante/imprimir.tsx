'use client';

import Link from 'next/link';
import { Printer } from 'lucide-react';
import { buttonVariants } from '../../../../components/ui/button';

export function AccionesComprobante() {
  return (
    <div className="mb-4 flex items-center gap-3 print:hidden">
      <button type="button" onClick={() => window.print()} className={buttonVariants({ variant: 'primary' })}>
        <Printer className="h-4 w-4" strokeWidth={2} />
        Imprimir
      </button>
      <Link href="/pagos" className="text-sm text-muted transition-colors duration-150 hover:text-navy">
        ← Volver a pagos
      </Link>
    </div>
  );
}
