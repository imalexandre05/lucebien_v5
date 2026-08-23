// ═══════════════════════════════════════════════════════════════════════════════════════════
// huellero.ts — de marcas de huella a una jornada de asistencia.
//
// Implementa docs/superpowers/specs/2026-08-15-huellero-asistencias-design.md §6.
//
// ZONA CRÍTICA (no-negociable 1). La liquidación lee `asistencias`
// (0073_sueldos_rpc.sql:177) y colapsa el día con min(hora_entrada)/max(hora_salida): lo que
// se decida acá se paga.
//
// Esta lógica está DUPLICADA a propósito con la RPC `huellero_derivar_asistencia` de la
// migración 0075. La RPC es la que escribe en producción; esto existe para poder probar las
// reglas sin una base delante, y para que cualquier cambio futuro tenga que pasar por un test
// antes de tocar SQL. Si las dos se separan, el test de paridad de la spec §10 lo detecta.
//
// El core NUNCA llama new Date() (no-negociable 4): las marcas llegan ya convertidas a hora
// Perú por quien invoca.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Una marca cruda del huellero, ya en hora Perú. */
export interface MarcaHuellero {
  /** `AAAA-MM-DD` en hora Perú. */
  fecha: string;
  /** `HH:MM` en hora Perú, 24 horas. */
  hora: string;
  /**
   * El nombre que el equipo tenía registrado para ese identificador EN EL MOMENTO de la marca.
   * Es lo que delata que un número se reasignó a otra persona.
   */
  nombreEquipo?: string | null;
}

/** Una fila de `asistencias` que ya existe para ese empleado y ese día. */
export interface AsistenciaExistente {
  fuente: string;
  condicion: 'sin_dato' | 'trabajado' | 'falta';
  horaEntrada: string | null;
  horaSalida: string | null;
  /** 'M' o 'T'. Se completa la de turno menor, igual que la RPC. */
  turno?: string;
}

/** Qué hacer con la asistencia del día. */
export type DecisionHuellero =
  | { accion: 'no_hacer_nada'; motivo: MotivoNoHacerNada }
  | {
      accion: 'crear' | 'actualizar';
      horaEntrada: string | null;
      horaSalida: string | null;
      condicion: 'sin_dato' | 'trabajado';
      /** Presente cuando el día se escribe pero NO se declara trabajado. */
      revisar?: MotivoRevisar;
    };

/** Los límites de una jornada creíble. Llegan desde `config`, nunca hardcodeados. */
export interface LimitesJornada {
  minHoras: number;
  maxHoras: number;
}

export const LIMITES_JORNADA_DEFAULT: LimitesJornada = { minHoras: 0.5, maxHoras: 14 };

export type MotivoNoHacerNada =
  /** No hay marcas: el día no existe para el huellero y no se inventa. */
  | 'sin_marcas'
  /**
   * El administrador declaró falta en ALGUNA fila del día. Cuesta dos días de sueldo (RN-09) y
   * la decidió una persona: ninguna huella la revierte sola.
   */
  | 'falta_declarada'
  /** La fila ya está completa y no hay nada que rellenar. */
  | 'sin_cambios'
  /**
   * Rellenar dejaría la salida antes que la entrada. Pasa con una fila de turno 'T' que tiene
   * la entrada cargada a mano (14:00) y marcas del huellero sólo de la mañana: quedaría
   * 14:00 → 12:00, la transición a `trabajado` lo bendeciría, y después `sueldos.ts:546-548`
   * lanza y el mes entero no se puede liquidar.
   */
  | 'orden_invertido';

/** Por qué un día quedó escrito pero SIN declararse trabajado. Va a `obs` para que se vea. */
export type MotivoRevisar =
  /**
   * Las marcas del día traen más de un nombre, o mezclan marcas con nombre y sin nombre: el
   * identificador cambió de dueño a mitad de día. Sólo una persona sabe quién trabajó cuánto.
   */
  | 'identificador_reasignado'
  /**
   * La jornada derivada no puede ser cierta. En los datos reales: JORDAN de 00:22 a 23:01
   * (22,6 h) y FERNANDO con dos marcas en el mismo minuto. Declararlas trabajadas no es
   * neutral: la primera paga 14,6 horas que nadie trabajó y la segunda impide cerrar la
   * liquidación del mes.
   */
  | 'jornada_implausible';

