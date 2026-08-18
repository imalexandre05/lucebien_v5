// ═══════════════════════════════════════════════════════════════════════════════════════════
// huellero-repo.ts — lectura y administración del huellero.
//
// Implementa docs/superpowers/specs/2026-08-15-huellero-asistencias-design.md §8.
//
// Todo pasa por `getServerClient()`, o sea por la RLS del actor. Las cuatro tablas del huellero
// son solo-administrador (0075 §5), así que un encargado o un confeccionista no ve nada de acá
// aunque llegue a la ruta. NO se usa `getAdminClient()`: agregarlo a un séptimo archivo exige
// justificación escrita (no-negociable 3) y este módulo no la necesita.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { getServerClient } from './supabase/server';
import { mapaNombres } from './directorio';

export interface DispositivoHuellero {
  id: string;
  nombre: string;
  sedeCod: string | null;
  ip: string;
  activo: boolean;
  ultimaSincronizacion: string | null;
  /** Minutos desde la última señal de vida. `null` si nunca sincronizó. */
  minutosDesdeSync: number | null;
}

export interface MapeoHuellero {
  id: string;
  dispositivoId: string;
  employeeNo: string;
  empleadoId: string | null;
  empleadoNombre: string | null;
  ignorado: boolean;
  vigenteDesde: string;
  vigenteHasta: string | null;
  nota: string | null;
}

/** Un identificador del equipo que todavía no está mapeado a nadie. */
export interface SinAsignar {
  dispositivoId: string;
  employeeNo: string;
  /** Los nombres que el equipo trae para ese identificador. Más de uno = fue reasignado. */
  nombresEquipo: string[];
  marcas: number;
  primeraMarca: string;
  ultimaMarca: string;
}

/** Un día que quedó a medias o marcado para revisar. */
export interface DiaPendiente {
  id: string;
  empleadoId: string;
  empleadoNombre: string | null;
  fecha: string;
  turno: string;
  horaEntrada: string | null;
  horaSalida: string | null;
  condicion: string;
  fuente: string;
  obs: string | null;
}

// Umbral para dar por caído al colector. Corre cada 5 minutos, así que 30 son seis ciclos
// perdidos: suficiente para no alarmar por un reinicio y poco para enterarse el mismo día.
const MINUTOS_PARA_ALARMA = 30;

export function colectorCaido(d: DispositivoHuellero): boolean {
  return d.minutosDesdeSync === null || d.minutosDesdeSync > MINUTOS_PARA_ALARMA;
}

export async function listarDispositivos(): Promise<DispositivoHuellero[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('dispositivos_huellero')
    .select('*')
    .order('nombre');
  if (error) throw new Error(error.message);

  const ahora = Date.now();
  return ((data as Record<string, unknown>[]) ?? []).map((d) => {
    const sync = (d.ultima_sincronizacion as string | null) ?? null;
    return {
      id: d.id as string,
      nombre: d.nombre as string,
      sedeCod: (d.sede_cod as string | null) ?? null,
      ip: d.ip as string,
      activo: Boolean(d.activo),
      ultimaSincronizacion: sync,
      minutosDesdeSync: sync ? Math.floor((ahora - new Date(sync).getTime()) / 60000) : null,
    };
  });
}

export async function listarMapeos(): Promise<MapeoHuellero[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('huellero_mapeos')
    .select('*')
    .order('employee_no')
    .order('vigente_desde');
  if (error) throw new Error(error.message);

  const nombre = await mapaNombres();
  return ((data as Record<string, unknown>[]) ?? []).map((m) => ({
    id: m.id as string,
    dispositivoId: m.dispositivo_id as string,
    employeeNo: m.employee_no as string,
    empleadoId: (m.empleado_id as string | null) ?? null,
    empleadoNombre: m.empleado_id ? (nombre.get(m.empleado_id as string) ?? null) : null,
    ignorado: Boolean(m.ignorado),
    vigenteDesde: String(m.vigente_desde ?? '').slice(0, 10),
    vigenteHasta: m.vigente_hasta ? String(m.vigente_hasta).slice(0, 10) : null,
    nota: (m.nota as string | null) ?? null,
  }));
}

/**
 * Los identificadores que marcaron pero que nadie mapeó todavía.
 *
 * Se agrupa acá y no en SQL a propósito: son pocas filas (las marcas sin resolver de un equipo
 * recién conectado) y agregar una vista o una RPC sólo para esto ampliaría la superficie de la
 * migración sin necesidad. Si algún día son decenas de miles, se mueve a una vista.
 *
 * `nombresEquipo` con más de un valor significa que el equipo reasignó ese número a otra
 * persona: el mapeo de ese identificador tiene que partirse por fecha.
 */
