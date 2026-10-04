import { describe, it, expect } from 'vitest';
import {
  liquidarPeriodo,
  resolverParametros,
  diasDelPeriodo,
  tramosSemanales,
  diaSemanaISO,
  sueldoSugerido,
  finDePeriodo,
  soloHastaHoy,
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
    // Sin meta pactada, se sugiere por horas: 33 h × S/45.4545 = S/1.500 por semana, y la semana
    // que absorbe los días sobrantes pide el doble (C-02). La del periodo es la suma de las
    // cuatro, no un cálculo aparte.
    expect(l.ventas.metaPeriodo).toBe(7500);
    expect(l.ventas.baseComision).toBe(2320);
    // Las ventas del mes (7.200) NO llegan a la meta del mes (7.500), así que no hay comisión.
    // La base se calcula igual: es el dato del que saldría la comisión si la meta se alcanzara.
    expect(l.ventas.metaAlcanzada).toBe(false);
    expect(linea('Comisión').monto).toBe(0);
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

  it('§9.2 — la semana larga absorbe días y SÍ sube su meta (RN-12, C-02)', () => {
    expect(l.ventas.semanas).toHaveLength(4);
    const [, , , s4] = l.ventas.semanas;
    // La semana 4 dura 10 días y tiene 6 días contratados en vez de 3, así que su meta es el
    // doble. Hasta el 17-ago-2026 las cuatro metas eran iguales — ver el test de más abajo.
    expect(l.ventas.semanas.map((s) => s.meta)).toEqual([1500, 1500, 1500, 3000]);
    expect(s4.dias).toBe(10);
    expect(s4.diasContratados).toBe(6);
    expect(s4.cumplida).toBe(false); // vendió 1.800, y ahora la meta de esa semana son 3.000
    expect(l.ventas.semanasCumplidas).toBe(3);
    expect(linea('Bono por metas semanales').monto).toBe(90);
  });

  // El caso completo del default anterior, para que la conducta que el administrador puede volver
  // a encender siga cubierta y para que se vea de un vistazo qué cuesta el cambio.
  it('metaSemanalFija:true reproduce el caso de la spec §5 hasta el 17-ago-2026', () => {
    const fija = liquidarPeriodo({ ...GOLDEN, parametros: { metaSemanalFija: true } });
    expect(fija.ventas.semanas.map((s) => s.meta)).toEqual([1500, 1500, 1500, 1500]);
    expect(fija.ventas.semanasCumplidas).toBe(4);
    expect(fija.ventas.metaPeriodo).toBe(6000);
    expect(fija.ventas.metaAlcanzada).toBe(true);
    expect(fija.lineas.find((x) => x.concepto === 'Bono por metas semanales')!.monto).toBe(120);
    expect(fija.lineas.find((x) => x.concepto.startsWith('Comisión'))!.monto).toBe(46.4);
    expect(fija.total).toBe(751.7);
  });

  // Lo que la spec no había previsto y sólo aparece corriendo el motor: como la meta del mes es
  // la SUMA de las semanales (RN-11), subir la de la semana larga sube también el umbral de la
  // comisión. Acá lo sube de 6.000 a 7.500 y las mismas 7.200 de venta dejan de alcanzarlo.
  // El cambio no cuesta S/30 de bono: cuesta S/76.40 entre bono y comisión.
  it('C-02 sube la meta del MES, no sólo la de la semana larga', () => {
    const fija = liquidarPeriodo({ ...GOLDEN, parametros: { metaSemanalFija: true } });
    expect(fija.ventas.metaPeriodo).toBe(6000);
    expect(l.ventas.metaPeriodo).toBe(7500);
    expect(fija.total - l.total).toBeCloseTo(76.4, 2);
  });

  it('el bono semanal y la comisión son premios distintos (RN-12 y RN-13)', () => {
    // Son premios distintos por metas distintas: el bono se gana semana a semana, la comisión
    // se desbloquea al llegar a la meta del mes. Uno no reemplaza al otro, y por eso acá se
    // cobran 3 bonos semanales sin una sola comisión.
    expect(linea('Bono por metas semanales').monto).toBe(90);
    expect(linea('Comisión').monto).toBe(0);
    // Con meta pactada baja (S/1.000 por semana) se cobran los dos a la vez.
    const conMeta = liquidarPeriodo({ ...GOLDEN, parametros: { metaSemanal: 1000 } });
    expect(conMeta.lineas.find((x) => x.concepto === 'Bono por metas semanales')!.monto).toBe(120);
    expect(conMeta.lineas.find((x) => x.concepto.startsWith('Comisión'))!.monto).toBe(46.4);
  });

  it('total del periodo', () => {
    expect(l.ingresos).toBe(775.82);
    expect(l.descuentos).toBe(-190);
    expect(l.ajustes).toBe(104.48);
    expect(l.subtotal).toBe(690.3);
    expect(l.total).toBe(675.3);
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
    expect(l.total).toBe(675.3);
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
    expect(l.total).toBe(655.3);
  });

  it('un ingreso sin salida avisa', () => {
    // Daba 657.97 sin advertencia: el error de marcación más común del mundo.
    const l = liquidarPeriodo({
      ...GOLDEN,
      asistencia: armarAsistencia().map((r) => (r.fecha === '2025-06-30' ? { ...r, horaSalida: null } : r)),
    });
    expect(l.advertencias.join(' ')).toMatch(/2025-06-30: tiene ingreso sin salida/);
    expect(l.asistencia.faltas).toBe(0); // marcó entrada, no es falta
    expect(l.total).toBe(627.97);
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
    expect(l.total).toBe(675.3);
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

// ── finDePeriodo (spec liquidación-por-tramos, addendum F-1/F-1b) ─────────────────────────────
// sugerirRango() de liquidaciones/cliente.tsx usaba calcularCiclo(desde, hoyPeru()), que contesta
// "¿qué ciclo contiene HOY?" y no "un período que arranca en `desde`". Estos casos fijan el
// contrato real: el resultado depende sólo de `desde`, `modalidad` y `limite` — nunca de la fecha
// de hoy.
describe('finDePeriodo', () => {
  it('semanal: 7 días inclusive, igual que un tramo de tramosSemanales()', () => {
    expect(finDePeriodo('2026-08-24', 'semanal')).toBe('2026-08-30');
    expect(diasDelPeriodo('2026-08-24', finDePeriodo('2026-08-24', 'semanal'))).toHaveLength(7);
  });

  it('mensual: un mes menos un día', () => {
    expect(finDePeriodo('2026-07-01', 'mensual')).toBe('2026-07-31');
  });

  it('mensual con un mes corto de por medio se recorta, mismo caso que ya prueba calcularCiclo', () => {
    // Mismo caso que evaluaciones.test.ts (aniversario en 29/30/31 de enero contra un febrero de
    // 28 días, 2026 no es bisiesto): acá el 31 de enero es el `desde` directo, no un aniversario.
    expect(finDePeriodo('2026-01-31', 'mensual')).toBe('2026-02-28');
    expect(finDePeriodo('2026-01-30', 'mensual')).toBe('2026-02-28');
    expect(finDePeriodo('2026-01-29', 'mensual')).toBe('2026-02-28');
  });

  it('mensual cruza el fin de año', () => {
    expect(finDePeriodo('2026-12-31', 'mensual')).toBe('2027-01-30');
  });

  it('se recorta a `limite` cuando el período se pasaría de ahí', () => {
    expect(finDePeriodo('2026-07-01', 'mensual', '2026-07-20')).toBe('2026-07-20');
    expect(finDePeriodo('2026-08-24', 'semanal', '2026-08-27')).toBe('2026-08-27');
  });

  it('no recorta cuando el período no se pasa de `limite`', () => {
    expect(finDePeriodo('2026-07-01', 'mensual', '2026-12-31')).toBe('2026-07-31');
  });

  it('el "hasta" de un acuerdo vencido no salta al mes de hoy — el bug real que corrige F-1', () => {
    // Caso del addendum: un acuerdo mensual de mayo a julio, liquidado recién en agosto.
    // calcularCiclo(desde, hoyPeru()) daba 2026-08-31 (el ciclo que contiene HOY); finDePeriodo
    // tiene que seguir devolviendo un tramo de MAYO, sin que importe cuándo se calcule.
    expect(finDePeriodo('2026-05-01', 'mensual', '2026-07-31')).toBe('2026-05-31');
  });

  it('rechaza una modalidad desconocida', () => {
    expect(() => finDePeriodo('2026-07-01', 'diaria' as never)).toThrow(/modalidad desconocida/);
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

// ── Los filos: cada umbral, probado justo a un lado y justo al otro ─────────────────────────
// Segunda ronda del verificador (spec §9.6). Todos estos límites existían en el motor pero
// ningún test los fijaba: se podían voltear en silencio.

describe('filos de los umbrales', () => {
  const SEMANA = { fechaInicio: '2025-06-16', fechaFin: '2025-06-22', horario: HORARIO };
  const jornadaCompleta = ['2025-06-16', '2025-06-17', '2025-06-18'].map((fecha) => ({
    fecha,
    horaIngreso: '09:00',
    horaSalida: '20:00',
  }));

  it('el empate no cumple la meta semanal pero sí desbloquea la comisión (RN-12 vs RN-13)', () => {
    // Las dos comparaciones son opuestas a propósito: §9.3 fija la semanal como estricta
    // (`ventas > meta`) y RN-13 usa `>=`. Sin este test, voltear cualquiera de las dos pasa sin
    // que nadie se entere, y voltear la del bono paga S/30 de una semana que no se ganó.
    const l = liquidarPeriodo({
      ...SEMANA,
      sueldoPactado: 120,
      asistencia: jornadaCompleta,
      ventas: [venta('2025-06-16', 1500)], // exactamente la meta sugerida de 33 h × S/45,4545
    });
    expect(l.ventas.semanas[0].meta).toBe(1500);
    expect(l.ventas.semanas[0].cumplida).toBe(false); // estricta: empatar no cumple
    expect(l.ventas.metaAlcanzada).toBe(true); // `>=`: empatar sí desbloquea
    expect(l.lineas.find((x) => x.concepto === 'Bono por metas semanales')!.monto).toBe(0);
    expect(l.lineas.find((x) => x.concepto.startsWith('Comisión'))!.monto).toBe(30);
    expect(l.total).toBe(150);
  });

  it('una boleta de exactamente S/120 queda fuera de la base de comisión (RN-13)', () => {
    const conBoletas = (montos: number[]) =>
      liquidarPeriodo({
        ...SEMANA,
        sueldoPactado: 120,
        asistencia: jornadaCompleta,
        ventas: montos.map((m) => venta('2025-06-16', m)),
      }).ventas.baseComision;
    expect(conBoletas([120, 1500])).toBe(1500); // la de 120 no entra
    expect(conBoletas([120.01, 1500])).toBe(1620.01); // un céntimo más y entra
  });

  it('entrar en el minuto exacto de la tolerancia no es tardanza (RN-08)', () => {
    // Turno 09:00 + 10 minutos de gracia = 09:10. La comparación es estricta.
    const conIngreso = (hora: string) =>
      liquidarPeriodo({
        ...SEMANA,
        sueldoPactado: 120,
        asistencia: [{ fecha: '2025-06-16', horaIngreso: hora, horaSalida: '20:00' }, ...jornadaCompleta.slice(1)],
      }).asistencia.tardanzas;
    expect(conIngreso('09:10')).toBe(0);
    expect(conIngreso('09:11')).toBe(1);
  });

  it('el almuerzo se gana a las 12 h exactas, no antes (RN-15)', () => {
    const conJornada = (salida: string) =>
      liquidarPeriodo({
        ...SEMANA,
        sueldoPactado: 120,
        asistencia: [
          { fecha: '2025-06-16', horaIngreso: '08:00', horaSalida: salida },
          ...jornadaCompleta.slice(1),
        ],
      }).asistencia.diasConDerechoAlmuerzo;
    expect(conJornada('19:59')).toBe(0); // 11 h 59
    expect(conJornada('20:00')).toBe(1); // 12 h justas
  });

  it('factorMeta descuenta la meta sugerida pero nunca la pactada (RN-10)', () => {
    const base = { ...SEMANA, sueldoPactado: 120, asistencia: jornadaCompleta };
    const sugerida = liquidarPeriodo({ ...base, parametros: { factorMeta: 0.85 } });
    expect(sugerida.ventas.semanas[0].meta).toBe(1275); // 1500 × 0.85
    const pactada = liquidarPeriodo({ ...base, parametros: { factorMeta: 0.85, metaSemanal: 3000 } });
    expect(pactada.ventas.semanas[0].meta).toBe(3000); // sin descuento
  });

  it('una fecha con formato válido pero inexistente corta el cálculo', () => {
    // '2025-06-31' pasa la expresión regular. Antes: la venta sumaba comisión, la jornada se
    // descartaba en silencio y las horas fuera de contrato se pagaban enteras.
    const conFechaImposible = (extra: Partial<EntradaLiquidacion>) => () =>
      liquidarPeriodo({ ...GOLDEN, ...extra });
    expect(conFechaImposible({ ventas: [...VENTAS, venta('2025-06-31', 5000)] })).toThrow(/no existe en el calendario/);
    expect(
      conFechaImposible({ horasFueraDeContrato: [{ fecha: '2025-06-31', horaIngreso: '08:00', horaSalida: '20:00' }] }),
    ).toThrow(/no existe en el calendario/);
    expect(
      conFechaImposible({ adelantos: [{ fecha: '2025-02-30', motivo: 'x', monto: 50 }] }),
    ).toThrow(/no existe en el calendario/);
  });

  it('un movimiento administrativo fuera del periodo se cuenta igual, pero avisa (§6)', () => {
    // Asimetría deliberada: una venta fuera del periodo pertenece a otra meta y no cuenta; un
    // adelanto ya entregado hay que descontarlo aunque le hayan puesto mal la fecha.
    const l = liquidarPeriodo({
      ...GOLDEN,
      adelantos: [{ fecha: '2025-05-02', motivo: 'adelanto con fecha mal puesta', monto: 100 }],
    });
    expect(l.lineas.find((x) => x.concepto === 'Adelantos')!.monto).toBe(-100);
    expect(l.advertencias.join(' ')).toMatch(/está fuera del periodo, pero se contó igual/);
  });

  it('una salida sin ingreso avisa y no cuenta como falta', () => {
    const l = liquidarPeriodo({
      ...SEMANA,
      sueldoPactado: 120,
      asistencia: [{ fecha: '2025-06-16', horaIngreso: null, horaSalida: '20:00' }, ...jornadaCompleta.slice(1)],
    });
    expect(l.advertencias.join(' ')).toMatch(/tiene salida sin ingreso/);
    expect(l.asistencia.faltas).toBe(1); // sin ingreso en día contratado, sigue siendo falta
  });

  it('el castigo por falta se cobra sobre el día real, no sobre el promedio (§9.6)', () => {
    // Lunes de 11 h y sábado de 1 h: dos jornadas muy desiguales, valor de la hora S/10.
    // Antes el castigo salía del día promedio (S/60) y faltar al sábado costaba S/70, es decir
    // 7 sábados de trabajo. Ahora cuesta 2 sábados y faltar al lunes cuesta 2 lunes.
    const desigual: TurnoContratado[] = [
      { diaSemana: 1, horaInicio: '09:00', horaFin: '20:00' }, // lunes, 11 h
      { diaSemana: 6, horaInicio: '09:00', horaFin: '10:00' }, // sábado, 1 h
    ];
    const costoDeLaFalta = (faltaAl: 'lunes' | 'sabado') => {
      const l = liquidarPeriodo({
        fechaInicio: '2025-06-16',
        fechaFin: '2025-06-22',
        sueldoPactado: 120, // 12 h contratadas → valorPorHora 10, sueldoPorDia 60
        horario: desigual,
        asistencia: [
          { fecha: '2025-06-16', horaIngreso: faltaAl === 'lunes' ? null : '09:00', horaSalida: faltaAl === 'lunes' ? null : '20:00' },
          { fecha: '2025-06-21', horaIngreso: faltaAl === 'sabado' ? null : '09:00', horaSalida: faltaAl === 'sabado' ? null : '10:00' },
        ],
      });
      return Math.round((120 - l.total) * 100) / 100; // sin faltas cobraría los 120 completos
    };
    expect(costoDeLaFalta('sabado')).toBe(20); // 2 × (1 h × S/10)
    expect(costoDeLaFalta('lunes')).toBe(220); // 2 × (11 h × S/10)
  });

  it('el descuento por falta nunca paga dinero, aunque el parámetro sea 0 o 1', () => {
    const conDias = (dias: number) =>
      liquidarPeriodo({
        ...SEMANA,
        sueldoPactado: 120,
        asistencia: [
          { fecha: '2025-06-16', horaIngreso: null, horaSalida: null },
          ...jornadaCompleta.slice(1),
        ],
        parametros: { diasDescuentoPorFalta: dias },
      }).lineas.find((x) => x.concepto === 'Faltas injustificadas')!.monto;
    expect(conDias(0)).toBe(0); // no se convierte en un pago a favor
    expect(conDias(1)).toBe(0); // la falta cuesta sólo el día que no vino
    expect(conDias(3)).toBe(-80); // dos días de castigo además del día perdido
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

// ── RN-05 con tramos: las pausas no se pagan (C-01) ────────────────────────────────────────
// Se arma un periodo mínimo —un solo lunes contratado— para que cada caso hable de una sola cosa
// y el número esperado se pueda comprobar de cabeza.

describe('RN-05 — suma de tramos continuos (C-01)', () => {
  // Lunes 2025-06-16, 09:00-20:00 = 11 h contratadas. Sueldo 11 → valorPorHora exactamente 1.
  // El martes entra al periodo sin horario contratado: sirve para RN-17 y no genera falta.
  const UN_LUNES: EntradaLiquidacion = {
    fechaInicio: '2025-06-16',
    fechaFin: '2025-06-17',
    sueldoPactado: 11,
    horario: [{ diaSemana: 1, turno: 1, horaInicio: '09:00', horaFin: '20:00' }],
    asistencia: [{ fecha: '2025-06-16', horaIngreso: '09:00', horaSalida: '20:00' }],
  };

  // Arma el día como lo emite la RPC: los tramos MÁS el par de punta a punta, que es lo que
  // conserva la compatibilidad con el snapshot viejo. Que los dos convivan es justamente lo que
  // hay que probar — si el motor se quedara con el par, C-01 no ocurriría.
  const conTramos = (tramos: { ingreso?: string | null; salida?: string | null }[], parametros = {}) =>
    liquidarPeriodo({
      ...UN_LUNES,
      asistencia: [
        {
          fecha: '2025-06-16',
          horaIngreso: tramos[0]?.ingreso ?? null,
          horaSalida: tramos[tramos.length - 1]?.salida ?? null,
          tramos,
        },
      ],
      parametros,
    });

  // El periodo mínimo no tiene ventas, así que siempre trae el aviso de "ninguna venta". Lo que
  // interesa es que no aparezca ninguno de RN-05.
  const avisosDeTramos = (l: ReturnType<typeof liquidarPeriodo>) =>
    l.advertencias.filter((a) => /pausa|tramo|sin salida|sin ingreso/.test(a));

  it('un día sin tramos se comporta exactamente como antes', () => {
    expect(liquidarPeriodo(UN_LUNES).asistencia.horasTrabajadas).toBe(11);
    expect(avisosDeTramos(liquidarPeriodo(UN_LUNES))).toEqual([]);
  });

  it('dos tramos contiguos dan lo mismo que la resta de punta a punta', () => {
    // El horario real de LuceBien: 09:00-13:00 + 13:00-20:00, sin hueco. C-01 no le cambia nada,
    // y ése es el caso de todos los días de todo el mundo hoy.
    const l = conTramos([
      { ingreso: '09:00', salida: '13:00' },
      { ingreso: '13:00', salida: '20:00' },
    ]);
    expect(l.asistencia.horasTrabajadas).toBe(11);
    expect(avisosDeTramos(l)).toEqual([]);
  });

  it('una pausa de verdad NO se paga y avisa', () => {
    // Salió a las 13:00 y volvió a las 15:00: son 9 horas trabajadas, no 11.
    const l = conTramos([
      { ingreso: '09:00', salida: '13:00' },
      { ingreso: '15:00', salida: '20:00' },
    ]);
    expect(l.asistencia.horasTrabajadas).toBe(9);
    expect(l.asistencia.diferenciaHoras).toBe(-2);
    expect(l.advertencias.join(' ')).toMatch(/1 pausa\(s\) que suman 120 minuto\(s\) no se pagan/);
  });

  it('dos marcas del mismo momento no son una pausa', () => {
    // "No sonó, marco de nuevo". Sin el umbral, un hueco de 2 minutos se descuenta todos los días
    // a quien tenga el dedo seco.
    const l = conTramos([
      { ingreso: '09:00', salida: '12:58' },
      { ingreso: '13:00', salida: '20:00' },
    ]);
    expect(l.asistencia.horasTrabajadas).toBe(11);
    expect(avisosDeTramos(l)).toEqual([]);
  });

  it('con pausaMinimaMinutos en 0, cualquier hueco se descuenta', () => {
    const l = conTramos(
      [
        { ingreso: '09:00', salida: '12:58' },
        { ingreso: '13:00', salida: '20:00' },
      ],
      { pausaMinimaMinutos: 0 },
    );
    expect(l.asistencia.horasTrabajadas).toBe(10.97); // las horas se reportan a 2 decimales
  });

  it('dos tramos que se pisan no pagan dos veces', () => {
    // La regresión que una suma ingenua habría metido: una fila cargada a mano de punta a punta
    // más otra que dejó un reporte. Sumadas a ciegas dan 18 h de un día de 11.
    const l = conTramos([
      { ingreso: '09:00', salida: '20:00' },
      { ingreso: '13:00', salida: '20:00' },
    ]);
    expect(l.asistencia.horasTrabajadas).toBe(11);
  });

  it('un tramo contenido dentro de otro no acorta el día', () => {
    // Sin el Math.max de la fusión, el tramo corto le comía 4 horas al largo.
    const l = conTramos([
      { ingreso: '09:00', salida: '20:00' },
      { ingreso: '10:00', salida: '16:00' },
    ]);
    expect(l.asistencia.horasTrabajadas).toBe(11);
  });

  it('los tramos llegan desordenados y se ordenan solos', () => {
    const l = conTramos([
      { ingreso: '15:00', salida: '20:00' },
      { ingreso: '09:00', salida: '13:00' },
    ]);
    expect(l.asistencia.horasTrabajadas).toBe(9);
  });

  it('un tramo con un solo lado vale 0 y avisa, sin tirar abajo los demás', () => {
    const l = conTramos([
      { ingreso: '09:00', salida: '13:00' },
      { ingreso: '15:00', salida: null }, // se fue sin marcar
    ]);
    expect(l.asistencia.horasTrabajadas).toBe(4);
    expect(l.advertencias.join(' ')).toMatch(/ingreso sin salida/);
  });

  it('la tardanza se mide contra el primer tramo, no contra el regreso de la pausa', () => {
    // Volver de almorzar a las 15:00 no es llegar tarde. Si esto se rompe, cada pausa genera una
    // tardanza y se descuentan S/5 por almorzar.
    const l = conTramos([
      { ingreso: '09:00', salida: '13:00' },
      { ingreso: '15:00', salida: '20:00' },
    ]);
    expect(l.asistencia.tardanzas).toBe(0);

    const tarde = conTramos([
      { ingreso: '09:30', salida: '13:00' },
      { ingreso: '15:00', salida: '20:00' },
    ]);
    expect(tarde.asistencia.tardanzas).toBe(1);
  });

  it('una fila que trae SÓLO tramos no se lee como falta', () => {
    // La RPC emite horaIngreso además de los tramos, pero nada obliga a que otro llamador lo haga.
    // Sin el respaldo, esa fila costaría dos días de sueldo por RN-09.
    const l = liquidarPeriodo({
      ...UN_LUNES,
      asistencia: [
        {
          fecha: '2025-06-16',
          tramos: [
            { ingreso: '09:00', salida: '13:00' },
            { ingreso: '15:00', salida: '20:00' },
          ],
        },
      ],
    });
    expect(l.asistencia.faltas).toBe(0);
    expect(l.asistencia.horasTrabajadas).toBe(9);
  });

  it('las horas fuera de contrato también suman tramos (RN-17)', () => {
    const l = liquidarPeriodo({
      ...UN_LUNES,
      horasFueraDeContrato: [
        {
          fecha: '2025-06-17', // martes: dentro del periodo y sin horario contratado
          tramos: [
            { ingreso: '08:00', salida: '10:00' },
            { ingreso: '14:00', salida: '16:00' },
          ],
        },
      ],
    });
    expect(l.asistencia.horasFueraDeContrato).toBe(4); // no 8
  });

  it('el default de pausaMinimaMinutos es 15', () => {
    expect(PARAMETROS_SUELDO_DEFAULT.pausaMinimaMinutos).toBe(15);
  });
});

const r2mas = (a: number, b: number) => Math.round((a + b) * 100) / 100;

describe('parámetros configurables (spec §3.3)', () => {
  it('ninguna cifra está quemada: cambiar la penalidad cambia el descuento', () => {
    const conPenalidad10 = liquidarPeriodo({ ...GOLDEN, parametros: { penalidadTardanza: 10 } });
    expect(conPenalidad10.lineas.find((x) => x.concepto === 'Descuento por tardanzas')!.monto).toBe(-30);
  });

  it('sin tardanzas libres, las 10 tardanzas menos las 4 justificadas se descuentan', () => {
    const sinLibres = liquidarPeriodo({ ...GOLDEN, parametros: { tardanzasLibres: 0 } });
    expect(sinLibres.asistencia.tardanzasInjustificadas).toBe(6);
  });

  it('factorHoraFueraContrato: el default no cambia nada y el override sí (C-03, RN-17)', () => {
    // El default es 1 a propósito: ninguna liquidación existente cambia de monto al agregar el
    // parámetro. Si esto se rompe, alguien le movió la plata a todos sin querer.
    expect(PARAMETROS_SUELDO_DEFAULT.factorHoraFueraContrato).toBe(1);
    const linea = (x: ReturnType<typeof liquidarPeriodo>) =>
      x.lineas.find((y) => y.concepto === 'Horas fuera de contrato')!;

    const base = liquidarPeriodo(GOLDEN);
    expect(linea(base).monto).toBe(21.82); // 6 h × 3.6364
    expect(linea(base).detalle).not.toMatch(/factor/);

    const conFactor = liquidarPeriodo({ ...GOLDEN, parametros: { factorHoraFueraContrato: 1.5 } });
    expect(linea(conFactor).monto).toBe(32.73);
    expect(linea(conFactor).detalle).toMatch(/× 1.5 \(factor pactado\)/);
    expect(conFactor.total).toBe(r2mas(base.total, 10.91));

    // Un factor 0 es una decisión válida: "ese día vino, se le registra, no se le paga aparte".
    const sinPago = liquidarPeriodo({ ...GOLDEN, parametros: { factorHoraFueraContrato: 0 } });
    expect(linea(sinPago).monto).toBe(0);
  });

  it('factorHoraFueraContrato no toca la diferencia de horas de un día contratado (RN-06)', () => {
    // RN-17 y RN-07 se pagan las dos por hora, y es fácil confundirlas. El factor es sólo de
    // RN-17: si esto se rompe, cada hora de más de un día normal se paga al precio de la extra.
    const conFactor = liquidarPeriodo({ ...GOLDEN, parametros: { factorHoraFueraContrato: 3 } });
    const dif = (x: ReturnType<typeof liquidarPeriodo>) =>
      x.lineas.find((y) => y.concepto === 'Diferencia de horas')!.monto;
    expect(dif(conFactor)).toBe(dif(liquidarPeriodo(GOLDEN)));
    expect(dif(conFactor)).toBe(54.48);
  });

  // Las dos direcciones, explícitas, para que el día que alguien vuelva a invertir el default se
  // le rompa una sola línea y no ocho.
  it('metaSemanalFija se comporta en las dos direcciones y el default es false', () => {
    expect(PARAMETROS_SUELDO_DEFAULT.metaSemanalFija).toBe(false);

    const proporcional = liquidarPeriodo({ ...GOLDEN, parametros: { metaSemanalFija: false } });
    expect(proporcional.ventas.semanas.map((s) => s.meta)).toEqual([1500, 1500, 1500, 3000]);
    expect(proporcional.ventas.semanasCumplidas).toBe(3);
    expect(proporcional.total).toBe(675.3);

    const fija = liquidarPeriodo({ ...GOLDEN, parametros: { metaSemanalFija: true } });
    expect(fija.ventas.semanas.map((s) => s.meta)).toEqual([1500, 1500, 1500, 1500]);
    expect(fija.ventas.semanasCumplidas).toBe(4);
    expect(fija.total).toBe(751.7);
  });
});

// ── Aviso de horas puestas por el sistema (RPC sueldo_entrada, migración 0098) ────────────────
// `entradaEstimada`/`salidaEstimada` no son un cálculo: son metadatos que liquidarPeriodo() sólo
// lee para juntar fechas en UNA advertencia (spec asistencias/2026-08-25-huellero-decide-por-
// horario-design.md §3, "el detalle de la liquidación la nombra"). Cada caso comprueba también
// que el total no se mueve ni un céntimo — es la garantía de que esto no toca la cadena del
// sueldo, sólo la hace visible antes de firmar el pago.
describe('aviso de horas estimadas por el sistema (RPC sueldo_entrada, migración 0098)', () => {
  const base = liquidarPeriodo(GOLDEN);

  it('sin ningún día estimado no hay ninguna advertencia de este tipo (es el snapshot de siempre)', () => {
    // armarAsistencia() nunca puso estas claves: GOLDEN ES el snapshot de antes de la 0098, y el
    // golden test de arriba ya fija que su desglose no cambia.
    expect(base.advertencias.some((a) => a.includes('hora puesta por el sistema'))).toBe(false);
  });

  it('un día con salidaEstimada nombra la fecha y no cambia el total', () => {
    const l = liquidarPeriodo({
      ...GOLDEN,
      asistencia: armarAsistencia().map((r) => (r.fecha === '2025-06-16' ? { ...r, salidaEstimada: true } : r)),
    });
    const aviso = l.advertencias.find((a) => a.includes('hora puesta por el sistema'));
    expect(aviso).toMatch(/^1 día\(s\) tienen una hora puesta por el sistema.*2025-06-16/);
    expect(l.total).toBe(base.total); // ningún cálculo cambia, sólo se agrega la advertencia
  });

  it('un día con las dos horas estimadas (entrada y salida) se cuenta una sola vez', () => {
    const l = liquidarPeriodo({
      ...GOLDEN,
      asistencia: armarAsistencia().map((r) =>
        r.fecha === '2025-06-16' ? { ...r, entradaEstimada: true, salidaEstimada: true } : r,
      ),
    });
    const aviso = l.advertencias.find((a) => a.includes('hora puesta por el sistema'))!;
    expect(aviso).toMatch(/^1 día\(s\)/);
  });

  it('varios días estimados se listan todos, ordenados por fecha', () => {
    const l = liquidarPeriodo({
      ...GOLDEN,
      asistencia: armarAsistencia().map((r) =>
        ['2025-07-01', '2025-06-18'].includes(r.fecha) ? { ...r, entradaEstimada: true } : r,
      ),
    });
    const aviso = l.advertencias.find((a) => a.includes('hora puesta por el sistema'))!;
    expect(aviso).toMatch(/^2 día\(s\)/);
    expect(aviso.indexOf('2025-06-18')).toBeGreaterThan(-1);
    expect(aviso.indexOf('2025-07-01')).toBeGreaterThan(aviso.indexOf('2025-06-18'));
    expect(l.total).toBe(base.total);
  });

  it('también avisa un día estimado en horas fuera de contrato (RN-17)', () => {
    const l = liquidarPeriodo({
      ...GOLDEN,
      horasFueraDeContrato: [
        { fecha: '2025-07-10', horaIngreso: '08:00', horaSalida: '14:00', entradaEstimada: true },
      ],
    });
    const aviso = l.advertencias.find((a) => a.includes('hora puesta por el sistema'));
    expect(aviso).toMatch(/^1 día\(s\) tienen una hora puesta por el sistema.*2025-07-10/);
    expect(l.total).toBe(base.total);
  });
});

describe('soloHastaHoy', () => {
  const dias = ['2026-10-03', '2026-10-04', '2026-10-05'].map((fecha) => ({ fecha }));

  it('incluye hoy y excluye mañana', () => {
    expect(soloHastaHoy(dias, '2026-10-04').map((d) => d.fecha)).toEqual(['2026-10-03', '2026-10-04']);
  });
  it('si hoy es anterior a todo, no queda nada; si es posterior, queda todo', () => {
    expect(soloHastaHoy(dias, '2026-10-02')).toEqual([]);
    expect(soloHastaHoy(dias, '2026-10-05')).toHaveLength(3);
  });
  it('lista vacía y sin mutar la entrada', () => {
    expect(soloHastaHoy([], '2026-10-04')).toEqual([]);
    soloHastaHoy(dias, '2026-10-04');
    expect(dias).toHaveLength(3);
  });
  it('rechaza fechas inválidas', () => {
    expect(() => soloHastaHoy(dias, '04/10/2026')).toThrow();
    expect(() => soloHastaHoy([{ fecha: '2026-10-31x' }], '2026-10-04')).toThrow();
  });
});
