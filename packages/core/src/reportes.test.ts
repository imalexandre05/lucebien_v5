import { describe, it, expect } from 'vitest';
import {
  fechaDesdeId,
  idReporte,
  actAplicaHoy,
  calcularPuntajeEval,
  turnosQueBloquean,
  minutosHastaCierre,
  formatoCierre,
  zonasSolapadas,
  resumenLimpieza,
  zonasSolapadasInesperadas,
  estadoActividadReporte,
  coberturaTurno,
} from './reportes';

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const diaDe = (fecha: string) => DIAS[new Date(`${fecha}T12:00:00`).getDay()];

describe('id de reporte (DD-MM-YY_TURNO-SEDE)', () => {
  it('deriva la fecha desde el id', () => {
    expect(fechaDesdeId('15-04-26_T-ST')).toBe('2026-04-15');
    expect(fechaDesdeId('22-04-26_M-AL')).toBe('2026-04-22');
  });
  it('rechaza ids con formato inválido', () => {
    expect(fechaDesdeId('basura')).toBeNull();
    expect(fechaDesdeId('')).toBeNull();
  });
  it('construye el id desde fecha + turno + sede (ida y vuelta)', () => {
    expect(idReporte('2026-04-15', 'T', 'ST')).toBe('15-04-26_T-ST');
    const id = idReporte('2026-04-22', 'M', 'AL');
    expect(fechaDesdeId(id)).toBe('2026-04-22');
  });
});

describe('actAplicaHoy — filtro por turno', () => {
  const base = { frecuenciaDias: 0, diaSemana: null, apareceDia: 0 };
  it('turno "ambos" aplica siempre', () => {
    expect(actAplicaHoy({ ...base, turno: 'ambos' }, '2026-06-15', 'M')).toBe(true);
    expect(actAplicaHoy({ ...base, turno: 'ambos' }, '2026-06-15', 'T')).toBe(true);
  });
  it('actividad de mañana NO aplica en turno T, sí en M', () => {
    expect(actAplicaHoy({ ...base, turno: 'm' }, '2026-06-15', 'T')).toBe(false);
    expect(actAplicaHoy({ ...base, turno: 'm' }, '2026-06-15', 'M')).toBe(true);
  });
  it('turno C (día completo) recibe actividades de M y de T', () => {
    expect(actAplicaHoy({ ...base, turno: 'm' }, '2026-06-15', 'C')).toBe(true);
    expect(actAplicaHoy({ ...base, turno: 't' }, '2026-06-15', 'C')).toBe(true);
  });
});

describe('actAplicaHoy — frecuencia', () => {
  it('diaria (0/1) aplica todos los días', () => {
    expect(actAplicaHoy({ turno: 'ambos', frecuenciaDias: 0, diaSemana: null, apareceDia: 0 }, '2026-06-15', 'M')).toBe(true);
    expect(actAplicaHoy({ turno: 'ambos', frecuenciaDias: 1, diaSemana: null, apareceDia: 0 }, '2026-06-15', 'M')).toBe(true);
  });
  it('semanal (7) aplica solo en el día de semana configurado', () => {
    const fecha = '2026-06-15';
    const hoy = diaDe(fecha);
    const otro = DIAS[(new Date(`${fecha}T12:00:00`).getDay() + 1) % 7];
    expect(actAplicaHoy({ turno: 'ambos', frecuenciaDias: 7, diaSemana: hoy, apareceDia: 1 }, fecha, 'M')).toBe(true);
    expect(actAplicaHoy({ turno: 'ambos', frecuenciaDias: 7, diaSemana: otro, apareceDia: 1 }, fecha, 'M')).toBe(false);
  });
  it('mensual (30) aplica solo el día base del mes', () => {
    expect(actAplicaHoy({ turno: 'ambos', frecuenciaDias: 30, diaSemana: null, apareceDia: 15 }, '2026-06-15', 'M')).toBe(true);
    expect(actAplicaHoy({ turno: 'ambos', frecuenciaDias: 30, diaSemana: null, apareceDia: 15 }, '2026-06-16', 'M')).toBe(false);
  });
});

