// migra-pipeline.mjs — Fase 3 (ETL del pipeline CORE: "Prendas Recibidas").
// Migra del SQLite viejo → Postgres (Supabase) las 5 tablas del tablero de lavandería:
//   envios_prendas → prendas(=prenda_pasada) → prenda_historial → pipeline_puntos → prenda_calificacion
//
// - Lee el origen SQLite en READ-ONLY (no lo toca).
// - Resuelve los pseudo-FK por código/nombre TEXT → uuid real de empleados, usando
//   _idmap.json (E0x→uuid, lo dejó provision-empleados.mjs) + la tabla empleados del SQLite.
// - Escribe con el cliente admin (service_role vía REST) → bypasea RLS (las tablas nuevas
//   aún no tienen policy; eso es 0006). Por eso este ETL NO depende de la RLS.
// - Idempotente: genera el uuid de cada fila una sola vez y lo persiste en
//   _pipeline_idmap.json; en re-corridas reusa el mismo uuid y hace upsert on_conflict=id.
//
// Uso (desde la raíz del repo, con better-sqlite3 ya compilado):
//   node packages/db/etl/migra-pipeline.mjs          -> DRY-RUN: cuenta + auditoría de resolución (no escribe)
//   node packages/db/etl/migra-pipeline.mjs --run     -> escribe todo
//
// Requiere: _idmap.json poblado (corre antes provision-empleados.mjs --run).
// Config: apps/erp-web/.env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).

import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../../..');
const ENV_FILE = resolve(ROOT, 'apps/erp-web/.env.local');
const IDMAP = resolve(__dir, '_idmap.json');
const PIPEMAP = resolve(__dir, '_pipeline_idmap.json');

// ── args ──────────────────────────────────────────────────────────
const RUN = process.argv.slice(2).includes('--run');
const DRY = !RUN;
const sqliteArgIdx = process.argv.indexOf('--sqlite');
const SQLITE = sqliteArgIdx >= 0 ? resolve(process.argv[sqliteArgIdx + 1]) : resolve(ROOT, 'database/lucebien.db');

// ── env ───────────────────────────────────────────────────────────
const env = {};
for (const l of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en', ENV_FILE);
  process.exit(1);
}
if (!existsSync(IDMAP)) {
  console.error('Falta _idmap.json. Corré antes: node packages/db/etl/provision-empleados.mjs --run');
  process.exit(1);
}
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };

// ── conversores SQLite→Postgres ───────────────────────────────────
const b = (v) => v === 1 || v === true || v === '1'; // INTEGER 0/1 → boolean
// El viejo guarda fecha TEXT en hora local de Perú (sin DST, offset fijo -05:00).
const toTs = (v) => {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length <= 10) return `${s}T00:00:00-05:00`;        // solo fecha
  return `${s.replace(' ', 'T')}-05:00`;                    // fecha + hora local
};

// ── helper REST (upsert idempotente) ──────────────────────────────
async function pgUpsert(table, rows, onConflict) {
  if (!rows.length) return;
  const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`pg.${table} ${r.status}: ${await r.text()}`);
}

// ── origen SQLite (read-only) ─────────────────────────────────────
const db = new Database(SQLITE, { readonly: true });
const empSql = db.prepare('SELECT id, cod, nombre FROM empleados').all();
const srcEnvios = db.prepare('SELECT * FROM envios_prendas').all();
const srcPrendas = db.prepare('SELECT * FROM prendas').all();
const srcHist = db.prepare('SELECT * FROM prenda_historial').all();
const srcPuntos = db.prepare('SELECT * FROM pipeline_puntos').all();
const srcCalif = db.prepare('SELECT * FROM prenda_calificacion').all();
db.close();

