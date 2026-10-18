import { describe, it, expect } from 'vitest';
import {
  calcularNotaMensual,
  notaTardanza,
  tramoEval,
  calcularCiclo,
  cicloCerradoAnterior,
  ultimaEvaluacionPorMes,
  revisarPesos,
  notaDesdePuntos,
  bandaDesdeNota,
  armarEvaluacionAGuardar,
  PESOS_DEFAULT,
  type ComponentesEval,
  type EscalaPuntos,
} from './evaluaciones';

const base: ComponentesEval = {
  competencias: 20,
  valores: 20,
  operaciones: 20,
  software: 20,
  limpieza: 20,
  examenes: 20,
  tardanza: 20,
  descuentoIncidencias: 0,
  bonusVentas: 0,
};

describe('calcularNotaMensual', () => {
  it('todo 20 con pesos que suman 1 → 20', () => {
    expect(calcularNotaMensual(base, PESOS_DEFAULT)).toBe(20);
  });
  it('aplica descuento y bonus al final', () => {
    expect(calcularNotaMensual({ ...base, descuentoIncidencias: 3, bonusVentas: 1 }, PESOS_DEFAULT)).toBe(18);
  });
  it('pondera por peso de cada componente', () => {
    // solo competencias=20 (peso 0.25), resto 0 → 5
    const c = { ...base, valores: 0, operaciones: 0, software: 0, limpieza: 0, examenes: 0, tardanza: 0 };
    expect(calcularNotaMensual(c, PESOS_DEFAULT)).toBe(5);
  });

  // C-1 (spec nota-sin-ceros-silenciosos): un componente o un peso que no es un número finito
  // corta en vez de disolverse en un cero calculado que se ve igual que un cero merecido.
  it('un componente en NaN corta y el mensaje nombra cuál', () => {
    const c: ComponentesEval = { ...base, valores: NaN };
    expect(() => calcularNotaMensual(c, PESOS_DEFAULT)).toThrow(
      'El componente "valores" no es un número (NaN). La nota no se puede calcular con un dato roto.',
    );
  });

  it('un componente en undefined corta y el mensaje lo nombra', () => {
    const c = { ...base, operaciones: undefined as unknown as number };
    expect(() => calcularNotaMensual(c, PESOS_DEFAULT)).toThrow(/"operaciones"/);
  });

  it('un peso en NaN corta', () => {
    const p = { ...PESOS_DEFAULT, examenes: NaN };
    expect(() => calcularNotaMensual(base, p)).toThrow(/"examenes"/);
  });

  it('un componente en 0 legítimo no lanza: la nota lo cuenta como cero', () => {
    // software pesa 0.1 en PESOS_DEFAULT: bajarlo de 20 a 0 resta 0.1 × 20 = 2 puntos.
    const c = { ...base, software: 0 };
    expect(() => calcularNotaMensual(c, PESOS_DEFAULT)).not.toThrow();
    expect(calcularNotaMensual(c, PESOS_DEFAULT)).toBe(18);
  });

  // E-1 (enmienda §7 de la spec nota-sin-ceros-silenciosos): el mismo corte de C-1, extendido al
  // descuento por incidencias y al bono por ventas — entraban con `|| 0` y quedaron afuera de la
  // primera pasada porque la prosa original decía "un componente o un peso".
  it('el descuento por incidencias en NaN corta con el mensaje exacto', () => {
    const c: ComponentesEval = { ...base, descuentoIncidencias: NaN };
    expect(() => calcularNotaMensual(c, PESOS_DEFAULT)).toThrow(
      'El descuento por incidencias no es un número (NaN). La nota no se puede calcular con un dato roto.',
    );
  });

  it('el descuento por incidencias en undefined también corta', () => {
    const c = { ...base, descuentoIncidencias: undefined as unknown as number };
    expect(() => calcularNotaMensual(c, PESOS_DEFAULT)).toThrow(/descuento por incidencias/);
  });

  it('el bono por ventas en NaN corta y el mensaje lo nombra', () => {
    const c: ComponentesEval = { ...base, bonusVentas: NaN };
    expect(() => calcularNotaMensual(c, PESOS_DEFAULT)).toThrow(
      'El bono por ventas no es un número (NaN). La nota no se puede calcular con un dato roto.',
    );
  });
});

