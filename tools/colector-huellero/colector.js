#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════
// LUCEBIEN · Colector del huellero
//
// Lee las marcaciones del terminal Hikvision del almacén por ISAPI y las empuja a Supabase cada
// cinco minutos. Corre bajo PM2 en la PC del almacén, que es distinta de la del sistema viejo.
//
// Diseño completo: docs/superpowers/specs/2026-08-15-huellero-asistencias-design.md §7.
//
// Tres cosas que no son obvias y sostienen todo lo demás:
//
//   1. No guarda estado local. El punto de partida se lo pregunta a la base (RPC
//      huellero_checkpoint) y le resta un solape. Reinstalar la PC no pierde ni duplica nada.
//   2. Escribe por una sola RPC, autenticado como usuario propio. Nunca con la service key.
//   3. Sube antes de resumir. Un error al armar el log no puede costar marcas ya leídas.
//
// Este archivo no importa nada de packages/: la carpeta se copia sola a la PC del almacén.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { crearClienteIsapi, aTextoPeru } from './lib/isapi.js';
import { crearClienteSupabase, asegurarSesion, obtenerCheckpoint, enviarMarcas } from './lib/subida.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MS_MINUTO = 60 * 1000;

// ── Registro ───────────────────────────────────────────────────────────────────────────────
// PM2 se queda con la salida estándar y le pone su propia marca de tiempo, pero la del log tiene
// que ser hora Perú: leer un log en UTC mientras se investiga un turno es pedir un error.
function registrar(mensaje, nivel = 'info') {
  const sello = aTextoPeru(new Date()).replace('T', ' ').slice(0, 19);
  const linea = `[${sello}] ${mensaje}`;
  if (nivel === 'error') console.error(linea);
  else console.log(linea);
}

// ── .env ───────────────────────────────────────────────────────────────────────────────────
// Lector propio en vez de una dependencia: son veinte líneas y evita que la PC del almacén tenga
// que actualizar una librería más. `--env-file` de Node se descartó porque exige 20.6 y acá sólo
// se garantiza Node 20.
function cargarEnv(ruta) {
  if (!fs.existsSync(ruta)) return {};
  const valores = {};
  for (const cruda of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea || linea.startsWith('#')) continue;
    const corte = linea.indexOf('=');
    if (corte < 0) continue;
    const nombre = linea.slice(0, corte).trim();
    let valor = linea.slice(corte + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    valores[nombre] = valor;
  }
  return valores;
}

function cargarConfiguracion() {
  // Lo que ya esté en el entorno manda sobre el archivo: así PM2 o el administrador pueden
  // sobreescribir un valor sin editar el .env.
  const archivo = cargarEnv(path.join(AQUI, '.env'));
  const leer = (nombre, porDefecto = undefined) => process.env[nombre] ?? archivo[nombre] ?? porDefecto;

  const nombres = String(leer('EQUIPOS', ''))
    .split(',')
    .map((n) => n.trim().toUpperCase())
    .filter(Boolean);

  if (nombres.length === 0) {
    throw new Error('El .env no declara ningún equipo. Agregar EQUIPOS=ALMACEN (y sus ID_, IP_ y PASS_).');
  }

  const equipos = nombres.map((nombre) => {
    const equipo = {
      nombre,
      dispositivoId: leer(`ID_${nombre}`),
      ip: leer(`IP_${nombre}`),
      usuario: leer(`USUARIO_${nombre}`, 'admin'),
      clave: leer(`PASS_${nombre}`),
      usarHttp: String(leer(`HTTP_${nombre}`, 'false')).toLowerCase() === 'true',
      // Sólo si el equipo no está en el puerto de siempre (443 con HTTPS, 80 con HTTP).
      puerto: leer(`PUERTO_${nombre}`, null),
    };
    for (const [campo, variable] of [['dispositivoId', `ID_${nombre}`], ['ip', `IP_${nombre}`], ['clave', `PASS_${nombre}`]]) {
      if (!equipo[campo]) throw new Error(`Falta ${variable} en el .env para el equipo ${nombre}.`);
    }
    return equipo;
  });

  const inicioHistorico = new Date(`${leer('INICIO_HISTORICO', '2026-01-01')}T00:00:00-05:00`);
  if (Number.isNaN(inicioHistorico.getTime())) {
    throw new Error('INICIO_HISTORICO tiene que ser una fecha AAAA-MM-DD.');
  }

  return {
    supabase: { url: leer('SUPABASE_URL'), clave: leer('SUPABASE_ANON_KEY') },
    credenciales: { correo: leer('COLECTOR_CORREO'), contrasena: leer('COLECTOR_CONTRASENA') },
    equipos,
    intervaloMs: Number(leer('INTERVALO_MINUTOS', '5')) * MS_MINUTO,
    solapeMs: Number(leer('SOLAPE_MINUTOS', '10')) * MS_MINUTO,
    inicioHistorico,
  };
}

