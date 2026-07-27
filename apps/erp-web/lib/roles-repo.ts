import type { Rol } from '@scilb/core';
import { slugRol } from '@scilb/core';
import { getServerClient } from './supabase/server';

// Roles derivados (Fase 1, migración 0050): heredan la seguridad (RLS) de uno de los 7 roles
// base y solo afinan permisos de módulo. CRUD de una sola tabla/fila → no necesita RPC (ya es
// atómico por sí mismo); la RLS (`roles_admin_write`) ya exige admin.
export type RolDerivado = {
  cod: string;
  nombre: string;
  rolBase: Rol;
  activo: boolean;
};

function fromRow(r: Record<string, unknown>): RolDerivado {
  return {
    cod: String(r.cod),
    nombre: String(r.nombre ?? ''),
    rolBase: r.rol_base as Rol,
    activo: Boolean(r.activo),
  };
}

export async function listarRoles(): Promise<RolDerivado[]> {
  const sb = getServerClient();
  const { data, error } = await sb.from('roles').select('cod, nombre, rol_base, activo').order('nombre');
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(fromRow);
}

// Genera el `cod` a partir del nombre (slugRol, core) y resuelve colisiones agregando un sufijo
// numérico — igual que un "nombre (2)" en un explorador de archivos.
export async function crearRol(nombre: string, rolBase: Rol): Promise<RolDerivado> {
  const sb = getServerClient();
  const base = slugRol(nombre);
  if (!base) throw new Error('El nombre del rol es obligatorio');

  let cod = base;
  for (let intento = 2; intento <= 50; intento++) {
    const { data: existe } = await sb.from('roles').select('cod').eq('cod', cod).maybeSingle();
    if (!existe) break;
    cod = `${base}_${intento}`;
  }

  const { data, error } = await sb
    .from('roles')
    .insert({ cod, nombre: nombre.trim(), rol_base: rolBase, activo: true })
    .select('cod, nombre, rol_base, activo')
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data as Record<string, unknown>);
}

export async function actualizarRol(cod: string, p: { nombre: string; activo: boolean }): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('roles').update({ nombre: p.nombre.trim(), activo: p.activo }).eq('cod', cod);
  if (error) throw new Error(error.message);
}
