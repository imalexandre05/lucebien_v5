import { getServerClient } from './supabase/server';
import { mapaNombres } from './directorio';
import { MAX_DIAS_RANGO, diasDelPeriodo } from './periodo';

export type Asistencia = {
  id: string;
  empleadoId: string;
  empleadoNombre: string | null;
  fecha: string;
  turno: string;
  horaEntrada: string | null;
  horaSalida: string | null;
  minutosTardanza: number;
  fuente: string;
  /** 'sin_dato' | 'trabajado' | 'falta'. Decide si el día entra en la liquidación. */
  condicion: string;
  obs: string | null;
  /**
   * true cuando la hora NO salió de una marca: la propuso el sistema con el horario contratado
   * porque faltó la marca real (migración 0097, spec asistencias/2026-08-25-huellero-decide-
   * por-horario-design.md §3 C-3). La pantalla la tiene que mostrar distinta de una hora real.
   */
  entradaEstimada: boolean;
  salidaEstimada: boolean;
};

type Row = {
  id: string;
  empleado_id: string;
  fecha: string;
  turno: string;
  hora_entrada: string | null;
  hora_salida: string | null;
  minutos_tardanza: number | null;
  fuente: string;
  condicion: string | null;
  obs: string | null;
  entrada_estimada: boolean | null;
  salida_estimada: boolean | null;
};

/**
 * Las asistencias de un rango de fechas (ambos extremos incluidos), las más recientes primero.
 *
 * Antes traía las últimas 300 filas sin rango: con 18 personas eso no llegaba a un mes, y un mes
 * anterior no se podía ver aunque se eligiera el día. Ahora pagina de a 1000 —el tope de filas de
 * PostgREST— hasta traer el rango entero. La RLS sigue decidiendo qué filas se ven.
 */
