import type { PrendaPasada } from '@scilb/core';
import { getServerClient } from './supabase/server';

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
  fechaIngreso: (r.fecha_ingreso ?? '').slice(0, 10),
  fechaActualizado: r.fecha_actualizado,
});

export async function listarPasadas(): Promise<PrendaPasada[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('prenda_pasada')
    .select('*')
    .order('fecha_ingreso', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(fromRow);
}

// Llamado al crear un pedido de servicio: la prenda entra al pipeline interno (E5).
export async function crearPasadaDesdePedido(p: {
  codigo: string;
  tipo: string;
  sedeOrigenCod: string;
  pedidoId: string;
}): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('prenda_pasada').insert({
    codigo: p.codigo,
    tipo: p.tipo,
    sede_origen_cod: p.sedeOrigenCod,
    pedido_id: p.pedidoId,
    etapa: 'recepcion',
  });
  if (error) throw new Error(error.message);
}

// Alta manual desde la pestaña Registrar: prendas que llegan al almacén sin pedido asociado.
// Trazabilidad (Fase 8): el vínculo prenda_pasada.activo_id → inventario_activo.id ya existía
// en el esquema (E5, migración 0001) pero nunca se usaba. Al registrar una prenda: si su código
// ya tiene un activo en el inventario (una prenda que vuelve a proceso, ej. lavado tras un
// alquiler), se reusa ese activo y se linkea la nueva pasada; si es completamente nueva
// (llega recién de proveedor/confección), se crea el activo de una vez — "pasa por el pipeline
// para codificarse" antes de mostrarse, tal como describe el flujo del negocio. Dos escrituras
// secuenciales (sin RPC): mismo patrón que el resto de este archivo (registrarPasada ya era un
// insert simple, no transaccional).
export async function registrarPasada(p: {
  codigo: string;
  tipo: string;
  color: string | null;
  talla: string | null;
  sedeOrigenCod: string;
  tipoLavado: string | null;
  necesitaCompostura: boolean;
  obsGeneral: string | null;
}): Promise<void> {
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

  const { error } = await sb.from('prenda_pasada').insert({
    activo_id: activoId,
    codigo: p.codigo,
    tipo: p.tipo,
    color: p.color,
    talla: p.talla,
    sede_origen_cod: p.sedeOrigenCod,
    tipo_lavado: p.tipoLavado,
    necesita_compostura: p.necesitaCompostura,
    obs_general: p.obsGeneral,
    etapa: 'recepcion',
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
  const { error } = await sb.from('prenda_pasada').insert({
    activo_id: activoId,
    codigo: a.codigo,
    tipo: a.tipo,
    color: a.color,
    talla: a.talla,
    sede_origen_cod: a.sede_cod,
    etapa: 'recepcion',
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

export async function rechazarPasada(id: string, destino: string, operador: string | null = null): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('pipeline_rechazar', { p_id: id, p_destino: destino, ...conOperador(operador) });
  if (error) throw new Error(error.message);
}

// Deshacer: revierte la prenda a la etapa anterior y quita los puntos recién ganados.
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
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await sb
    .from('prenda_historial')
    .select('fecha, etapa_nueva')
    .gte('fecha', desde)
    .order('fecha', { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return ((data as { fecha: string; etapa_nueva: string }[]) ?? []).map((r) => ({
    fecha: (r.fecha ?? '').slice(0, 10),
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
// El código se teclea UNA vez y sólo viaja a pipeline_validar_codigo, que cuenta los intentos y
// devuelve un token de operador. Las demás RPC reciben ese token (`p_operador`), nunca el código.
export type ValidacionCodigo =
  | { ok: true; token: string; nombre: string; expiraEn: string; ventanaMin: number }
  | { ok: false; bloqueadoMin?: number; intentosRestantes?: number; motivo?: 'equipo_no_compartido' };

export async function validarCodigoOperador(codigo: string, deviceId: string | null): Promise<ValidacionCodigo> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('pipeline_validar_codigo', { p_codigo: codigo, p_device: deviceId });
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
    motivo: r.motivo === 'equipo_no_compartido' ? 'equipo_no_compartido' : undefined,
  };
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