// ── resolución empleado: código/nombre → uuid ─────────────────────
const idmap = JSON.parse(readFileSync(IDMAP, 'utf8')); // E0x → uuid
const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const codToUuid = {};
const nombreToUuid = {};
for (const e of empSql) {
  const uuid = idmap[e.id];
  if (!uuid) continue;
  if (e.cod) codToUuid[String(e.cod)] = uuid;
  const n = norm(e.nombre);
  if (n) nombreToUuid[n] = nombreToUuid[n] && nombreToUuid[n] !== uuid ? 'AMBIG' : uuid; // homónimos → no resolver por nombre
}
// Una fila que una migración desactivó a mano (ej. la 0102, fusión de una identidad que había
// quedado partida entre este ETL y el huellero en vivo) no debe volver a recibir escrituras en
// un re-run: el idmap no sabe de esa decisión posterior, así que se lee el estado actual.
{
  const r = await fetch(`${SB_URL}/rest/v1/empleados?activo=eq.false&select=id`, { headers: H });
  const inactivos = new Set(r.ok ? (await r.json()).map((row) => row.id) : []);
  for (const [k, v] of Object.entries(codToUuid)) if (inactivos.has(v)) delete codToUuid[k];
  for (const [k, v] of Object.entries(nombreToUuid)) if (inactivos.has(v)) delete nombreToUuid[k];
}
// Alias de nombres mal escritos en el origen (confirmados con el responsable) → nombre canónico.
// 'Marylin' es la misma persona que 'Mary' (E06): el origen guarda ambas grafías.
// Mismo alias que migra-reportes.mjs — ver docs/mapeo-migracion.md.
const ALIASES = { marylin: 'mary' };
for (const [alias, canon] of Object.entries(ALIASES)) {
  if (nombreToUuid[canon] && nombreToUuid[canon] !== 'AMBIG') nombreToUuid[alias] = nombreToUuid[canon];
}
const orphans = new Map(); // clave → veces (para auditar)
function resolveEmp(cod, nombre) {
  if (cod != null && codToUuid[String(cod)]) return codToUuid[String(cod)];
  const n = norm(nombre);
  if (n && nombreToUuid[n] && nombreToUuid[n] !== 'AMBIG') return nombreToUuid[n];
  const key = cod ? `cod=${cod}` : nombre ? `nombre=${nombre}` : '∅';
  if (cod != null || nombre) orphans.set(key, (orphans.get(key) || 0) + 1);
  return null;
}

// ── idmap del pipeline (uuid estable por fila, idempotencia) ───────
const pmap = existsSync(PIPEMAP)
  ? JSON.parse(readFileSync(PIPEMAP, 'utf8'))
  : { envios: {}, prendas: {}, historial: {}, puntos: {}, calif: {} };
const uuidFor = (sec, oldId) => (pmap[sec][oldId] ||= randomUUID());

// ── construcción de filas destino ─────────────────────────────────
const outEnvios = srcEnvios.map((e) => ({
  id: uuidFor('envios', e.id),
  sede_destino_cod: e.sede_destino,
  fecha: toTs(e.fecha) || toTs(e.created_at) || new Date().toISOString(),
  responsable_id: resolveEmp(null, e.responsable),
  estado: e.estado || 'enviado',
  validado_tienda: b(e.validado_tienda),
  obs_tienda: e.obs_tienda || null,
}));

// 'codificacion' es el nombre original de la etapa que hoy es 'planchado' — usado sólo en las
// primeras prendas (abril-mayo 2026) antes de que la app vieja renombrara la etapa. Confirmado
// con Alexander el 26-ago-2026 por su posición en el flujo (refaccion → codificacion → control_calidad/listo).
const ETAPA_ALIAS = { codificacion: 'planchado' };

const outPrendas = srcPrendas.map((p) => ({
  id: uuidFor('prendas', p.id),
  codigo: p.codigo,
  tipo: p.tipo || null,
  color: p.color || null,
  talla: p.talla || null,
  etapa: ETAPA_ALIAS[p.etapa] || p.etapa || 'recepcion',
  tipo_lavado: p.tipo_lavado || null,
  sede_origen_cod: p.sede_origen,
  lavador_id: resolveEmp(p.cod_lavador, null),
  planchador_id: resolveEmp(p.cod_planchador, null),
  necesita_compostura: b(p.necesita_compostura),
  obs_refaccion: p.obs_refaccion || null,
  obs_compostura: p.obs_compostura || null,
  obs_calidad: p.obs_calidad || null,
  obs_general: p.obs_general || null,
  aprobada: b(p.aprobada),
  envio_id: p.envio_id != null && pmap.envios[p.envio_id] ? pmap.envios[p.envio_id] : null,
  dividida: b(p.dividida),
  dividida_en: p.dividida_en || null,
  fecha_ingreso: toTs(p.fecha_ingreso) || toTs(p.created_at) || new Date().toISOString(),
  fecha_actualizado: toTs(p.fecha_actualizado),
}));

const outHist = srcHist
  .filter((h) => pmap.prendas[h.prenda_id]) // sin prenda padre → huérfano, se omite
  .map((h) => ({
    id: uuidFor('historial', h.id),
    pasada_id: pmap.prendas[h.prenda_id],
    etapa_anterior: h.etapa_anterior || null,
    etapa_nueva: h.etapa_nueva,
    empleado_id: resolveEmp(h.cod_responsable, h.responsable),
    obs: h.obs || null,
    fecha: toTs(h.fecha) || new Date().toISOString(),
  }));

