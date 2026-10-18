import type { PrendaPasada } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { diaPeruDe } from './fechas';

type Row = {
  id: string;
  activo_id: string | null;
  pedido_id: string | null;
  codigo: string;
  tipo: string | null;
  color: string | null;
  talla: string | null;
  etapa: PrendaPasada['etapa'];
  tipo_lavado: string | null;
  sede_origen_cod: string | null;
  lavador_id: string | null;
  planchador_id: string | null;
  necesita_compostura: boolean | null;
  obs_refaccion: string | null;
  obs_compostura: string | null;
  obs_calidad: string | null;
  obs_general: string | null;
  aprobada: boolean | null;
  envio_id: string | null;
  lista_lavanderia_id: string | null;
  dividida: boolean | null;
  dividida_en: string | null;
  fecha_ingreso: string;
  fecha_actualizado: string | null;
};

// Sólo se manda `p_operador` cuando hay token. PostgREST resuelve la función por los NOMBRES de los
// argumentos: mandar la clave siempre (aunque valga null) rompe todo el pipeline (PGRST202) si la
// app se despliega antes de aplicar la migración 0112. Sin la clave, la llamada es la de siempre.
const conOperador = (operador: string | null) => (operador ? { p_operador: operador } : {});

const fromRow = (r: Row): PrendaPasada => ({
  id: r.id,
  activoId: r.activo_id,
  pedidoId: r.pedido_id,
  codigo: r.codigo,
  tipo: r.tipo ?? '',
  color: r.color,
  talla: r.talla,
  etapa: r.etapa,
  tipoLavado: r.tipo_lavado,
  sedeOrigenCod: r.sede_origen_cod ?? '',
  lavadorId: r.lavador_id,
  planchadorId: r.planchador_id,
  necesitaCompostura: Boolean(r.necesita_compostura),
  obsRefaccion: r.obs_refaccion,
  obsCompostura: r.obs_compostura,
  obsCalidad: r.obs_calidad,
  obsGeneral: r.obs_general,
  aprobada: Boolean(r.aprobada),
  envioId: r.envio_id,
  listaLavanderiaId: r.lista_lavanderia_id,
  dividida: Boolean(r.dividida),
  divididaEn: r.dividida_en,
  fechaIngreso: r.fecha_ingreso ? diaPeruDe(r.fecha_ingreso) : '',
  fechaActualizado: r.fecha_actualizado,
});

