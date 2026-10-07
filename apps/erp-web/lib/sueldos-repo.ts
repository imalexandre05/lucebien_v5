import {
  MOTOR_VERSION,
  cuotaDeLiquidacion,
  liquidacionesCruzadas,
  liquidarPeriodo,
  proximoPagoPendiente,
  resolverParametros,
  validarCadaDias,
  frecuenciaVigente,
  type CambioFrecuencia,
  type ContratoPago,
  type ModalidadPago,
  type EntradaLiquidacion,
  type Liquidacion,
  type ParametrosSueldo,
} from '@scilb/core';
import { mapaNombres } from './directorio';
import { getServerClient } from './supabase/server';
import { leerConfigMap } from './config-repo';

/**
 * sueldos-repo.ts — acceso a datos del motor de sueldos (migraciones 0072 y 0073).
 * Implementa el paso 4 de docs/superpowers/specs/sueldos/SPEC-esquema-sueldos.md §9.
 *
 * TRES COSAS QUE NO SE NEGOCIAN ACÁ:
 *
 * 1. **`getServerClient()`, nunca `getAdminClient()`.** El cliente admin bypasea la RLS y está
 *    restringido a seis archivos (no-negociable 3); éste sería el séptimo. No hace falta: las
 *    políticas de la 0072 ya dicen que el administrador ve todo y cada persona ve sólo lo suyo.
 *    Por eso **ninguna consulta de este archivo filtra por empleado para aislar** — el aislamiento
 *    lo aplica la base. Un `.eq('empleado_id', …)` acá sería un filtro de comodidad, y confundirlo
 *    con el aislamiento es cómo se termina publicando el sueldo de todos.
 *
 * 2. **El navegador no manda plata.** El cliente puede pedir un preview, pero el borrador que se
 *    guarda lo calcula el servidor: `crearBorrador()` recibe un id de acuerdo y el rango del tramo
 *    a liquidar (`desde`/`hasta`, spec liquidación-por-tramos) — nunca un total ni una liquidación
 *    ya armada. Pide la entrada a la RPC con ese rango y vuelve a correr `liquidarPeriodo()` acá.
 *    Elegir QUÉ RANGO liquidar es del cliente; calcular CUÁNTO da ese rango no. Es el mismo patrón
 *    que `/evaluaciones`.
 *
 * 3. **Las escrituras del cierre pasan por RPC.** Cerrar y anular tocan cuatro tablas en una
 *    transacción y en un orden que no es libre (spec §8.1). Reproducir eso con `update` sueltos
 *    desde acá deja liquidaciones a medio congelar.
 *
 * ERRORES: las RPC y los triggers hablan con el prefijo `'CODIGO:mensaje'`. Acá se convierten en
 * `SueldoRpcError` con el código separado, para que la pantalla decida qué hacer sin volver a
 * parsear el texto.
 */

// ── Errores ─────────────────────────────────────────────────────────────────────────────────

/**
 * Códigos que devuelven las migraciones 0072 y 0073. La lista no es decorativa: son los seis
 * casos que la UI tiene que distinguir.
 *
 * - `PERMISO` — no es administrador. La pantalla no debería haberlo dejado llegar.
 * - `DATO` — falta algo concreto y el mensaje dice qué (incluidas las fechas sin declarar).
 * - `ESTADO` — la liquidación no está en el estado que esa acción necesita.
 * - `DESACTUALIZADA` — se cargó algo entre el cálculo y el cierre. Hay que recalcular.
 * - `CONGELADA` — se intentó tocar algo ya liquidado. No se reintenta: se corrige el mes en curso.
 * - `CONFIG` — un parámetro de `/configuracion` no es un número. Lo arregla el administrador.
 * - `SALDO` — código de la 0080 (`sueldo_liquidacion_pagar`): el abono pedido deja lo pagado por
 *   encima del total de la liquidación. No se reintenta con el mismo monto.
 */
export type CodigoSueldo =
  | 'PERMISO'
  | 'DATO'
  | 'ESTADO'
  | 'DESACTUALIZADA'
  | 'CONGELADA'
  | 'CONFIG'
  | 'SALDO';

export class SueldoRpcError extends Error {
  codigo?: CodigoSueldo;
  constructor(message: string, codigo?: CodigoSueldo) {
    super(message);
    this.name = 'SueldoRpcError';
    this.codigo = codigo;
  }
}

const CODIGOS: readonly string[] = [
  'PERMISO',
  'DATO',
  'ESTADO',
  'DESACTUALIZADA',
  'CONGELADA',
  'CONFIG',
  'SALDO',
];

function errorSueldo(error: { message?: string; code?: string } | null): SueldoRpcError {
  const msg = error?.message ?? 'Error desconocido';

  // 23P01 = exclusion_violation. Es el código que dispara `sueldo_acuerdos_sin_solape`
  // (restricción de exclusión desde el esquema original: dos contratos de la misma persona no
  // pueden compartir un día de calendario). Sin este `if`, el mensaje que llegaba a la pantalla
  // era el crudo de Postgres —«conflicting key value violates exclusion constraint...»— así que
  // se traduce acá, igual que `config-repo.ts` e `incidencias-repo.ts` ya traducen `23505` a un
  // mensaje propio.
  if (error?.code === '23P01') {
    return new SueldoRpcError(
      'Esta persona ya tiene un contrato que cubre parte de este período. Cierra o edita el contrato existente antes de crear uno nuevo.',
      'DATO',
    );
  }

  const m = msg.match(/^([A-Z_]+):([\s\S]+)$/);
  if (m && CODIGOS.includes(m[1])) return new SueldoRpcError(m[2], m[1] as CodigoSueldo);
  return new SueldoRpcError(msg);
}

// ── Acuerdos (contratos) ────────────────────────────────────────────────────────────────────

export type EstadoAcuerdo = 'borrador' | 'vigente' | 'liquidado';
/** Cómo se corta el contrato en pagos: mensual, quincenal, semanal o cada N días (migración 0120). */
export type ModalidadAcuerdo = ModalidadPago;

/**
 * Una fila de `sueldo_acuerdo_cambios` (0120): desde `desde` rigen esta frecuencia y esta cuota. Lo
 * «anterior» viaja para mostrar «Quincenal S/325 (antes mensual S/650)» sin reconstruirlo.
 */
export type CambioAcuerdo = {
  id: string;
  desde: string;
  modalidad: ModalidadAcuerdo;
  cadaDias: number | null;
  sueldoPactado: number;
  modalidadAnterior: ModalidadAcuerdo | null;
  cadaDiasAnterior: number | null;
  sueldoPactadoAnterior: number | null;
  creadoEn: string;
};

type RowCambio = {
  id: string;
  desde: string;
  modalidad: string;
  cada_dias: number | null;
  sueldo_pactado: number | string;
  modalidad_anterior: string | null;
  cada_dias_anterior: number | null;
  sueldo_pactado_anterior: number | string | null;
  creado_en: string;
};

export type TurnoAcuerdo = {
  id: string;
  /** 1 = lunes … 7 = domingo, igual que `TurnoContratado` del core. */
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
  lugar: string | null;
};

export type AcuerdoSueldo = {
  id: string;
  empleadoId: string;
  empleadoNombre: string | null;
  fechaInicio: string;
  fechaFin: string;
  modalidad: ModalidadAcuerdo;
  /** Sólo con modalidad `'dias'`: cada cuántos días se paga (1–62). */
  cadaDias: number | null;
  sueldoPactado: number;
  escala: number | null;
  almuerzoHabilitado: boolean;
  /** Overrides de esta persona sobre los parámetros globales. `{}` = usa todos los globales. */
  parametros: Partial<ParametrosSueldo>;
  estado: EstadoAcuerdo;
  creadoEn: string;
  turnos: TurnoAcuerdo[];
  /** Historial de cambios de frecuencia/cuota, del más viejo al más nuevo. */
  cambios: CambioAcuerdo[];
};

