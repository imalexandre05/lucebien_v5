import type { ReactNode } from 'react';
import { SECCIONES, type ClaveSeccion } from '../../lib/colaboradores-secciones';

// El encabezado de una sección: qué se hace acá, en una línea, y lo que haga falta aclarar.
//
// Es chico a propósito. La cabecera grande —quién es la persona y qué período— ya está arriba en
// el layout; repetirla en cada sección empujaría el contenido fuera de la pantalla, que es
// justamente lo que hace pesado a un ERP.

export function SeccionHeader({
  seccion,
  nota,
  accion,
}: {
  seccion: ClaveSeccion;
  /** Aclaración propia de esta sección, cuando el título no alcanza. */
  nota?: ReactNode;
  accion?: ReactNode;
}) {
  const s = SECCIONES.find((x) => x.clave === seccion);
  if (!s) return null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 pt-1">
      <div>
        <h2 className="text-base font-semibold text-navy">{s.label}</h2>
        <p className="text-xs text-muted">{s.descripcion}</p>
        {nota && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{nota}</p>}
      </div>
      {accion}
    </div>
  );
}