describe('calcularPuntajeEval', () => {
  it('todo perfecto = 100', () => {
    expect(calcularPuntajeEval([{ peso: 1, calificacion: 1 }, { peso: 2, calificacion: 1 }])).toBe(100);
  });
  it('parcial pondera por peso', () => {
    expect(calcularPuntajeEval([{ peso: 2, calificacion: 0.5 }, { peso: 2, calificacion: 1 }])).toBe(75);
  });
  it('sin actividades = 0 (evita división por cero)', () => {
    expect(calcularPuntajeEval([])).toBe(0);
  });
});

describe('turnosQueBloquean — exclusividad de turno', () => {
  it('mañana y tarde se bloquean solo por "día completo" (C)', () => {
    expect(turnosQueBloquean('M')).toEqual(['C']);
    expect(turnosQueBloquean('T')).toEqual(['C']);
  });
  it('"día completo" se bloquea si ya existe mañana o tarde', () => {
    expect(turnosQueBloquean('C')).toEqual(['M', 'T']);
  });
});

describe('estadoActividadReporte — badge combinado del dashboard (Fase 6)', () => {
  it('enviado + evaluado → ok (verde)', () => {
    expect(estadoActividadReporte({ estadoEnvio: 'enviado', evaluado: true })).toBe('ok');
  });
  it('enviado sin evaluar → por_evaluar (ámbar)', () => {
    expect(estadoActividadReporte({ estadoEnvio: 'enviado', evaluado: false })).toBe('por_evaluar');
  });
  it('no_enviado prima sobre evaluado (rojo), evaluado o no', () => {
    expect(estadoActividadReporte({ estadoEnvio: 'no_enviado', evaluado: true })).toBe('no_enviado');
    expect(estadoActividadReporte({ estadoEnvio: 'no_enviado', evaluado: false })).toBe('no_enviado');
  });
  it('sin_actividad siempre gana (gris)', () => {
    expect(estadoActividadReporte({ estadoEnvio: 'sin_actividad', evaluado: false })).toBe('sin_actividad');
    expect(estadoActividadReporte({ estadoEnvio: 'sin_actividad', evaluado: true })).toBe('sin_actividad');
  });
});

describe('coberturaTurno — matriz sede×turno del dashboard (Fase 6)', () => {
  it('sin reportes y turno todavía abierto: en_curso (no es una alerta)', () => {
    expect(coberturaTurno('M', [], 30)).toBe('en_curso');
  });
  it('sin reportes y turno ya vencido: sin_reportar (alerta real)', () => {
    expect(coberturaTurno('M', [], -5)).toBe('sin_reportar');
    expect(coberturaTurno('M', [], 0)).toBe('sin_reportar');
  });
  it('reporte enviado del turno exacto: cubierto', () => {
    expect(coberturaTurno('M', [{ turno: 'M', estadoEnvio: 'enviado' }], -5)).toBe('cubierto');
  });
  it('un reporte "C" (día completo) cubre tanto M como T', () => {
    expect(coberturaTurno('M', [{ turno: 'C', estadoEnvio: 'enviado' }], -5)).toBe('cubierto');
    expect(coberturaTurno('T', [{ turno: 'C', estadoEnvio: 'enviado' }], -5)).toBe('cubierto');
  });
  it('un reporte de OTRO turno no cubre (T no cubre M)', () => {
    expect(coberturaTurno('M', [{ turno: 'T', estadoEnvio: 'enviado' }], -5)).toBe('sin_reportar');
  });
  it('no_enviado: venció con borrador con contenido, sin dar Enviar', () => {
    expect(coberturaTurno('M', [{ turno: 'M', estadoEnvio: 'no_enviado' }], -5)).toBe('no_enviado');
  });
  it('sin_actividad (venció sin nada) se trata igual que sin_reportar', () => {
    expect(coberturaTurno('M', [{ turno: 'M', estadoEnvio: 'sin_actividad' }], -5)).toBe('sin_reportar');
  });
  it('con varios candidatos, "cubierto" gana sobre los demás', () => {
    expect(
      coberturaTurno(
        'M',
        [
          { turno: 'M', estadoEnvio: 'sin_actividad' },
          { turno: 'C', estadoEnvio: 'enviado' },
        ],
        -5,
      ),
    ).toBe('cubierto');
  });
});