type RowAcuerdo = {
  id: string;
  empleado_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  modalidad: string;
  cada_dias: number | null;
  sueldo_pactado: number | string;
  escala: number | null;
  almuerzo_habilitado: boolean;
  parametros: Partial<ParametrosSueldo> | null;
  estado: string;
  creado_en: string;
  sueldo_acuerdo_turnos?: RowTurno[] | null;
  sueldo_acuerdo_cambios?: RowCambio[] | null;
};

type RowTurno = {
  id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  lugar: string | null;
};

// Una sola línea literal: supabase-js deduce el tipo del texto del select, y concatenar dos literales
// con `+` lo vuelve `string` y rompe esa deducción.
const SELECT_ACUERDO =
  '*, sueldo_acuerdo_turnos(id, dia_semana, hora_inicio, hora_fin, lugar), sueldo_acuerdo_cambios(id, desde, modalidad, cada_dias, sueldo_pactado, modalidad_anterior, cada_dias_anterior, sueldo_pactado_anterior, creado_en)';

function aCambio(r: RowCambio): CambioAcuerdo {
  return {
    id: r.id,
    desde: (r.desde ?? '').slice(0, 10),
    modalidad: r.modalidad as ModalidadAcuerdo,
    cadaDias: r.cada_dias,
    sueldoPactado: Number(r.sueldo_pactado ?? 0),
    modalidadAnterior: (r.modalidad_anterior as ModalidadAcuerdo | null) ?? null,
    cadaDiasAnterior: r.cada_dias_anterior,
    sueldoPactadoAnterior: r.sueldo_pactado_anterior == null ? null : Number(r.sueldo_pactado_anterior),
    creadoEn: r.creado_en,
  };
}

/** Lo que el core necesita de un cambio para resolver la frecuencia vigente. */
export const cambiosParaCore = (cambios: CambioAcuerdo[]): CambioFrecuencia[] =>
  cambios.map((c) => ({ desde: c.desde, modalidad: c.modalidad, cadaDias: c.cadaDias, sueldoPactado: c.sueldoPactado }));

// Postgres devuelve `time` como 'HH:MM:SS'. El core valida 'H:MM' o 'HH:MM' (RE_HORA acepta los
// segundos, pero la UI no los quiere mostrar) y `sueldo_entrada` ya recorta a 'HH24:MI'. Acá se
// recorta también para que el formulario y el snapshot digan lo mismo.
const hhmm = (t: string): string => t.slice(0, 5);

function aTurno(r: RowTurno): TurnoAcuerdo {
  return {
    id: r.id,
    diaSemana: r.dia_semana,
    horaInicio: hhmm(r.hora_inicio),
    horaFin: hhmm(r.hora_fin),
    lugar: r.lugar,
  };
}

function aAcuerdo(r: RowAcuerdo, nombre: string | null): AcuerdoSueldo {
  const turnos = (r.sueldo_acuerdo_turnos ?? []).map(aTurno);
  turnos.sort((a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio));
  return {
    id: r.id,
    empleadoId: r.empleado_id,
    empleadoNombre: nombre,
    fechaInicio: (r.fecha_inicio ?? '').slice(0, 10),
    fechaFin: (r.fecha_fin ?? '').slice(0, 10),
    modalidad: (r.modalidad as ModalidadAcuerdo) ?? 'mensual',
    cadaDias: r.cada_dias ?? null,
    sueldoPactado: Number(r.sueldo_pactado ?? 0),
    escala: r.escala,
    almuerzoHabilitado: Boolean(r.almuerzo_habilitado),
    parametros: r.parametros ?? {},
    estado: (r.estado as EstadoAcuerdo) ?? 'borrador',
    creadoEn: r.creado_en,
    turnos,
    cambios: (r.sueldo_acuerdo_cambios ?? []).map(aCambio).sort((a, b) => a.desde.localeCompare(b.desde)),
  };
}

/**
 * Los contratos visibles, del más reciente al más viejo. Un colaborador ve los suyos; el
 * administrador, todos. Eso lo decide la policy `sueldo_acuerdos_select`, no este código.
 */
export async function listarAcuerdos(empleadoId?: string): Promise<AcuerdoSueldo[]> {
  const sb = getServerClient();
  let q = sb.from('sueldo_acuerdos').select(SELECT_ACUERDO).order('fecha_inicio', { ascending: false });
  // Filtro de pantalla ("mostrame los de Ana"), no de seguridad. Ver la nota 1 de la cabecera.
  if (empleadoId) q = q.eq('empleado_id', empleadoId);
  const { data, error } = await q;
  if (error) throw errorSueldo(error);

  const rows = (data as RowAcuerdo[]) ?? [];
  const nombre = await mapaNombres();
  return rows.map((r) => aAcuerdo(r, nombre.get(r.empleado_id) ?? null));
}

export async function obtenerAcuerdo(id: string): Promise<AcuerdoSueldo | null> {
  const sb = getServerClient();
  const { data, error } = await sb.from('sueldo_acuerdos').select(SELECT_ACUERDO).eq('id', id).maybeSingle();
  if (error) throw errorSueldo(error);
  if (!data) return null;

  const r = data as RowAcuerdo;
  const nombre = await mapaNombres();
  return aAcuerdo(r, nombre.get(r.empleado_id) ?? null);
}

export type AcuerdoInput = {
  empleadoId: string;
  fechaInicio: string;
  fechaFin: string;
  modalidad: ModalidadAcuerdo;
  cadaDias: number | null;
  sueldoPactado: number;
  escala: number | null;
  almuerzoHabilitado: boolean;
  parametros: Partial<ParametrosSueldo>;
  turnos: Omit<TurnoAcuerdo, 'id'>[];
};

/**
 * Los overrides se validan ACÁ antes de escribir, aunque la base tenga su propio check.
 *
 * La base rechaza una clave desconocida, pero con un mensaje de constraint que no le dice nada a
 * nadie. Y sobre todo: `resolverParametros()` **lanza** ante cualquier clave que no esté en
 * `ParametrosSueldo` (sueldos.ts), así que un `{"tolerancia_minutos": 15}` guardado con éxito
 * rompería toda liquidación futura de esa persona. Mejor que falle el formulario.
 */
function validarOverrides(parametros: Partial<ParametrosSueldo>): Partial<ParametrosSueldo> {
  // Tira si hay una clave que el motor no conoce, que es exactamente lo que se quiere.
  resolverParametros(parametros);
  return parametros;
}

function filaAcuerdo(p: Omit<AcuerdoInput, 'turnos'>) {
  return {
    empleado_id: p.empleadoId,
    fecha_inicio: p.fechaInicio,
    fecha_fin: p.fechaFin,
    modalidad: p.modalidad,
    // Sólo 'dias' lleva N; el check de la 0120 rechaza N en cualquier otra modalidad.
    cada_dias: p.modalidad === 'dias' ? validarCadaDias(p.cadaDias) : null,
    sueldo_pactado: p.sueldoPactado,
    escala: p.escala,
    almuerzo_habilitado: p.almuerzoHabilitado,
    parametros: validarOverrides(p.parametros),
  };
}

export async function crearAcuerdo(p: AcuerdoInput, creadoPor: string): Promise<string> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('sueldo_acuerdos')
    .insert({ ...filaAcuerdo(p), creado_por: creadoPor })
    .select('id')
    .single();
  if (error) throw errorSueldo(error);

  const id = String((data as { id: string }).id);
  if (p.turnos.length > 0) await guardarTurnos(id, p.turnos);
  return id;
}

export async function actualizarAcuerdo(id: string, p: AcuerdoInput): Promise<void> {
  // Con cambios de frecuencia registrados, el inicio y la frecuencia base ya no se editan: los
  // cambios están anclados a ese calendario y quedarían a mitad de un pago o antes del inicio.
  const actual = await obtenerAcuerdo(id);
  if (
    actual &&
    actual.cambios.length > 0 &&
    (actual.fechaInicio !== p.fechaInicio ||
      actual.modalidad !== p.modalidad ||
      (actual.cadaDias ?? null) !== (p.modalidad === 'dias' ? p.cadaDias : null))
  ) {
    throw new SueldoRpcError(
      'Este contrato ya tiene cambios de frecuencia: no se puede cambiar su inicio ni su frecuencia base. Usa «Cambiar cómo se paga».',
      'ESTADO',
    );
  }
  const sb = getServerClient();
  const { error } = await sb.from('sueldo_acuerdos').update(filaAcuerdo(p)).eq('id', id);
  if (error) throw errorSueldo(error);
  await guardarTurnos(id, p.turnos);
}

