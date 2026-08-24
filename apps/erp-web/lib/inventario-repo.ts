import type { ActivoInventario, ActivoInput, InventarioRepo, PiezaActivo } from '@scilb/core';
import { getServerClient } from './supabase/server';

// snake_case (Postgres) <-> camelCase (dominio)
// pieza/activo_padre_id (Fase 7, migración 0055): opcionales en el tipo Row porque en un entorno
// sin migrar `select('*')` simplemente no las trae — nunca se piden por nombre explícito (lección
// de la Fase 4: "column does not exist" tumba toda la página). fromRow cae a los defaults de antes
// de la migración ('unica' / sin padre) cuando faltan.
type Row = {
  id: string;
  codigo: string;
  tipo: string;
  talla: string | null;
  color: string | null;
  sede_cod: string | null;
  estado: string;
  precio_base: number;
  precio_alquiler: number;
  precio_venta: number;
  usos_acumulados: number;
  atributos: Record<string, string> | null;
  publicable: boolean | null;
  descripcion_publica: string | null;
  pieza?: PiezaActivo | null;
  activo_padre_id?: string | null;
};

type PasadaActivaRow = { id: string; activo_id: string | null; etapa: string };

const fromRow = (r: Row, enPipeline: ActivoInventario['enPipeline']): ActivoInventario => ({
  id: r.id,
  codigo: r.codigo,
  tipo: r.tipo,
  talla: r.talla ?? '',
  color: r.color ?? '',
  sedeCod: r.sede_cod ?? '',
  estado: (r.estado ?? 'disponible') as ActivoInventario['estado'],
  precioBase: Number(r.precio_base),
  precioAlquiler: Number(r.precio_alquiler),
  precioVenta: Number(r.precio_venta),
  usosAcumulados: r.usos_acumulados,
  atributos: r.atributos ?? {},
  publicable: Boolean(r.publicable),
  descripcionPublica: r.descripcion_publica ?? '',
  enPipeline,
  pieza: r.pieza ?? 'unica',
  activoPadreId: r.activo_padre_id ?? null,
});

const toRow = (i: ActivoInput) => ({
  codigo: i.codigo,
  tipo: i.tipo,
  talla: i.talla,
  color: i.color,
  sede_cod: i.sedeCod,
  estado: i.estado,
  precio_base: i.precioBase,
  precio_alquiler: i.precioAlquiler,
  precio_venta: i.precioVenta,
  usos_acumulados: i.usosAcumulados,
  atributos: i.atributos,
  publicable: i.publicable,
  descripcion_publica: i.descripcionPublica,
  pieza: i.pieza,
});

// Fase 7: 'pieza' puede no existir todavía si la migración 0055 no se aplicó — a diferencia de un
// SELECT (donde falta el campo y ya, sin error), un INSERT/UPDATE con una columna que no existe SÍ
// falla. Verificado en vivo (mismo patrón que esTablaInexistente en producto-tipos-repo.ts):
// PostgREST devuelve PGRST204 con mensaje "Could not find the 'pieza' column of ... in the schema
// cache" — se cubren código + mensaje. Igual que getSesion() con rol_cod (lib/auth.ts): reintenta
// sin el campo nuevo en vez de tumbar la creación/edición entera.
function esColumnaPiezaDesconocida(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (error.code === 'PGRST204' || /could not find the '.*' column/i.test(msg)) && msg.includes('pieza');
}

