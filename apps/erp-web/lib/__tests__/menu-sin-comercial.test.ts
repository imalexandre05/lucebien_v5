// @ts-nocheck
//
// `@ts-nocheck`: vitest no es dependencia declarada de erp-web (ver porcentaje.test.ts).

import { describe, it, expect } from 'vitest';
import { HREFS } from '../../components/shell/sidebar';

// Decisión del dueño n.º 9 (18-oct-2026): Ventas (POS) e Inventario no se ven ni se alcanzan desde
// el menú. Spec: docs/superpowers/specs/erp/2026-10-18-ocultar-pos-inventario-design.md
const FUERA_DEL_MENU = [
  '/inventario',
  '/caja',
  '/pedidos',
  '/clientes',
  '/finanzas',
  '/estadisticas',
  '/proveedores',
  '/materiales',
  '/compras',
];

describe('menú lateral', () => {
  it('no lleva a POS ni a inventario', () => {
    for (const h of HREFS) {
      expect(FUERA_DEL_MENU.some((f) => h === f || h.startsWith(`${f}/`))).toBe(false);
    }
  });

  it('conserva las entradas de uso diario', () => {
    expect(HREFS).toContain('/pipeline');
    expect(HREFS).toContain('/personal');
  });
});
