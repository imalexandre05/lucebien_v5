'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '../../components/ui/button';

// Botón de submit con estado real del server action: deshabilitado y con
// feedback mientras Supabase valida (checklist §6: botón deshabilitado durante async).
// El spinner ahora lo pone Button vía `pending` (Fase 3) — antes era el único lugar del
// proyecto con feedback de carga, armado a mano con un Loader2 propio.
export function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} className="w-full py-2.5">
      {pending ? 'Ingresando…' : 'Ingresar'}
    </Button>
  );
}
