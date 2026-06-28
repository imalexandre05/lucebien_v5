// migra-reportes.mjs — Módulo Reportes FR-01 (ETL del reporte diario por turno M/T/C).
// Migra del SQLite viejo → Postgres (Supabase) las tablas del reporte + el catálogo:
//   reportes → (reporte_trabajadores, reporte_actividades, reporte_extras)
//   actividades_config (catálogo configurable) · actividades_pendientes (arrastres)
//
// - Lee el origen SQLite en READ-ONLY (no lo toca).
// - `reportes.id` es TEXT y se PRESERVA (no se genera uuid) → las hijas lo referencian igual.
// - Resuelve los pseudo-FK por nombre/cod TEXT → uuid real de empleados, usando
//   _idmap.json (E0x→uuid, lo dejó provision-empleados.mjs) + la tabla empleados del SQLite:
//     reportes.encargado/encargado_id · reportes.evaluador · reporte_trabajadores.nombre ·
//     reporte_extras.registrado_por.
// - Escribe con el cliente admin (service_role vía REST) → bypasea RLS (las nuevas aún no
//   tienen policy; eso es 0016). Por eso este ETL NO depende de la RLS.
// - Idempotente: uuid estable por fila hija (persistido en _reportes_idmap.json) + upsert
//   on_conflict=id. `reportes` upsertea por su id TEXT.
//
// Uso (desde la raíz del repo, con better-sqlite3 ya compilado):
//   node packages/db/etl/migra-reportes.mjs          -> DRY-RUN: conteos + auditoría (no escribe)
//   node packages/db/etl/migra-reportes.mjs --run     -> escribe todo
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
const SQLITE = resolve(ROOT, 'database/lucebien.db');
const ENV_FILE = resolve(ROOT, 'apps/erp-web/.env.local');
const IDMAP = resolve(__dir, '_idmap.json');
const REPMAP = resolve(__dir, '_reportes_idmap.json');

// ── args ──────────────────────────────────────────────────────────
const RUN = process.argv.slice(2).includes('--run');
const DRY = !RUN;

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
// Columnas `date`: pasar 'YYYY-MM-DD' crudo → sin corrimiento por zona horaria.
const toDate = (v) => {
  if (!v) return null;
  const s = String(v).trim().slice(0, 10);
  return s || null;
};

// ── helper REST (upsert idempotente, por lotes) ───────────────────
async function pgUpsert(table, rows, onConflict) {
  if (!rows.length) return;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!r.ok) throw new Error(`pg.${table} ${r.status}: ${await r.text()}`);
  }
}

// ── origen SQLite (read-only) ─────────────────────────────────────
const db = new Database(SQLITE, { readonly: true });
const empSql = db.prepare('SELECT id, cod, nombre FROM empleados').all();
const srcRep = db.prepare('SELECT * FROM reportes').all();
const srcTrab = db.prepare('SELECT * FROM reporte_trabajadores').all();
const srcAct = db.prepare('SELECT * FROM reporte_actividades').all();
const srcExtras = db.prepare('SELECT * FROM reporte_extras').all();
const srcConfig = db.prepare('SELECT * FROM actividades_config').all();
const srcPend = db.prepare('SELECT * FROM actividades_pendientes').all();
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
// Alias de nombres mal escritos en el origen (confirmados con el responsable) → nombre canónico.
// 'Marylin' es la misma persona que 'Mary' (E06): el origen guarda ambas grafías.
const ALIASES = { marylin: 'mary' };
for (const [alias, canon] of Object.entries(ALIASES)) {
  if (nombreToUuid[canon] && nombreToUuid[canon] !== 'AMBIG') nombreToUuid[alias] = nombreToUuid[canon];
}
const orphans = new Map();
function resolveEmp(cod, nombre) {
  if (cod != null && codToUuid[String(cod)]) return codToUuid[String(cod)];
  const n = norm(nombre);
  if (n && nombreToUuid[n] && nombreToUuid[n] !== 'AMBIG') return nombreToUuid[n];
  const key = cod ? `cod=${cod}` : nombre ? `nombre=${nombre}` : '∅';
  if (cod != null || nombre) orphans.set(key, (orphans.get(key) || 0) + 1);
  return null;
}
// encargado: primero el id viejo (E0x) si está; si no, por nombre.
function resolveEncargado(oldId, nombre) {
  if (oldId && idmap[oldId]) return idmap[oldId];
  return resolveEmp(null, nombre);
}

