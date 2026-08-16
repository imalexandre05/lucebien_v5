// ═══════════════════════════════════════════════════════════════════════════════════════════
// Conversación con Supabase: sesión del usuario colector, checkpoint y envío de marcas.
//
// El colector se autentica como un usuario propio (correo y contraseña en el .env) cuyo uid está
// registrado en `huellero_colectores`. NUNCA con la service key: es el no-negociable 3. Si
// alguien se lleva el .env de la PC del almacén, lo único que consigue es insertar marcas de
// asistencia — no lee sueldos, ni notas, ni datos personales.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const LOTE = 200; // marcas por llamada a la RPC, como dice la spec §7

export function crearClienteSupabase({ url, clave }) {
  if (!url || !clave) throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el .env.');
  return createClient(url, clave, {
    auth: {
      // Un servicio, no un navegador: no hay dónde persistir la sesión ni para qué. El token se
      // renueva en memoria y, si se venció, se vuelve a iniciar sesión en el ciclo siguiente.
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    // El colector no usa realtime, pero la librería arma igual su cliente al crearse y en Node 20
    // no existe WebSocket nativo: sin esta línea, `createClient` tira
    // "Node.js 20 detected without native WebSocket support" y el proceso no arranca. Node 22 no
    // lo necesita, pero declararlo hace que la misma carpeta funcione en las dos versiones.
    realtime: { transport: ws },
  });
}

// Inicia sesión sólo si hace falta. Se comprueba en cada ciclo: un proceso que corre semanas
// enteras se queda sin token en algún momento, y reconectar es más barato que caerse.
export async function asegurarSesion(supabase, { correo, contrasena }) {
  if (!correo || !contrasena) {
    throw new Error('Faltan COLECTOR_CORREO o COLECTOR_CONTRASENA en el .env.');
  }

  const { data } = await supabase.auth.getSession();
  const sesion = data?.session;
  const faltanSegundos = sesion?.expires_at ? sesion.expires_at - Math.floor(Date.now() / 1000) : -1;
  if (sesion && faltanSegundos > 120) return sesion;

  const { data: nueva, error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  });
  if (error) {
    throw new Error(`No se pudo iniciar sesión como colector (${correo}): ${error.message}`);
  }
  return nueva.session;
}

// ── Checkpoint ─────────────────────────────────────────────────────────────────────────────
// Sin estado local a propósito: el punto de partida se le pregunta a la base. Si la PC se
// reinstala desde cero no se pierde ni se duplica nada, porque el índice único
// (dispositivo_id, evento_serial) absorbe el solape.
//
// `marcas_huellero` es sólo-administrador bajo RLS, así que el colector NO la consulta: usa la
// RPC de lectura. Si esa RPC todavía no existe, se avisa por su nombre en vez de fallar con un
// 404 críptico.
export async function obtenerCheckpoint(supabase, dispositivoId) {
  const { data, error } = await supabase.rpc('huellero_checkpoint', {
    p_dispositivo_id: dispositivoId,
  });

  if (error) {
    if (error.code === 'PGRST202' || /Could not find the function|does not exist/i.test(error.message || '')) {
      throw new Error(
        'Falta la RPC huellero_checkpoint(p_dispositivo_id uuid) -> timestamptz en la base. ' +
        'Sin ella el colector no sabe desde cuándo pedir y no arranca. La tiene que agregar una ' +
        'migración: el colector no puede leer marcas_huellero directamente porque es sólo-administrador.',
      );
    }
    throw new Error(`No se pudo leer el checkpoint: ${traducirError(error)}`);
  }

  return data ? new Date(data) : null;
}

// ── Envío ──────────────────────────────────────────────────────────────────────────────────
// En lotes y EN ORDEN CRONOLÓGICO. El orden importa: si el tercer lote falla, los dos primeros
// ya están en la base y el checkpoint queda donde llegaron. Al revés, un lote reciente subido
// antes que uno viejo adelantaría el checkpoint por encima de marcas que nunca se subieron.
export async function enviarMarcas(supabase, dispositivoId, marcas, registrar = () => {}) {
  const ordenadas = [...marcas].sort((a, b) => a.marcada_en.localeCompare(b.marcada_en));
  const total = { insertadas: 0, duplicadas: 0, sin_mapeo: 0, enviadas: 0 };

  // Un lote vacío también se manda: la RPC actualiza `ultima_sincronizacion` y así un ciclo sin
  // marcas sigue siendo señal de que el colector está vivo. Un colector caído se ve en la
  // pantalla, no se descubre a fin de mes.
  const paquetes = ordenadas.length === 0 ? [[]] : trocear(ordenadas, LOTE);

  for (const paquete of paquetes) {
    const { data, error } = await supabase.rpc('huellero_registrar_marcas', {
      p_dispositivo_id: dispositivoId,
      p_marcas: paquete,
    });
    if (error) throw new Error(traducirError(error));

    total.insertadas += Number(data?.insertadas ?? 0);
    total.duplicadas += Number(data?.duplicadas ?? 0);
    total.sin_mapeo += Number(data?.sin_mapeo ?? 0);
    total.enviadas += paquete.length;

    if (paquetes.length > 1) {
      registrar(`   lote de ${paquete.length}: ${data?.insertadas ?? 0} nuevas, ${data?.duplicadas ?? 0} repetidas`);
    }
  }

  return total;
}

function trocear(lista, tamano) {
  const partes = [];
  for (let i = 0; i < lista.length; i += tamano) partes.push(lista.slice(i, i + tamano));
  return partes;
}

// La RPC señaliza con prefijo 'CODIGO:mensaje'. Se traduce a algo que se pueda leer en el log de
// PM2 sin abrir el código de la migración.
function traducirError(error) {
  const mensaje = error?.message || String(error);
  if (mensaje.includes('PERMISO:')) {
    return `${mensaje.split('PERMISO:')[1].trim()} — comprobar que el uid del usuario colector esté en la tabla huellero_colectores y activo.`;
  }
  if (mensaje.includes('DATO:')) {
    return `${mensaje.split('DATO:')[1].trim()} — comprobar el identificador del equipo en el .env contra la tabla dispositivos_huellero.`;
  }
  return mensaje;
}
