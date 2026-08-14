import { describe, it, expect } from 'vitest';
import {
  liquidarPeriodo,
  resolverParametros,
  diasDelPeriodo,
  tramosSemanales,
  diaSemanaISO,
  sueldoSugerido,
  PARAMETROS_SUELDO_DEFAULT,
  type EntradaLiquidacion,
  type RegistroVenta,
  type TurnoContratado,
} from './sueldos';

// ── Caso de prueba de la spec §5 ────────────────────────────────────────────────────────────
// Datos reales de `13.-NOMBRE_2026_MES_VERSIÓN 20.0.xlsx`, periodo 2025-06-16 a 2025-07-16.

const INICIO = '2025-06-16';
const FIN = '2025-07-16';

// Lunes, martes y miércoles: 09:00-13:00 + 13:00-20:00 = 11 h. Jueves a domingo: sin horario.
const HORARIO: TurnoContratado[] = [1, 2, 3].flatMap((diaSemana) => [
  { diaSemana, turno: 1, horaInicio: '09:00', horaFin: '13:00' },
  { diaSemana, turno: 2, horaInicio: '13:00', horaFin: '20:00' },
]);

// 16 días trabajados: 15 contratados + el jueves 19 de junio, que no tenía horario.
const JORNADAS: Record<string, [string, string]> = {
  '2025-06-16': ['09:11', '20:30'],
  '2025-06-17': ['09:11', '20:30'],
  '2025-06-18': ['09:00', '20:30'],
  '2025-06-19': ['09:11', '20:30'], // jueves sin horario contratado
  '2025-06-23': ['09:11', '20:00'],
  '2025-06-24': ['09:11', '20:30'],
  '2025-06-25': ['09:00', '20:30'],
  '2025-06-30': ['09:11', '20:00'],
  '2025-07-01': ['09:11', '20:30'],
  '2025-07-02': ['09:00', '20:30'],
  '2025-07-07': ['09:11', '20:00'],
  '2025-07-08': ['09:11', '20:30'],
  '2025-07-09': ['09:00', '20:30'],
  '2025-07-14': ['09:11', '20:00'],
  '2025-07-15': ['09:11', '20:30'],
  '2025-07-16': ['09:00', '20:30'],
};

const TARDANZAS_JUSTIFICADAS = ['2025-06-16', '2025-06-17', '2025-06-23', '2025-06-24'];

const armarAsistencia = (justificadas: string[] = TARDANZAS_JUSTIFICADAS) =>
  diasDelPeriodo(INICIO, FIN).map((fecha) => ({
    fecha,
    horaIngreso: JORNADAS[fecha]?.[0] ?? null,
    horaSalida: JORNADAS[fecha]?.[1] ?? null,
    tardanzaJustificada: justificadas.includes(fecha),
  }));

// Ventas: S/7.200 en total, S/1.800 por semana, y S/2.320 en boletas mayores a S/120.
// El Excel guardaba esos dos totales en bloques distintos que no cuadraban; acá hay una sola
// tabla y ambos se derivan de ella (spec §3.5).
const venta = (fecha: string, monto: number): RegistroVenta => ({ fecha, monto, tipo: 'venta' });
const repetir = (fecha: string, monto: number, n: number): RegistroVenta[] =>
  Array.from({ length: n }, () => venta(fecha, monto));

const VENTAS: RegistroVenta[] = [
  // Semana 1 — 450 en boletas grandes + 1.350 en chicas
  venta('2025-06-16', 150),
  venta('2025-06-16', 300),
  ...repetir('2025-06-17', 100, 13),
  venta('2025-06-18', 50),
  // Semana 2 — 550 + 1.250
  venta('2025-06-23', 200),
  venta('2025-06-23', 350),
  ...repetir('2025-06-24', 100, 12),
  venta('2025-06-25', 50),
  // Semana 3 — 920 + 880
  venta('2025-06-30', 420),
  venta('2025-06-30', 500),
  ...repetir('2025-07-01', 110, 8),
  // Semana 4 — 400 + 1.400
  venta('2025-07-07', 220),
  venta('2025-07-07', 180),
  ...repetir('2025-07-08', 100, 14),
];