/**
 * Reemplaza el horario completo del acuerdo.
 *
 * Borra y vuelve a insertar en vez de comparar fila por fila: el horario se edita como una grilla
 * semanal entera, no turno por turno, y la restricción de solapamiento de la 0072 se evalúa por
 * fila. Editando en el lugar, un cambio válido en conjunto —correr los dos turnos del lunes una
 * hora— puede chocar contra la versión vieja de su propio compañero según el orden de los updates.
 *
 * No hay riesgo de perder el horario de una liquidación ya emitida: el snapshot `entrada` guarda
 * el horario que se usó (spec §6).
 */
export async function guardarTurnos(acuerdoId: string, turnos: Omit<TurnoAcuerdo, 'id'>[]): Promise<void> {
  const sb = getServerClient();

  const { error: eDel } = await sb.from('sueldo_acuerdo_turnos').delete().eq('acuerdo_id', acuerdoId);
  if (eDel) throw errorSueldo(eDel);

  if (turnos.length === 0) return;
  const { error } = await sb.from('sueldo_acuerdo_turnos').insert(
    turnos.map((t) => ({
      acuerdo_id: acuerdoId,
      dia_semana: t.diaSemana,
      hora_inicio: t.horaInicio,
      hora_fin: t.horaFin,
      lugar: t.lugar || null,
    })),
  );
  if (error) throw errorSueldo(error);
}

export async function cambiarEstadoAcuerdo(id: string, estado: EstadoAcuerdo): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('sueldo_acuerdos').update({ estado }).eq('id', id);
  if (error) throw errorSueldo(error);
}

// ── Cambio de frecuencia (migración 0120, spec frecuencia-pago-flexible §3.2) ────────────────

export type CambioFrecuenciaInput = {
  /** Primer día de la nueva frecuencia: tiene que ser el próximo pago que todavía no se pagó. */
  desde: string;
  modalidad: ModalidadAcuerdo;
  cadaDias: number | null;
  /** Cuota de CADA pago desde `desde`. La confirma el administrador: el sistema sólo la sugiere. */
  sueldoPactado: number;
};

/** Lo último que ya se pagó de un contrato: el `periodo_hasta` más alto entre las liquidaciones cerradas. */
function ultimaCerradaHasta(liqs: { estado: string; periodoHasta: string }[]): string | null {
  return liqs.filter((l) => l.estado === 'cerrada').reduce<string | null>((m, l) => (m === null || l.periodoHasta > m ? l.periodoHasta : m), null);
}

/**
 * El próximo pago sin pagar de un acuerdo y los borradores que un cambio ahí dejaría
 * desactualizados. Lo usa la pantalla para proponer la fecha y avisar ANTES de confirmar.
 */
export async function planDeCambio(acuerdoId: string) {
  const acuerdo = await obtenerAcuerdo(acuerdoId);
  if (!acuerdo) throw new SueldoRpcError('El contrato no existe o no tenés acceso.', 'DATO');
  const liqs = await listarLiquidaciones({ acuerdoId });
  const proximo = proximoPagoPendiente(acuerdo, cambiosParaCore(acuerdo.cambios), ultimaCerradaHasta(liqs));
  const borradores = proximo ? liquidacionesCruzadas(liqs, proximo.desde) : [];
  return { acuerdo, proximo, borradores };
}

/**
 * Cambia la frecuencia y la cuota de un contrato vigente. Aplica desde el próximo pago que todavía
 * no se pagó: lo ya cerrado no se toca (la fila nueva sólo rige desde `desde`, y el snapshot de
 * cada liquidación guarda la cuota que usó). Si hay un borrador que se cruza con el cambio lo
 * devuelve para que la pantalla pida recalcularlo; no lo borra ni lo recalcula solo.
 */
export async function cambiarFrecuencia(
  acuerdoId: string,
  p: CambioFrecuenciaInput,
  creadoPor: string,
): Promise<{ borradores: LiquidacionResumen[] }> {
  const { acuerdo, proximo, borradores } = await planDeCambio(acuerdoId);
  if (!proximo) {
    throw new SueldoRpcError('Todos los pagos de este contrato ya están pagados: no hay nada que cambiar.', 'ESTADO');
  }
  if (p.desde !== proximo.desde) {
    throw new SueldoRpcError(
      `El cambio tiene que empezar en el próximo pago sin pagar (${proximo.desde}); lo ya pagado no se toca.`,
      'ESTADO',
    );
  }
  if (!Number.isFinite(p.sueldoPactado) || p.sueldoPactado <= 0) {
    throw new SueldoRpcError('La cuota tiene que ser mayor que cero.', 'DATO');
  }
  const cadaDias = p.modalidad === 'dias' ? validarCadaDias(p.cadaDias) : null;
  const anterior = frecuenciaVigente(acuerdo, cambiosParaCore(acuerdo.cambios), p.desde);

  const sb = getServerClient();

  // Nada se ha pagado: el «próximo pago» es el primero del contrato, y un cambio ahí es simplemente
  // el contrato (la base rechaza un cambio el primer día). Se edita el contrato base.
  if (p.desde === acuerdo.fechaInicio) {
    const { error: eBase } = await sb
      .from('sueldo_acuerdos')
      .update({ modalidad: p.modalidad, cada_dias: cadaDias, sueldo_pactado: p.sueldoPactado })
      .eq('id', acuerdoId);
    if (eBase) throw errorSueldo(eBase);
    return { borradores };
  }

  // Corregir un cambio mal cargado: si ya hay uno que arranca ese día, se reemplaza (el anterior,
  // mientras no se haya pagado nada de ahí en adelante, no tiene por qué quedar). Un solo `upsert`
  // sobre (acuerdo_id, desde): antes era borrar y después insertar, y si el insert fallaba el cambio
  // anterior se perdía (auditoría D-10, H8). El trigger de la 0121 rechaza tocar uno ya pagado.
  const previo = acuerdo.cambios.find((c) => c.desde === p.desde);
  const { error } = await sb.from('sueldo_acuerdo_cambios').upsert({
    acuerdo_id: acuerdoId,
    desde: p.desde,
    modalidad: p.modalidad,
    cada_dias: cadaDias,
    sueldo_pactado: p.sueldoPactado,
    // Si se reemplaza un cambio, «antes» es lo que había antes de ese cambio, no el cambio borrado.
    modalidad_anterior: previo?.modalidadAnterior ?? anterior.modalidad,
    cada_dias_anterior: previo ? previo.cadaDiasAnterior : (anterior.cadaDias ?? null),
    sueldo_pactado_anterior: previo?.sueldoPactadoAnterior ?? anterior.sueldoPactado,
    creado_por: creadoPor,
  }, { onConflict: 'acuerdo_id,desde' });
  if (error) throw errorSueldo(error);
  return { borradores };
}

// ── Movimientos: adelantos, descuentos, bonos, capacitaciones, almuerzos ─────────────────────

// Viven en `sueldos-tipos.ts` porque una pantalla de navegador necesita `esConteo`, y desde acá
// no se puede: este módulo trae el cliente de servidor. Se reexportan para no romper a quien ya
// los importaba de acá.
import { TIPOS_CONTEO, esConteo, type TipoMovimiento } from './sueldos-tipos';
export { TIPOS_CONTEO, esConteo, type TipoMovimiento };

