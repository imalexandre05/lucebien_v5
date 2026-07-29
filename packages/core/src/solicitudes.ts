// Solicitudes: flujo de pedido de prendas/artículos de tienda → almacén (Fase 11 del plan de
// perfeccionamiento). Puerto de routes/solicitudes.js + public/js/solicitudes.js ("Solicitudes
// v8") del sistema viejo. Lógica pura de estados/permisos — el I/O vive en
// apps/erp-web/lib/solicitudes-repo.ts y las RPC atómicas en la migración 0056 (mismo contrato,
// re-verificado ahí con comentarios que apuntan aquí, mismo patrón que pipeline_deshacer_division
// cita pipeline.ts).
import type { Rol } from './permisos';

export const ESTADOS_SOLICITUD = ['pendiente', 'aprobada', 'rechazada', 'entregada', 'confirmada'] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export const URGENCIAS_SOLICITUD = ['alta', 'media', 'baja'] as const;
export type UrgenciaSolicitud = (typeof URGENCIAS_SOLICITUD)[number];

export const CATEGORIAS_ITEM_SOLICITUD = ['prenda', 'articulo'] as const;
export type CategoriaItemSolicitud = (typeof CATEGORIAS_ITEM_SOLICITUD)[number];

// Transiciones hacia adelante permitidas (BPMN portado 1:1 del sistema viejo: pendiente→aprobada/
// rechazada, aprobada→entregada, entregada→confirmada; rechazada/confirmada son terminales).
export const TRANSICIONES_SOLICITUD: Record<EstadoSolicitud, EstadoSolicitud[]> = {
  pendiente: ['aprobada', 'rechazada'],
  aprobada: ['entregada'],
  rechazada: [],
  entregada: ['confirmada'],
  confirmada: [],
};

export function puedeTransicionar(origen: EstadoSolicitud, destino: EstadoSolicitud): boolean {
  return TRANSICIONES_SOLICITUD[origen]?.includes(destino) ?? false;
}

// Deshacer (routes/solicitudes.js PUT /:id/deshacer, viejo): el sistema viejo confiaba en un
// `estado_destino` que mandaba el CLIENTE, sin validar que fuera el anterior real — un bug de
// integridad más que una elección de diseño. Aquí el estado anterior se DERIVA del actual: un
// único destino válido por estado, nada que el cliente pueda falsificar (la RPC de la migración
// 0056 hace exactamente este mismo cálculo server-side, sin recibir ningún "destino" del cliente).
const ESTADO_ANTERIOR: Partial<Record<EstadoSolicitud, EstadoSolicitud>> = {
  aprobada: 'pendiente',
  rechazada: 'pendiente',
  entregada: 'aprobada',
  confirmada: 'entregada',
};

export function estadoAnterior(actual: EstadoSolicitud): EstadoSolicitud | null {
  return ESTADO_ANTERIOR[actual] ?? null;
}

export function puedeDeshacer(actual: EstadoSolicitud): boolean {
  return estadoAnterior(actual) !== null;
}

// Quién gestiona almacén (aprobar/entregar/rechazar) — regla del plan F11, literal: "admin | dueno
// | encargado_almacen". NO incluye confeccionista aunque comparta app_es_almacen() con RLS
// (esa función es para VISIBILIDAD entre sedes, no para autoridad de aprobar/rechazar/entregar).
export function esGestorSolicitudes(rol: Rol): boolean {
  return rol === 'admin' || rol === 'dueno' || rol === 'encargado_almacen';
}

// Confirmar: "la tienda" que pidió (misma sede) — admin/dueño pueden hacerlo desde cualquiera.
export function puedeConfirmarSolicitud(rol: Rol, sedeActor: string, sedeSolicitud: string): boolean {
  if (rol === 'admin' || rol === 'dueno') return true;
  return Boolean(sedeActor) && sedeActor === sedeSolicitud;
}

// Deshacer exige la MISMA autoridad que causó la transición que se está revirtiendo (simetría:
// nadie deshace lo que no podría haber hecho en primer lugar). No es una regla nueva — es aplicar
// dos veces la misma regla que ya da el plan (aprobar/entregar/rechazar vs. confirmar).
export function puedeDeshacerSolicitud(
  actual: EstadoSolicitud,
  rol: Rol,
  sedeActor: string,
  sedeSolicitud: string,
): boolean {
  const destino = estadoAnterior(actual);
  if (!destino) return false;
  // destino === 'entregada' significa que actual === 'confirmada' (deshacer un confirmar).
  if (destino === 'entregada') return puedeConfirmarSolicitud(rol, sedeActor, sedeSolicitud);
  return esGestorSolicitudes(rol);
}

export function motivoRechazoValido(motivo: string | null | undefined): boolean {
  return Boolean(motivo && motivo.trim().length > 0);
}

// ── Catálogo de campos por tipo de prenda (producto_tipos.campos_solicitud, migración 0056) ──
// `color`/`talla`/`tela`/`mtela`/`mprenda`/`modelo` pueden ser `true` (usar el catálogo general
// de la sede, ej. los 18 colores) o un array fijo — override para tipos con opciones propias (ej.
// Gemelos/Pisacorbata solo vienen en Dorado/Plata, nunca en el catálogo general de 18 colores).
// `resolverOpciones` es la única regla de decisión entre ambos casos — portada de SOLI_CFG en
// public/js/solicitudes.js, donde `color:1` = catálogo general y `color:[...]` = lista propia.
export type CampoSolicitud = true | string[] | undefined;
export interface CamposSolicitudPrenda {
  color?: CampoSolicitud;
  talla?: CampoSolicitud;
  tela?: CampoSolicitud;
  mtela?: CampoSolicitud;
  mprenda?: CampoSolicitud;
  modelo?: CampoSolicitud;
  desc?: boolean;
}

export function resolverOpciones(campo: CampoSolicitud, catalogoGeneral: string[]): string[] {
  if (campo === true) return catalogoGeneral;
  if (Array.isArray(campo)) return campo;
  return [];
}

export function requiereCampo(campo: CampoSolicitud): boolean {
  return campo === true || (Array.isArray(campo) && campo.length > 0);
}