const GOLDEN: EntradaLiquidacion = {
  fechaInicio: INICIO,
  fechaFin: FIN,
  sueldoPactado: 600,
  horario: HORARIO,
  asistencia: armarAsistencia(),
  horasFueraDeContrato: [{ fecha: '2025-07-10', horaIngreso: '08:00', horaSalida: '14:00' }],
  ventas: VENTAS,
  adelantos: [
    { fecha: '2025-06-20', motivo: 'adelanto', monto: 100 },
    { fecha: '2025-06-27', motivo: 'adelanto', monto: 20 },
    { fecha: '2025-07-04', motivo: 'adelanto', monto: 50 },
    { fecha: '2025-07-11', motivo: 'adelanto', monto: 20 },
  ],
  reportes: [{ fecha: '2025-07-02', motivo: 'malogró plancha', monto: 20 }],
  bonosExtras: [{ fecha: '2025-07-05', motivo: 'pintado de habitación', monto: 20 }],
  almuerzosEntregados: 8,
  // Sus días son de 11 h y el umbral de tiempo completo son 12: si el administrador no le
  // hubiera habilitado los almuerzos, no ganaría ninguno. El Excel se los pagaba, así que estaba
  // habilitado (RN-15).
  almuerzoHabilitadoPorAdmin: true,
  personasCapacitadas: 2,
};