describe('revisarPesos', () => {
  it('PESOS_DEFAULT no está desviado', () => {
    expect(revisarPesos(PESOS_DEFAULT)).toEqual({ suma: 1, desviado: false });
  });

  it('pesos que suman 0,95 quedan marcados como desviados', () => {
    const p = { ...PESOS_DEFAULT, examenes: 0.1 }; // 0.25+0.25+0.1+0.1+0.1+0.10+0.05 = 0.95
    expect(revisarPesos(p)).toEqual({ suma: 0.95, desviado: true });
  });

  it('ruido de coma flotante en el último decimal no cuenta como desviado', () => {
    // 0.1+0.2+0.15+0.15+0.1+0.2+0.1 suma 1 matemáticamente pero en coma flotante da
    // 1.0000000000000002 — muy por debajo de la tolerancia de 0.01, no debe marcarse desviado.
    const p = { competencias: 0.1, valores: 0.2, operaciones: 0.15, software: 0.15, limpieza: 0.1, examenes: 0.2, tardanza: 0.1 };
    expect(revisarPesos(p)).toEqual({ suma: 1, desviado: false });
  });

  // E-3 (enmienda §7): antes, un peso NaN volvía la suma NaN y `Math.abs(NaN - 1) > 0.01` daba
  // false — la función afirmaba que los pesos estaban bien justo cuando estaban rotos.
  it('un peso en NaN queda marcado como desviado', () => {
    const p = { ...PESOS_DEFAULT, examenes: NaN };
    expect(revisarPesos(p).desviado).toBe(true);
  });
});

describe('notaTardanza', () => {
  it('sin tardanza = 20', () => expect(notaTardanza(0)).toBe(20));
  it('resta 1 punto por cada 15 min', () => expect(notaTardanza(45)).toBe(17));
  it('no baja de 0', () => expect(notaTardanza(1000)).toBe(0));
});

describe('tramoEval', () => {
  it('clasifica por nota', () => {
    expect(tramoEval(18)).toBe('excelente');
    expect(tramoEval(15)).toBe('bueno');
    expect(tramoEval(12)).toBe('mejorar');
    expect(tramoEval(9)).toBe('bajo');
  });
});

