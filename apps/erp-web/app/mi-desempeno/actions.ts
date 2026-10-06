'use server';

import { revalidatePath } from 'next/cache';
import { definirPin, type ResultadoPin } from '../../lib/pipeline-repo';

// PIN personal para los equipos compartidos (migración 0112, spec codigo-personal §0 E-1). La base
// valida largo, triviales y el PIN actual, cuenta los intentos fallidos y guarda sólo el hash.
export async function guardarPin(nuevo: string, actual: string | null): Promise<ResultadoPin> {
  const n = (nuevo ?? '').trim();
  const a = (actual ?? '').trim();
  const r = await definirPin(n, a || null);
  if (r.ok) revalidatePath('/mi-desempeno');
  return r;
}