describe('golden test — spec §5', () => {
  const l = liquidarPeriodo(GOLDEN);
  const linea = (concepto: string) => l.lineas.find((x) => x.concepto.startsWith(concepto))!;

  it('base del periodo (RN-01 a RN-04)', () => {
    expect(l.base.horasContratadas).toBe(165);
    expect(l.base.diasContratados).toBe(15); // no 27: sólo los días que tienen horario
    expect(l.base.sueldoPorDia).toBe(40); // no 22.22
    expect(l.base.valorPorHora).toBeCloseTo(3.6364, 4);
  });

  it('asistencia (RN-05 a RN-07)', () => {
    expect(l.asistencia.diasTrabajados).toBe(16);
    // Las horas se reportan a 2 decimales (179,9833 en el Excel). El dinero de la línea
    // "Diferencia de horas" sí se calcula con la precisión completa: da 54,48 y no 54,47.
    expect(l.asistencia.horasTrabajadas).toBe(179.98);
    expect(l.asistencia.diferenciaHoras).toBe(14.98);
    expect(l.asistencia.faltas).toBe(0);
  });

  it('ventas y meta del periodo (RN-10, RN-11, RN-13)', () => {
    expect(l.ventas.total).toBe(7200);
    // Sin meta pactada, se sugiere por horas: 33 h × S/45.4545 = S/1.500 por semana.
    // La del periodo es la suma de las cuatro, no un cálculo aparte.
    expect(l.ventas.metaPeriodo).toBe(6000);
    expect(l.ventas.baseComision).toBe(2320);
    expect(l.ventas.metaAlcanzada).toBe(true);
    expect(linea('Comisión').monto).toBe(46.4);
  });

  it('la meta pactada del contrato manda sobre la sugerida (RN-10)', () => {
    const conMetaPactada = liquidarPeriodo({ ...GOLDEN, parametros: { metaSemanal: 3000 } });
    expect(conMetaPactada.ventas.semanas.map((s) => s.meta)).toEqual([3000, 3000, 3000, 3000]);
    expect(conMetaPactada.ventas.metaPeriodo).toBe(12000);
    expect(conMetaPactada.ventas.semanasCumplidas).toBe(0); // vendió 1.800 por semana
    expect(conMetaPactada.ventas.metaAlcanzada).toBe(false); // 7.200 < 12.000
    expect(conMetaPactada.lineas.find((x) => x.concepto.startsWith('Comisión'))!.monto).toBe(0);
  });

  it('almuerzos: cuenta días de tiempo completo, no días del calendario (RN-15)', () => {
    expect(l.asistencia.diasConDerechoAlmuerzo).toBe(16);
    expect(l.asistencia.almuerzosAPagar).toBe(8); // el Excel pagaba 19
    expect(linea('Almuerzos').monto).toBe(64); // el Excel pagaba 152
  });

  it('sin la habilitación del administrador, 11 h no llegan a tiempo completo (RN-15)', () => {
    const sinHabilitar = liquidarPeriodo({ ...GOLDEN, almuerzoHabilitadoPorAdmin: false });
    expect(sinHabilitar.asistencia.diasConDerechoAlmuerzo).toBe(0);
    expect(sinHabilitar.lineas.find((x) => x.concepto === 'Almuerzos')!.monto).toBe(0);
    expect(sinHabilitar.advertencias.join(' ')).toMatch(/Se entregaron 8 almuerzos/);
  });

  it('horas fuera de contrato y capacitaciones (RN-16, RN-17)', () => {
    expect(l.asistencia.horasFueraDeContrato).toBe(6);
    expect(linea('Horas fuera de contrato').monto).toBe(21.82);
    expect(linea('Apoyo en capacitación').monto).toBe(50);
  });

  it('ajustes y movimientos administrativos (RN-07, RN-18, RN-19)', () => {
    expect(linea('Diferencia de horas').monto).toBe(54.48);
    expect(linea('Adelantos').monto).toBe(-190);
    expect(linea('Reportes').monto).toBe(-20);
    expect(linea('Bonos extras').monto).toBe(20);
  });

  it('el desglose suma exactamente el total (RN-20)', () => {
    const suma = l.lineas.reduce((s, x) => s + x.monto, 0);
    expect(Math.round(suma * 100) / 100).toBe(l.total);
    expect(Math.round((l.ingresos + l.descuentos + l.ajustes) * 100) / 100).toBe(l.subtotal);
  });

  it('un periodo bien cargado no genera ninguna advertencia', () => {
    expect(l.advertencias).toEqual([]);
  });

  // ── Las dos decisiones de Alexander del 13-ago-2026 (spec §9) ─────────────────────────────

  it('§9.1 — el jueves sin horario no genera tardanza (RN-08)', () => {
    // El Excel contaba 11 ingresos a las 09:11. Uno es el jueves 19, que no tenía horario.
    // Decisión: no cuenta como tardanza; ese día sólo entra por la diferencia de horas.
    expect(l.asistencia.tardanzas).toBe(10);
    expect(l.asistencia.tardanzasInjustificadas).toBe(3); // 10 − 3 libres − 4 justificadas
    expect(linea('Descuento por tardanzas').monto).toBe(-15);
  });

  it('§9.2 — la semana larga absorbe días pero NO sube su meta (RN-12)', () => {
    expect(l.ventas.semanas).toHaveLength(4);
    const [, , , s4] = l.ventas.semanas;
    // Las cuatro metas son iguales aunque la semana 4 dure 10 días y tenga 6 días contratados.
    expect(l.ventas.semanas.map((s) => s.meta)).toEqual([1500, 1500, 1500, 1500]);
    expect(s4.dias).toBe(10);
    expect(s4.diasContratados).toBe(6);
    expect(s4.cumplida).toBe(true); // vendió 1.800 > 1.500
    expect(l.ventas.semanasCumplidas).toBe(4);
    expect(linea('Bono por metas semanales').monto).toBe(120);
  });

  it('el bono semanal y la comisión se cobran los dos (RN-12 y RN-13)', () => {
    // Son premios distintos por metas distintas: el bono se gana semana a semana, la comisión
    // se desbloquea al llegar a la meta del mes. Uno no reemplaza al otro.
    expect(linea('Bono por metas semanales').monto).toBe(120);
    expect(linea('Comisión').monto).toBe(46.4);
  });

  it('total del periodo', () => {
    expect(l.ingresos).toBe(852.22);
    expect(l.descuentos).toBe(-190);
    expect(l.ajustes).toBe(104.48);
    expect(l.subtotal).toBe(766.7);
    expect(l.total).toBe(751.7);
  });
});

// ── Datos incompletos: cada caso de abajo salía mal y en silencio ───────────────────────────
// Hallazgos del subagente verificador, 13-ago-2026. Todos son regresiones: el número que sigue
// a "daba" es lo que el motor devolvía antes de arreglarlo.