export async function listarAsistencias(desde: string, hasta: string): Promise<Asistencia[]> {
  // Defensa para futuros llamadores: la pantalla ya recorta el rango antes de llegar acá.
  if (diasDelPeriodo({ desde, hasta }) > MAX_DIAS_RANGO) {
    throw new Error(`El rango pasa de ${MAX_DIAS_RANGO} días; recórtalo antes de consultar.`);
  }
  const sb = getServerClient();
  const PAGINA = 1000;
  const rows: Row[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await sb
      .from('asistencias')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('id', { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data as Row[]) ?? [];
    rows.push(...pagina);
    if (pagina.length < PAGINA) break;
  }

  const nombre = await mapaNombres();

  return rows.map((r) => ({
    id: r.id,
    empleadoId: r.empleado_id,
    empleadoNombre: nombre.get(r.empleado_id) ?? null,
    fecha: (r.fecha ?? '').slice(0, 10),
    turno: r.turno,
    horaEntrada: r.hora_entrada,
    horaSalida: r.hora_salida,
    minutosTardanza: Number(r.minutos_tardanza ?? 0),
    fuente: r.fuente,
    condicion: r.condicion ?? 'sin_dato',
    obs: r.obs,
    entradaEstimada: Boolean(r.entrada_estimada),
    salidaEstimada: Boolean(r.salida_estimada),
  }));
}

export async function crearAsistencia(p: {
  empleadoId: string;
  fecha: string;
  turno: string;
  horaEntrada: string | null;
  horaSalida: string | null;
  minutosTardanza: number;
  obs: string;
}): Promise<void> {
  const sb = getServerClient();

  // OJO: esto NO declara la condición del día, y por lo tanto no lo hace liquidable. Para eso
  // está `declararDia()` más abajo, que además valida y no pisa `fuente`.
  //
  // No se agrega `condicion` acá a propósito: es un `upsert`, así que escribiría la columna en
  // filas que ya existen y podría revertir una falta declarada por una persona sin que quien
  // usa el formulario se entere. Registrar y declarar son dos actos distintos.
  //
  // Y tampoco puede ser un `upsert` a secas. Escribía `fuente='manual'` y `obs` sobre la fila
  // que ya existía, y con eso borraba el rastro de qué había puesto el huellero: al corregir
  // después un mapeo, la reversión no reconocía la fila y el día quedaba cobrado por dos
  // personas. Ahora se busca primero y, si existe, se actualizan sólo las horas — igual que
  // hace `declararDia`.
  const { data: existente, error: eBuscar } = await sb
    .from('asistencias')
    .select('id')
    .eq('empleado_id', p.empleadoId)
    .eq('fecha', p.fecha)
    .eq('turno', p.turno)
    .maybeSingle();
  if (eBuscar) throw new Error(eBuscar.message);

  if (existente) {
    // Las horas pasan a ser de quien las escribió acá: se bajan las banderas del huellero para
    // que la reversión no se las lleve, y también `*_estimada` — una hora que acaba de escribir
    // una persona no es una hora que el sistema propuso (migración 0097, spec asistencias/2026-
    // 08-25-huellero-decide-por-horario-design.md §3 C-3: "el administrador la pisa con la hora
    // real cuando la sepa, y la bandera vuelve a false — mismo lugar, misma idea").
    const { error } = await sb
      .from('asistencias')
      .update({
        hora_entrada: p.horaEntrada || null,
        hora_salida: p.horaSalida || null,
        minutos_tardanza: p.minutosTardanza,
        ...(p.horaEntrada ? { huellero_puso_entrada: false, entrada_estimada: false } : {}),
        ...(p.horaSalida ? { huellero_puso_salida: false, salida_estimada: false } : {}),
        ...(p.obs ? { obs: p.obs } : {}),
      })
      .eq('id', (existente as { id: string }).id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await sb.from('asistencias').insert({
    empleado_id: p.empleadoId,
    fecha: p.fecha,
    turno: p.turno,
    hora_entrada: p.horaEntrada || null,
    hora_salida: p.horaSalida || null,
    minutos_tardanza: p.minutosTardanza,
    fuente: 'manual',
    obs: p.obs || null,
  });
  if (error) throw new Error(error.message);
}

export async function eliminarAsistencia(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('asistencias').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Declaración de la condición del día (migración 0072, paso 6 de la spec de sueldos)
//
// EL PROBLEMA QUE RESUELVE. Antes de la 0072, un día sin fila y un día que la persona faltó eran
// lo mismo: nada. La liquidación no puede distinguirlos, y confundirlos cuesta dos días de sueldo
// por día. Por eso ahora una falta se DECLARA, y un día que nadie cargó se queda en 'sin_dato' y
// **corta la liquidación nombrando la fecha** (`sueldo_entrada`).
//
// Esta parte del repo existe para que esa declaración tenga dónde hacerse.
// ═════════════════════════════════════════════════════════════════════════════════════════════

export type CondicionDia = 'sin_dato' | 'trabajado' | 'falta';

/**
 * El turno con el que se declara un día completo. `'C'` ya significa «Día completo» en
 * `TURNO_LABEL` del core y en la pantalla de asistencias, así que no se inventa vocabulario.
 *
 * Que existan además filas `'M'` o `'T'` del mismo día no rompe nada, pero desde C-01 significan
 * otra cosa: `sueldo_entrada` agrupa por fecha y emite **una fila = un tramo continuo**, y el
 * motor los suma descontando las pausas (RN-05). Antes las colapsaba con `min`/`max` y el hueco
 * del medio se pagaba. Si CUALQUIER fila del día dice `'falta'`, el día entero se cobra como falta.
 *
 * **Lo que esta pantalla todavía no hace:** declarar un día con pausa. Escribe una sola fila por
 * día, así que un día cargado a mano es siempre un tramo único. Quien puede producir varios tramos
 * hoy es el huellero, emparejando marcas. Anotado en docs/pendientes-negocio.md.
 */
export const TURNO_DIA_COMPLETO = 'C';

export type AsistenciaDia = {
  id: string;
  fecha: string;
  turno: string;
  condicion: CondicionDia;
  horaEntrada: string | null;
  horaSalida: string | null;
  tardanzaJustificada: boolean;
  faltaJustificada: boolean;
  motivoJustificacion: string | null;
  fuente: string;
  /** Ídem `Asistencia.entradaEstimada`/`salidaEstimada`: la puso el sistema, no una marca. */
  entradaEstimada: boolean;
  salidaEstimada: boolean;
  /** El administrador ya miró este día (0165). `null` = nadie lo ha revisado, o el dato cambió después. */
  revisadaEn: string | null;
};

type RowDia = Row & {
  condicion: string;
  tardanza_justificada: boolean;
  falta_justificada: boolean;
  motivo_justificacion: string | null;
  revisada_en: string | null;
};

// Postgres devuelve `time` como 'HH:MM:SS'; el formulario y el motor quieren 'HH:MM'.
const hhmm = (t: string | null): string | null => (t == null ? null : t.slice(0, 5));

/**
 * Todas las filas de asistencia de una persona en un periodo, del día más viejo al más nuevo.
 *
 * Devuelve **todas** las filas, no una por día: puede haber una del turno M creada por el envío de
 * un reporte y otra declarada a mano. La pantalla las agrupa; el motor también.
 */
export async function listarAsistenciasPeriodo(
  empleadoId: string,
  desde: string,
  hasta: string,
): Promise<AsistenciaDia[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('asistencias')
    .select(
      'id, empleado_id, fecha, turno, hora_entrada, hora_salida, minutos_tardanza, fuente, obs, condicion, tardanza_justificada, falta_justificada, motivo_justificacion, entrada_estimada, salida_estimada, revisada_en',
    )
    .eq('empleado_id', empleadoId)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: true })
    .order('turno', { ascending: true });
  if (error) throw new Error(error.message);

  return ((data as RowDia[]) ?? []).map((r) => ({
    id: r.id,
    fecha: (r.fecha ?? '').slice(0, 10),
    turno: r.turno,
    condicion: (r.condicion as CondicionDia) ?? 'sin_dato',
    horaEntrada: hhmm(r.hora_entrada),
    horaSalida: hhmm(r.hora_salida),
    tardanzaJustificada: Boolean(r.tardanza_justificada),
    faltaJustificada: Boolean(r.falta_justificada),
    motivoJustificacion: r.motivo_justificacion,
    fuente: r.fuente,
    entradaEstimada: Boolean(r.entrada_estimada),
    salidaEstimada: Boolean(r.salida_estimada),
    revisadaEn: r.revisada_en ?? null,
  }));
}

/**
 * Marca como revisados los días dados de una persona (0165). No cambia ningún dato ni ningún pago:
 * sólo deja de listar el día en «Por revisar». Si después cambia una hora o la condición, la base
 * borra la marca sola y el día vuelve a aparecer.
 */
export async function marcarRevisados(empleadoId: string, fechas: string[], adminId: string): Promise<number> {
  const unicas = [...new Set(fechas)];
  if (unicas.length === 0) return 0;
  const sb = getServerClient();
  const { data, error } = await sb
    .from('asistencias')
    .update({ revisada_en: new Date().toISOString(), revisada_por: adminId })
    .eq('empleado_id', empleadoId)
    .in('fecha', unicas)
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

export type DeclaracionDia = {
  empleadoId: string;
  fecha: string;
  /** Por defecto `'C'`. Se pasa otro sólo para corregir una fila que ya existe con turno propio. */
  turno?: string;
  condicion: CondicionDia;
  horaEntrada: string | null;
  horaSalida: string | null;
  tardanzaJustificada: boolean;
  faltaJustificada: boolean;
  motivoJustificacion: string | null;
};

/**
 * Declara qué pasó ese día.
 *
 * **No usa `upsert`, y no es por gusto.** Un `upsert` escribe todas las columnas que se le pasan,
 * así que en una fila que ya existía —creada por el envío de un reporte, o mañana por el huellero—
 * pisaría `fuente` y borraría de dónde salió el dato. Acá se busca primero: si la fila existe se
 * actualizan **sólo** las columnas de la declaración, y `fuente` queda como estaba.
 *
 * La restricción `asistencias_trabajado_chk` de la 0073 exige que un día `'trabajado'` tenga las
 * dos horas. Se comprueba antes para dar un mensaje que se entienda, no un error de constraint.
 */
export async function declararDia(d: DeclaracionDia): Promise<void> {
  if (d.condicion === 'trabajado' && (!d.horaEntrada || !d.horaSalida)) {
    throw new Error(
      `${d.fecha}: un día trabajado necesita hora de entrada y de salida. ` +
        'Si la persona no vino, declaralo como falta; si todavía no se sabe, dejalo sin dato.',
    );
  }
  if (d.condicion === 'falta' && (d.horaEntrada || d.horaSalida)) {
    throw new Error(`${d.fecha}: una falta no lleva horas. Quitá las horas o cambiá la condición.`);
  }

  const sb = getServerClient();

  // Las horas que se declaran acá las escribió una persona, así que dejan de ser de la máquina.
  //
  // POR QUÉ HACE FALTA DECIRLO. `huellero_puso_entrada` / `huellero_puso_salida` no son un dato
  // de auditoría: mandan. La derivación recalcula exactamente las horas cuyo sello está en `true`
  // (0079_huellero_emparejado_fix.sql:270-273) y la reversión de un mapeo anula exactamente ésas
  // (0075:876-877). Sin bajar el sello, la corrección se escribía bien y el siguiente lote del
  // colector la volvía a pisar con la hora de la máquina, sin un solo error a la vista — y el
  // 98,8 % de las filas de `asistencias` viene del huellero. `crearAsistencia()` ya lo hacía;
  // esta puerta, que es la principal, no.
  //
  // Sólo cuando hay hora: el sello protege una hora, y sobre una hora en `null` no protege nada
  // (la derivación la rellena igual por el `coalesce` de 0079:270-273). En la rama de `insert`
  // este mismo objeto alcanza: si no hay hora, la columna toma su `default false`.
  //
  // Lo mismo con `entrada_estimada`/`salida_estimada` (migración 0097): una hora que acaba de
  // escribir el administrador no es una hora que el sistema propuso con el horario contratado.
  // Sin bajar la bandera acá, una hora estimada corregida a mano seguiría mostrándose como
  // estimada en /asistencias y en /sueldos/asistencia hasta que el huellero volviera a derivar
  // ese día (spec asistencias/2026-08-25-huellero-decide-por-horario-design.md §3 C-3).
  const declaracion = {
    condicion: d.condicion,
    hora_entrada: d.horaEntrada || null,
    hora_salida: d.horaSalida || null,
    tardanza_justificada: d.tardanzaJustificada,
    falta_justificada: d.faltaJustificada,
    motivo_justificacion: d.motivoJustificacion?.trim() || null,
    ...(d.horaEntrada ? { huellero_puso_entrada: false, entrada_estimada: false } : {}),
    ...(d.horaSalida ? { huellero_puso_salida: false, salida_estimada: false } : {}),
  };

  // QUÉ FILA SE DECLARA, Y POR QUÉ NO SIEMPRE UNA NUEVA.
  //
  // Declarar un día ponía la fila en el turno «día completo» salvo que quien llamara dijera otro.
  // Eso alcanzaba cuando la tabla tenía una fila por día; desde que el huellero escribe una fila
  // por TRAMO (migración 0079) y el envío de un reporte deja la suya con el turno de ese turno, un
  // día suele llegar acá con una fila ya puesta. Insertar otra dejaba el día con dos, y desde la
  // 0085 un día con una fila declarada y otra en `sin_dato` bloquea la liquidación entera: el
  // administrador declaraba el día y el periodo quedaba trabado, sin entender por qué.
  //
  // Con una sola fila en el día, se declara ESA, sea cual sea su turno. Con varias —el día partido
  // en tramos— no hay una respuesta única y el sistema no la inventa: se explica y se pide
  // declarar tramo por tramo, que es lo que la pantalla ya permite pasando `turno`.
  const { data: delDia, error: eBuscar } = await sb
    .from('asistencias')
    .select('id, turno')
    .eq('empleado_id', d.empleadoId)
    .eq('fecha', d.fecha);
  if (eBuscar) throw new Error(eBuscar.message);

  const filas = (delDia ?? []) as { id: string; turno: string }[];
  const explicito = d.turno ?? null;
  const existente = explicito
    ? (filas.find((f) => f.turno === explicito) ?? null)
    : filas.length === 1
      ? filas[0]
      : null;

  if (!explicito && filas.length > 1) {
    const turnos = filas.map((f) => f.turno).join(', ');
    throw new Error(
      `${d.fecha}: el día está partido en varios tramos (${turnos}). Declara cada uno por separado ` +
        'para no perder las horas de ninguno.',
    );
  }

  const turno = explicito ?? TURNO_DIA_COMPLETO;

  if (existente) {
    const { error } = await sb.from('asistencias').update(declaracion).eq('id', (existente as { id: string }).id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await sb.from('asistencias').insert({
    empleado_id: d.empleadoId,
    fecha: d.fecha,
    turno,
    minutos_tardanza: 0, // La tardanza la calcula el motor contra el horario contratado, no esta columna.
    fuente: 'manual',
    ...declaracion,
  });
  if (error) throw new Error(error.message);
}
