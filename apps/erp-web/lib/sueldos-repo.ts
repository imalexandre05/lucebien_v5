import {
  MOTOR_VERSION,
  liquidarPeriodo,
  resolverParametros,
  type EntradaLiquidacion,
  type Liquidacion,
  type ParametrosSueldo,
} from '@scilb/core';
import { mapaNombres } from './directorio';
import { getServerClient } from './supabase/server';

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
 *    guarda lo calcula el servidor: `crearBorrador()` recibe un id de acuerdo y nada más, pide la
 *    entrada a la RPC y vuelve a correr `liquidarPeriodo()` acá. Ningún total viaja desde el
 *    formulario. Es el mismo patrón que `/evaluaciones`.
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
 */
export type CodigoSueldo =
  | 'PERMISO'
  | 'DATO'
  | 'ESTADO'
  | 'DESACTUALIZADA'
  | 'CONGELADA'
  | 'CONFIG';

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
];

function errorSueldo(error: { message?: string } | null): SueldoRpcError {
  const msg = error?.message ?? 'Error desconocido';
  const m = msg.match(/^([A-Z_]+):([\s\S]+)$/);
  if (m && CODIGOS.includes(m[1])) return new SueldoRpcError(m[2], m[1] as CodigoSueldo);
  return new SueldoRpcError(msg);
}

// ── Acuerdos (contratos) ────────────────────────────────────────────────────────────────────

export type EstadoAcuerdo = 'borrador' | 'vigente' | 'liquidado';
export type ModalidadAcuerdo = 'mensual' | 'semanal';

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
  sueldoPactado: number;
  escala: number | null;
  almuerzoHabilitado: boolean;
  /** Overrides de esta persona sobre los parámetros globales. `{}` = usa todos los globales. */
  parametros: Partial<ParametrosSueldo>;
  estado: EstadoAcuerdo;
  creadoEn: string;
  turnos: TurnoAcuerdo[];
};

type RowAcuerdo = {
  id: string;
  empleado_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  modalidad: string;
  sueldo_pactado: number | string;
  escala: number | null;
  almuerzo_habilitado: boolean;
  parametros: Partial<ParametrosSueldo> | null;
  estado: string;
  creado_en: string;
  sueldo_acuerdo_turnos?: RowTurno[] | null;
};

type RowTurno = {
  id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  lugar: string | null;
};

const SELECT_ACUERDO = '*, sueldo_acuerdo_turnos(id, dia_semana, hora_inicio, hora_fin, lugar)';

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
    sueldoPactado: Number(r.sueldo_pactado ?? 0),
    escala: r.escala,
    almuerzoHabilitado: Boolean(r.almuerzo_habilitado),
    parametros: r.parametros ?? {},
    estado: (r.estado as EstadoAcuerdo) ?? 'borrador',
    creadoEn: r.creado_en,
    turnos,
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

// ── Movimientos: adelantos, descuentos, bonos, capacitaciones, almuerzos ─────────────────────

export type TipoMovimiento = 'adelanto' | 'reporte' | 'bono_extra' | 'capacitacion' | 'almuerzo_entregado';

/** Los dos tipos que se cargan como CONTEO. El resto son plata. Espeja `sueldo_mov_unidad_chk`. */
export const TIPOS_CONTEO: readonly TipoMovimiento[] = ['capacitacion', 'almuerzo_entregado'];

export const esConteo = (tipo: TipoMovimiento): boolean => TIPOS_CONTEO.includes(tipo);

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
}): Promise<MovimientoSueldo[]> {
  const sb = getServerClient();
  let q = sb.from('sueldo_movimientos').select('*').order('fecha', { ascending: false });
  if (f.empleadoId) q = q.eq('empleado_id', f.empleadoId);
  if (f.desde) q = q.gte('fecha', f.desde);
  if (f.hasta) q = q.lte('fecha', f.hasta);
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
 */
export async function crearMovimiento(p: MovimientoInput, creadoPor: string): Promise<string> {
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
};

/**
 * Arma la entrada del periodo desde la base. **No escribe nada.**
 *
 * Corta con `DATO` nombrando las fechas si algún día contratado quedó sin declarar. Ese corte es
 * la razón de ser de la columna `condicion`: un día sin cargar no es una falta, y confundirlos
 * cuesta dos días de sueldo por día.
 */
export async function entradaDeAcuerdo(acuerdoId: string): Promise<EntradaConContexto> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('sueldo_entrada', { p_acuerdo: acuerdoId });
  if (error) throw errorSueldo(error);
  return data as EntradaConContexto;
}

/**
 * El cálculo para mirar en pantalla, sin guardar nada. Es lo que alimenta el preview en vivo.
 *
 * Devuelve también la entrada porque el administrador necesita ver de dónde salió cada número
 * —qué días, qué horas, qué ventas— antes de emitir un pago.
 */
export async function calcularPreview(
  acuerdoId: string,
): Promise<{ entrada: EntradaConContexto; liquidacion: Liquidacion }> {
  const entrada = await entradaDeAcuerdo(acuerdoId);
  return { entrada, liquidacion: liquidarPeriodo(entrada) };
}

/**
 * Guarda el borrador del periodo.
 *
 * **Recibe un id y nada más, a propósito.** La entrada la pide a la RPC y el cálculo lo corre acá,
 * en el servidor, con `liquidarPeriodo()`. Si esta función aceptara la liquidación ya calculada,
 * bastaría con manipular el formulario para escribir cualquier total en un pago.
 *
 * Se guardan los tres snapshots (entrada, parámetros resueltos y resultado completo), no sólo el
 * total: el total es la suma de líneas ya redondeadas y no se llega a él de ninguna otra forma.
 */
export async function crearBorrador(acuerdoId: string): Promise<string> {
  const entrada = await entradaDeAcuerdo(acuerdoId);
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
    // El índice único parcial deja UNA liquidación no anulada por acuerdo. El mensaje de Postgres
    // ("duplicate key value violates unique constraint") no le dice nada a nadie.
    if (/uq_sueldo_liq_acuerdo_vigente|duplicate key/i.test(error.message ?? '')) {
      throw new SueldoRpcError(
        'Este acuerdo ya tiene una liquidación. Para rehacerla hay que anular la anterior, con motivo.',
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
 * Devuelve `DESACTUALIZADA` si entre el cálculo y el cierre se cargó un adelanto, una venta, un
 * almuerzo o una capacitación. No es un error del administrador: hay que volver a calcular y
 * cerrar de nuevo. Sin esa comprobación, esa fila quedaría sellada sin haber entrado en el pago.
 */
export async function cerrarLiquidacion(id: string): Promise<void> {
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