// Perú (America/Lima) es UTC-5 todo el año (sin horario de verano) → instantes UTC fijos alcanzan.
describe('minutosHastaCierre — cuenta regresiva del turno', () => {
  it('exactamente en la hora de cierre = 0', () => {
    expect(minutosHastaCierre(new Date('2026-07-15T20:00:00Z'), '15:00')).toBe(0);
  });
  it('30 minutos antes del cierre = 30', () => {
    expect(minutosHastaCierre(new Date('2026-07-15T19:30:00Z'), '15:00')).toBe(30);
  });
  it('después del cierre = negativo', () => {
    expect(minutosHastaCierre(new Date('2026-07-15T20:10:00Z'), '15:00')).toBe(-10);
  });
  it('cruza la hora exacta (23:00 Perú = 04:00 UTC del día siguiente)', () => {
    expect(minutosHastaCierre(new Date('2026-07-15T03:45:00Z'), '23:00')).toBe(15);
  });
});

describe('formatoCierre', () => {
  it('turno ya cerrado (0 o negativo)', () => {
    expect(formatoCierre(0)).toBe('turno cerrado');
    expect(formatoCierre(-5)).toBe('turno cerrado');
  });
  it('menos de una hora: solo minutos', () => {
    expect(formatoCierre(8)).toBe('cierra en 8m');
  });
  it('una hora o más: horas y minutos', () => {
    expect(formatoCierre(90)).toBe('cierra en 1h 30m');
    expect(formatoCierre(60)).toBe('cierra en 1h 0m');
  });
});

describe('zonasSolapadas — geometría del lienzo de limpieza', () => {
  it('sin zonas o una sola: ningún par', () => {
    expect(zonasSolapadas([])).toEqual([]);
    expect(zonasSolapadas([{ cod: 'Z01', posX: 0, posY: 0, ancho: 40, alto: 40 }])).toEqual([]);
  });
  it('rectángulos que no se tocan: ningún par', () => {
    const zonas = [
      { cod: 'Z01', posX: 0, posY: 0, ancho: 40, alto: 40 },
      { cod: 'Z02', posX: 100, posY: 100, ancho: 40, alto: 40 },
    ];
    expect(zonasSolapadas(zonas)).toEqual([]);
  });
  it('rectángulos que solo se tocan en el borde: no cuenta como solape', () => {
    const zonas = [
      { cod: 'Z01', posX: 0, posY: 0, ancho: 40, alto: 40 },
      { cod: 'Z02', posX: 40, posY: 0, ancho: 40, alto: 40 }, // pegado exactamente al borde derecho
    ];
    expect(zonasSolapadas(zonas)).toEqual([]);
  });
  it('rectángulos que se solapan en área: detecta el par', () => {
    const zonas = [
      { cod: 'Z01', posX: 0, posY: 0, ancho: 50, alto: 50 },
      { cod: 'Z02', posX: 30, posY: 30, ancho: 50, alto: 50 },
    ];
    expect(zonasSolapadas(zonas)).toEqual([['Z01', 'Z02']]);
  });
  it('un mueble con dos zonas "sobre" solapadas entre sí: detecta el par (no lo explica sobreCod)', () => {
    const zonas = [
      { cod: 'MESA', posX: 0, posY: 0, ancho: 100, alto: 60 },
      { cod: 'Z_A', posX: 10, posY: 10, ancho: 30, alto: 20 },
      { cod: 'Z_B', posX: 20, posY: 15, ancho: 30, alto: 20 }, // se solapa con Z_A, no con MESA
    ];
    const pares = zonasSolapadas(zonas);
    expect(pares).toContainEqual(['Z_A', 'Z_B']);
  });
  it('tres zonas mutuamente solapadas: reporta los 3 pares', () => {
    const zonas = [
      { cod: 'A', posX: 0, posY: 0, ancho: 50, alto: 50 },
      { cod: 'B', posX: 10, posY: 10, ancho: 50, alto: 50 },
      { cod: 'C', posX: 20, posY: 20, ancho: 50, alto: 50 },
    ];
    expect(zonasSolapadas(zonas)).toHaveLength(3);
  });
});