// Repo por-request con el cliente `server` (RLS): cada empleado ve/escribe solo el
// inventario de su sede; admin/dueño ven todo. Reemplaza el singleton service_role (H1).
export const inventarioRepo: InventarioRepo = {
  async listar() {
    const sb = getServerClient();
    const [{ data, error }, pasadasRes] = await Promise.all([
      sb.from('inventario_activo').select('*').order('codigo'),
      // Trazabilidad (Fase 8): el vínculo prenda_pasada.activo_id → inventario_activo.id ya
      // existía en el esquema (E5) pero nadie lo consultaba. Una prenda "en pipeline" es la
      // que tiene una pasada activa (no 'enviado' — esa ya está en tienda, terminó su recorrido).
      sb.from('prenda_pasada').select('id, activo_id, etapa').not('activo_id', 'is', null).neq('etapa', 'enviado'),
    ]);
    if (error) throw new Error(error.message);
    if (pasadasRes.error) throw new Error(pasadasRes.error.message);

    const pipelinePorActivo = new Map<string, { pasadaId: string; etapa: string }>();
    for (const p of (pasadasRes.data as PasadaActivaRow[]) ?? []) {
      if (p.activo_id) pipelinePorActivo.set(p.activo_id, { pasadaId: p.id, etapa: p.etapa });
    }

    return (data as Row[]).map((r) => fromRow(r, pipelinePorActivo.get(r.id) ?? null));
  },
  async crear(input) {
    const sb = getServerClient();
    let { data, error } = await sb.from('inventario_activo').insert(toRow(input)).select().single();
    if (error && esColumnaPiezaDesconocida(error)) {
      const { pieza: _pieza, ...sinPieza } = toRow(input);
      ({ data, error } = await sb.from('inventario_activo').insert(sinPieza).select().single());
    }
    if (error) throw new Error(error.message);
    return fromRow(data as Row, null);
  },
  async editar(id, input) {
    const sb = getServerClient();
    let { data, error } = await sb.from('inventario_activo').update(toRow(input)).eq('id', id).select().single();
    if (error && esColumnaPiezaDesconocida(error)) {
      const { pieza: _pieza, ...sinPieza } = toRow(input);
      ({ data, error } = await sb.from('inventario_activo').update(sinPieza).eq('id', id).select().single());
    }
    if (error) throw new Error(error.message);
    return fromRow(data as Row, null);
  },
  // «Dar de baja» es un cambio de estado, no un borrado. Acá había un DELETE físico mientras la
  // pantalla preguntaba «¿Dar de baja este activo?», y eso costaba tres cosas a la vez:
  //   1. inventario_activo no tiene trigger de auditoría, así que la fila desaparecía sin dejar
  //      rastro de quién la borró ni de qué prenda era.
  //   2. la policy inv_write es "for all" sobre la sede propia — no es solo el admin: cualquier
  //      colaborador podía hacer desaparecer los activos de su sede.
  //   3. en cuanto la prenda había pasado por el pipeline o entrado en un pedido, la referencian
  //      prenda_pasada.activo_id y pedido_items.activo_id (ambas FK sin ON DELETE, verificado en
  //      la base) y el DELETE reventaba con un 23503 crudo de Postgres en la cara del usuario.
  // El estado 'baja' ya existe en el core (EstadoActivo), en el check de la base y en los mapas de
  // etiqueta y color de la pantalla: la fila queda marcada como Baja, sigue siendo consultable y
  // el histórico del pipeline no se rompe. El nombre `eliminar` se conserva porque es el de la
  // interfaz InventarioRepo (packages/core), fuera del alcance de este cambio.
  async eliminar(id) {
    const sb = getServerClient();
    const { error } = await sb.from('inventario_activo').update({ estado: 'baja' }).eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ── Despiece saco/pantalón (Fase 7, RPC 0055) ──────────────────────────────────────────────
export type PiezaDespiece = { id: string; codigo: string; pieza: PiezaActivo };

// Fuera de la interfaz InventarioRepo (como dividirPasada/avanzarPasada en pipeline-repo.ts): es
// una mutación respaldada por RPC, no CRUD genérico. Si la migración 0055 no está aplicada, el RPC
// no existe todavía (Postgres 42883 "function does not exist") — se traduce a un mensaje claro en
// vez de dejar pasar el error crudo de Postgres.
export async function despiezarActivo(id: string): Promise<PiezaDespiece[]> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('inventario_despiece', { p_activo_id: id });
  if (error) {
    if (error.code === '42883' || /inventario_despiece/i.test(error.message ?? '')) {
      throw new Error('El despiece todavía no está disponible: falta aplicar la migración 0055.');
    }
    throw new Error(error.message);
  }
  return (data as PiezaDespiece[]) ?? [];
}
