import { getServerClient } from './supabase/server';

// Maestro de proveedores (S16). Global (no atado a sede); escritura admin/almacén (RLS 0039).
export type Proveedor = {
  id: string;
  nombre: string;
  ruc: string | null;
  contacto: string | null;
  telefono: string | null;
  direccion: string | null;
  categoria: string | null;
  activo: boolean;
  obs: string | null;
};

const COLS = 'id, nombre, ruc, contacto, telefono, direccion, categoria, activo, obs';

function fromRow(r: Record<string, unknown>): Proveedor {
  return {
    id: String(r.id),
    nombre: String(r.nombre ?? ''),
    ruc: (r.ruc as string | null) ?? null,
    contacto: (r.contacto as string | null) ?? null,
    telefono: (r.telefono as string | null) ?? null,
    direccion: (r.direccion as string | null) ?? null,
    categoria: (r.categoria as string | null) ?? null,
    activo: Boolean(r.activo),
    obs: (r.obs as string | null) ?? null,
  };
}

export async function listarProveedores(soloActivos = false): Promise<Proveedor[]> {
  const sb = getServerClient();
  let q = sb.from('proveedores').select(COLS).order('nombre');
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(fromRow);
}

export type ProveedorInput = Omit<Proveedor, 'id'>;

export async function crearProveedor(p: ProveedorInput): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('proveedores').insert({
    nombre: p.nombre.trim(),
    ruc: p.ruc?.trim() || null,
    contacto: p.contacto?.trim() || null,
    telefono: p.telefono?.trim() || null,
    direccion: p.direccion?.trim() || null,
    categoria: p.categoria || null,
    activo: p.activo,
    obs: p.obs?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function editarProveedor(id: string, p: ProveedorInput): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb
    .from('proveedores')
    .update({
      nombre: p.nombre.trim(),
      ruc: p.ruc?.trim() || null,
      contacto: p.contacto?.trim() || null,
      telefono: p.telefono?.trim() || null,
      direccion: p.direccion?.trim() || null,
      categoria: p.categoria || null,
      activo: p.activo,
      obs: p.obs?.trim() || null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