// ── idmap de reportes (uuid estable por fila hija, idempotencia) ───
const rmap = existsSync(REPMAP)
  ? JSON.parse(readFileSync(REPMAP, 'utf8'))
  : { trabajadores: {}, actividades: {}, extras: {}, config: {}, pendientes: {} };
const uuidFor = (sec, key) => (rmap[sec][key] ||= randomUUID());

// ── construcción de filas destino ─────────────────────────────────
const outRep = srcRep.map((r) => ({
  id: r.id, // TEXT preservado
  sede_cod: r.sede,
  turno: r.turno,
  fecha: toDate(r.fecha),
  encargado_id: resolveEncargado(r.encargado_id, r.encargado),
  puntaje: Number(r.puntaje) || 0,
  puntaje_eval: r.puntaje_eval == null ? null : Number(r.puntaje_eval),
  act_total: Number(r.act_total) || 0,
  act_done: Number(r.act_done) || 0,
  evaluado: b(r.evaluado),
  evaluador_id: resolveEmp(null, r.evaluador),
  bloqueado: b(r.bloqueado),
  auto_enviado: b(r.auto_enviado),
  auto_enviado_razon: r.auto_enviado_razon || null,
  no_evaluable: b(r.no_evaluable),
  created_at: toTs(r.created_at) || new Date().toISOString(),
}));

const repIds = new Set(srcRep.map((r) => r.id));

const outTrab = srcTrab
  .filter((t) => repIds.has(t.reporte_id)) // sin reporte padre → huérfano, se omite
  .map((t) => ({
    id: uuidFor('trabajadores', `${t.reporte_id}__${norm(t.nombre)}`),
    reporte_id: t.reporte_id,
    empleado_id: resolveEmp(null, t.nombre),
  }));

const outAct = srcAct
  .filter((a) => repIds.has(a.reporte_id))
  .map((a) => ({
    id: uuidFor('actividades', a.id),
    reporte_id: a.reporte_id,
    cod: a.cod,
    nombre: a.nombre,
    cat: a.cat || null,
    peso: Number(a.peso) || 0,
    realizada: b(a.realizada),
    obs: a.obs || null,
    calificacion: a.calificacion == null ? 1 : Number(a.calificacion),
    obs_eval: a.obs_eval || null,
  }));

const outExtras = srcExtras
  .filter((e) => repIds.has(e.reporte_id))
  .map((e) => ({
    id: uuidFor('extras', e.id),
    reporte_id: e.reporte_id,
    tipo: e.tipo,
    nombre: e.nombre,
    cantidad: Number(e.cantidad) || 1,
    precio_unitario: Number(e.precio_unitario) || 0,
    monto_total: Number(e.monto_total) || 0,
    detalle: e.detalle || null,
    registrado_por_id: resolveEmp(null, e.registrado_por),
  }));

const outConfig = srcConfig.map((c) => ({
  id: uuidFor('config', c.id),
  sede_cod: c.sede,
  cod: c.cod,
  nombre: c.nombre,
  categoria: c.categoria || 'PO',
  tipo_act: c.tipo_act || 'obligatoria',
  peso: Number(c.peso) || 0,
  activa: c.activa == null ? true : b(c.activa),
  aparece_dia: Number(c.aparece_dia) || 0,
  frecuencia_dias: Number(c.frecuencia_dias) || 0,
  turno: c.turno || 'ambos',
  dia_semana: c.dia_semana || null,
  acumula: c.acumula == null ? true : b(c.acumula),
  precio_unitario: Number(c.precio_unitario) || 0,
  unidad: c.unidad || 'unidad',
  orden: Number(c.orden) || 0,
  descuento: Number(c.descuento) || 0,
}));

const outPend = srcPend.map((p) => ({
  id: uuidFor('pendientes', p.id),
  act_cod: p.act_cod,
  sede_cod: p.sede,
  desde_fecha: toDate(p.desde_fecha),
  desde_turno: p.desde_turno || null,
  resuelta: b(p.resuelta),
  resuelta_en: toTs(p.resuelta_en),
}));

