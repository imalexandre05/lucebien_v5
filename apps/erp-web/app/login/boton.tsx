'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';

// Botón de submit con estado real del server action: deshabilitado y con
// feedback mientras Supabase valida (checklist §6: botón deshabilitado durante async).
export function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full py-2.5">
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
          Ingresando…
        </>
      ) : (
        'Ingresar'
      )}
    </Button>
  );
}
