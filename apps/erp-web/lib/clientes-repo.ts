import type { Cliente, ClienteInput, ClientesRepo } from '@scilb/core';
import { getServerClient } from './supabase/server';

type Row = {
  id: string;
  nombre: string;
  dni: string | null;
  telefono: string | null;
  sede_cod: string | null;
  medidas: { talla?: string } | null;
  created_at: string;
};

const fromRow = (r: Row): Cliente => ({
  id: r.id,
  nombre: r.nombre,
  dni: r.dni ?? '',
  telefono: r.telefono ?? '',
  sedeCod: r.sede_cod ?? '',
  medidas: r.medidas ?? {},
  createdAt: (r.created_at ?? '').slice(0, 10),
});

const toRow = (c: ClienteInput) => ({
  nombre: c.nombre,
  dni: c.dni,
  telefono: c.telefono,
  sede_cod: c.sedeCod,
  medidas: c.medidas,
});

// Repo por-request con el cliente `server` (RLS): cada empleado ve/escribe solo los
// clientes de su sede; admin/dueño ven todo. Reemplaza el singleton service_role que
// bypaseaba la RLS (hallazgo H1).
export const clientesRepo: ClientesRepo = {
  async listar() {
    const sb = getServerClient();
    const { data, error } = await sb.from('clientes').select('*').order('nombre');
    if (error) throw new Error(error.message);
    return (data as Row[]).map(fromRow);
  },
  async crear(input) {
    const sb = getServerClient();
    const { data, error } = await sb.from('clientes').insert(toRow(input)).select().single();
    if (error) throw new Error(error.message);
    return fromRow(data as Row);
  },
  async eliminar(id) {
    const sb = getServerClient();
    const { error } = await sb.from('clientes').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