describe('datos incompletos (hallazgos del verificador)', () => {
  it('un día contratado sin registro corta el cálculo, no se asume falta', () => {
    // Daba −1198.18 en vez de 705.30: 15 faltas × 3 días de sueldo, sin una sola advertencia.
    // "No cargué la asistencia" y "no vino nunca" tienen que ser distinguibles.
    expect(() => liquidarPeriodo({ ...GOLDEN, asistencia: [] })).toThrow(/Faltan 15 día\(s\) contratado\(s\)/);
    const sinUnDia = armarAsistencia().filter((r) => r.fecha !== '2025-07-01');
    expect(() => liquidarPeriodo({ ...GOLDEN, asistencia: sinUnDia })).toThrow(/2025-07-01/);
  });

  it('un parámetro undefined o null no pisa el default', () => {
    // Daba total NaN (que serializa a null en JSON) cuando la fila de config todavía no existía.
    const p = resolverParametros({ penalidadTardanza: undefined, valorAlmuerzo: null as never });
    expect(p.penalidadTardanza).toBe(PARAMETROS_SUELDO_DEFAULT.penalidadTardanza);
    expect(p.valorAlmuerzo).toBe(PARAMETROS_SUELDO_DEFAULT.valorAlmuerzo);
    const l = liquidarPeriodo({ ...GOLDEN, parametros: { penalidadTardanza: undefined } });
    expect(l.total).toBe(751.7);
  });

  it('un parámetro con basura adentro corta el cálculo', () => {
    expect(() => resolverParametros({ penalidadTardanza: NaN })).toThrow(/tiene que ser un número/);
    expect(() => resolverParametros({ valorAlmuerzo: -5 })).toThrow(/no puede ser negativo/);
    expect(() => resolverParametros({ metaSemanalFija: 1 as never })).toThrow(/true o false/);
    expect(() => resolverParametros({ inventado: 3 } as never)).toThrow(/desconocido/);
  });

  it('dos turnos del mismo día que se solapan cortan el cálculo', () => {
    // Daba 322.29 en vez de 705.30: las horas contratadas pasaban de 165 a 270 y el valor por
    // hora se hundía de 3.6364 a 2.2222 para TODO el periodo.
    const solapado: TurnoContratado[] = [
      { diaSemana: 1, turno: 1, horaInicio: '09:00', horaFin: '20:00' }, // tipeo: debía ser 13:00
      { diaSemana: 1, turno: 2, horaInicio: '13:00', horaFin: '20:00' },
    ];
    expect(() => liquidarPeriodo({ ...GOLDEN, horario: solapado })).toThrow(/se solapan/);
  });

  it('una fecha que no es YYYY-MM-DD corta el cálculo', () => {
    // Un repo que devuelva una columna timestamptz sin convertir daba 146 en vez de 274: el día
    // no matcheaba, se descartaba en silencio y se volvía falta.
    const conTimestamp = armarAsistencia().map((r) =>
      r.fecha === '2025-06-17' ? { ...r, fecha: '2025-06-17T00:00:00.000Z' } : r,
    );
    expect(() => liquidarPeriodo({ ...GOLDEN, asistencia: conTimestamp })).toThrow(/fecha inválida/);
    expect(() => liquidarPeriodo({ ...GOLDEN, fechaInicio: '2025-6-16' })).toThrow(/fecha inválida/);
  });

  it('una justificación puesta en un día sin tardanza avisa en vez de perderse', () => {
    // Daba 685.30 sin decir nada: el admin creía haber justificado 4 días y no se descontaba
    // ninguno. Las 4 justificaciones caen acá en días que entró 09:00 (a horario).
    const l = liquidarPeriodo({
      ...GOLDEN,
      asistencia: armarAsistencia(['2025-06-18', '2025-06-25', '2025-07-02', '2025-07-09']),
    });
    expect(l.asistencia.tardanzasJustificadas).toBe(0);
    expect(l.asistencia.tardanzasInjustificadas).toBe(7);
    expect(l.advertencias.join(' ')).toMatch(/4 justificación\(es\) cayeron en días/);
    expect(l.total).toBe(731.7);
  });

  it('un ingreso sin salida avisa', () => {
    // Daba 657.97 sin advertencia: el error de marcación más común del mundo.
    const l = liquidarPeriodo({
      ...GOLDEN,
      asistencia: armarAsistencia().map((r) => (r.fecha === '2025-06-30' ? { ...r, horaSalida: null } : r)),
    });
    expect(l.advertencias.join(' ')).toMatch(/2025-06-30: tiene ingreso sin salida/);
    expect(l.asistencia.faltas).toBe(0); // marcó entrada, no es falta
    expect(l.total).toBe(704.37);
  });

  it('horas fuera de contrato de otro periodo no se pagan, y las repetidas cortan', () => {
    // Un registro que quedó del mes anterior se cobraba de nuevo este mes, sin advertencia.
    const l = liquidarPeriodo({
      ...GOLDEN,
      horasFueraDeContrato: [
        { fecha: '2025-07-10', horaIngreso: '08:00', horaSalida: '14:00' },
        { fecha: '2025-05-02', horaIngreso: '08:00', horaSalida: '20:00' }, // periodo anterior
      ],
    });
    expect(l.asistencia.horasFueraDeContrato).toBe(6);
    expect(l.total).toBe(751.7);
    expect(l.advertencias.join(' ')).toMatch(/fuera del periodo y no se pagaron/);

    expect(() =>
      liquidarPeriodo({
        ...GOLDEN,
        horasFueraDeContrato: [
          { fecha: '2025-07-10', horaIngreso: '08:00', horaSalida: '11:00' },
          { fecha: '2025-07-10', horaIngreso: '11:00', horaSalida: '14:00' },
        ],
      }),
    ).toThrow(/Fecha repetida en horas fuera de contrato/);
  });

  it('liquidar sin ninguna venta cargada avisa', () => {
    // Daba 585.30 en silencio: se perdía el bono entero. Hoy la grilla de ventas se llena a mano.
    const l = liquidarPeriodo({ ...GOLDEN, ventas: [] });
    expect(l.advertencias.join(' ')).toMatch(/No hay ninguna venta registrada/);
    expect(l.total).toBe(585.3);
  });

  it('un movimiento con monto negativo o cero corta el cálculo', () => {
    // Un adelanto tipeado como −100 invertía la línea: de descontar 100 pasaba a sumar 100.
    expect(() =>
      liquidarPeriodo({ ...GOLDEN, adelantos: [{ fecha: '2025-06-20', motivo: 'adelanto', monto: -100 }] }),
    ).toThrow(/Tiene que ser mayor a 0/);
    expect(() =>
      liquidarPeriodo({ ...GOLDEN, reportes: [{ fecha: '2025-07-02', motivo: 'x', monto: 0 }] }),
    ).toThrow(/Tiene que ser mayor a 0/);
  });

  it('una hora fuera de rango corta el cálculo', () => {
    // '19:99' por '19:59' regalaba 0,65 h pagadas.
    expect(() =>
      liquidarPeriodo({
        ...GOLDEN,
        asistencia: armarAsistencia().map((r) => (r.fecha === '2025-06-16' ? { ...r, horaSalida: '20:99' } : r)),
      }),
    ).toThrow(/fuera de rango/);
  });

  it('un total negativo avisa antes de pagarlo', () => {
    const l = liquidarPeriodo({
      ...GOLDEN,
      adelantos: [{ fecha: '2025-06-20', motivo: 'adelanto grande', monto: 2000 }],
    });
    expect(l.total).toBeLessThan(0);
    expect(l.advertencias.join(' ')).toMatch(/total del periodo es negativo/);
  });
});