export async function listarSinAsignar(): Promise<SinAsignar[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('marcas_huellero')
    .select('dispositivo_id, employee_no, nombre_equipo, marcada_en')
    .is('empleado_id', null)
    .order('marcada_en');
  if (error) throw new Error(error.message);

  // Las marcas de un identificador IGNORADO también quedan sin empleado, así que sin esto el
  // identificador que se decidió no contar seguía apareciendo como pendiente para siempre,
  // mezclado con los que de verdad faltan asignar.
  const { data: ign, error: eIgn } = await sb
    .from('huellero_mapeos')
    .select('dispositivo_id, employee_no')
    .eq('ignorado', true);
  if (eIgn) throw new Error(eIgn.message);
  const ignorados = new Set(
    ((ign as { dispositivo_id: string; employee_no: string }[]) ?? []).map(
      (m) => `${m.dispositivo_id}::${m.employee_no}`,
    ),
  );

  const grupos = new Map<string, SinAsignar>();
  for (const fila of (data as Record<string, unknown>[]) ?? []) {
    const dispositivoId = fila.dispositivo_id as string;
    const employeeNo = fila.employee_no as string;
    const clave = `${dispositivoId}::${employeeNo}`;
    if (ignorados.has(clave)) continue;
    const cuando = String(fila.marcada_en ?? '');
    const nombre = String(fila.nombre_equipo ?? '').trim();

    const previo = grupos.get(clave);
    if (previo) {
      previo.marcas += 1;
      previo.ultimaMarca = cuando;
      if (nombre && !previo.nombresEquipo.includes(nombre)) previo.nombresEquipo.push(nombre);
    } else {
      grupos.set(clave, {
        dispositivoId,
        employeeNo,
        nombresEquipo: nombre ? [nombre] : [],
        marcas: 1,
        primeraMarca: cuando,
        ultimaMarca: cuando,
      });
    }
  }

  return [...grupos.values()].sort((a, b) => b.marcas - a.marcas);
}

/**
 * Los días que hay que completar a mano antes de liquidar.
 *
 * Dos clases, y las dos bloquean el cálculo del periodo si no se resuelven:
 *   · Entrada sin salida: la persona no marcó al irse.
 *   · Marcados para revisar: el identificador cambió de dueño ese día, o la jornada derivada no
 *     puede ser cierta (`obs` empieza con "revisar:").
 *
 * Sobre el histórico de 2026 la primera clase era el 17% de las jornadas, concentrada en tres
 * personas con explicación propia.
 */
export async function listarDiasPendientes(desde?: string): Promise<DiaPendiente[]> {
  const sb = getServerClient();

  // El filtro NO puede ser sólo `condicion = 'sin_dato'`. La derivación transiciona únicamente
  // de 'sin_dato' a 'trabajado': si la fila YA estaba trabajada cuando llegó la marca que la
  // manda a revisar, se le escribe el motivo pero la condición no cambia. Ese día quedaba
  // invisible acá y se liquidaba igual — la bandera escrita donde nadie la lee.
  //
  // Pasa de verdad: llegan 08:45 y 13:00 con el mismo nombre (fila 'trabajado') y en el lote de
  // la noche llega 20:46 con otro nombre.
  //
  // Y NO se filtra por `hora_entrada is not null`: una fila revertida al corregir un mapeo queda
  // sin horas y con el motivo puesto. Bloquea la liquidación igual, así que tiene que verse en
  // la pantalla que existe justamente para mostrarla.
  let q = sb
    .from('asistencias')
    .select('id, empleado_id, fecha, turno, hora_entrada, hora_salida, condicion, fuente, obs')
    .or('and(condicion.eq.sin_dato,hora_entrada.not.is.null),obs.ilike.%revisar:%')
    .order('fecha', { ascending: false })
    .limit(400);
  if (desde) q = q.gte('fecha', desde);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const nombre = await mapaNombres();
  return ((data as Record<string, unknown>[]) ?? []).map((a) => ({
    id: a.id as string,
    empleadoId: a.empleado_id as string,
    empleadoNombre: nombre.get(a.empleado_id as string) ?? null,
    fecha: String(a.fecha ?? '').slice(0, 10),
    turno: a.turno as string,
    horaEntrada: (a.hora_entrada as string | null) ?? null,
    horaSalida: (a.hora_salida as string | null) ?? null,
    condicion: a.condicion as string,
    fuente: a.fuente as string,
    obs: (a.obs as string | null) ?? null,
  }));
}

// ── Escritura ──────────────────────────────────────────────────────────────────────────────
// Las tablas son solo-admin bajo RLS, así que estas escrituras fallan solas si el actor no lo
// es. El guard del lado de la aplicación está igual en las server actions: dos redes, no una.

export async function crearDispositivo(p: {
  nombre: string;
  ip: string;
  sedeCod: string | null;
}): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('dispositivos_huellero').insert({
    nombre: p.nombre,
    ip: p.ip,
    sede_cod: p.sedeCod,
  });
  if (error) throw new Error(error.message);
}

/**
 * Mapea un identificador a un empleado desde una fecha.
 *
 * `vigenteDesde` importa: el equipo reutiliza los números, así que un mapeo sin fecha correcta
 * le adjudica a una persona los días de otra. Cuando el identificador ya tuvo dueño, hay que
 * cerrar el mapeo anterior antes — el índice de exclusión de la 0075 rechaza dos vigencias
 * solapadas para el mismo identificador, así que el error llega de la base y no se puede
 * ignorar.
 */
