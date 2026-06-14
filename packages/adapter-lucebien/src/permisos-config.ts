import type { MatrizPermisos } from '@scilb/core';

// ⚠️ PLACEHOLDER — confirmar con Alexander (pendiente: matriz real del ERP viejo, tabla config 'permisos').
// admin y dueno tienen acceso total por mecanismo (ver core: `puede`), no hace falta listarlos.
export const matrizPermisos: MatrizPermisos = {
  encargado_tienda: {
    inventario: ['ver'],
    clientes: ['ver', 'crear', 'editar'],
    pedidos: ['ver', 'crear', 'editar'],
  },
  encargado_almacen: {
    inventario: ['ver', 'crear', 'editar'],
    pipeline: ['ver', 'editar'],
  },
  confeccionista: {
    pipeline: ['ver', 'editar'],
  },
  ventas_junior: {
    clientes: ['ver', 'crear'],
    pedidos: ['ver', 'crear'],
  },
  ventas_junior_2: {
    clientes: ['ver'],
    pedidos: ['ver'],
  },
};
