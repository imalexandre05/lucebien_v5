import { describe, it, expect } from 'vitest';
import {
  decidirAsistencia,
  jornadaImplausible,
  horasEntre,
  resolverMapeo,
  type MarcaHuellero,
  type AsistenciaExistente,
  type MapeoVigencia,
} from './huellero';

// Atajo: marcas de un día con el mismo nombre de equipo.
const marcas = (horas: string[], nombre = 'YESSICA'): MarcaHuellero[] =>
  horas.map((hora) => ({ fecha: '2026-08-12', hora, nombreEquipo: nombre }));

describe('decidirAsistencia — el caso normal', () => {
  // El caso real de LuceBien: nadie sale a almorzar, así que un día completo deja DOS marcas.
  it('dos marcas dan una jornada trabajada', () => {
    const d = decidirAsistencia(marcas(['08:00', '14:00']), null);
    expect(d).toEqual({
      accion: 'crear',
      horaEntrada: '08:00',
      horaSalida: '14:00',
      condicion: 'trabajado',
    });
  });

  // Este test es el que impide reintroducir la partición por turno. Con un corte a las 13:00,
  // la marca de las 08:00 caía en el turno M y la de las 14:00 en el T, los dos quedaban sin
  // salida, y la liquidación leía cero horas. Sobre los datos reales rompía 8 de cada 10 días.
  it('no parte el día aunque las marcas caigan a distinto lado del mediodía', () => {
    const d = decidirAsistencia(marcas(['08:00', '20:00']), null);
    expect(d).toMatchObject({ horaEntrada: '08:00', horaSalida: '20:00', condicion: 'trabajado' });
  });

  it('el turno tarde también da una sola jornada', () => {
    const d = decidirAsistencia(marcas(['14:05', '21:09'], 'JANET'), null);
    expect(d).toMatchObject({ horaEntrada: '14:05', horaSalida: '21:09', condicion: 'trabajado' });
  });

  it('ordena las marcas: el lote puede venir desordenado', () => {
    const d = decidirAsistencia(marcas(['20:00', '08:00', '14:00']), null);
    expect(d).toMatchObject({ horaEntrada: '08:00', horaSalida: '20:00' });
  });

  // Si alguien sí sale a almorzar, el colapso sigue dando el día completo. Es lo correcto bajo
  // la regla confirmada: el almuerzo se paga.
  it('cuatro marcas dan de la primera a la última', () => {
    const d = decidirAsistencia(marcas(['08:00', '13:00', '14:00', '20:00']), null);
    expect(d).toMatchObject({ horaEntrada: '08:00', horaSalida: '20:00' });
  });

  it('marcas duplicadas al mismo minuto no rompen nada', () => {
    const d = decidirAsistencia(marcas(['08:00', '08:00', '14:00']), null);
    expect(d).toMatchObject({ horaEntrada: '08:00', horaSalida: '14:00' });
  });
});

describe('decidirAsistencia — la jornada a medias', () => {
  // Sin este comportamiento la RPC violaría asistencias_trabajado_chk (0073) durante toda la
  // jornada: entre la marca de entrada y la de salida pasan once horas.
  it('una sola marca deja la entrada y NO declara trabajado', () => {
    const d = decidirAsistencia(marcas(['09:35'], 'ELTHOM'), null);
    expect(d).toEqual({
      accion: 'crear',
      horaEntrada: '09:35',
      horaSalida: null,
      condicion: 'sin_dato',
    });
  });

  it('sin marcas no se inventa nada', () => {
    expect(decidirAsistencia([], null)).toEqual({
      accion: 'no_hacer_nada',
      motivo: 'sin_marcas',
    });
  });
});