export type MovimientoSueldo = {
  id: string;
  empleadoId: string;
  empleadoNombre: string | null;
  fecha: string;
  tipo: TipoMovimiento;
  /** `null` en los tipos de conteo: el valor sale de `/configuracion`, no de la fila. */
  monto: number | null;
  cantidad: number;
  motivo: string;
  /** Con sello, la fila ya se pagó y es intocable. */
  liquidacionId: string | null;
  creadoEn: string;
};

type RowMovimiento = {
  id: string;
  empleado_id: string;
  fecha: string;
  tipo: string;
  monto: number | string | null;
  cantidad: number;
  motivo: string;
  liquidacion_id: string | null;
  creado_en: string;
};

export async function listarMovimientos(f: {
  empleadoId?: string;
  desde?: string;
  hasta?: string;
  soloSinLiquidar?: boolean;
  /**
   * Con `desde` y `hasta`: además del rango, trae TODO lo que siga sin liquidar, sea de la fecha
   * que sea. Es lo que va a entrar en el próximo pago, así que una pantalla no lo puede esconder
   * por mirar otro mes (spec 2026-10-03-adelantos-rendimiento-design.md §4). Sin rango no cambia
   * nada.
   */
  incluirSinLiquidar?: boolean;
}): Promise<MovimientoSueldo[]> {
  const sb = getServerClient();
  let q = sb
    .from('sueldo_movimientos')
    .select('*')
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false });
  if (f.empleadoId) q = q.eq('empleado_id', f.empleadoId);
  if (f.incluirSinLiquidar && f.desde && f.hasta) {
    q = q.or(`liquidacion_id.is.null,and(fecha.gte.${f.desde},fecha.lte.${f.hasta})`);
  } else {
    if (f.desde) q = q.gte('fecha', f.desde);
    if (f.hasta) q = q.lte('fecha', f.hasta);
  }
  if (f.soloSinLiquidar) q = q.is('liquidacion_id', null);

  const { data, error } = await q;
  if (error) throw errorSueldo(error);

  const rows = (data as RowMovimiento[]) ?? [];
  const nombre = await mapaNombres();
  return rows.map((r) => ({
    id: r.id,
    empleadoId: r.empleado_id,
    empleadoNombre: nombre.get(r.empleado_id) ?? null,
    fecha: (r.fecha ?? '').slice(0, 10),
    tipo: r.tipo as TipoMovimiento,
    monto: r.monto == null ? null : Number(r.monto),
    cantidad: Number(r.cantidad ?? 1),
    motivo: r.motivo,
    liquidacionId: r.liquidacion_id,
    creadoEn: r.creado_en,
  }));
}

export type MovimientoInput = {
  empleadoId: string;
  fecha: string;
  tipo: TipoMovimiento;
  /** Plata en positivo. El signo lo pone la regla del motor, nunca el dato. */
  monto?: number;
  cantidad?: number;
  motivo: string;
};

/**
 * El monto va SIEMPRE en positivo, incluso para un adelanto o un descuento.
 *
 * La base ya lo exige (`sueldo_mov_monto_chk`), y el motivo está en la 0072: un adelanto tipeado
 * en negativo invertía la línea, de descontar S/100 a sumar S/100. Acá se corta antes, con un
 * mensaje que un administrador entiende.
 *
 * Son las validaciones de `crearMovimiento`, separadas para que la acción pueda correrlas ANTES de
 * intentar el insert y saber con certeza que un rechazo acá no escribió nada (spec
 * 2026-10-03-adelantos-rendimiento-design.md). Lanza `SueldoRpcError` con código `DATO`.
 */
export function validarMovimiento(p: MovimientoInput): void {
  const conteo = esConteo(p.tipo);

  if (conteo) {
    if (p.monto != null) {
      throw new SueldoRpcError(
        `Un movimiento de tipo "${p.tipo}" se carga por cantidad, no por monto: el valor sale de /configuracion.`,
        'DATO',
      );
    }
    if (!p.cantidad || p.cantidad < 1) {
      throw new SueldoRpcError(`Falta la cantidad del movimiento de tipo "${p.tipo}".`, 'DATO');
    }
  } else if (!p.monto || p.monto <= 0) {
    throw new SueldoRpcError(
      'El monto tiene que ser mayor que cero, también en un adelanto o un descuento: el signo lo pone la regla, no el dato.',
      'DATO',
    );
  }
}

export async function crearMovimiento(p: MovimientoInput, creadoPor: string): Promise<string> {
  validarMovimiento(p);
  const conteo = esConteo(p.tipo);

  const sb = getServerClient();
  const { data, error } = await sb
    .from('sueldo_movimientos')
    .insert({
      empleado_id: p.empleadoId,
      fecha: p.fecha,
      tipo: p.tipo,
      monto: conteo ? null : p.monto,
      cantidad: conteo ? p.cantidad : 1,
      motivo: p.motivo.trim(),
      creado_por: creadoPor,
    })
    .select('id')
    .single();
  if (error) throw errorSueldo(error);
  return String((data as { id: string }).id);
}

/**
 * Sólo se borra lo que todavía no se pagó. Si la fila ya fue consumida por una liquidación, el
 * trigger de la 0072 corta con `CONGELADA` — y así tiene que ser: borrar un adelanto ya
 * descontado le regalaría ese monto a alguien sin dejar rastro.
 */
export async function eliminarMovimiento(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('sueldo_movimientos').delete().eq('id', id);
  if (error) throw errorSueldo(error);
}

// ── Ventas ──────────────────────────────────────────────────────────────────────────────────

export type VentaSueldo = {
  id: string;
  origen: string;
  fecha: string;
  monto: number;
  tipo: 'venta' | 'alquiler';
  sedeCod: string | null;
  empleadoId: string | null;
  empleadoNombre: string | null;
  /** Lo que mandó el otro sistema cuando no se pudo mapear a nadie. */
  vendedorExterno: string | null;
  liquidacionId: string | null;
};

type RowVenta = {
  id: string;
  origen: string;
  fecha: string;
  monto: number | string;
  tipo: string;
  sede_cod: string | null;
  empleado_id: string | null;
  vendedor_externo: string | null;
  liquidacion_id: string | null;
};

export async function listarVentas(f: {
  empleadoId?: string;
  desde?: string;
  hasta?: string;
  /** La cola de ventas que llegaron sin vendedor identificable. Nada se descarta en silencio. */
  soloSinAsignar?: boolean;
}): Promise<VentaSueldo[]> {
  const sb = getServerClient();
  let q = sb.from('sueldo_ventas').select('*').order('fecha', { ascending: false });
  if (f.empleadoId) q = q.eq('empleado_id', f.empleadoId);
  if (f.desde) q = q.gte('fecha', f.desde);
  if (f.hasta) q = q.lte('fecha', f.hasta);
  if (f.soloSinAsignar) q = q.is('empleado_id', null);

  const { data, error } = await q;
  if (error) throw errorSueldo(error);

  const rows = (data as RowVenta[]) ?? [];
  const nombre = await mapaNombres();
  return rows.map((r) => ({
    id: r.id,
    origen: r.origen,
    fecha: (r.fecha ?? '').slice(0, 10),
    monto: Number(r.monto ?? 0),
    tipo: (r.tipo as 'venta' | 'alquiler') ?? 'venta',
    sedeCod: r.sede_cod,
    empleadoId: r.empleado_id,
    empleadoNombre: r.empleado_id ? (nombre.get(r.empleado_id) ?? null) : null,
    vendedorExterno: r.vendedor_externo,
    liquidacionId: r.liquidacion_id,
  }));
}

export type VentaInput = {
  fecha: string;
  /** El total de la boleta, no el de un producto: RN-13 compara la boleta contra el mínimo. */
  monto: number;
  tipo: 'venta' | 'alquiler';
  sedeCod: string | null;
  empleadoId: string | null;
  vendedorExterno?: string | null;
};

export async function crearVenta(p: VentaInput): Promise<string> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('sueldo_ventas')
    .insert({
      origen: 'manual',
      fecha: p.fecha,
      monto: p.monto,
      tipo: p.tipo,
      sede_cod: p.sedeCod,
      empleado_id: p.empleadoId,
      vendedor_externo: p.vendedorExterno ?? null,
    })
    .select('id')
    .single();
  if (error) throw errorSueldo(error);
  return String((data as { id: string }).id);
}