const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validarHora(hora: string, donde: string): string {
  if (!RE_HORA.test(hora)) {
    throw new Error(`${donde}: hora inválida "${hora}". Se espera HH:MM en 24 horas.`);
  }
  return hora;
}

/**
 * Decide qué escribir en `asistencias` a partir de las marcas de un empleado en un día.
 *
 * Reglas, todas de la spec §6:
 *
 * 1. **Una fila por día, no una por turno.** El primer diseño partía el día por una hora de
 *    corte y era capaz de pagar cero: quien entra 08:00 y sale 14:00 deja una marca de cada
 *    lado, los dos turnos quedan sin salida, y la liquidación lee "ingreso sin salida" = 0
 *    horas. Sobre los datos reales de 2026 eso rompía 8 de cada 10 días.
 * 2. **`trabajado` exige entrada y salida.** Lo impone `asistencias_trabajado_chk` (0073). Con
 *    una sola marca la fila vive como `sin_dato` con la entrada puesta, y así la liquidación
 *    corta nombrando la fecha en vez de cobrar el día a 0 horas.
 * 3. **Nunca se pisa una hora ya cargada ni se cambia `fuente`.** Lo que escribió una persona
 *    manda sobre la máquina.
 * 4. **`sin_dato` → `trabajado` es la única transición permitida**, y sólo cuando quedan las dos
 *    horas. Sin ella, las filas que crea el envío de un reporte (0030) se quedan invisibles
 *    para la liquidación y bloquean el periodo entero.
 */
export function decidirAsistencia(
  marcas: MarcaHuellero[],
  /**
   * TODAS las filas de `asistencias` del empleado ese día, no una.
   *
   * Antes recibía una sola —la de turno menor— y sólo sobre esa se comprobaba la falta. Con el
   * turno 'M' en `sin_dato` (la fila que deja un reporte) y el turno 'T' declarado `falta`, se
   * rellenaba la 'M' y quedaba una fila `trabajado` con horas contradiciendo la falta que
   * declaró una persona.
   */
  existentes: AsistenciaExistente[],
  limites: LimitesJornada = LIMITES_JORNADA_DEFAULT,
): DecisionHuellero {
  if (marcas.length === 0) {
    return { accion: 'no_hacer_nada', motivo: 'sin_marcas' };
  }

  // La falta se mira sobre el DÍA entero.
  if (existentes.some((e) => e.condicion === 'falta')) {
    return { accion: 'no_hacer_nada', motivo: 'falta_declarada' };
  }

  // El día en que un identificador cambia de dueño. La vigencia del mapeo es por fecha, pero la
  // reasignación puede ocurrir a mitad de día: el 00000013 marcó como JAZMIN a las 08:45 del
  // 28-ene-2026 y como NICOL a las 20:46 de ese mismo día.
  //
  // Dispara con dos nombres distintos Y TAMBIÉN con mezcla de marcas con nombre y sin nombre:
  // una marca anónima puede ser de cualquiera de las dos personas, y el equipo omite el nombre
  // en varios tipos de evento.
  const nombres = new Set(
    marcas.map((m) => (m.nombreEquipo ?? '').trim()).filter((n) => n.length > 0),
  );
  const anonimas = marcas.filter((m) => (m.nombreEquipo ?? '').trim().length === 0).length;
  let revisar: MotivoRevisar | undefined =
    nombres.size > 1 || (nombres.size >= 1 && anonimas > 0)
      ? 'identificador_reasignado'
      : undefined;

  const horas = marcas.map((m) => validarHora(m.hora, 'Marca')).sort();
  const entrada = horas[0];
  // Una sola marca no es una jornada: no se inventa la salida.
  const salida = horas.length >= 2 ? horas[horas.length - 1] : null;

  // Una jornada que no puede ser cierta no se declara trabajada. No se recorta —eso sería
  // inventar una regla (no-negociable 5)— pero tampoco se paga a ciegas.
  if (revisar === undefined && salida !== null && jornadaImplausible(entrada, salida, limites)) {
    revisar = 'jornada_implausible';
  }

  const existente = filaAEditar(existentes);

  if (existente === null) {
    return {
      accion: 'crear',
      horaEntrada: entrada,
      horaSalida: salida,
      condicion: salida !== null && revisar === undefined ? 'trabajado' : 'sin_dato',
      ...(revisar !== undefined ? { revisar } : {}),
    };
  }

  // Sólo se rellena lo que está vacío.
  const nuevaEntrada = existente.horaEntrada ?? entrada;
  const nuevaSalida = existente.horaSalida ?? salida;

  // Rellenar sin comparar dejaba la salida antes que la entrada.
  if (nuevaEntrada !== null && nuevaSalida !== null && nuevaSalida <= nuevaEntrada) {
    return { accion: 'no_hacer_nada', motivo: 'orden_invertido' };
  }

  // Acá `condicion` ya no puede ser 'falta': si alguna fila del día lo era, se retornó arriba.
  const condicionActual = existente.condicion as 'sin_dato' | 'trabajado';

  const completa = nuevaEntrada !== null && nuevaSalida !== null;
  const nuevaCondicion: 'sin_dato' | 'trabajado' =
    condicionActual === 'sin_dato' && completa && revisar === undefined
      ? 'trabajado'
      : condicionActual;

  const sinCambios =
    nuevaEntrada === existente.horaEntrada &&
    nuevaSalida === existente.horaSalida &&
    nuevaCondicion === existente.condicion;

  if (sinCambios) {
    return { accion: 'no_hacer_nada', motivo: 'sin_cambios' };
  }

  return {
    accion: 'actualizar',
    horaEntrada: nuevaEntrada,
    horaSalida: nuevaSalida,
    condicion: nuevaCondicion,
    ...(revisar !== undefined ? { revisar } : {}),
  };
}

