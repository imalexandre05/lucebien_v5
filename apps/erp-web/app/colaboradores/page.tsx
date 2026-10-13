import { use } from 'react';
import { redirect } from 'next/navigation';

// Ruta vieja de la lista (fusión de menú, 23-ago-2026): el módulo se mudó a /personal, pero un
// enlace guardado o una pestaña vieja no se puede romper. Se conserva la query — desde/hasta del
// período— para que la redirección no pierda dónde estaba parada la persona.
function query(searchParams?: Record<string, string | string[] | undefined>): string {
  if (!searchParams) return '';
  const sp = new URLSearchParams();
  for (const [clave, valor] of Object.entries(searchParams)) {
    if (valor === undefined) continue;
    if (Array.isArray(valor)) valor.forEach((v) => sp.append(clave, v));
    else sp.append(clave, valor);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export default function ColaboradoresRedirect(
  props: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = props.searchParams ? use(props.searchParams) : undefined;
  redirect(`/personal${query(searchParams)}`);
}