/** Saca una venta de la cola de sin-asignar. Si ya se liquidó, el trigger corta con `CONGELADA`. */
export async function asignarVendedor(ventaId: string, empleadoId: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('sueldo_ventas').update({ empleado_id: empleadoId }).eq('id', ventaId);
  if (error) throw errorSueldo(error);
}

export async function eliminarVenta(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('sueldo_ventas').delete().eq('id', id);
  if (error) throw errorSueldo(error);
}

// ── Liquidación ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que devuelve `sueldo_entrada()`: la `EntradaLiquidacion` del core más tres campos de
 * contexto que el motor no necesita pero la pantalla sí.
 */
export type EntradaConContexto = EntradaLiquidacion & {
  acuerdoId: string;
  empleadoId: string;
  modalidad: string;
  /**
   * Migración 0121: los datos que DECIDEN la cuota del tramo, tal como los devuelve
   * `sueldo_entrada_pago`. Se guardan en el borrador y el cierre los compara dentro de su
   * transacción: si cambiaron (un cambio de frecuencia, una cuota editada), responde DESACTUALIZADA.
   * Ausentes en borradores anteriores a la 0121.
   */
  contratoPago?: ContratoPagoGuardado;
  cambiosFrecuencia?: CambioFrecuenciaGuardado[];
  /** La cuota es la de una liquidación que se corrigió, no la que da el calendario (spec §9.3). */
  cuotaFijada?: true;
};

/** `contratoPago` tal como sale de `sueldo_entrada_pago` (0121). */
export type ContratoPagoGuardado = {
  fechaInicio: string;
  fechaFin: string;
  modalidad: ModalidadAcuerdo;
  cadaDias: number | null;
  sueldoPactado: number;
};

/** Cada elemento de `cambiosFrecuencia` tal como sale de `sueldo_entrada_pago` (0121). */
export type CambioFrecuenciaGuardado = {
  desde: string;
  modalidad: ModalidadAcuerdo;
  cadaDias: number | null;
  sueldoPactado: number;
};

/**
 * La cuota del tramo con los datos guardados en la entrada: la MISMA función del core y los MISMOS
 * datos que el cierre compara (spec §9.3). Un rango que no tiene cuota posible (desalineado y
 * cruzando un cambio, enmienda 9.2) se informa como ESTADO.
 */
function cuotaConDatosDePago(
  contrato: ContratoPagoGuardado,
  cambios: CambioFrecuenciaGuardado[],
  desde: string,
  hasta: string,
): number {
  const c: ContratoPago = { ...contrato, sueldoPactado: Number(contrato.sueldoPactado) };
  const cs: CambioFrecuencia[] = cambios.map((x) => ({ ...x, sueldoPactado: Number(x.sueldoPactado) }));
  try {
    return cuotaDeLiquidacion(c, cs, desde, hasta);
  } catch (e) {
    throw new SueldoRpcError(e instanceof Error ? e.message : 'No pude calcular la cuota del tramo.', 'ESTADO');
  }
}

/**
 * Arma la entrada de UN TRAMO del acuerdo desde la base (spec liquidación-por-tramos, C-3).
 * **No escribe nada.**
 *
 * `desde`/`hasta` son el tramo que el administrador eligió liquidar esta vez — no necesariamente
 * el acuerdo completo: `sueldo_entrada` (0093) exige que caigan dentro de
 * `fecha_inicio`/`fecha_fin` del acuerdo, pero un acuerdo de tres meses se puede liquidar mes a
 * mes, tramo por tramo.
 *
 * Corta con `DATO` nombrando las fechas si algún día contratado del TRAMO quedó sin declarar. Ese
 * corte es la razón de ser de la columna `condicion`: un día sin cargar no es una falta, y
 * confundirlos cuesta dos días de sueldo por día.
 */