describe('decidirAsistencia — las salvaguardas del sueldo', () => {
  const falta: AsistenciaExistente = {
    fuente: 'manual',
    condicion: 'falta',
    horaEntrada: null,
    horaSalida: null,
  };

  // Una falta cuesta dos días de sueldo (RN-09) y la declaró una persona.
  it('una falta declarada no se toca ni con marcas ese día', () => {
    expect(decidirAsistencia(marcas(['08:00', '20:00']), falta)).toEqual({
      accion: 'no_hacer_nada',
      motivo: 'falta_declarada',
    });
  });

  it('no pisa horas que ya cargó una persona', () => {
    const manual: AsistenciaExistente = {
      fuente: 'manual',
      condicion: 'trabajado',
      horaEntrada: '09:00',
      horaSalida: '18:00',
    };
    expect(decidirAsistencia(marcas(['07:00', '22:00']), manual)).toEqual({
      accion: 'no_hacer_nada',
      motivo: 'sin_cambios',
    });
  });

  it('rellena sólo la hora que falta, sin tocar la que ya estaba', () => {
    const aMedias: AsistenciaExistente = {
      fuente: 'manual',
      condicion: 'sin_dato',
      horaEntrada: '09:00',
      horaSalida: null,
    };
    const d = decidirAsistencia(marcas(['07:30', '18:30']), aMedias);
    expect(d).toEqual({
      accion: 'actualizar',
      horaEntrada: '09:00', // la cargada a mano gana
      horaSalida: '18:30',
      condicion: 'trabajado',
    });
  });

  // Sin esta transición el proyecto no sirve: las filas que crea el envío de un reporte (0030)
  // nacen sin horas y en sin_dato, y la liquidación filtra por condicion <> 'sin_dato'. Habría
  // horas reales en la fila y el periodo entero bloqueado.
  it('una fila de reporte sin horas se completa y deja de ser invisible', () => {
    const reporte: AsistenciaExistente = {
      fuente: 'reporte',
      condicion: 'sin_dato',
      horaEntrada: null,
      horaSalida: null,
    };
    const d = decidirAsistencia(marcas(['14:05', '21:00']), reporte);
    expect(d).toEqual({
      accion: 'actualizar',
      horaEntrada: '14:05',
      horaSalida: '21:00',
      condicion: 'trabajado',
    });
  });

  it('una fila de reporte con una sola marca sigue en sin_dato', () => {
    const reporte: AsistenciaExistente = {
      fuente: 'reporte',
      condicion: 'sin_dato',
      horaEntrada: null,
      horaSalida: null,
    };
    const d = decidirAsistencia(marcas(['14:05']), reporte);
    expect(d).toMatchObject({ horaSalida: null, condicion: 'sin_dato' });
  });

  it('nunca declara trabajado sin las dos horas', () => {
    const casos: AsistenciaExistente[] = [
      { fuente: 'reporte', condicion: 'sin_dato', horaEntrada: null, horaSalida: null },
      { fuente: 'manual', condicion: 'sin_dato', horaEntrada: '08:00', horaSalida: null },
    ];
    for (const existente of casos) {
      const d = decidirAsistencia(marcas(['09:00']), existente);
      if (d.accion !== 'no_hacer_nada' && d.condicion === 'trabajado') {
        expect(d.horaEntrada).not.toBeNull();
        expect(d.horaSalida).not.toBeNull();
      }
    }
  });
});

describe('decidirAsistencia — el identificador que cambió de dueño', () => {
  // Caso real: el 00000013 marcó como JAZMIN a las 08:45 del 28-ene-2026 y como NICOL a las
  // 20:46 del mismo día. Colapsarlas daría doce horas que no trabajó ninguna de las dos.
  it('no deriva nada cuando el día trae dos nombres distintos', () => {
    const mixtas: MarcaHuellero[] = [
      { fecha: '2026-01-28', hora: '08:45', nombreEquipo: 'JAZMIN' },
      { fecha: '2026-01-28', hora: '20:46', nombreEquipo: 'NICOL' },
    ];
    expect(decidirAsistencia(mixtas, null)).toEqual({
      accion: 'no_hacer_nada',
      motivo: 'identificador_reasignado',
    });
  });

  it('el mismo nombre repetido no dispara la alerta', () => {
    expect(decidirAsistencia(marcas(['08:00', '20:00'], 'JAZMIN'), null).accion).toBe('crear');
  });

  it('marcas sin nombre no disparan la alerta', () => {
    const sinNombre: MarcaHuellero[] = [
      { fecha: '2026-08-12', hora: '08:00', nombreEquipo: null },
      { fecha: '2026-08-12', hora: '14:00' },
    ];
    expect(decidirAsistencia(sinNombre, null).accion).toBe('crear');
  });
});

describe('resolverMapeo — la vigencia', () => {
  // El identificador 13, tal como está en los datos reales.
  const mapeos: MapeoVigencia[] = [
    { empleadoId: 'jazmin', ignorado: false, vigenteDesde: '2026-01-01', vigenteHasta: '2026-01-28' },
    { empleadoId: 'nicol', ignorado: false, vigenteDesde: '2026-01-29', vigenteHasta: null },
  ];

  it('resuelve contra la fecha de la marca, no contra el mapeo de hoy', () => {
    expect(resolverMapeo(mapeos, '2026-01-27')).toBe('jazmin');
    expect(resolverMapeo(mapeos, '2026-01-28')).toBe('jazmin');
    expect(resolverMapeo(mapeos, '2026-01-29')).toBe('nicol');
    expect(resolverMapeo(mapeos, '2026-08-15')).toBe('nicol');
  });

  it('una fecha anterior a todo mapeo queda sin resolver', () => {
    expect(resolverMapeo(mapeos, '2025-12-31')).toBeNull();
  });

  it('un identificador ignorado no resuelve a nadie', () => {
    const ignorado: MapeoVigencia[] = [
      { empleadoId: null, ignorado: true, vigenteDesde: '2026-01-01', vigenteHasta: null },
    ];
    expect(resolverMapeo(ignorado, '2026-08-12')).toBeNull();
  });

  it('sin mapeos no resuelve a nadie', () => {
    expect(resolverMapeo([], '2026-08-12')).toBeNull();
  });
});