describe('zonasSolapadasInesperadas — descarta el solape "sobre" declarado', () => {
  it('maniquí "sobre" su mueble exacto: solape esperado, no se avisa', () => {
    const zonas = [
      { cod: 'MESA', posX: 0, posY: 0, ancho: 100, alto: 60, nivel: 'piso', sobreCod: '' },
      { cod: 'MANIQUI', posX: 10, posY: 10, ancho: 30, alto: 30, nivel: 'sobre', sobreCod: 'MESA' },
    ];
    expect(zonasSolapadasInesperadas(zonas)).toEqual([]);
  });
  it('dos zonas de piso que se solapan sin ninguna relación sobre: sí avisa', () => {
    const zonas = [
      { cod: 'Z01', posX: 0, posY: 0, ancho: 50, alto: 50, nivel: 'piso', sobreCod: '' },
      { cod: 'Z02', posX: 30, posY: 30, ancho: 50, alto: 50, nivel: 'piso', sobreCod: '' },
    ];
    expect(zonasSolapadasInesperadas(zonas)).toEqual([['Z01', 'Z02']]);
  });
  it('zona "sobre" que se solapa con un mueble QUE NO ES el declarado en sobreCod: sí avisa', () => {
    const zonas = [
      { cod: 'MESA1', posX: 0, posY: 0, ancho: 50, alto: 50, nivel: 'piso', sobreCod: '' },
      { cod: 'MESA2', posX: 200, posY: 200, ancho: 50, alto: 50, nivel: 'piso', sobreCod: '' },
      // declara sobreCod=MESA2 pero geométricamente está encima de MESA1 → posicionamiento inconsistente
      { cod: 'MANIQUI', posX: 10, posY: 10, ancho: 20, alto: 20, nivel: 'sobre', sobreCod: 'MESA2' },
    ];
    const pares = zonasSolapadasInesperadas(zonas);
    expect(pares).toContainEqual(['MESA1', 'MANIQUI']);
  });
});

describe('resumenLimpieza — el 100 % son las zonas del turno; las del otro turno suman encima', () => {
  const zonas = [
    { cod: 'Z1', peso: 20, tipo: 'zona', turno: 'ambos' },
    { cod: 'Z2', peso: 23.1, tipo: 'zona', turno: 'mañana' },
    { cod: 'Z3', peso: 6.9, tipo: 'zona', turno: 'tarde' },
    { cod: 'A1', peso: 50, tipo: 'area', turno: 'ambos' },
  ];
  const todas = (cods: string[]) => Object.fromEntries(cods.map((c) => [c, 1]));
  it('solo zonas del turno: 100 %', () => {
    const r = resumenLimpieza(zonas, todas(['Z1', 'Z2']), 'M');
    expect(r).toEqual({ propiosTot: 43.1, propiosGot: 43.1, extraGot: 0, pct: 100 });
  });
  it('con una zona del otro turno: pasa de 100 % (50/43,1 = 116 %)', () => {
    const r = resumenLimpieza(zonas, todas(['Z1', 'Z2', 'Z3']), 'M');
    expect(r).toEqual({ propiosTot: 43.1, propiosGot: 43.1, extraGot: 6.9, pct: 116 });
  });
  it('la zona del otro turno no agranda el total', () => {
    expect(resumenLimpieza(zonas, todas(['Z3']), 'M').propiosTot).toBe(43.1);
  });
  it('turno C: todas las zonas son del turno, no hay extra', () => {
    const r = resumenLimpieza(zonas, todas(['Z1', 'Z2', 'Z3']), 'C');
    expect(r).toEqual({ propiosTot: 50, propiosGot: 50, extraGot: 0, pct: 100 });
  });
  it('las zonas tipo area no puntúan', () => {
    expect(resumenLimpieza(zonas, todas(['A1']), 'M')).toEqual({ propiosTot: 43.1, propiosGot: 0, extraGot: 0, pct: 0 });
  });
  it('calificación parcial pondera el peso', () => {
    expect(resumenLimpieza(zonas, { Z1: 0.5 }, 'M').propiosGot).toBe(10);
  });
  it('sin zonas del turno: pct 0, sin dividir entre cero', () => {
    expect(resumenLimpieza([{ cod: 'Z3', peso: 5, tipo: 'zona', turno: 'tarde' }], todas(['Z3']), 'M').pct).toBe(0);
  });
});