export async function crearMapeo(p: {
  dispositivoId: string;
  employeeNo: string;
  empleadoId: string | null;
  ignorado: boolean;
  vigenteDesde: string;
  vigenteHasta: string | null;
  nota: string | null;
}): Promise<string> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('huellero_mapeos')
    .insert({
      dispositivo_id: p.dispositivoId,
      employee_no: p.employeeNo,
      empleado_id: p.ignorado ? null : p.empleadoId,
      ignorado: p.ignorado,
      vigente_desde: p.vigenteDesde,
      vigente_hasta: p.vigenteHasta,
      nota: p.nota,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function cerrarMapeo(id: string, vigenteHasta: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb
    .from('huellero_mapeos')
    .update({ vigente_hasta: vigenteHasta })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Borra un mapeo y re-resuelve el identificador, en UNA transacción.
 *
 * Eran dos viajes a la base. Si el borrado commiteaba y la re-resolución fallaba —un tiempo de
 * espera agotado, la red—, quedaba el peor estado: mapeo borrado, marcas todavía apuntando a la
 * persona anterior, y sus asistencias liquidándose mientras el identificador figuraba libre.
 */
export async function borrarMapeo(id: string): Promise<{ diasRecalculados: number }> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('huellero_borrar_mapeo', { p_mapeo_id: id });
  if (error) throw new Error(traducir(error.message));
  const r = (data ?? {}) as Record<string, number>;
  return { diasRecalculados: Number(r.dias_recalculados ?? 0) };
}

/**
 * Reasigna las marcas de un mapeo y recalcula las asistencias afectadas.
 *
 * Hay que llamarla después de crear, acortar o ignorar un mapeo. No es opcional: sin esto, las
 * marcas históricas se quedan como estaban y —si el mapeo se acortó— la persona anterior
 * conserva días que ya no le corresponden.
 */
export async function reprocesarMapeo(mapeoId: string): Promise<{
  marcasMovidas: number;
  diasRecalculados: number;
}> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('huellero_reprocesar_mapeo', { p_mapeo_id: mapeoId });
  if (error) throw new Error(traducir(error.message));
  const r = (data ?? {}) as Record<string, number>;
  return {
    marcasMovidas: Number(r.marcas_movidas ?? 0),
    diasRecalculados: Number(r.dias_recalculados ?? 0),
  };
}

/**
 * Vuelve a resolver un identificador contra los mapeos que existan.
 *
 * Hace falta como variante de `reprocesarMapeo` para después de BORRAR un mapeo: en ese momento
 * ya no hay id al que apuntar, y sin esto las marcas quedarían asignadas a la persona del mapeo
 * borrado, con sus asistencias liquidándose.
 */
export async function reprocesarIdentificador(
  dispositivoId: string,
  employeeNo: string,
): Promise<{ marcasMovidas: number; diasRecalculados: number }> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('huellero_reprocesar_identificador', {
    p_dispositivo_id: dispositivoId,
    p_employee_no: employeeNo,
  });
  if (error) throw new Error(traducir(error.message));
  const r = (data ?? {}) as Record<string, number>;
  return {
    marcasMovidas: Number(r.marcas_movidas ?? 0),
    diasRecalculados: Number(r.dias_recalculados ?? 0),
  };
}

/**
 * Qué hay declarado ese día, para las salvaguardas de la aplicación.
 *
 * Mira TODAS las filas del día, no una: una falta puede estar en el turno T mientras el huellero
 * escribió en el M.
 */
export async function estadoDelDia(
  empleadoId: string,
  fecha: string,
): Promise<{ tieneFalta: boolean; motivoRevision: string | null }> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('asistencias')
    .select('condicion, obs')
    .eq('empleado_id', empleadoId)
    .eq('fecha', fecha);
  if (error) throw new Error(error.message);

  const filas = (data as { condicion: string; obs: string | null }[]) ?? [];
  const conRevision = filas.find((f) => (f.obs ?? '').includes('revisar:'));
  return {
    tieneFalta: filas.some((f) => f.condicion === 'falta'),
    motivoRevision: conRevision
      ? (/revisar:\s*([^·]+)/.exec(conRevision.obs ?? '')?.[1]?.trim() ?? 'sin detalle')
      : null,
  };
}

/** Los errores de las RPC llegan como 'CODIGO:mensaje'. Al usuario le sirve el mensaje. */
function traducir(mensaje: string): string {
  const m = /(?:PERMISO|DATO):\s*(.+)/.exec(mensaje);
  if (m) return m[1].trim();
  if (/huellero_mapeo_sin_solape/.test(mensaje)) {
    return 'Ese identificador ya tiene un mapeo vigente en esas fechas. Cerrá el anterior antes de crear el nuevo.';
  }
  if (/huellero_mapeo_rango_chk/.test(mensaje)) {
    return 'La fecha de fin no puede ser anterior a la de inicio.';
  }
  if (/huellero_mapeo_destino_chk/.test(mensaje)) {
    return 'Elegí un empleado, o marcá el identificador como ignorado.';
  }
  return mensaje;
}
