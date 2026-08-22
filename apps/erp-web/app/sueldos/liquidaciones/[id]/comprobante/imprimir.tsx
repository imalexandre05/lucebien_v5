'use client';

import { Printer } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';

/** Envuelto en print:hidden: el boton no sale en el papel. */
export function ImprimirResumen() {
  return (
    <div className="mb-4 flex justify-end print:hidden">
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
        Imprimir
      </Button>
    </div>
  );
}
