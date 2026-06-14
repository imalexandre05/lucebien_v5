import type { Cliente, ClienteInput, ClientesRepo } from '@scilb/core';
import { getSupabase } from './supabase';

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

const supabaseRepo: ClientesRepo = {
  async listar() {
    const sb = getSupabase()!;
    const { data, error } = await sb.from('clientes').select('*').order('nombre');
    if (error) throw new Error(error.message);
    return (data as Row[]).map(fromRow);
  },
  async crear(input) {
    const sb = getSupabase()!;
    const { data, error } = await sb.from('clientes').insert(toRow(input)).select().single();
    if (error) throw new Error(error.message);
    return fromRow(data as Row);
  },
  async eliminar(id) {
    const sb = getSupabase()!;
    const { error } = await sb.from('clientes').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// Fallback en memoria (demo sin Supabase configurado).
const datos: Cliente[] = [
  { id: '1', nombre: 'Juan Pérez', dni: '45678912', telefono: '987654321', sedeCod: 'LB', medidas: { talla: '40' }, createdAt: '2026-01-15' },
  { id: '2', nombre: 'María Quispe', dni: '70112233', telefono: '912345678', sedeCod: 'ST', medidas: { talla: 'M' }, createdAt: '2026-02-03' },
];
let seq = datos.length;
const memoriaRepo: ClientesRepo = {
  async listar() {
    return [...datos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  },
  async crear(input) {
    const cliente: Cliente = { id: String(++seq), createdAt: new Date().toISOString().slice(0, 10), ...input };
    datos.push(cliente);
    return cliente;
  },
  async eliminar(id) {
    const i = datos.findIndex((c) => c.id === id);
    if (i >= 0) datos.splice(i, 1);
  },
};

export const clientesRepo: ClientesRepo = getSupabase() ? supabaseRepo : memoriaRepo;