// ── reporte de resolución (calidad de datos) ──────────────────────
const sinUuid = (rows, campo) => rows.filter((r) => !r[campo]).length;
const distinct = (rows, campo) => [...new Set(rows.map((r) => r[campo]))].sort();
const encNull = outRep.filter((r, i) => (srcRep[i].encargado_id || norm(srcRep[i].encargado)) && !r.encargado_id).length;
const encTot = srcRep.filter((r) => r.encargado_id || norm(r.encargado)).length;
const evalNull = outRep.filter((r, i) => norm(srcRep[i].evaluador) && !r.evaluador_id).length;
const evalTot = srcRep.filter((r) => norm(r.evaluador)).length;

console.log(`\n=== ETL REPORTES FR-01 — ${DRY ? 'DRY-RUN (no escribe)' : 'RUN (escribe)'} ===`);
console.log(`Origen SQLite → ${SB_URL}\n`);
console.log('  Conteos origen:');
console.log(`    reportes                ${srcRep.length}`);
console.log(`    reporte_trabajadores    ${srcTrab.length}  (con reporte: ${outTrab.length})`);
console.log(`    reporte_actividades     ${srcAct.length}  (con reporte: ${outAct.length})`);
console.log(`    reporte_extras          ${srcExtras.length}  (con reporte: ${outExtras.length})`);
console.log(`    actividades_config      ${srcConfig.length}`);
console.log(`    actividades_pendientes  ${srcPend.length}`);
console.log('\n  Sedes referenciadas (deben existir en `sedes`):');
console.log(`    reportes.sede_cod           ${distinct(outRep, 'sede_cod').join(', ')}`);
console.log(`    actividades_config.sede_cod ${distinct(outConfig, 'sede_cod').join(', ')}`);
console.log('\n  Resolución de empleados (sin resolver → queda NULL):');
console.log(`    reportes.encargado_id    sin resolver: ${encNull}/${encTot} (con encargado)`);
console.log(`    reportes.evaluador_id    sin resolver: ${evalNull}/${evalTot} (con evaluador)`);
console.log(`    trabajadores.empleado_id sin resolver: ${sinUuid(outTrab, 'empleado_id')}/${outTrab.length}`);
console.log(`    extras.registrado_por_id sin resolver: ${sinUuid(outExtras, 'registrado_por_id')}/${outExtras.length}`);
if (orphans.size) {
  console.log('\n  ⚠ Nombres/códigos que no resolvieron a ningún empleado:');
  for (const [k, n] of [...orphans.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${k}  (${n}×)`);
}

// ── escritura ─────────────────────────────────────────────────────
if (DRY) {
  console.log('\nDRY-RUN: nada escrito. Revisá la resolución y luego corré con --run.\n');
  process.exit(0);
}

// Persistir los uuids ANTES de escribir: si una tabla falla a media carga, el re-run
// reusa los mismos uuids (idempotente, upsert on_conflict=id) en vez de duplicar hijas.
writeFileSync(REPMAP, JSON.stringify(rmap, null, 2));

try {
  // orden por FK: reportes → (trabajadores, actividades, extras); config/pendientes son independientes
  await pgUpsert('reportes', outRep, 'id');
  console.log(`  ✔ reportes                ${outRep.length}`);
  await pgUpsert('reporte_trabajadores', outTrab, 'id');
  console.log(`  ✔ reporte_trabajadores    ${outTrab.length}`);
  await pgUpsert('reporte_actividades', outAct, 'id');
  console.log(`  ✔ reporte_actividades     ${outAct.length}`);
  await pgUpsert('reporte_extras', outExtras, 'id');
  console.log(`  ✔ reporte_extras          ${outExtras.length}`);
  await pgUpsert('actividades_config', outConfig, 'id');
  console.log(`  ✔ actividades_config      ${outConfig.length}`);
  await pgUpsert('actividades_pendientes', outPend, 'id');
  console.log(`  ✔ actividades_pendientes  ${outPend.length}`);

  writeFileSync(REPMAP, JSON.stringify(rmap, null, 2));
  console.log(`\nMapa de uuids guardado en ${REPMAP}`);
  console.log('Listo. Verificá conteos en Supabase.\n');
} catch (e) {
  console.error(`\n[FALLO] ${e.message}\n`);
  process.exit(1);
}