// `soloActivas`: el tablero no necesita las ya recibidas; sin esto, con el historial creciendo el
// tope de 1000 filas de PostgREST dejaba fuera prendas antiguas que siguen en proceso.
export async function listarPasadas(opts: { soloActivas?: boolean } = {}): Promise<PrendaPasada[]> {
  const sb = getServerClient();
  let q = sb.from('prenda_pasada').select('*');
  if (opts.soloActivas) q = q.neq('etapa', 'recibido');
  const { data, error } = await q.order('fecha_ingreso', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(fromRow);
}

// Alta manual desde la pestaña Registrar: prendas que llegan al almacén sin pedido asociado.
// Trazabilidad (Fase 8): el vínculo prenda_pasada.activo_id → inventario_activo.id ya existía
// en el esquema (E5, migración 0001) pero nunca se usaba. Al registrar una prenda: si su código
// ya tiene un activo en el inventario (una prenda que vuelve a proceso, ej. lavado tras un
// alquiler), se reusa ese activo y se linkea la nueva pasada; si es completamente nueva
// (llega recién de proveedor/confección), se crea el activo de una vez — "pasa por el pipeline
// para codificarse" antes de mostrarse, tal como describe el flujo del negocio. Dos escrituras
// secuenciales (activo e inserción de la pasada, esta última por RPC desde la 0122): no es
// transaccional.
export async function registrarPasada(p: {
  codigo: string;
  tipo: string;
  color: string | null;
  talla: string | null;
  sedeOrigenCod: string;
  tipoLavado: string | null;
  necesitaCompostura: boolean;
  obsGeneral: string | null;
}, operador: string | null = null): Promise<void> {
  const sb = getServerClient();

  const { data: existente, error: buscarErr } = await sb
    .from('inventario_activo')
    .select('id')
    .eq('codigo', p.codigo)
    .maybeSingle();
  if (buscarErr) throw new Error(buscarErr.message);

  let activoId = (existente as { id: string } | null)?.id ?? null;
  if (!activoId) {
    // Fase 7 tarea 2: un activo que nace acá (código nunca visto) entra a "codificarse" —
    // todavía no es una prenda vendible/alquilable. pipeline_enviar (migración 0055) lo pasa a
    // 'disponible' cuando sale del pipeline hacia una tienda. Con fallback (Fase 4/7: nunca pedir
    // una columna nueva por nombre explícito contra una base sin migrar) por si 'codificando'
    // todavía no está en el check constraint del entorno (migración 0055 pendiente).
    const { data: nuevo, error: crearErr } = await sb
      .from('inventario_activo')
      .insert({
        codigo: p.codigo,
        tipo: p.tipo,
        color: p.color ?? '',
        talla: p.talla ?? '',
        sede_cod: p.sedeOrigenCod,
        estado: 'codificando',
      })
      .select('id')
      .single();
    if (crearErr) {
      const { data: reintento, error: reintentoErr } = await sb
        .from('inventario_activo')
        .insert({ codigo: p.codigo, tipo: p.tipo, color: p.color ?? '', talla: p.talla ?? '', sede_cod: p.sedeOrigenCod })
        .select('id')
        .single();
      if (reintentoErr) throw new Error(reintentoErr.message);
      activoId = (reintento as { id: string }).id;
    } else {
      activoId = (nuevo as { id: string }).id;
    }
  }

  const { error } = await sb.rpc('pipeline_registrar_prenda', {
    p_codigo: p.codigo,
    p_tipo: p.tipo,
    p_color: p.color,
    p_talla: p.talla,
    p_sede: p.sedeOrigenCod,
    p_tipo_lavado: p.tipoLavado,
    p_necesita_compostura: p.necesitaCompostura,
    p_obs: p.obsGeneral,
    p_activo_id: activoId,
    ...conOperador(operador),
  });
  if (error) throw new Error(error.message);
}

// Fase 9: al devolver un pedido de alquiler, el/los activo(s) reingresan al pipeline de
// lavandería (recepción) para procesarse antes de volver a estar disponibles — reusa el vínculo
// activo_id (Fase 8), sin buscar por código porque ya se tiene el id.
// Fase 7 tarea 2: "los devueltos van tienda → almacén → proceso → inventario" — el activo pasa a
// 'en_pipeline' acá (no queda en 'alquilado' mientras se procesa). Best-effort: si falla (p. ej.
// migración 0055 pendiente y el check constraint todavía no acepta 'en_pipeline'), no revierte la
// pasada ya insertada — la prenda igual entra al tablero, que es lo crítico de esta función.
export async function reingresarActivoAPipeline(activoId: string): Promise<void> {
  const sb = getServerClient();
  const { data: activo, error: e1 } = await sb
    .from('inventario_activo')
    .select('codigo, tipo, color, talla, sede_cod')
    .eq('id', activoId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!activo) return;
  const a = activo as { codigo: string; tipo: string; color: string | null; talla: string | null; sede_cod: string | null };
  const { error } = await sb.rpc('pipeline_registrar_prenda', {
    p_codigo: a.codigo,
    p_tipo: a.tipo,
    p_color: a.color,
    p_talla: a.talla,
    p_sede: a.sede_cod,
    p_tipo_lavado: null,
    p_necesita_compostura: false,
    p_obs: null,
    p_activo_id: activoId,
  });
  if (error) throw new Error(error.message);

  await sb.from('inventario_activo').update({ estado: 'en_pipeline' }).eq('id', activoId);
}

// ── Mutaciones del tablero vía RPC (una sola llamada atómica, ~200ms; ver 0009). ──

// Avanza la prenda y devuelve los puntos ganados por el actor (para feedback en la UI).
export async function avanzarPasada(id: string, destino: string, operador: string | null = null): Promise<number> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('pipeline_avanzar', { p_id: id, p_destino: destino, ...conOperador(operador) });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export async function enviarPasada(id: string, sedeDestino: string, operador: string | null = null): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('pipeline_enviar', { p_id: id, p_sede: sedeDestino, ...conOperador(operador) });
  if (error) throw new Error(error.message);
}

// Tanda atómica (migración 0153): una sola transacción en la base.
export async function enviarTandaPasadas(ids: string[], sedeDestino: string, operador: string | null = null): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('pipeline_enviar_tanda', { p_ids: ids, p_sede: sedeDestino, ...conOperador(operador) });
  if (error) throw new Error(error.message);
}

export async function rechazarPasada(
  id: string,
  destino: string,
  motivo: string,
  operador: string | null = null,
): Promise<void> {
  const sb = getServerClient();
  // Motivo obligatorio (0154): la base lo valida y lo guarda en obs_calidad y en el historial.
  const { error } = await sb.rpc('pipeline_rechazar', {
    p_id: id,
    p_destino: destino,
    p_motivo: motivo,
    ...conOperador(operador),
  });
  if (error) throw new Error(error.message);
}