// pipeline_puntos.empleado_id es NOT NULL en el destino: una fila sin empleado resuelto
// (ej. datos de prueba como cod=9999/"admin-smoke") no se puede insertar y se descarta —
// queda logueada en `orphans`, no es un huérfano silencioso.
const outPuntos = srcPuntos
  .map((pt) => ({ pt, empleado_id: resolveEmp(pt.emp_cod, pt.emp_nombre) }))
  .filter(({ empleado_id }) => empleado_id)
  .map(({ pt, empleado_id }) => ({
    id: uuidFor('puntos', pt.id),
    empleado_id,
    pasada_id: pt.prenda_id != null && pmap.prendas[pt.prenda_id] ? pmap.prendas[pt.prenda_id] : null,
    etapa: pt.etapa,
    puntos: Number(pt.puntos) || 0,
    detalle: pt.detalle || null,
    fecha: toTs(pt.fecha) || new Date().toISOString(),
  }));

const outCalif = srcCalif
  .filter((c) => pmap.prendas[c.prenda_id])
  .map((c) => ({
    id: uuidFor('calif', c.id),
    pasada_id: pmap.prendas[c.prenda_id],
    envio_id: c.envio_id != null && pmap.envios[c.envio_id] ? pmap.envios[c.envio_id] : null,
    aceptada: c.aceptada == null ? true : b(c.aceptada),
    obs: c.obs || null,
    calificador_id: resolveEmp(null, c.calificador),
    fecha: toTs(c.fecha) || new Date().toISOString(),
  }));

// ── reporte de resolución (calidad de datos) ──────────────────────
const sinUuid = (rows, campo) => rows.filter((r) => !r[campo]).length;
console.log(`\n=== ETL PIPELINE CORE — ${DRY ? 'DRY-RUN (no escribe)' : 'RUN (escribe)'} ===`);
console.log(`Origen SQLite → ${SB_URL}\n`);
console.log('  Conteos origen:');
console.log(`    envios_prendas      ${srcEnvios.length}`);
console.log(`    prendas             ${srcPrendas.length}`);
console.log(`    prenda_historial    ${srcHist.length}  (con prenda padre: ${outHist.length})`);
console.log(`    pipeline_puntos     ${srcPuntos.length}`);
console.log(`    prenda_calificacion ${srcCalif.length}  (con prenda padre: ${outCalif.length})`);
console.log('\n  Resolución de empleados (sin resolver → queda NULL):');
console.log(`    prendas.lavador_id    sin resolver: ${sinUuid(outPrendas, 'lavador_id')}/${outPrendas.length}`);
console.log(`    prendas.planchador_id sin resolver: ${sinUuid(outPrendas, 'planchador_id')}/${outPrendas.length}`);
console.log(`    historial.empleado_id sin resolver: ${sinUuid(outHist, 'empleado_id')}/${outHist.length}`);
console.log(`    puntos.empleado_id    sin resolver: ${sinUuid(outPuntos, 'empleado_id')}/${outPuntos.length}`);
if (orphans.size) {
  console.log('\n  ⚠ Códigos/nombres que no resolvieron a ningún empleado:');
  for (const [k, n] of [...orphans.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${k}  (${n}×)`);
}

// ── escritura ─────────────────────────────────────────────────────
if (DRY) {
  console.log('\nDRY-RUN: nada escrito. Revisá la resolución y luego corré con --run.\n');
  process.exit(0);
}

try {
  // orden por FK: envios → prendas → (historial, puntos, calif)
  await pgUpsert('envios_prendas', outEnvios, 'id');
  console.log(`  ✔ envios_prendas      ${outEnvios.length}`);
  await pgUpsert('prenda_pasada', outPrendas, 'id');
  console.log(`  ✔ prenda_pasada       ${outPrendas.length}`);
  await pgUpsert('prenda_historial', outHist, 'id');
  console.log(`  ✔ prenda_historial    ${outHist.length}`);
  await pgUpsert('pipeline_puntos', outPuntos, 'id');
  console.log(`  ✔ pipeline_puntos     ${outPuntos.length}`);
  await pgUpsert('prenda_calificacion', outCalif, 'id');
  console.log(`  ✔ prenda_calificacion ${outCalif.length}`);

  writeFileSync(PIPEMAP, JSON.stringify(pmap, null, 2));
  console.log(`\nMapa de uuids guardado en ${PIPEMAP}`);
  console.log('Listo. Verificá conteos en Supabase.\n');
} catch (e) {
  console.error(`\n[FALLO] ${e.message}\n`);
  process.exit(1);
}
