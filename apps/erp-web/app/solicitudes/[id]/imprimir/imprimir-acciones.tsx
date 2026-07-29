'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { accionMarcarImpreso } from '../../actions';
import { PrintButton } from '../../../../components/print-button';
import { Button } from '../../../../components/ui/button';

// Botones de la barra superior del formato (no imprimen — `print:hidden`). "Marcar como impresa"
// es lo mismo que el viejo PUT /:id/marcar-impreso (soliShowUndo lo disparaba tras el clic en
// 🖨 Formato Pedido / 🖨 Confirmación); acá es explícito porque no hay journey de impresión
// automática al abrir la pestaña — el usuario decide cuándo quedó realmente impreso en papel.
export function ImprimirAcciones({ id, tipo, yaImpreso }: { id: string; tipo: 'pedido' | 'confirmacion'; yaImpreso: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function marcar() {
    startTransition(async () => {
      await accionMarcarImpreso(id, tipo);
      router.refresh();
    });
  }

  return (
    <div className="mb-4 flex justify-end gap-2 print:hidden">
      <Button type="button" variant="outline" onClick={marcar} pending={pending} disabled={yaImpreso}>
        {yaImpreso ? 'Ya marcada como impresa' : pending ? 'Marcando…' : 'Marcar como impresa'}
      </Button>
      <PrintButton />
    </div>
  );
}
