'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ROL_LABEL, type Rol } from '@scilb/core';
import type { Colaborador } from '../../../lib/colaboradores-repo';
import { Avatar } from '../../../components/colaboradores/avatar';
import { campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';
import { BotonDeshacerAlta } from './deshacer-alta';

// La cabecera de la persona: quién es, y el cambio rápido a otra.
//
// EL SELECTOR ES UN <select> NATIVO Y NO UN COMBOBOX PROPIO. Con dieciocho personas, el nativo se
// abre con el teclado, filtra escribiendo, funciona en el celular y no pesa nada. Un combobox
// hecho a mano acá sería más código para hacer peor lo mismo. Es también lo que hacía el módulo
// viejo, y ese detalle es parte de por qué se sentía rápido.
//
// Cambiar de persona conserva la sección y el período: si estabas mirando las asistencias de julio
// de alguien, pasás a las asistencias de julio de otro. Volver al principio en cada cambio era una
// de las cosas que hacían lento al ERP nuevo.

export function CabeceraColaborador({
  persona,
  personas,
  esAdmin,
}: {
  persona: Colaborador;
  personas: Colaborador[];
  /** «Deshacer alta» (C-3 de la spec 2026-08-25-borrar-alta-por-error-design.md): mismo público
      que «Suspender» — sólo administrador/dueño. Se recibe ya resuelto desde el layout en vez de
      leer la sesión acá: es el mismo criterio que `soloAdmin` de colaboradores-secciones.ts, pero
      la cabecera se muestra en TODAS las secciones (no sólo Datos), así que necesita su propio
      guard en vez de heredar el de una pestaña. */
  esAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, iniciar] = useTransition();
  const query = sp.toString();

  const cambiar = (nuevoId: string) => {
    if (!nuevoId || nuevoId === persona.id) return;
    // Se reemplaza sólo el segmento del id: /personal/<id>/<seccion> conserva <seccion>.
    const destino = pathname.replace(`/personal/${persona.id}`, `/personal/${nuevoId}`);
    iniciar(() => router.push(query ? `${destino}?${query}` : destino));
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <Link
        href={query ? `/personal?${query}` : '/personal'}
        className="toque inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted outline-none transition-colors duration-150 hover:bg-navy/5 hover:text-navy focus-visible:ring-2 focus-visible:ring-gold/60"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Todos
      </Link>

      <div className="flex min-w-0 items-center gap-3">
        <Avatar nombre={persona.nombre} iniciales={persona.iniciales} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl font-semibold leading-tight text-navy">
            {persona.nombre}
          </h1>
          <p className="truncate text-xs text-muted">
            {ROL_LABEL[persona.rol as Rol] ?? persona.rol}
            {persona.sedeCod ? ` · ${persona.sedeCod}` : ''}
            {persona.fechaIngreso ? ` · ingresó el ${persona.fechaIngreso}` : ''}
          </p>
        </div>
      </div>

      <div className="ml-auto">
        <label htmlFor="cambiar-colaborador" className="block text-[11px] font-medium uppercase tracking-wide text-muted">
          Ver a otra persona
        </label>
        <select
          id="cambiar-colaborador"
          value={persona.id}
          onChange={(e) => cambiar(e.target.value)}
          disabled={pendiente}
          className={cn(campoCls, 'min-w-[200px] cursor-pointer')}
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Sólo admin/dueño, mismo público que Suspender (pestaña Datos). Ícono y texto distintos
          a propósito (Undo2 + «Deshacer alta») — no se puede confundir con esa acción, que corta
          el acceso y conserva todo, con ésta, que borra la fila sin vuelta atrás. */}
      {esAdmin && <BotonDeshacerAlta personaId={persona.id} personaNombre={persona.nombre} />}
    </div>
  );
}