/** La fila del día que se completa: la de turno menor, igual que hace la RPC. */
function filaAEditar(existentes: AsistenciaExistente[]): AsistenciaExistente | null {
  if (existentes.length === 0) return null;
  return [...existentes].sort((a, b) => (a.turno ?? '').localeCompare(b.turno ?? ''))[0];
}

/**
 * ¿La jornada cae fuera de lo razonable? Sirve para AVISAR, no para corregir.
 *
 * En los datos reales hay jornadas que el colapso de primera y última marca no puede resolver:
 * JORDAN tiene días de 00:22 a 23:01 porque entra y sale muchas veces, y FERNANDO un día con
 * dos marcas en el mismo minuto. Ninguna de las dos es una jornada.
 *
 * Recortarlas sería inventar una regla de negocio (no-negociable 5), así que sólo se listan
 * para que las revise una persona. Los límites llegan desde `config`, no hardcodeados.
 */
export function jornadaImplausible(
  horaEntrada: string | null,
  horaSalida: string | null,
  limites: { minHoras: number; maxHoras: number },
): boolean {
  if (horaEntrada === null || horaSalida === null) return false;
  const horas = horasEntre(horaEntrada, horaSalida);
  return horas < limites.minHoras || horas > limites.maxHoras;
}

/** Horas decimales entre dos `HH:MM` del mismo día. Negativo si la salida es anterior. */
export function horasEntre(desde: string, hasta: string): number {
  const a = minutosDeHora(validarHora(desde, 'Desde'));
  const b = minutosDeHora(validarHora(hasta, 'Hasta'));
  return (b - a) / 60;
}

function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/**
 * El empleado al que pertenece un identificador **en una fecha dada**.
 *
 * El equipo reutiliza los números: el 00000013 fue JAZMIN hasta el 28-ene-2026 y NICOL desde el
 * 29. Resolver contra el mapeo de hoy le adjudicaría a una persona los días de la otra.
 *
 * Devuelve `null` si no hay mapeo vigente o si el identificador está ignorado — y en ese caso
 * la marca se guarda igual, con el empleado sin resolver, para que aparezca en la cola.
 */
export function resolverMapeo(
  mapeos: MapeoVigencia[],
  fecha: string,
): string | null {
  const vigente = mapeos.find(
    (m) =>
      !m.ignorado &&
      m.vigenteDesde <= fecha &&
      (m.vigenteHasta === null || m.vigenteHasta >= fecha),
  );
  return vigente?.empleadoId ?? null;
}

export interface MapeoVigencia {
  empleadoId: string | null;
  ignorado: boolean;
  /** `AAAA-MM-DD` inclusive. */
  vigenteDesde: string;
  /** `AAAA-MM-DD` inclusive, o `null` si sigue vigente. */
  vigenteHasta: string | null;
}