// ── Reglas sueltas ──────────────────────────────────────────────────────────────────────────

describe('calendario', () => {
  it('diaSemanaISO: 1 lunes … 7 domingo', () => {
    expect(diaSemanaISO('2025-06-16')).toBe(1);
    expect(diaSemanaISO('2025-06-22')).toBe(7);
  });

  it('rechaza una fecha que no existe en el calendario', () => {
    expect(() => diaSemanaISO('2025-02-31')).toThrow(/no existe en el calendario/);
  });

  it('tramosSemanales: la última semana absorbe los días sobrantes (RN-12)', () => {
    expect(tramosSemanales('2025-06-16', '2025-07-16')).toEqual([
      { desde: '2025-06-16', hasta: '2025-06-22' },
      { desde: '2025-06-23', hasta: '2025-06-29' },
      { desde: '2025-06-30', hasta: '2025-07-06' },
      { desde: '2025-07-07', hasta: '2025-07-16' },
    ]);
  });

  it('tramosSemanales: un periodo más corto que una semana es una sola semana', () => {
    expect(tramosSemanales('2025-06-16', '2025-06-19')).toHaveLength(1);
  });
});

describe('modalidad semanal — el mismo motor con periodo de 7 días (spec §1.1)', () => {
  const semanal = liquidarPeriodo({
    fechaInicio: '2025-06-16',
    fechaFin: '2025-06-22',
    sueldoPactado: 140,
    horario: HORARIO,
    asistencia: [
      { fecha: '2025-06-16', horaIngreso: '09:00', horaSalida: '20:00' },
      { fecha: '2025-06-17', horaIngreso: '09:00', horaSalida: '20:00' },
      { fecha: '2025-06-18', horaIngreso: '09:00', horaSalida: '20:00' },
    ],
  });

  it('una sola semana y las mismas reglas', () => {
    expect(semanal.base.horasContratadas).toBe(33);
    expect(semanal.base.diasContratados).toBe(3);
    expect(semanal.ventas.semanas).toHaveLength(1);
    expect(semanal.base.valorPorHora).toBeCloseTo(140 / 33, 6);
    expect(semanal.asistencia.diferenciaHoras).toBe(0);
    expect(semanal.total).toBe(140); // sin almuerzo: sus días de 11 h no llegan a tiempo completo
  });
});

