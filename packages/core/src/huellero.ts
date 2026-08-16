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

/** La fila de `asistencias` que ya existe para ese empleado y ese día, si la hay. */
export interface AsistenciaExistente {
  fuente: string;
  condicion: 'sin_dato' | 'trabajado' | 'falta';
  horaEntrada: string | null;
  horaSalida: string | null;
}

/** Qué hacer con la asistencia del día. */
export type DecisionHuellero =
  | { accion: 'no_hacer_nada'; motivo: MotivoNoHacerNada }
  | {
      accion: 'crear' | 'actualizar';
      horaEntrada: string | null;
      horaSalida: string | null;
      condicion: 'sin_dato' | 'trabajado';
    };

export type MotivoNoHacerNada =
  /** No hay marcas: el día no existe para el huellero y no se inventa. */
  | 'sin_marcas'
  /**
   * Las marcas del día traen más de un nombre: el identificador cambió de dueño a mitad de
   * día. Sólo una persona sabe quién trabajó cuánto.
   */
  | 'identificador_reasignado'
  /**
   * El administrador declaró falta. Cuesta dos días de sueldo (RN-09) y la decidió una
   * persona: ninguna huella la revierte sola.
   */
  | 'falta_declarada'
  /** La fila ya está completa y no hay nada que rellenar. */
  | 'sin_cambios';

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
  existente: AsistenciaExistente | null,
): DecisionHuellero {
  if (marcas.length === 0) {
    return { accion: 'no_hacer_nada', motivo: 'sin_marcas' };
  }

  // El día en que un identificador cambia de dueño. La vigencia del mapeo es por fecha, pero la
  // reasignación puede ocurrir a mitad de día: el 00000013 marcó como JAZMIN a las 08:45 del
  // 28-ene-2026 y como NICOL a las 20:46 de ese mismo día. Colapsar esas dos marcas daría una
  // jornada de doce horas que no trabajó ninguna de las dos.
  const nombres = new Set(
    marcas.map((m) => (m.nombreEquipo ?? '').trim()).filter((n) => n.length > 0),
  );
  if (nombres.size > 1) {
    return { accion: 'no_hacer_nada', motivo: 'identificador_reasignado' };
  }

  const horas = marcas.map((m) => validarHora(m.hora, 'Marca')).sort();
  const entrada = horas[0];
  // Una sola marca no es una jornada: no se inventa la salida.
  const salida = horas.length >= 2 ? horas[horas.length - 1] : null;

  if (existente === null) {
    return {
      accion: 'crear',
      horaEntrada: entrada,
      horaSalida: salida,
      condicion: salida !== null ? 'trabajado' : 'sin_dato',
    };
  }

  // Una falta declarada no se toca ni para rellenar horas vacías.
  if (existente.condicion === 'falta') {
    return { accion: 'no_hacer_nada', motivo: 'falta_declarada' };
  }

  // Sólo se rellena lo que está vacío.
  const nuevaEntrada = existente.horaEntrada ?? entrada;
  const nuevaSalida = existente.horaSalida ?? salida;

  const completa = nuevaEntrada !== null && nuevaSalida !== null;
  const nuevaCondicion: 'sin_dato' | 'trabajado' =
    existente.condicion === 'sin_dato' && completa ? 'trabajado' : existente.condicion;

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
  };
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
