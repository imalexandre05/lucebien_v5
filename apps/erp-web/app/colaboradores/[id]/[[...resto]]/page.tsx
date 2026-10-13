import { use } from 'react';
import { redirect } from 'next/navigation';

// Rutas viejas de una persona (fusión de menú, 23-ago-2026): /colaboradores/[id] y todas sus
// secciones se mudaron a /personal/[id]. El catch-all opcional atrapa las dos formas con el mismo
// archivo: sin `resto` es la persona a secas (antes app/colaboradores/[id]/page.tsx), con `resto`
// es una sección (antes app/colaboradores/[id]/<seccion>/page.tsx). Se conserva la query.
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

export default function ColaboradorIdRedirect(
  props: {
    params: Promise<{ id: string; resto?: string[] }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = props.searchParams ? use(props.searchParams) : undefined;
  const params = use(props.params);
  const resto = params.resto?.length ? `/${params.resto.join('/')}` : '';
  redirect(`/personal/${params.id}${resto}${query(searchParams)}`);
}