describe('jornadaImplausible — avisar, no corregir', () => {
  const limites = { minHoras: 0.5, maxHoras: 14 };

  // JORDAN, 2026-01-26: entra y sale tantas veces que el colapso da 22,6 horas.
  it('marca la jornada de 22 horas', () => {
    expect(jornadaImplausible('00:22', '23:01', limites)).toBe(true);
  });

  // FERNANDO, 2026-01-08: dos marcas en el mismo minuto.
  it('marca la jornada de cero horas', () => {
    expect(jornadaImplausible('21:02', '21:02', limites)).toBe(true);
  });

  it('no marca las jornadas normales', () => {
    expect(jornadaImplausible('08:00', '14:00', limites)).toBe(false);
    expect(jornadaImplausible('07:55', '20:30', limites)).toBe(false);
  });

  it('una jornada sin cerrar no se marca: ya la cubre sin_dato', () => {
    expect(jornadaImplausible('09:35', null, limites)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Casos sacados del histórico real leído del equipo el 15-ago-2026 (3.058 marcas, 1.571
// jornadas). No son inventados: cada uno es una fila de huellero-jornadas.csv. Sirven para que
// la lógica quede contrastada contra lo que la gente hace de verdad, no contra lo que uno supone
// que hace.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('decidirAsistencia — jornadas reales del equipo', () => {
  const real = (fecha: string, horas: string[], nombre: string): MarcaHuellero[] =>
    horas.map((hora) => ({ fecha, hora, nombreEquipo: nombre }));

  it('JANET, turno tarde del 2 de enero', () => {
    const d = decidirAsistencia(real('2026-01-02', ['14:01', '21:09'], 'JANET'), null);
    expect(d).toMatchObject({ horaEntrada: '14:01', horaSalida: '21:09', condicion: 'trabajado' });
    expect(horasEntre('14:01', '21:09')).toBeCloseTo(7.13, 2);
  });

  it('YESSICA, el 2 de enero marcó sólo la entrada', () => {
    const d = decidirAsistencia(real('2026-01-02', ['08:53'], 'YESSICA'), null);
    expect(d).toMatchObject({ horaEntrada: '08:53', horaSalida: null, condicion: 'sin_dato' });
  });

  it('SHEYLA, jornada larga del 12 de agosto', () => {
    const d = decidirAsistencia(real('2026-08-12', ['07:55', '18:35'], 'SHEYLA'), null);
    expect(d).toMatchObject({ horaEntrada: '07:55', horaSalida: '18:35', condicion: 'trabajado' });
  });

  // Las dos que el colapso no puede resolver. Se derivan igual —no inventamos nada— pero
  // jornadaImplausible las manda a revisión.
  it('FERNANDO, dos marcas en el mismo minuto: se deriva, y se marca para revisar', () => {
    const d = decidirAsistencia(real('2026-01-08', ['21:02', '21:02'], 'FERNANDO'), null);
    expect(d).toMatchObject({ horaEntrada: '21:02', horaSalida: '21:02', condicion: 'trabajado' });
    expect(jornadaImplausible('21:02', '21:02', { minHoras: 0.5, maxHoras: 14 })).toBe(true);
  });

  it('JORDAN, cinco marcas entre las 00:22 y las 23:01: se deriva, y se marca para revisar', () => {
    const d = decidirAsistencia(
      real('2026-01-26', ['00:22', '08:12', '08:26', '20:44', '23:01'], 'JORDAN'),
      null,
    );
    expect(d).toMatchObject({ horaEntrada: '00:22', horaSalida: '23:01' });
    expect(jornadaImplausible('00:22', '23:01', { minHoras: 0.5, maxHoras: 14 })).toBe(true);
  });

  // GUILLERMO entra sólo a abrir las puertas: sus 29 días tienen una marca cada uno y ninguno
  // es una jornada. Por eso su identificador va ignorado en el mapeo — pero si no lo estuviera,
  // el sistema al menos no inventa una salida.
  it('GUILLERMO, una marca por día los 29 días', () => {
    const d = decidirAsistencia(real('2026-08-12', ['08:16'], 'GUILLERMO'), null);
    expect(d).toMatchObject({ horaSalida: null, condicion: 'sin_dato' });
  });
});

describe('horasEntre', () => {
  it('calcula horas decimales', () => {
    expect(horasEntre('08:00', '14:00')).toBe(6);
    expect(horasEntre('07:55', '14:17')).toBeCloseTo(6.37, 2);
  });

  it('rechaza horas inválidas en vez de calcular cualquier cosa', () => {
    expect(() => horasEntre('25:00', '14:00')).toThrow(/hora inválida/);
    expect(() => horasEntre('08:00', '8:5')).toThrow(/hora inválida/);
  });
});