// Spec docs/superpowers/specs/evaluaciones/2026-08-25-puntos-como-moneda-design.md §2 C-2/C-3 y
// §7: los 8 casos de la tabla son obligatorios, incluido el #8 (división por cero).
describe('notaDesdePuntos', () => {
  // Los defaults textuales del administrador: 5000 puntos → nota 16 (el promedio), 7500 → 20.
  const escala: EscalaPuntos = {
    puntosPromedio: 5000,
    notaPromedio: 16,
    puntosExcelente: 7500,
    bandaRiesgo: 13,
    bandaIdeal: 18,
  };

  it('caso 1: 0 puntos → nota 0,00, banda riesgo', () => {
    expect(notaDesdePuntos(0, escala)).toEqual({ nota: 0, banda: 'riesgo' });
  });

  it('caso 2: el promedio exacto (5000) → nota 16,00, banda en desarrollo', () => {
    expect(notaDesdePuntos(5000, escala)).toEqual({ nota: 16, banda: 'en_desarrollo' });
  });

  it('caso 3: el excelente exacto (7500) → nota 20,00, banda ideal', () => {
    expect(notaDesdePuntos(7500, escala)).toEqual({ nota: 20, banda: 'ideal' });
  });

  it('caso 4: 9000 puntos → nota 22,40, banda sobresaliente (sin techo)', () => {
    expect(notaDesdePuntos(9000, escala)).toEqual({ nota: 22.4, banda: 'sobresaliente' });
  });

  it('caso 5: 4000 puntos → nota 12,80, banda riesgo (< 13)', () => {
    expect(notaDesdePuntos(4000, escala)).toEqual({ nota: 12.8, banda: 'riesgo' });
  });

  it('caso 6: 6250 puntos → nota 18,00, banda ideal (el borde exacto)', () => {
    expect(notaDesdePuntos(6250, escala)).toEqual({ nota: 18, banda: 'ideal' });
  });

  it('caso 7: puntos negativos (incidencias > trabajo) → nota 0,00, nunca negativa, banda riesgo', () => {
    expect(notaDesdePuntos(-1000, escala)).toEqual({ nota: 0, banda: 'riesgo' });
  });

  it('caso 8: puntosExcelente == puntosPromedio corta con error claro, no divide por cero', () => {
    const escalaRota: EscalaPuntos = { ...escala, puntosExcelente: 5000 };
    // Al lanzar, la función nunca llega al `return`: no hay forma de que escape un Infinity/NaN.
    expect(() => notaDesdePuntos(6000, escalaRota)).toThrow(/puntosExcelente.*puntosPromedio.*iguales/);
  });

  it('puntosPromedio en 0 también corta (mismo defecto, la otra rama de la recta)', () => {
    const escalaRota: EscalaPuntos = { ...escala, puntosPromedio: 0 };
    expect(() => notaDesdePuntos(100, escalaRota)).toThrow(/puntosPromedio/);
  });

  it('un componente de la escala en NaN corta y el mensaje lo nombra', () => {
    const escalaRota: EscalaPuntos = { ...escala, bandaIdeal: NaN };
    expect(() => notaDesdePuntos(100, escalaRota)).toThrow(/"bandaIdeal"/);
  });
});

// bandaDesdeNota se exporta aparte para clasificar una nota_final YA CONGELADA (historial,
// mi-desempeño) sin recalcular puntos → nota — ver el comentario en evaluaciones.ts.
describe('bandaDesdeNota', () => {
  it('clasifica una nota vieja (metodo ponderado) contra los cortes actuales de config', () => {
    expect(bandaDesdeNota(17.5, 13, 18)).toBe('en_desarrollo');
    expect(bandaDesdeNota(9, 13, 18)).toBe('riesgo');
    expect(bandaDesdeNota(20, 13, 18)).toBe('ideal');
    expect(bandaDesdeNota(20.01, 13, 18)).toBe('sobresaliente');
  });
});