export async function entradaDeAcuerdo(
  acuerdoId: string,
  desde: string,
  hasta: string,
  /** Fuerza la cuota (la de una liquidación que se corrige): no se recalcula con la regla de hoy. */
  cuotaFija?: number,
): Promise<EntradaConContexto> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('sueldo_entrada', {
    p_acuerdo: acuerdoId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw errorSueldo(error);
  const entrada = data as EntradaConContexto;

  // Migración 0121: los datos del calendario de pago (contrato + cambios de frecuencia) se leen con
  // la MISMA función que usa el cierre y viajan en la entrada. El cierre los compara; la cuota se
  // calcula acá con ellos y con nada más (una sola fuente de verdad, spec §9.3).
  const { data: pago, error: ePago } = await sb.rpc('sueldo_entrada_pago', { p_acuerdo: acuerdoId });
  if (ePago) throw errorSueldo(ePago);
  const datosPago = pago as { contratoPago: ContratoPagoGuardado; cambiosFrecuencia: CambioFrecuenciaGuardado[] } | null;
  if (!datosPago?.contratoPago) {
    throw new SueldoRpcError('No pude leer el contrato para calcular la cuota del tramo.', 'DATO');
  }
  entrada.contratoPago = datosPago.contratoPago;
  entrada.cambiosFrecuencia = datosPago.cambiosFrecuencia ?? [];

  // La RPC manda `a.sueldo_pactado` (la cuota original del contrato). Con frecuencia flexible la
  // cuota del tramo puede ser otra —cambio de frecuencia—, ir prorrateada —último pago corto— o
  // sumar varios pagos —un rango que cubre más de uno—; se resuelve en el core y se reemplaza ACÁ,
  // en el servidor, antes del cálculo.
  if (cuotaFija !== undefined) {
    entrada.sueldoPactado = cuotaFija;
    entrada.cuotaFijada = true;
    return entrada;
  }
  entrada.sueldoPactado = cuotaConDatosDePago(entrada.contratoPago, entrada.cambiosFrecuencia, desde, hasta);
  return entrada;
}

/**
 * El cálculo para mirar en pantalla, sin guardar nada. Es lo que alimenta el preview en vivo.
 *
 * Devuelve también la entrada porque el administrador necesita ver de dónde salió cada número
 * —qué días, qué horas, qué ventas— antes de emitir un pago.
 */
export async function calcularPreview(
  acuerdoId: string,
  desde: string,
  hasta: string,
): Promise<{ entrada: EntradaConContexto; liquidacion: Liquidacion }> {
  const entrada = await entradaDeAcuerdo(acuerdoId, desde, hasta);
  return { entrada, liquidacion: liquidarPeriodo(entrada) };
}

/**
 * Guarda el borrador de UN TRAMO del acuerdo.
 *
 * **Recibe un id de acuerdo y el rango del tramo, nada más, a propósito.** La entrada la pide a la
 * RPC y el cálculo lo corre acá, en el servidor, con `liquidarPeriodo()`. Si esta función aceptara
 * la liquidación ya calculada, bastaría con manipular el formulario para escribir cualquier total
 * en un pago.
 *
 * Se guardan los tres snapshots (entrada, parámetros resueltos y resultado completo), no sólo el
 * total: el total es la suma de líneas ya redondeadas y no se llega a él de ninguna otra forma.
 */
export async function crearBorrador(
  acuerdoId: string,
  desde: string,
  hasta: string,
  cuotaFija?: number,
): Promise<string> {
  const entrada = await entradaDeAcuerdo(acuerdoId, desde, hasta, cuotaFija);
  const liquidacion = liquidarPeriodo(entrada);
  const parametros = resolverParametros(entrada.parametros);

  const sb = getServerClient();
  const { data, error } = await sb
    .from('sueldo_liquidaciones')
    .insert({
      acuerdo_id: entrada.acuerdoId,
      // Sale de la entrada, no del formulario: es la columna que decide la RLS, y la clave foránea
      // compuesta de la 0072 rechaza cualquier par (acuerdo, empleado) que no exista.
      empleado_id: entrada.empleadoId,
      periodo_desde: entrada.fechaInicio,
      periodo_hasta: entrada.fechaFin,
      entrada,
      parametros_usados: parametros,
      resultado: liquidacion,
      total: liquidacion.total,
      subtotal: liquidacion.subtotal,
      ingresos: liquidacion.ingresos,
      descuentos: liquidacion.descuentos,
      ajustes: liquidacion.ajustes,
      valor_por_hora: liquidacion.base.valorPorHora,
      motor_version: MOTOR_VERSION,
    })
    .select('id')
    .single();

  if (error) {
    // La restricción de exclusión `sueldo_liq_periodo_sin_solape` (migración 0093, liquidación
    // por tramos) reemplazó al índice único que dejaba UNA sola liquidación viva por acuerdo: ahora
    // varios tramos del mismo acuerdo conviven, y sólo se rechaza si sus períodos se PISAN. Se
    // comprueba por NOMBRE de la restricción, y este chequeo tiene que ir ANTES del `23P01`
    // genérico de `errorSueldo()` más abajo: ese otro es para `sueldo_acuerdos_sin_solape` —dos
    // ACUERDOS que se pisan—, un caso distinto que comparte el mismo código de Postgres. Si el
    // orden se invirtiera, un choque entre dos liquidaciones del mismo acuerdo mostraría el
    // mensaje de "ya tiene un contrato", que no es lo que pasó.
    //
    // Código 'ESTADO', no 'DATO': la pantalla (`liquidaciones/cliente.tsx`) muestra una ayuda extra
    // fija para `codigo === 'DATO'` ("Faltan días por declarar... Andá a Declarar asistencia") que
    // no tiene nada que ver con un solape de períodos — confundiría más de lo que ayuda. 'ESTADO'
    // es también el código que ya usaba el mensaje anterior para este mismo tipo de choque.
    if (/sueldo_liq_periodo_sin_solape/i.test(error.message ?? '')) {
      throw new SueldoRpcError(
        'El período que elegiste se superpone con otra liquidación de este mismo acuerdo. Elegí un rango que no se pise, o anulá la existente.',
        'ESTADO',
      );
    }
    throw errorSueldo(error);
  }
  return String((data as { id: string }).id);
}

/**
 * Congela el pago: escribe el desglose, sella los movimientos y las ventas consumidos, y recién
 * al final pasa a `cerrada`. Todo dentro de la RPC, en una transacción.
 *
 * Devuelve `DESACTUALIZADA` si la entrada guardada ya no es idéntica a la que se calcularía ahora
 * (migración 0111): un movimiento o una venta cargados, borrados o con otro monto, o una asistencia
 * corregida. No es un error del administrador: hay que recalcular el borrador y cerrar de nuevo. Sin esa comprobación, esa fila quedaría sellada sin haber entrado en el pago.
 */
export async function cerrarLiquidacion(id: string): Promise<void> {
  // Que la cuota guardada sea la que da el core con los datos de pago GUARDADOS (una fórmula que
  // cambió entre el cálculo y el cierre). Que esos datos sigan siendo los de la base —un cambio de
  // frecuencia o una cuota editada después de calcular— lo comprueba la RPC (0121) dentro de su
  // transacción y con el contrato bloqueado: acá no se lee la base, para no abrir una carrera.
  const liq = await obtenerLiquidacion(id);
  const e = liq?.entrada as EntradaConContexto | undefined;
  if (liq && liq.estado === 'borrador' && e?.contratoPago && !e.cuotaFijada) {
    const cuota = cuotaConDatosDePago(e.contratoPago, e.cambiosFrecuencia ?? [], liq.periodoDesde, liq.periodoHasta);
    if (cuota !== e.sueldoPactado) {
      throw new SueldoRpcError(
        'La cuota de este tramo se calculó con otra regla. Recalcula el borrador antes de cerrarlo.',
        'DESACTUALIZADA',
      );
    }
  }
  const sb = getServerClient();
  const { error } = await sb.rpc('sueldo_liquidacion_cerrar', { p_liquidacion: id });
  if (error) throw errorSueldo(error);
}

/**
 * El único camino para dejar sin efecto una liquidación cerrada. No la borra —el rastro queda— y
 * libera el sello de los movimientos y las ventas, para que la reemisión los vuelva a tomar.
 *
 * El motivo es obligatorio: sin él se pierde por qué se anuló un pago ya emitido.
 */
export async function anularLiquidacion(id: string, motivo: string): Promise<void> {
  if (motivo.trim().length === 0) {
    throw new SueldoRpcError('Hace falta el motivo de la anulación.', 'DATO');
  }
  const sb = getServerClient();
  const { error } = await sb.rpc('sueldo_liquidacion_anular', { p_liquidacion: id, p_motivo: motivo.trim() });
  if (error) throw errorSueldo(error);
}

/**
 * Lo que puede pasar al crear el borrador de reemplazo DESPUÉS de anular, dentro de
 * `corregirLiquidacion()`. Anular y crear son dos escrituras separadas, no una transacción: si la
 * primera corre y la segunda falla, la anulación queda firme igual — el trigger `sueldo_liq_inmutable`
 * (0072 §8.1) sólo deja pasar de 'cerrada' a 'anulada', nunca al revés, así que no hay forma de
 * deshacerla. El administrador tiene que enterarse de que el pago SÍ quedó anulado, no leer un error
 * genérico que lo deje adivinando si algo se guardó o no.
 */
export class CorreccionParcialError extends Error {
  /** Con qué motivo quedó anulada — para no volver a preguntarle algo que ya pasó. */
  readonly motivoAnulacion: string;
  readonly acuerdoId: string;
  readonly periodoDesde: string;
  readonly periodoHasta: string;

  constructor(
    motivoAnulacion: string,
    acuerdoId: string,
    periodoDesde: string,
    periodoHasta: string,
    causa: string,
  ) {
    super(
      `La liquidación se anuló con el motivo "${motivoAnulacion}", pero no se pudo crear el borrador ` +
        `de reemplazo: ${causa}`,
    );
    this.name = 'CorreccionParcialError';
    this.motivoAnulacion = motivoAnulacion;
    this.acuerdoId = acuerdoId;
    this.periodoDesde = periodoDesde;
    this.periodoHasta = periodoHasta;
  }
}

/**
 * «Corregir esta liquidación» (docs/superpowers/specs/2026-08-25-reunion-admin-hoja-de-ruta.md
 * §3.1, D-1). NO es un camino nuevo: es `anularLiquidacion()` seguido de `crearBorrador()` para el
 * MISMO acuerdo y el MISMO período de la liquidación que se corrige — nunca el rango que el
 * administrador tenga cargado en el selector de arriba, que puede estar mirando otra cosa. Por eso
 * el acuerdo y el período se leen de la propia fila en la base (`obtenerLiquidacion`); el único dato
 * que hace falta del cliente es el id y el motivo.
 *
 * El congelado no se toca: `anularLiquidacion()` es el único UPDATE que el trigger de la 0072
 * permite sobre una 'cerrada', y `crearBorrador()` es un INSERT nuevo, no una edición. Que el
 * borrador nuevo entre sin chocar con el anulado lo garantiza `sueldo_liq_periodo_sin_solape`
 * (0093): excluye `estado <> 'anulada'`, así que apenas la anulación corre, ese período vuelve a
 * estar libre para el mismo acuerdo.
 *
 * Las dos escrituras NO comparten transacción (son un RPC y un INSERT por separado). Si anular
 * corre y crear falla, esta función no intenta deshacer nada —no se puede: una 'anulada' no vuelve a
 * 'cerrada'— y en cambio lanza `CorreccionParcialError`, con el acuerdo y el período exactos para
 * que la pantalla se lo diga al administrador y le arme el camino de vuelta.
 *
 * El tercer parámetro (`colaboradores`) es un punto de inyección SÓLO para tests. `apps/erp-web` no
 * tiene un runner de tests unitarios (a diferencia de `packages/core`, que sí lo tiene wireado en
 * `tools/verificar-local.sh`), y las tres funciones de acá abajo hablan con Supabase: no se pueden
 * ejercitar sin una base real. Con este seam, `lib/__tests__/sueldos-repo.corregir.test.ts` prueba
 * el ORDEN (anular antes que crear) y que el período que recibe `crearBorrador` es el de la propia
 * liquidación leída de la base, sin depender de Supabase. Ningún llamador real pasa este parámetro:
 * los tres defaults son exactamente las funciones exportadas de este archivo.
 */
export async function corregirLiquidacion(
  id: string,
  motivo: string,
  colaboradores: {
    obtener?: typeof obtenerLiquidacion;
    anular?: typeof anularLiquidacion;
    crear?: typeof crearBorrador;
  } = {},
): Promise<{ nuevoBorradorId: string }> {
  const obtener = colaboradores.obtener ?? obtenerLiquidacion;
  const anular = colaboradores.anular ?? anularLiquidacion;
  const crear = colaboradores.crear ?? crearBorrador;

  const actual = await obtener(id);
  if (!actual) {
    throw new SueldoRpcError('No existe esa liquidación.', 'DATO');
  }
  if (actual.estado !== 'cerrada') {
    // Mismo texto que ya usa la RPC para este mismo corte (0073): sólo se corrige — como sólo se
    // anula — una liquidación cerrada. No es una regla nueva, es la misma dicha antes de intentarlo.
    throw new SueldoRpcError(`Esta liquidación está ${actual.estado}; sólo se corrige una cerrada.`, 'ESTADO');
  }

  // anularLiquidacion() valida el motivo (no vacío) antes de tocar la base, y su RPC corre en su
  // propia transacción: o queda 'anulada' entera —sellos liberados y el acuerdo vuelto a 'vigente'
  // si correspondía— o no cambia nada. No hay estado intermedio posible acá.
  await anular(id, motivo);

  // A PARTIR DE ACÁ LA ANULACIÓN YA CORRIÓ. Cualquier error de acá en más se envuelve en
  // CorreccionParcialError: nunca puede llegarle a la pantalla como un error suelto que sugiera que
  // no pasó nada.
  try {
    // Misma cuota con la que se pagó: corregir cambia datos, no la cuota.
    const nuevoBorradorId = await crear(
      actual.acuerdoId,
      actual.periodoDesde,
      actual.periodoHasta,
      actual.entrada?.sueldoPactado,
    );
    return { nuevoBorradorId };
  } catch (e) {
    const causa = e instanceof Error ? e.message : 'error desconocido';
    throw new CorreccionParcialError(
      motivo.trim(),
      actual.acuerdoId,
      actual.periodoDesde,
      actual.periodoHasta,
      causa,
    );
  }
}

/** Un borrador se puede descartar; una cerrada o una anulada no (trigger de la 0072). */
export async function eliminarBorrador(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('sueldo_liquidaciones').delete().eq('id', id);
  if (error) throw errorSueldo(error);
}

export type EstadoLiquidacion = 'borrador' | 'cerrada' | 'anulada';

export type LiquidacionResumen = {
  id: string;
  acuerdoId: string;
  empleadoId: string;
  empleadoNombre: string | null;
  periodoDesde: string;
  periodoHasta: string;
  estado: EstadoLiquidacion;
  total: number;
  ingresos: number | null;
  descuentos: number | null;
  motorVersion: string;
  cerradaEn: string | null;
  anuladaEn: string | null;
  anuladaMotivo: string | null;
  creadoEn: string;
};

export type LineaGuardada = {
  orden: number;
  grupo: 'ingreso' | 'descuento' | 'ajuste' | 'final';
  concepto: string;
  detalle: string;
  regla: string;
  monto: number;
};

/**
 * La liquidación completa tal como se emitió.
 *
 * `resultado` y `entrada` son los snapshots congelados: se leen de ahí y **no se recalculan**.
 * Recalcular al abrir mostraría un número distinto del que se pagó en cuanto alguien edite un
 * parámetro de `/configuracion` — que es justamente lo que el congelado existe para impedir.
 */
export type LiquidacionDetalle = LiquidacionResumen & {
  entrada: EntradaConContexto;
  parametrosUsados: ParametrosSueldo;
  resultado: Liquidacion;
  /** Vacío mientras es borrador: las líneas se escriben al cerrar. */
  lineas: LineaGuardada[];
};

type RowLiquidacion = {
  id: string;
  acuerdo_id: string;
  empleado_id: string;
  periodo_desde: string;
  periodo_hasta: string;
  estado: string;
  total: number | string;
  ingresos: number | string | null;
  descuentos: number | string | null;
  motor_version: string;
  cerrada_en: string | null;
  anulada_en: string | null;
  anulada_motivo: string | null;
  creado_en: string;
  entrada?: EntradaConContexto;
  parametros_usados?: ParametrosSueldo;
  resultado?: Liquidacion;
  sueldo_liquidacion_lineas?: RowLinea[] | null;
};

type RowLinea = {
  orden: number;
  grupo: string;
  concepto: string;
  detalle: string;
  regla: string;
  monto: number | string;
};

function aResumen(r: RowLiquidacion, nombre: string | null): LiquidacionResumen {
  return {
    id: r.id,
    acuerdoId: r.acuerdo_id,
    empleadoId: r.empleado_id,
    empleadoNombre: nombre,
    periodoDesde: (r.periodo_desde ?? '').slice(0, 10),
    periodoHasta: (r.periodo_hasta ?? '').slice(0, 10),
    estado: (r.estado as EstadoLiquidacion) ?? 'borrador',
    total: Number(r.total ?? 0),
    ingresos: r.ingresos == null ? null : Number(r.ingresos),
    descuentos: r.descuentos == null ? null : Number(r.descuentos),
    motorVersion: r.motor_version,
    cerradaEn: r.cerrada_en,
    anuladaEn: r.anulada_en,
    anuladaMotivo: r.anulada_motivo,
    creadoEn: r.creado_en,
  };
}

// Los tres jsonb pesan: la entrada lleva la asistencia día por día y el resultado lleva las líneas
// y las semanas. En la lista no se piden.
const SELECT_RESUMEN =
  'id, acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado, total, ingresos, descuentos, motor_version, cerrada_en, anulada_en, anulada_motivo, creado_en';

export async function listarLiquidaciones(f: {
  empleadoId?: string;
  acuerdoId?: string;
  estado?: EstadoLiquidacion;
} = {}): Promise<LiquidacionResumen[]> {
  const sb = getServerClient();
  let q = sb.from('sueldo_liquidaciones').select(SELECT_RESUMEN).order('periodo_desde', { ascending: false });
  if (f.empleadoId) q = q.eq('empleado_id', f.empleadoId);
  if (f.acuerdoId) q = q.eq('acuerdo_id', f.acuerdoId);
  if (f.estado) q = q.eq('estado', f.estado);

  const { data, error } = await q;
  if (error) throw errorSueldo(error);

  const rows = (data as RowLiquidacion[]) ?? [];
  const nombre = await mapaNombres();
  return rows.map((r) => aResumen(r, nombre.get(r.empleado_id) ?? null));
}

export async function obtenerLiquidacion(id: string): Promise<LiquidacionDetalle | null> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('sueldo_liquidaciones')
    .select('*, sueldo_liquidacion_lineas(orden, grupo, concepto, detalle, regla, monto)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw errorSueldo(error);
  if (!data) return null;

  const r = data as RowLiquidacion;
  const nombre = await mapaNombres();
  const lineas = (r.sueldo_liquidacion_lineas ?? [])
    .map((l) => ({
      orden: l.orden,
      grupo: l.grupo as LineaGuardada['grupo'],
      concepto: l.concepto,
      detalle: l.detalle,
      regla: l.regla,
      monto: Number(l.monto ?? 0),
    }))
    .sort((a, b) => a.orden - b.orden);

  return {
    ...aResumen(r, nombre.get(r.empleado_id) ?? null),
    entrada: r.entrada as EntradaConContexto,
    parametrosUsados: r.parametros_usados as ParametrosSueldo,
    resultado: r.resultado as Liquidacion,
    lineas,
  };
}

// ── Pagos de liquidación (migración 0080) ──────────────────────────────────────────────────
//
// «La liquidación es el pago» (spec §2.6): sobre una liquidación `cerrada` se acumulan abonos
// hasta saldarla. El total es el de `sueldo_liquidaciones.total`, ya congelado al cerrar — acá
// sólo se lee y se escribe la lista de abonos contra ese total. La regla de negocio (no pagar de
// más, no pagar un borrador, no editar ni borrar un pago) vive en la migración 0080: esta capa
// wrappea la tabla y las dos RPC, no reimplementa nada de eso.
//
// DEGRADACIÓN ELEGANTE. La 0080 puede no estar aplicada todavía en la base contra la que corre
// esta pantalla (la aplica el controlador después de la verificación adversarial de la Tarea 10).
// Mismo patrón que ValoresNoMigradoError/SolicitudesNoMigradoError: la tabla o la función
// faltante se traducen a LiquidacionPagosNoMigradoError, y la pantalla la atrapa para avisar en
// vez de reventar con un 500.

export class LiquidacionPagosNoMigradoError extends Error {
  constructor() {
    super('Falta aplicar la migración 0080 (tabla sueldo_liquidacion_pagos y sus RPC).');
    this.name = 'LiquidacionPagosNoMigradoError';
  }
}

function esTablaOFuncionInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST205' ||
    error.code === 'PGRST202' ||
    error.code === '42P01' ||
    error.code === '42883' ||
    /could not find the table/i.test(msg) ||
    /could not find the function/i.test(msg)
  );
}