// ── Un ciclo de un equipo ──────────────────────────────────────────────────────────────────
async function sincronizar(supabase, cfg, equipo) {
  await asegurarSesion(supabase, cfg.credenciales);

  const checkpoint = await obtenerCheckpoint(supabase, equipo.dispositivoId);
  // Diez minutos de solape a propósito: la RPC es idempotente por (dispositivo, serial, instante),
  // así que repetir no cuesta nada y cubre cualquier marca que haya entrado al equipo con retraso.
  const desde = checkpoint ? new Date(checkpoint.getTime() - cfg.solapeMs) : cfg.inicioHistorico;
  const hasta = new Date();

  registrar(
    `${equipo.nombre}: pidiendo desde ${aTextoPeru(desde).slice(0, 19)}` +
    (checkpoint ? '' : ' (sin marcas previas: primera corrida, trae el histórico)'),
  );

  const cliente = crearClienteIsapi(equipo);
  const { marcas, error: errorLectura } = await cliente.leerMarcas({
    desde,
    hasta,
    registrar: (m) => registrar(`${equipo.nombre}:${m}`),
  });

  // Si la lectura falló sin traer nada, NO se manda el latido vacío: `ultima_sincronizacion`
  // existe para que la pantalla muestre en rojo una cadena rota, y marcarla viva mientras el
  // equipo está inalcanzable escondería justo eso.
  if (marcas.length === 0 && errorLectura) {
    throw errorLectura;
  }

  // Subir ANTES de resumir. Lo leído se pone a salvo primero: la primera versión del script de
  // diagnóstico fallaba al armar el resumen y perdía las 3.058 marcas que ya tenía en la mano.
  const resultado = await enviarMarcas(supabase, equipo.dispositivoId, marcas, (m) =>
    registrar(`${equipo.nombre}:${m}`));

  registrar(
    `${equipo.nombre}: ${resultado.enviadas} leídas · ${resultado.insertadas} nuevas · ` +
    `${resultado.duplicadas} repetidas · ${resultado.sin_mapeo} sin mapeo`,
  );

  if (resultado.sin_mapeo > 0) {
    registrar(
      `${equipo.nombre}: ${resultado.sin_mapeo} marca(s) sin empleado asignado. ` +
      'Quedan guardadas y aparecen en /asistencias/huellero para mapearlas.',
    );
  }

  // La lectura falló a mitad de camino pero lo leído hasta ahí ya está a salvo. Se avisa y se
  // corta el ciclo: el checkpoint quedó donde llegó y el ciclo siguiente sigue desde ahí.
  if (errorLectura) throw errorLectura;
}

async function ciclo(supabase, cfg) {
  for (const equipo of cfg.equipos) {
    try {
      await sincronizar(supabase, cfg, equipo);
    } catch (error) {
      // Un equipo caído no puede tumbar el proceso ni impedir que se lea el otro. El equipo
      // guarda sus eventos por su cuenta: el ciclo siguiente los recupera.
      registrar(`${equipo.nombre}: ${error.message}`, 'error');
    }
  }
}

// ── Arranque ───────────────────────────────────────────────────────────────────────────────
async function principal() {
  let cfg;
  try {
    cfg = cargarConfiguracion();
  } catch (error) {
    registrar(error.message, 'error');
    registrar('Revisar el .env contra .env.example. El colector no arranca sin eso.', 'error');
    process.exit(1);
  }

  registrar('══ Colector del huellero — LuceBien ══');
  registrar(`Equipos: ${cfg.equipos.map((e) => `${e.nombre} (${e.ip})`).join(', ')}`);
  registrar(`Intervalo: ${cfg.intervaloMs / MS_MINUTO} min · solape ${cfg.solapeMs / MS_MINUTO} min`);

  const supabase = crearClienteSupabase(cfg.supabase);

  // Identificar cada equipo una vez al arrancar: es la comprobación más barata de que la IP y la
  // clave son las correctas, y deja en el log contra qué firmware se está corriendo.
  for (const equipo of cfg.equipos) {
    try {
      const info = await crearClienteIsapi(equipo).leerInfo();
      registrar(`${equipo.nombre}: ${info.modelo ?? 'equipo'} · firmware ${info.firmware ?? '?'} · serie ${info.serie ?? '?'}`);
    } catch (error) {
      registrar(`${equipo.nombre}: no respondió al arrancar — ${error.message}`, 'error');
      registrar(`${equipo.nombre}: se sigue igual; el ciclo reintenta cada ${cfg.intervaloMs / MS_MINUTO} min.`, 'error');
    }
  }

  let vivo = true;
  let temporizador = null;
  for (const senal of ['SIGINT', 'SIGTERM']) {
    process.on(senal, () => {
      vivo = false;
      if (temporizador) clearTimeout(temporizador);
      registrar('Detenido. Lo que no se alcanzó a subir entra en el próximo arranque: el equipo guarda sus eventos.');
      process.exit(0);
    });
  }

  // setTimeout encadenado y no setInterval: con setInterval, un ciclo que tarda más que el
  // intervalo se solapa con el siguiente y los dos leen el mismo rango.
  const programar = async () => {
    await ciclo(supabase, cfg);
    if (vivo) temporizador = setTimeout(programar, cfg.intervaloMs);
  };
  await programar();
}

// Una promesa rechazada sin capturar tumba el proceso en Node 20. PM2 lo levantaría, pero el log
// quedaría sin explicación: se registra y se sigue.
process.on('unhandledRejection', (motivo) => {
  registrar(`Error no capturado: ${motivo?.message ?? motivo}`, 'error');
});

principal();