describe('calcularCiclo', () => {
  it('sin fecha_ingreso: cae a mes calendario completo', () => {
    expect(calcularCiclo(null, '2026-07-20')).toEqual({
      desde: '2026-07-01',
      hasta: '2026-07-31',
      fuente: 'mes_calendario',
    });
  });

  it('fecha_ingreso con formato inválido: mismo fallback', () => {
    expect(calcularCiclo('20-07-2026', '2026-07-20').fuente).toBe('mes_calendario');
    expect(calcularCiclo('', '2026-07-20').fuente).toBe('mes_calendario');
  });

  it('mes calendario respeta meses de 30/31/28 días', () => {
    expect(calcularCiclo(undefined, '2026-02-10')).toEqual({
      desde: '2026-02-01',
      hasta: '2026-02-28',
      fuente: 'mes_calendario',
    });
    expect(calcularCiclo(undefined, '2026-04-01')).toEqual({
      desde: '2026-04-01',
      hasta: '2026-04-30',
      fuente: 'mes_calendario',
    });
  });

  it('aniversario: hoy ya pasó el día del mes → ciclo arrancó este mes', () => {
    // fecha_ingreso 2026-03-15, hoy 2026-07-20 (día 20 ≥ 15) → ciclo 15 jul – 14 ago.
    expect(calcularCiclo('2026-03-15', '2026-07-20')).toEqual({
      desde: '2026-07-15',
      hasta: '2026-08-14',
      fuente: 'aniversario',
    });
  });

  it('aniversario: hoy aún no llega al día del mes → ciclo arrancó el mes pasado', () => {
    // fecha_ingreso 2026-03-15, hoy 2026-07-10 (día 10 < 15) → ciclo 15 jun – 14 jul.
    expect(calcularCiclo('2026-03-15', '2026-07-10')).toEqual({
      desde: '2026-06-15',
      hasta: '2026-07-14',
      fuente: 'aniversario',
    });
  });

  it('aniversario en el mismo día: el ciclo arranca hoy', () => {
    expect(calcularCiclo('2026-03-15', '2026-07-15')).toEqual({
      desde: '2026-07-15',
      hasta: '2026-08-14',
      fuente: 'aniversario',
    });
  });

  it('aniversario cruza fin de año', () => {
    // fecha_ingreso día 5, hoy 2026-01-02 (día 2 < 5) → ciclo arrancó en diciembre del año anterior.
    expect(calcularCiclo('2020-03-05', '2026-01-02')).toEqual({
      desde: '2025-12-05',
      hasta: '2026-01-04',
      fuente: 'aniversario',
    });
  });

  // Antes del 24-ago-2026 esto esperaba '2026-03-03' (Date.UTC desbordaba el 31-feb al mes
  // siguiente) y el comentario original decía "no es un bug nuevo, ver
  // docs/pendientes-negocio.md" — ese era justo el pendiente sin resolver hasta que Alexander
  // confirmara la regla. La spec 2026-08-24-ciclo-aniversario-mes-corto-design.md la confirma: el
  // ciclo se recorta al último día real del mes, no se corre al siguiente.
  it('aniversario en día 31: se recorta al último día real del mes, no se corre al siguiente', () => {
    // fecha_ingreso día 31, ciclo arranca en febrero (28 días en 2026, no bisiesto) → arranca el
    // 28-feb, no el 3-mar.
    expect(calcularCiclo('2026-01-31', '2026-03-15').desde).toBe('2026-02-28');
  });

  // ── Tabla §5 de la spec 2026-08-24-ciclo-aniversario-mes-corto-design.md ────────────────────
  // (el primer caso de la tabla, día 15 en un mes de 31 días, ya está cubierto arriba por
  // "aniversario: hoy ya pasó el día del mes" y no se repite acá).
  it('ingresa el 29 de enero → el ciclo termina el 28 de febrero', () => {
    expect(calcularCiclo('2026-01-29', '2026-01-29')).toEqual({
      desde: '2026-01-29',
      hasta: '2026-02-28',
      fuente: 'aniversario',
    });
  });

  it('ingresa el 30 de enero → el ciclo termina el 28 de febrero', () => {
    expect(calcularCiclo('2026-01-30', '2026-01-30')).toEqual({
      desde: '2026-01-30',
      hasta: '2026-02-28',
      fuente: 'aniversario',
    });
  });

  it('ingresa el 31 de enero → el ciclo termina el 28 de febrero', () => {
    expect(calcularCiclo('2026-01-31', '2026-01-31')).toEqual({
      desde: '2026-01-31',
      hasta: '2026-02-28',
      fuente: 'aniversario',
    });
  });

  // La prosa de la spec §5 decía "29 de febrero (el mes sí tiene ese día)" para este caso, pero la
  // fórmula del §3 aplicada literalmente da 28: hasta = min(díaDeseado − 1, últimoDíaDelMes) con
  // díaDeseado = 29 es min(28, últimoDíaDelMes), y últimoDíaDelMes de febrero nunca baja de 28 —
  // bisiesto o no (2028 es bisiesto: Date.UTC(2028,2,0) da día 29, y aun así min(28, 29) = 28).
  // Alexander confirmó el 24-ago-2026, preguntado directamente: "si tambien el 28 se paga" — el
  // mismo día en año bisiesto o no. La fórmula sin rama especial para bisiestos es la correcta.
  it('ingresa el 29 de enero en año bisiesto → el ciclo termina el 28 de febrero, confirmado', () => {
    expect(calcularCiclo('2028-01-29', '2028-01-29')).toEqual({
      desde: '2028-01-29',
      hasta: '2028-02-28',
      fuente: 'aniversario',
    });
  });

  it('ingresa el 31 de octubre → el mes siguiente tiene 30 días, el ciclo termina el 30', () => {
    expect(calcularCiclo('2026-10-31', '2026-10-31')).toEqual({
      desde: '2026-10-31',
      hasta: '2026-11-30',
      fuente: 'aniversario',
    });
  });

  it('ingresa el 31 de diciembre → cruce de año, el ciclo termina el 30 de enero', () => {
    expect(calcularCiclo('2026-12-31', '2026-12-31')).toEqual({
      desde: '2026-12-31',
      hasta: '2027-01-30',
      fuente: 'aniversario',
    });
  });
});

