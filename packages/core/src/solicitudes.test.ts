import { describe, it, expect } from 'vitest';
import {
  ESTADOS_SOLICITUD,
  TRANSICIONES_SOLICITUD,
  puedeTransicionar,
  estadoAnterior,
  puedeDeshacer,
  esGestorSolicitudes,
  puedeConfirmarSolicitud,
  puedeDeshacerSolicitud,
  motivoRechazoValido,
  resolverOpciones,
  requiereCampo,
} from './solicitudes';
import { ROLES_BASE, type Rol } from './permisos';

describe('TRANSICIONES_SOLICITUD', () => {
  it('todo estado tiene destinos definidos', () => {
    for (const e of ESTADOS_SOLICITUD) expect(TRANSICIONES_SOLICITUD[e]).toBeDefined();
  });
  it('pendiente va a aprobada o rechazada', () => {
    expect(TRANSICIONES_SOLICITUD.pendiente).toEqual(['aprobada', 'rechazada']);
  });
  it('rechazada y confirmada son terminales', () => {
    expect(TRANSICIONES_SOLICITUD.rechazada).toEqual([]);
    expect(TRANSICIONES_SOLICITUD.confirmada).toEqual([]);
  });
  it('todos los destinos son estados válidos', () => {
    for (const e of ESTADOS_SOLICITUD) {
      for (const d of TRANSICIONES_SOLICITUD[e]) expect(ESTADOS_SOLICITUD).toContain(d);
    }
  });
});

describe('puedeTransicionar', () => {
  it('acepta transiciones del BPMN', () => {
    expect(puedeTransicionar('pendiente', 'aprobada')).toBe(true);
    expect(puedeTransicionar('pendiente', 'rechazada')).toBe(true);
    expect(puedeTransicionar('aprobada', 'entregada')).toBe(true);
    expect(puedeTransicionar('entregada', 'confirmada')).toBe(true);
  });
  it('rechaza saltos de estado', () => {
    expect(puedeTransicionar('pendiente', 'entregada')).toBe(false);
    expect(puedeTransicionar('pendiente', 'confirmada')).toBe(false);
    expect(puedeTransicionar('aprobada', 'confirmada')).toBe(false);
  });
  it('rechaza cualquier salida de un estado terminal', () => {
    for (const d of ESTADOS_SOLICITUD) {
      expect(puedeTransicionar('rechazada', d)).toBe(false);
      expect(puedeTransicionar('confirmada', d)).toBe(false);
    }
  });
});

describe('estadoAnterior / puedeDeshacer', () => {
  it('deriva el anterior correcto para cada estado deshacible', () => {
    expect(estadoAnterior('aprobada')).toBe('pendiente');
    expect(estadoAnterior('rechazada')).toBe('pendiente');
    expect(estadoAnterior('entregada')).toBe('aprobada');
    expect(estadoAnterior('confirmada')).toBe('entregada');
  });
  it('pendiente no tiene anterior (es el origen)', () => {
    expect(estadoAnterior('pendiente')).toBeNull();
  });
  it('puedeDeshacer refleja estadoAnterior', () => {
    expect(puedeDeshacer('pendiente')).toBe(false);
    for (const e of ['aprobada', 'rechazada', 'entregada', 'confirmada'] as const) {
      expect(puedeDeshacer(e)).toBe(true);
    }
  });
});

describe('esGestorSolicitudes (aprobar/entregar/rechazar — plan F11)', () => {
  it('admin, dueno y encargado_almacen pueden gestionar', () => {
    expect(esGestorSolicitudes('admin')).toBe(true);
    expect(esGestorSolicitudes('dueno')).toBe(true);
    expect(esGestorSolicitudes('encargado_almacen')).toBe(true);
  });
  it('el resto de roles NO puede', () => {
    const noGestores: Rol[] = ['encargado_tienda', 'confeccionista', 'ventas_junior', 'ventas_junior_2'];
    for (const r of noGestores) expect(esGestorSolicitudes(r)).toBe(false);
  });
  it('cubre los 7 roles base sin excepción', () => {
    for (const r of ROLES_BASE) expect(typeof esGestorSolicitudes(r)).toBe('boolean');
  });
});

describe('puedeConfirmarSolicitud (la tienda que pidió)', () => {
  it('admin/dueño confirman desde cualquier sede', () => {
    expect(puedeConfirmarSolicitud('admin', 'AL', 'LB')).toBe(true);
    expect(puedeConfirmarSolicitud('dueno', 'AL', 'ST')).toBe(true);
  });
  it('la misma sede confirma', () => {
    expect(puedeConfirmarSolicitud('encargado_tienda', 'LB', 'LB')).toBe(true);
  });
  it('otra sede NO confirma', () => {
    expect(puedeConfirmarSolicitud('encargado_tienda', 'ST', 'LB')).toBe(false);
    expect(puedeConfirmarSolicitud('ventas_junior', 'TR', 'LB')).toBe(false);
  });
});

describe('puedeDeshacerSolicitud (simetría con quien pudo causar la transición)', () => {
  it('deshacer aprobar/rechazar/entregar exige gestor de almacén', () => {
    expect(puedeDeshacerSolicitud('aprobada', 'encargado_almacen', 'AL', 'LB')).toBe(true);
    expect(puedeDeshacerSolicitud('rechazada', 'admin', 'AL', 'LB')).toBe(true);
    expect(puedeDeshacerSolicitud('entregada', 'dueno', 'AL', 'LB')).toBe(true);
    expect(puedeDeshacerSolicitud('aprobada', 'encargado_tienda', 'LB', 'LB')).toBe(false);
  });
  it('deshacer confirmar exige la misma sede (o admin/dueño)', () => {
    expect(puedeDeshacerSolicitud('confirmada', 'encargado_tienda', 'LB', 'LB')).toBe(true);
    expect(puedeDeshacerSolicitud('confirmada', 'encargado_tienda', 'ST', 'LB')).toBe(false);
    expect(puedeDeshacerSolicitud('confirmada', 'admin', 'AL', 'LB')).toBe(true);
  });
  it('pendiente no tiene nada que deshacer', () => {
    expect(puedeDeshacerSolicitud('pendiente', 'admin', 'AL', 'LB')).toBe(false);
  });
});

describe('motivoRechazoValido', () => {
  it('exige texto no vacío', () => {
    expect(motivoRechazoValido('No hay stock')).toBe(true);
    expect(motivoRechazoValido('   ')).toBe(false);
    expect(motivoRechazoValido('')).toBe(false);
    expect(motivoRechazoValido(null)).toBe(false);
    expect(motivoRechazoValido(undefined)).toBe(false);
  });
});

describe('resolverOpciones / requiereCampo (catálogo por tipo de prenda)', () => {
  const GENERAL = ['Negro', 'Blanco', 'Azul Noche'];
  it('true usa el catálogo general', () => {
    expect(resolverOpciones(true, GENERAL)).toEqual(GENERAL);
  });
  it('un array es un override fijo (ej. Gemelos: Dorado/Plata)', () => {
    expect(resolverOpciones(['Dorado', 'Plata'], GENERAL)).toEqual(['Dorado', 'Plata']);
  });
  it('undefined = sin opciones (el campo no aplica)', () => {
    expect(resolverOpciones(undefined, GENERAL)).toEqual([]);
  });
  it('requiereCampo refleja si el picker debe mostrarse', () => {
    expect(requiereCampo(true)).toBe(true);
    expect(requiereCampo(['Dorado', 'Plata'])).toBe(true);
    expect(requiereCampo([])).toBe(false);
    expect(requiereCampo(undefined)).toBe(false);
  });
});