describe('faltas (RN-09)', () => {
  const base = {
    fechaInicio: '2025-06-16',
    fechaFin: '2025-06-22',
    sueldoPactado: 120, // 3 días contratados → S/40 por día
    horario: HORARIO,
  };

  it('un día con horario y sin ingreso es falta, y cuesta 2 días de sueldo', () => {
    const l = liquidarPeriodo({
      ...base,
      asistencia: [
        { fecha: '2025-06-16', horaIngreso: '09:00', horaSalida: '20:00' },
        { fecha: '2025-06-17', horaIngreso: null, horaSalida: null },
        { fecha: '2025-06-18', horaIngreso: '09:00', horaSalida: '20:00' },
      ],
    });
    expect(l.asistencia.faltas).toBe(1);
    expect(l.advertencias.join(' ')).toMatch(/1 falta\(s\)/);
    // El ejemplo textual del dueño (14-ago-2026): "si trabaja 3 días y cobra 40, y falta uno
    // recibe 80 de dos días, pero al faltar un día se le quita de uno más, entonces solo cobra
    // 40". Los dos días salen por caminos distintos y suman exactamente eso.
    expect(l.lineas.find((x) => x.concepto === 'Diferencia de horas')!.monto).toBe(-40); // el día que no vino
    expect(l.lineas.find((x) => x.concepto === 'Faltas injustificadas')!.monto).toBe(-40); // el castigo
    expect(l.total).toBe(40);
  });

  it('una falta justificada cuesta 1 día: sólo el que no vino, sin castigo', () => {
    const l = liquidarPeriodo({
      ...base,
      asistencia: [
        { fecha: '2025-06-16', horaIngreso: '09:00', horaSalida: '20:00' },
        { fecha: '2025-06-17', horaIngreso: null, horaSalida: null, faltaJustificada: true },
        { fecha: '2025-06-18', horaIngreso: '09:00', horaSalida: '20:00' },
      ],
    });
    expect(l.asistencia.faltasInjustificadas).toBe(0);
    expect(l.lineas.find((x) => x.concepto === 'Faltas injustificadas')!.monto).toBe(0);
    expect(l.total).toBe(80); // 120 − los 40 del día que no vino
  });

  it('un día sin horario y sin ingreso no es falta', () => {
    const l = liquidarPeriodo({
      ...base,
      asistencia: [
        { fecha: '2025-06-16', horaIngreso: '09:00', horaSalida: '20:00' },
        { fecha: '2025-06-17', horaIngreso: '09:00', horaSalida: '20:00' },
        { fecha: '2025-06-18', horaIngreso: '09:00', horaSalida: '20:00' },
      ],
    });
    expect(l.asistencia.faltas).toBe(0);
  });
});