// Spec 2026-10-04-evaluacion-guardar-recalculada §2/§4: lo que se guarda lo arma el servidor desde
// la salida de la RPC del ciclo exacto; del cliente sólo entra el juicio humano / entrada manual.
describe('armarEvaluacionAGuardar', () => {
  const escala: EscalaPuntos = { puntosPromedio: 5000, notaPromedio: 16, puntosExcelente: 7500, bandaRiesgo: 13, bandaIdeal: 18 };
  const rpc = {
    operaciones: 12, software: 11, limpieza: 10, tardanza: 15, descuento: 200, puntosPipeline: 4000,
    extrasMonto: 0, extrasCantidad: 0, extrasPuntos: 0, valores: 17 as number | null, valoresCantidad: 3,
    bonusVentas: 2, puntosActividades: 500, puntosVentas: 0, ventasSinTasa: false, puntosTotal: 5000,
  };
  const manual = { competencias: 14, examenes: 9 };

  it('la nota y los puntos salen de la RPC, no del cliente', () => {
    const r = armarEvaluacionAGuardar(rpc, escala, manual);
    expect(r.puntosTotal).toBe(5000);
    expect(r.notaFinal).toBe(notaDesdePuntos(5000, escala).nota);
    expect(r.notaFinal).toBe(16);
    expect(r.banda).toBe('en_desarrollo');
  });
  it('otros puntos de la RPC dan otra nota (ciclo distinto)', () => {
    expect(armarEvaluacionAGuardar({ ...rpc, puntosTotal: 7500 }, escala, manual).notaFinal).toBe(20);
  });
  it('los componentes automáticos vienen de la RPC y los manuales del cliente', () => {
    const r = armarEvaluacionAGuardar(rpc, escala, manual);
    expect(r.componentes).toEqual({
      operaciones: 12, software: 11, limpieza: 10, tardanza: 15, valores: 17, valoresCantidad: 3,
      competencias: 14, examenes: 9, descuentoIncidencias: 200, bonusVentas: 2,
    });
  });
  // Spec 2026-10-17-componentes-automaticos: el examen de las capacitaciones cerradas en el ciclo.
  it('si la RPC trae examenes, se guarda ése y se ignora el del cliente', () => {
    const r = armarEvaluacionAGuardar({ ...rpc, examenes: 16.5 }, escala, manual);
    expect(r.componentes.examenes).toBe(16.5);
  });
  it('examenes null o ausente → rige la entrada manual', () => {
    expect(armarEvaluacionAGuardar({ ...rpc, examenes: null }, escala, manual).componentes.examenes).toBe(9);
    expect(armarEvaluacionAGuardar(rpc, escala, manual).componentes.examenes).toBe(9);
  });
  it('examenes de la RPC no cambia la nota ni los puntos', () => {
    const a = armarEvaluacionAGuardar(rpc, escala, manual);
    const b = armarEvaluacionAGuardar({ ...rpc, examenes: 3 }, escala, manual);
    expect(b.notaFinal).toBe(a.notaFinal);
    expect(b.puntosTotal).toBe(a.puntosTotal);
  });
  it('examenes fuera de 0–20 o no numérico desde la RPC se rechaza', () => {
    expect(() => armarEvaluacionAGuardar({ ...rpc, examenes: 25 }, escala, manual)).toThrow(/examenes/);
    expect(() => armarEvaluacionAGuardar({ ...rpc, examenes: Number.NaN }, escala, manual)).toThrow(/examenes/);
  });
  // Spec 2026-10-04-evaluacion-guardar-recalculada §7 (H-6): la 0119 publica el 360° de una fila
  // guardada sólo si componentes.valoresCantidad llega al mínimo; sin la clave no se publicaba nunca.
  it('guarda valoresCantidad tal cual lo devuelve la RPC', () => {
    expect(armarEvaluacionAGuardar({ ...rpc, valoresCantidad: 5 }, escala, manual).componentes.valoresCantidad).toBe(5);
  });
  it('valoresCantidad null o ausente se guarda como 0 (la base no publica sin saber cuántos votos hubo)', () => {
    expect(armarEvaluacionAGuardar({ ...rpc, valoresCantidad: null }, escala, manual).componentes.valoresCantidad).toBe(0);
    const { valoresCantidad: _c, ...sinCantidad } = rpc;
    expect(armarEvaluacionAGuardar(sinCantidad, escala, manual).componentes.valoresCantidad).toBe(0);
  });
  it('lo que mande el cliente no cambia valoresCantidad', () => {
    const manualConExtra = { ...manual, valoresCantidad: 99 } as unknown as typeof manual;
    expect(armarEvaluacionAGuardar(rpc, escala, manualConExtra).componentes.valoresCantidad).toBe(3);
  });
  it('valores null (sin evaluaciones ese mes) se guarda como 0', () => {
    expect(armarEvaluacionAGuardar({ ...rpc, valores: null }, escala, manual).componentes.valores).toBe(0);
  });
  it('sin puntosTotal (migración 0095 sin aplicar) lanza', () => {
    const { puntosTotal: _omitido, ...sinTotal } = rpc;
    expect(() => armarEvaluacionAGuardar(sinTotal, escala, manual)).toThrow(/puntos/i);
  });
  it('ventas sin tasa lanza', () => {
    expect(() => armarEvaluacionAGuardar({ ...rpc, ventasSinTasa: true }, escala, manual)).toThrow(/ventas/i);
  });
  it('una entrada manual no finita lanza', () => {
    expect(() => armarEvaluacionAGuardar(rpc, escala, { ...manual, competencias: NaN })).toThrow(/competencias/);
    expect(() => armarEvaluacionAGuardar(rpc, escala, { ...manual, examenes: Infinity })).toThrow(/examenes/);
    expect(() => armarEvaluacionAGuardar({ ...rpc, bonusVentas: NaN }, escala, manual)).toThrow(/bonusVentas/);
  });
  it('descuento y bonus salen de la RPC aunque el cliente mande otros', () => {
    const r = armarEvaluacionAGuardar(rpc, escala, { ...manual, descuentoIncidencias: 0, bonusVentas: 99 } as typeof manual);
    expect(r.componentes.descuentoIncidencias).toBe(200);
    expect(r.componentes.bonusVentas).toBe(2);
  });
  it('una competencia fuera de 0-20 lanza', () => {
    expect(() => armarEvaluacionAGuardar(rpc, escala, { ...manual, competencias: 25 })).toThrow(/competencias/);
  });
  it('escala rota lanza (no guarda Infinity/NaN)', () => {
    expect(() => armarEvaluacionAGuardar(rpc, { ...escala, puntosExcelente: 5000 }, manual)).toThrow();
  });
});