export type PagoLiquidacion = {
  id: string;
  liquidacionId: string;
  fecha: string;
  monto: number;
  metodo: string;
  nota: string | null;
  /** Nombre de quién lo cargó, resuelto vía el directorio. `null` si la cuenta ya no existe. */
  registradoPor: string | null;
  anulado: boolean;
  anuladoMotivo: string | null;
  anuladoEn: string | null;
  creadoEn: string;
};

type RowPagoLiquidacion = {
  id: string;
  liquidacion_id: string;
  fecha: string;
  monto: number | string;
  metodo: string;
  nota: string | null;
  registrado_por: string | null;
  anulado: boolean;
  anulado_motivo: string | null;
  anulado_en: string | null;
  creado_en: string;
};

function aPagoLiquidacion(r: RowPagoLiquidacion, nombre: string | null): PagoLiquidacion {
  return {
    id: r.id,
    liquidacionId: r.liquidacion_id,
    fecha: (r.fecha ?? '').slice(0, 10),
    monto: Number(r.monto ?? 0),
    metodo: r.metodo,
    nota: r.nota,
    registradoPor: nombre,
    anulado: Boolean(r.anulado),
    anuladoMotivo: r.anulado_motivo,
    anuladoEn: r.anulado_en,
    creadoEn: r.creado_en,
  };
}

