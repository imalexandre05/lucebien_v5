import type { ActivoInventario, ActivoInput, InventarioRepo } from '@scilb/core';

// Repo en MEMORIA para la demo de Fase 1 (sin Supabase). La implementación real (cliente Supabase
// contra la tabla inventario_activo de 0001_init.sql) reemplaza este módulo sin tocar la UI.
const datos: ActivoInventario[] = [
  { id: '1', codigo: 'TN-001', tipo: 'TN', talla: '40', color: 'Navy', sedeCod: 'LB', estado: 'disponible', precioBase: 250, precioAlquiler: 80, precioVenta: 450, usosAcumulados: 12 },
  { id: '2', codigo: 'TN-002', tipo: 'TN', talla: '38', color: 'Negro', sedeCod: 'ST', estado: 'alquilado', precioBase: 250, precioAlquiler: 80, precioVenta: 450, usosAcumulados: 3 },
  { id: '3', codigo: 'CM-008', tipo: 'CM', talla: 'M', color: 'Blanco', sedeCod: 'LB', estado: 'disponible', precioBase: 60, precioAlquiler: 20, precioVenta: 90, usosAcumulados: 1 },
];
let seq = datos.length;

export const inventarioRepo: InventarioRepo = {
  async listar() {
    return [...datos].sort((a, b) => a.codigo.localeCompare(b.codigo));
  },
  async crear(input: ActivoInput) {
    const activo: ActivoInventario = { id: String(++seq), ...input };
    datos.push(activo);
    return activo;
  },
  async eliminar(id: string) {
    const i = datos.findIndex((a) => a.id === id);
    if (i >= 0) datos.splice(i, 1);
  },
};
