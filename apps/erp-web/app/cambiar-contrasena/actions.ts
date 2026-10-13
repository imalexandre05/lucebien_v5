'use server';

import { redirect } from 'next/navigation';
import { cambiarMiContrasena } from '../../lib/auth';

export type EstadoCambio = { errores: string[] };

// useFormState: devuelve los errores para pintarlos sin perder lo escrito; si sale bien, al inicio.
export async function accionCambiarContrasena(_prev: EstadoCambio, formData: FormData): Promise<EstadoCambio> {
  const res = await cambiarMiContrasena(
    String(formData.get('actual') ?? ''),
    String(formData.get('nueva') ?? ''),
    String(formData.get('repetir') ?? ''),
  );
  if (!res.ok) return { errores: res.errores };
  redirect('/?contrasena=cambiada');
}
