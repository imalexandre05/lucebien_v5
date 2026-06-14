import type { Cliente, ClienteInput, ClientesRepo } from '@scilb/core';

// Repo en MEMORIA para la demo de Fase 1 (sin Supabase). La implementación real (cliente Supabase
// contra la tabla clientes de 0001_init.sql) reemplaza este módulo sin tocar la UI.
const datos: Cliente[] = [
  { id: '1', nombre: 'Juan Pérez', dni: '45678912', telefono: '987654321', sedeCod: 'LB', medidas: { talla: '40' }, createdAt: '2026-01-15' },
  { id: '2', nombre: 'María Quispe', dni: '70112233', telefono: '912345678', sedeCod: 'ST', medidas: { talla: 'M' }, createdAt: '2026-02-03' },
];
let seq = datos.length;

export const clientesRepo: ClientesRepo = {
  async listar() {
    return [...datos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  },
  async crear(input: ClienteInput) {
    const cliente: Cliente = { id: String(++seq), createdAt: new Date().toISOString().slice(0, 10), ...input };
    datos.push(cliente);
    return cliente;
  },
  async eliminar(id: string) {
    const i = datos.findIndex((c) => c.id === id);
    if (i >= 0) datos.splice(i, 1);
  },
};