// Deshacer: revierte la prenda a la etapa anterior y quita los puntos recién ganados.
// Anular un envío equivocado (0156): la prenda vuelve a «listo». Motivo obligatorio.
export async function anularEnvioPasada(id: string, motivo: string, operador: string | null = null): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('pipeline_anular_envio', { p_id: id, p_motivo: motivo, ...conOperador(operador) });
  if (error) throw new Error(error.message);
}

export async function deshacerPasada(id: string, etapaAnterior: string, operador: string | null = null): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('pipeline_deshacer', {
    p_id: id,
    p_etapa_anterior: etapaAnterior,
    ...conOperador(operador),
  });
  if (error) throw new Error(error.message);
}

// Tanda: avanza varias prendas de una etapa de un solo golpe. Devuelve los puntos totales.
export async function avanzarTanda(ids: string[], destino: string, operador: string | null = null): Promise<number> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('pipeline_avanzar_tanda', {
    p_ids: ids,
    p_destino: destino,
    ...conOperador(operador),
  });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export type ResultadoTanda = { puntos: number; movidas: number; omitidas: number; idsMovidos: string[] };

// Tanda con resultado detallado (0155): cuántas se movieron, cuántas se omitieron y cuáles.
export async function avanzarTandaResultado(
  ids: string[],
  destino: string,
  operador: string | null = null,
): Promise<ResultadoTanda> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('pipeline_avanzar_tanda_resultado', {
    p_ids: ids,
    p_destino: destino,
    ...conOperador(operador),
  });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    puntos: Number(d.puntos) || 0,
    movidas: Number(d.movidas) || 0,
    omitidas: Number(d.omitidas) || 0,
    idsMovidos: Array.isArray(d.ids_movidos) ? (d.ids_movidos as string[]) : [],
  };
}

// Deshacer una tanda entera, todo o nada (0155).
export async function deshacerTandaPasadas(
  items: { id: string; etapaAnterior: string }[],
  operador: string | null = null,
): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('pipeline_deshacer_tanda', {
    p_items: items.map((i) => ({ id: i.id, etapa_anterior: i.etapaAnterior })),
    ...conOperador(operador),
  });
  if (error) throw new Error(error.message);
}

export type RankingItem = { nombre: string; total: number; acciones: number };

// Ranking de puntos del día (todos los operarios; security definer en 0011).
export async function rankingHoy(): Promise<RankingItem[]> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('pipeline_ranking_hoy');
  if (error) throw new Error(error.message);
  return (data as RankingItem[]).map((r) => ({
    nombre: r.nombre,
    total: Number(r.total),
    acciones: Number(r.acciones),
  }));
}

// Movimientos del historial de los últimos N días (para la pestaña Métricas).
export type Movimiento = { fecha: string; etapaNueva: string };
export async function movimientosRecientes(dias = 7): Promise<Movimiento[]> {
  const sb = getServerClient();
  // Desde el inicio del día de Perú de hace (dias-1) días: el día más viejo entra entero.
  const desde = `${diaPeruDe(new Date(Date.now() - (dias - 1) * 86400000).toISOString())}T00:00:00-05:00`;
  const { data, error } = await sb
    .from('prenda_historial')
    .select('fecha, etapa_nueva')
    .gte('fecha', desde)
    .order('fecha', { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return ((data as { fecha: string; etapa_nueva: string }[]) ?? []).map((r) => ({
    fecha: r.fecha ? diaPeruDe(r.fecha) : '',
    etapaNueva: r.etapa_nueva,
  }));
}

// Divide un terno en piezas hijas (saco + pantalón); el original sale del tablero.
export async function dividirPasada(id: string, operador: string | null = null): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('pipeline_dividir', { p_id: id, ...conOperador(operador) });
  if (error) throw new Error(error.message);
}

// Deshace una división (Fase 6 tarea 6, migración 0054): borra las hijas -S/-P y devuelve la
// madre a su etapa original — SOLO si ninguna hija avanzó de etapa (el RPC lo valida server-side
// y rechaza con un mensaje claro si no se puede). `id` es el id de la MADRE (mismo parámetro que
// dividirPasada, no el de una hija — ver deshacerDivisionPrenda en actions.ts).
export async function deshacerDivisionPasada(id: string, operador: string | null = null): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('pipeline_deshacer_division', { p_id: id, ...conOperador(operador) });
  if (error) throw new Error(error.message);
}

// Calificar en tienda: aceptar (→ recibido) u observar (→ etapa destino, vuelve al trabajo).
export async function calificarPasada(
  id: string,
  aceptada: boolean,
  destino = '',
  obs = '',
  operador: string | null = null,
): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('pipeline_calificar', {
    p_id: id,
    p_aceptada: aceptada,
    p_destino: destino,
    p_obs: obs,
    ...conOperador(operador),
  });
  if (error) throw new Error(error.message);
}