describe('validaciones (spec §6)', () => {
  const jornada = (fecha: string) => ({ fecha, horaIngreso: '09:00', horaSalida: '20:00' });
  const minimo = {
    fechaInicio: '2025-06-16',
    fechaFin: '2025-06-22',
    sueldoPactado: 120,
    horario: HORARIO,
    asistencia: ['2025-06-16', '2025-06-17', '2025-06-18'].map(jornada),
  };

  it('sin horas contratadas no se puede liquidar (RN-02)', () => {
    expect(() => liquidarPeriodo({ ...minimo, horario: [] })).toThrow(/no tiene horas contratadas/);
  });

  it('la salida tiene que ser posterior al ingreso', () => {
    expect(() =>
      liquidarPeriodo({
        ...minimo,
        asistencia: [
          { fecha: '2025-06-16', horaIngreso: '20:00', horaSalida: '09:00' },
          jornada('2025-06-17'),
          jornada('2025-06-18'),
        ],
      }),
    ).toThrow(/no es posterior al ingreso/);
  });

  it('la misma fecha no puede estar en asistencia y en horas fuera de contrato (RN-17)', () => {
    expect(() =>
      liquidarPeriodo({
        ...minimo,
        horasFueraDeContrato: [{ fecha: '2025-06-16', horaIngreso: '20:00', horaSalida: '22:00' }],
      }),
    ).toThrow(/se pagaría dos veces/);
  });

  it('una fecha repetida en la asistencia corta el cálculo', () => {
    expect(() =>
      liquidarPeriodo({ ...minimo, asistencia: [...minimo.asistencia, jornada('2025-06-16')] }),
    ).toThrow(/Fecha repetida en la asistencia/);
  });

  it('un descuento sin motivo no se registra', () => {
    expect(() =>
      liquidarPeriodo({ ...minimo, reportes: [{ fecha: '2025-06-16', motivo: '  ', monto: 20 }] }),
    ).toThrow(/no tiene motivo/);
  });

  it('los almuerzos nunca son negativos y avisan cuando no cuadran', () => {
    const l = liquidarPeriodo({ ...minimo, almuerzosEntregados: 5 });
    expect(l.asistencia.diasConDerechoAlmuerzo).toBe(0); // 11 h no llegan a las 12 de tiempo completo
    expect(l.asistencia.almuerzosAPagar).toBe(0);
    expect(l.advertencias.join(' ')).toMatch(/Se entregaron 5 almuerzos/);
  });

  it('un sueldo pactado negativo corta el cálculo', () => {
    expect(() => liquidarPeriodo({ ...minimo, sueldoPactado: -100 })).toThrow(/no puede ser negativo/);
  });
});

describe('escala salarial (RN-14)', () => {
  it('sugiere una tarifa, no la impone', () => {
    expect(sueldoSugerido(1, 165)).toBe(478.5); // el "sueldo recomendado" del Excel
    expect(sueldoSugerido(5, 165)).toBe(825);
  });

  it('acepta una tabla de escalas distinta a la de por defecto', () => {
    expect(sueldoSugerido(1, 100, [{ escala: 1, tarifaHora: 4, antiguedad: 'nueva escala' }])).toBe(400);
  });

  it('rechaza una escala inexistente', () => {
    expect(() => sueldoSugerido(9, 165)).toThrow(/Escala inexistente/);
  });
});

describe('parámetros configurables (spec §3.3)', () => {
  it('ninguna cifra está quemada: cambiar la penalidad cambia el descuento', () => {
    const conPenalidad10 = liquidarPeriodo({ ...GOLDEN, parametros: { penalidadTardanza: 10 } });
    expect(conPenalidad10.lineas.find((x) => x.concepto === 'Descuento por tardanzas')!.monto).toBe(-30);
  });

  it('sin tardanzas libres, las 10 tardanzas menos las 4 justificadas se descuentan', () => {
    const sinLibres = liquidarPeriodo({ ...GOLDEN, parametros: { tardanzasLibres: 0 } });
    expect(sinLibres.asistencia.tardanzasInjustificadas).toBe(6);
  });

  it('metaSemanalFija:false vuelve a la RN-12 original (opción A de la spec §9.2)', () => {
    const proporcional = liquidarPeriodo({ ...GOLDEN, parametros: { metaSemanalFija: false } });
    expect(proporcional.ventas.semanas.map((s) => s.meta)).toEqual([1500, 1500, 1500, 3000]);
    expect(proporcional.ventas.semanasCumplidas).toBe(3);
    expect(proporcional.total).toBe(675.3);
  });
});
