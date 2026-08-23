// ═══════════════════════════════════════════════════════════════════════════════════════════
// sueldos-tipos.ts — lo que de sueldos puede viajar al navegador.
//
// Existe por una razón concreta: `sueldos-repo.ts` importa `getServerClient()`, que usa
// `next/headers` y sólo corre en el servidor. Una pantalla marcada 'use client' que importe de
// ahí un VALOR —no un tipo— arrastra el módulo entero al paquete del navegador y la compilación
// falla con "You're importing a component that needs next/headers". Con los tipos no pasa,
// porque se borran al compilar; con `esConteo`, que es código real, sí pasaba.
//
// Este archivo no importa nada: es seguro desde cualquier lado.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export type TipoMovimiento = 'adelanto' | 'reporte' | 'bono_extra' | 'capacitacion' | 'almuerzo_entregado';

/** Los dos tipos que se cargan como CONTEO. El resto son plata. Espeja `sueldo_mov_unidad_chk`. */
export const TIPOS_CONTEO: readonly TipoMovimiento[] = ['capacitacion', 'almuerzo_entregado'];

export const esConteo = (tipo: TipoMovimiento): boolean => TIPOS_CONTEO.includes(tipo);