/**
 * Los abonos de una liquidación, del más reciente al más viejo. La RLS de la 0080 ya dice quién
 * ve qué (aislamiento 1): acá no se filtra por empleado, sólo por liquidación — es un filtro de
 * pantalla, no de seguridad, igual que el resto de este archivo (ver nota 1 de la cabecera).
 */
export async function listarPagosLiquidacion(liquidacionId: string): Promise<PagoLiquidacion[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('sueldo_liquidacion_pagos')
    .select('*')
    .eq('liquidacion_id', liquidacionId)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false });
  if (error) {
    if (esTablaOFuncionInexistente(error)) throw new LiquidacionPagosNoMigradoError();
    throw errorSueldo(error);
  }

  const rows = (data as RowPagoLiquidacion[]) ?? [];
  const nombre = await mapaNombres();
  return rows.map((r) => aPagoLiquidacion(r, r.registrado_por ? (nombre.get(r.registrado_por) ?? null) : null));
}

export type PagoResumen = { liquidacionId: string; monto: number };

/**
 * Lo pagado (no anulado) de un LOTE de liquidaciones, en una sola consulta y sin resolver
 * nombres — para `estadoDelPeriodo()` (colaboradores-repo.ts), que cruza hasta veinte personas
 * de un saque y no puede permitirse una consulta de `listarPagosLiquidacion()` por persona (esa
 * además resuelve el directorio, que acá no hace falta). Mismo criterio de degradación que el
 * resto de este bloque: tabla o función inexistente (0080 sin aplicar) se traduce a
 * `LiquidacionPagosNoMigradoError`, nunca a un 500.
 */
export async function listarPagosDeLiquidaciones(liquidacionIds: string[]): Promise<PagoResumen[]> {
  if (liquidacionIds.length === 0) return [];
  const sb = getServerClient();
  const { data, error } = await sb
    .from('sueldo_liquidacion_pagos')
    .select('liquidacion_id, monto')
    .in('liquidacion_id', liquidacionIds)
    .eq('anulado', false);
  if (error) {
    if (esTablaOFuncionInexistente(error)) throw new LiquidacionPagosNoMigradoError();
    throw errorSueldo(error);
  }
  return ((data as { liquidacion_id: string; monto: number | string }[]) ?? []).map((r) => ({
    liquidacionId: r.liquidacion_id,
    monto: Number(r.monto ?? 0),
  }));
}

export type PagoLiquidacionInput = {
  liquidacionId: string;
  fecha: string;
  monto: number;
  metodo: string;
  nota?: string;
};

/**
 * Registra un abono. Los nombres de parámetro son los EXACTOS de `sueldo_liquidacion_pagar(...)`
 * en la 0080 — cambiarlos acá sin cambiar la migración rompe la llamada en silencio (PostgREST
 * no avisa de un parámetro de más o de menos con un mensaje claro).
 *
 * Anti-sobrepago, borrador pagable, liquidación anulada: todo lo valida la RPC con el `select …
 * for update` de la migración. Acá no se repite ninguna de esas comprobaciones.
 */
export async function pagarLiquidacion(p: PagoLiquidacionInput): Promise<string> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('sueldo_liquidacion_pagar', {
    p_liquidacion_id: p.liquidacionId,
    p_fecha: p.fecha,
    p_monto: p.monto,
    p_metodo: p.metodo,
    p_nota: p.nota?.trim() || null,
  });
  if (error) {
    if (esTablaOFuncionInexistente(error)) throw new LiquidacionPagosNoMigradoError();
    throw errorSueldo(error);
  }
  return String(data as string);
}

/** El único camino para deshacer un abono. El motivo es obligatorio, como en el resto del módulo. */
export async function anularPagoLiquidacion(pagoId: string, motivo: string): Promise<void> {
  if (motivo.trim().length === 0) {
    throw new SueldoRpcError('Hace falta el motivo de la anulación.', 'DATO');
  }
  const sb = getServerClient();
  const { error } = await sb.rpc('sueldo_liquidacion_pago_anular', {
    p_pago_id: pagoId,
    p_motivo: motivo.trim(),
  });
  if (error) {
    if (esTablaOFuncionInexistente(error)) throw new LiquidacionPagosNoMigradoError();
    throw errorSueldo(error);
  }
}

// Mismos cinco valores que siembra la 0080 §7 en `config.sueldo_metodos_pago` — la spec los marca
// como PROPUESTA sin confirmar con el dueño todavía (§6), así que este default es una copia
// literal del seed, no una decisión nueva tomada acá.
const METODOS_PAGO_DEFAULT = ['Efectivo', 'Yape', 'Plin', 'Transferencia', 'Otro'];

/** El catálogo de métodos de pago de liquidación, editable desde /configuracion (no-negociable 5). */
export async function leerMetodosPago(): Promise<string[]> {
  const config = await leerConfigMap();
  const crudo = config['sueldo_metodos_pago'];
  if (!crudo) return METODOS_PAGO_DEFAULT;
  const metodos = crudo
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return metodos.length > 0 ? metodos : METODOS_PAGO_DEFAULT;
}