// ── Código personal (migración 0112, spec codigo-personal) ────────────────────────────────────
// Usuario + PIN se teclean UNA vez y sólo viajan a pipeline_validar_codigo, que cuenta los intentos
// (por sesión y por persona) y devuelve un token de operador. Las demás RPC reciben ese token
// (`p_operador`), nunca el PIN. El PIN lo define cada persona (`definirPin`); la base guarda sólo el
// hash.
export type ValidacionCodigo =
  | { ok: true; token: string; nombre: string; expiraEn: string; ventanaMin: number }
  | {
      ok: false;
      bloqueadoMin?: number;
      intentosRestantes?: number;
      motivo?: 'equipo_no_compartido' | 'sin_pin';
    };

export async function validarCodigoOperador(
  usuario: string,
  pin: string,
  deviceId: string | null,
): Promise<ValidacionCodigo> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('pipeline_validar_codigo', {
    p_usuario: usuario,
    p_pin: pin,
    p_device: deviceId,
  });
  if (error) throw new Error(error.message);
  const r = data as {
    ok: boolean;
    token?: string;
    nombre?: string;
    expira_en?: string;
    ventana_min?: number;
    bloqueado_min?: number;
    intentos_restantes?: number;
    motivo?: string;
  };
  if (r.ok && r.token) {
    return {
      ok: true,
      token: r.token,
      nombre: r.nombre ?? '',
      expiraEn: r.expira_en ?? '',
      ventanaMin: Number(r.ventana_min) || 0,
    };
  }
  return {
    ok: false,
    bloqueadoMin: r.bloqueado_min,
    intentosRestantes: r.intentos_restantes,
    motivo: r.motivo === 'equipo_no_compartido' || r.motivo === 'sin_pin' ? r.motivo : undefined,
  };
}

export type ResultadoPin =
  | { ok: true }
  | {
      ok: false;
      motivo?: 'pin_corto' | 'pin_trivial' | 'pin_actual_incorrecto' | 'cuenta_compartida' | 'sin_permiso';
      largoMin?: number;
      intentosRestantes?: number;
      bloqueadoMin?: number;
    };

// La propia persona define o cambia su PIN (para cambiarlo, da el actual).
export async function definirPin(nuevo: string, actual: string | null): Promise<ResultadoPin> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('pipeline_definir_pin', { p_pin_nuevo: nuevo, p_pin_actual: actual });
  if (error) throw new Error(error.message);
  const r = data as {
    ok: boolean;
    motivo?: string;
    largo_min?: number;
    intentos_restantes?: number;
    bloqueado_min?: number;
  };
  if (r.ok) return { ok: true };
  return {
    ok: false,
    motivo: r.motivo as Extract<ResultadoPin, { ok: false }>['motivo'],
    largoMin: r.largo_min,
    intentosRestantes: r.intentos_restantes,
    bloqueadoMin: r.bloqueado_min,
  };
}

// ¿La sesión ya tiene PIN? PGRST202 = migración sin aplicar → se trata como «sin PIN».
export async function tengoPin(): Promise<boolean> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('pipeline_tengo_pin');
  if (error?.code === 'PGRST202') return false;
  if (error) throw new Error(error.message);
  return data === true;
}

// Admin: borra el PIN de quien lo olvidó (la base exige admin).
export async function borrarPin(empleadoId: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('pipeline_borrar_pin', { p_empleado: empleadoId });
  if (error) throw new Error(error.message);
}

// Admin: marca la cuenta con la que se abre un equipo compartido. Para esa cuenta la base rechaza
// toda acción del pipeline sin código (spec §0 E-3).
export async function marcarCuentaCompartida(empleadoId: string, valor: boolean): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('empleado_marcar_cuenta_compartida', { p_empleado: empleadoId, p_valor: valor });
  if (error) throw new Error(error.message);
}

// «cambiar» en el chip: revoca el token de operador en la base (sólo los de la propia sesión).
export async function cerrarOperadorCodigo(token: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('pipeline_cerrar_operador', { p_token: token });
  if (error) throw new Error(error.message);
}

// ¿El equipo de esta cookie `sci_device` está marcado como compartido? (RPC definer: la tabla
// sólo la lee el admin por RLS.)
export async function dispositivoCompartido(deviceId: string): Promise<boolean> {
  if (!deviceId) return false;
  const sb = getServerClient();
  const { data, error } = await sb.rpc('dispositivo_compartido', { p_device_id: deviceId });
  // PGRST202: la función no existe todavía (migración 0112 sin aplicar) → ningún equipo es
  // compartido y el pipeline funciona como siempre. Cualquier otro error sí se propaga: fallar en
  // silencio en un equipo compartido le atribuiría todo a la dueña de la sesión.
  if (error?.code === 'PGRST202') return false;
  if (error) throw new Error(error.message);
  return data === true;
}