describe('cicloCerradoAnterior', () => {
  it('ciclo en curso: devuelve el anterior, ya terminado', () => {
    // Ingreso el día 10; hoy 18-oct → el ciclo en curso es 10-oct..09-nov (no terminó).
    expect(cicloCerradoAnterior('2024-03-10', '2026-10-18')).toEqual({
      desde: '2026-09-10',
      hasta: '2026-10-09',
      fuente: 'aniversario',
    });
  });

  it('borde: el ciclo que termina hoy cuenta como cerrado (hasta == hoy)', () => {
    // hoy = 09-oct; el ciclo en curso por calcularCiclo ya es 09-sep..08-oct? No: hd < 10 →
    // arrancó el 10-sep y termina el 09-oct = hoy.
    expect(cicloCerradoAnterior('2024-03-10', '2026-10-09')).toEqual({
      desde: '2026-09-10',
      hasta: '2026-10-09',
      fuente: 'aniversario',
    });
  });

  it('el día siguiente al cierre ya propone el ciclo que acaba de terminar, no el nuevo', () => {
    expect(cicloCerradoAnterior('2024-03-10', '2026-10-10').hasta).toBe('2026-10-09');
  });

  it('cruza el año', () => {
    expect(cicloCerradoAnterior('2024-03-15', '2026-01-20')).toEqual({
      desde: '2025-12-15',
      hasta: '2026-01-14',
      fuente: 'aniversario',
    });
  });

  it('mes corto: respeta el recorte de calcularCiclo', () => {
    // Aniversario 31; hoy 15-mar-2026 → en curso 28-feb..30-mar; el anterior 31-ene..28-feb (recorte de calcularCiclo).
    expect(cicloCerradoAnterior('2024-01-31', '2026-03-15')).toEqual({
      desde: '2026-01-31',
      hasta: '2026-02-28',
      fuente: 'aniversario',
    });
  });

  it('sin fecha de ingreso: mes calendario anterior; el mes completo si hoy es su último día', () => {
    expect(cicloCerradoAnterior(null, '2026-10-18')).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-30',
      fuente: 'mes_calendario',
    });
    expect(cicloCerradoAnterior(null, '2026-10-31').hasta).toBe('2026-10-31');
    expect(cicloCerradoAnterior(null, '2026-01-05').desde).toBe('2025-12-01');
  });

  it('nunca devuelve un ciclo que termine después de hoy', () => {
    for (const hoy of ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-30', '2026-03-31', '2026-12-31']) {
      expect(cicloCerradoAnterior('2024-01-31', hoy).hasta <= hoy).toBe(true);
      expect(cicloCerradoAnterior(null, hoy).hasta <= hoy).toBe(true);
    }
  });
});

describe('ultimaEvaluacionPorMes', () => {
  it('elige por mes, no por fecha de creación', () => {
    const filas = [
      { mes: '2026-09', nota_final: 15, created_at: '2026-10-18T10:00:00Z' }, // evaluada tarde
      { mes: '2026-10', nota_final: 17, created_at: '2026-10-05T10:00:00Z' },
    ];
    expect(ultimaEvaluacionPorMes(filas)?.nota_final).toBe(17);
  });

  it('mismo mes: desempata por created_at', () => {
    const filas = [
      { mes: '2026-10', nota_final: 12, created_at: '2026-10-01T10:00:00Z' },
      { mes: '2026-10', nota_final: 14, created_at: '2026-10-02T10:00:00Z' },
    ];
    expect(ultimaEvaluacionPorMes(filas)?.nota_final).toBe(14);
  });

  it('sin filas: null', () => {
    expect(ultimaEvaluacionPorMes([])).toBeNull();
  });
});
