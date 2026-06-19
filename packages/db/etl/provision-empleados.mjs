// provision-empleados.mjs — Fase 1 de la migración.
// Migra empleados (SQLite del ERP viejo) → Postgres (Supabase) + usuarios de Supabase Auth.
//
// - Lee el origen SQLite en READ-ONLY (no lo toca).
// - Crea el usuario Auth con `password_hash = cod_hash` → el empleado entra con su
//   MISMO código de 4 dígitos (cod_hash es bcrypt del código). Sin resets.
// - Inserta el empleado en Postgres con `id == auth.users.id` (lo exige la RLS: auth.uid()=empleados.id).
// - Inserta empleado_tiendas (N:M) y fija sede_cod primaria = primera tienda.
// - Idempotente: reutiliza el usuario Auth si el email ya existe; upsert por `cod`.
// - Persiste el mapa E01→uuid en _idmap.json (lo usan las demás fases del ETL).
//
// Uso (desde la raíz del repo):
//   node packages/db/etl/provision-empleados.mjs              -> DRY-RUN (no escribe, muestra plan)
//   node packages/db/etl/provision-empleados.mjs --only E01   -> escribe SOLO ese empleado (prueba)
//   node packages/db/etl/provision-empleados.mjs --run        -> escribe los 18
//
// Config: lee apps/erp-web/.env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
//         y database/lucebien.db.

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
const EMAIL_DOMAIN = 'lucebien.local';

// ── args ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const RUN = argv.includes('--run');
const onlyIdx = argv.indexOf('--only');
const ONLY = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
const DRY = !RUN && !ONLY;
const LIVE = RUN || !!ONLY; // escribe?

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
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
const emailDe = (cod) => `${cod}@${EMAIL_DOMAIN}`;

// ── origen ────────────────────────────────────────────────────────
const db = new Database(SQLITE, { readonly: true });
let empleados = db.prepare('SELECT * FROM empleados ORDER BY id').all();
if (ONLY) empleados = empleados.filter((e) => e.id === ONLY);
const tiendasPorEmp = {};
for (const t of db.prepare('SELECT emp_id, tienda FROM empleado_tiendas').all()) {
  (tiendasPorEmp[t.emp_id] ||= []).push(t.tienda);
}
db.close();

// ── idmap (idempotencia entre corridas) ───────────────────────────
const idmap = existsSync(IDMAP) ? JSON.parse(readFileSync(IDMAP, 'utf8')) : {};

// ── helpers REST (GoTrue admin + PostgREST) ───────────────────────
async function authFindByEmail(email) {
  const r = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=200`, { headers: H });
  if (!r.ok) return null;
  const j = await r.json();
  const users = j.users || (Array.isArray(j) ? j : []);
  return users.find((u) => u.email === email) || null;
}
async function authCreate(emp, uuid) {
  const body = {
    id: uuid,
    email: emailDe(emp.cod),
    email_confirm: true,
    user_metadata: { cod: emp.cod, nombre: emp.nombre, rol: emp.rol },
  };
  if (emp.cod_hash) body.password_hash = emp.cod_hash; // bcrypt del código → login con el código
  const r = await fetch(`${SB_URL}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`auth.create ${r.status}: ${JSON.stringify(j)}`);
  return j.id || uuid;
}
async function pgUpsert(table, row, onConflict) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`pg.${table} ${r.status}: ${await r.text()}`);
}

function mapEmpleado(emp, uuid) {
  const sedes = tiendasPorEmp[emp.id] || [];
  return {
    id: uuid,
    cod: emp.cod,
    nombre: emp.nombre,
    iniciales: emp.iniciales || (emp.nombre || '?').slice(0, 2).toUpperCase(),
    rol: emp.rol || 'confeccionista',
    sede_cod: sedes[0] || null,
    activo: emp.activo === 1 || emp.activo === true,
    estado: emp.estado || 'activo',
    password_hash: emp.password_hash || '',
    dni: emp.dni || '',
    telefono: emp.telefono || '',
    direccion: emp.direccion || '',
    fecha_nacimiento: emp.fecha_nacimiento || null,
    fecha_ingreso: emp.fecha_ingreso || null,
    contacto_emergencia: emp.contacto_emergencia || '',
    tel_emergencia: emp.tel_emergencia || '',
    salario_base: emp.salario_base || 0,
    notas: emp.notas || '',
  };
}

// ── main ──────────────────────────────────────────────────────────
console.log(`\n=== PROVISIÓN EMPLEADOS — ${DRY ? 'DRY-RUN (no escribe)' : (ONLY ? 'SOLO ' + ONLY : 'RUN (todos)')} ===`);
console.log(`Origen: ${empleados.length} empleados | Destino: ${SB_URL}\n`);

let ok = 0, fail = 0;
const sinCodHash = [];

for (const emp of empleados) {
  const email = emailDe(emp.cod);
  const sedes = tiendasPorEmp[emp.id] || [];
  if (!emp.cod_hash) sinCodHash.push(emp.id);

  if (DRY) {
    console.log(
      `  ${emp.id}  cod=${emp.cod}  ${email}  rol=${emp.rol}  ` +
      `sede=${sedes[0] || '—'}${sedes.length > 1 ? ' (+' + (sedes.length - 1) + ')' : ''}  ` +
      `login-código=${emp.cod_hash ? 'sí' : 'NO (sin cod_hash)'}`
    );
    continue;
  }

  try {
    // 1) usuario Auth (reusa si ya existe)
    let uuid = idmap[emp.id];
    const existente = await authFindByEmail(email);
    if (existente) {
      uuid = existente.id;
    } else {
      uuid = uuid || randomUUID();
      uuid = await authCreate(emp, uuid);
    }
    idmap[emp.id] = uuid;

    // 2) empleado (id == auth uid)
    await pgUpsert('empleados', mapEmpleado(emp, uuid), 'cod');

    // 3) empleado_tiendas
    for (const tienda of sedes) {
      await pgUpsert('empleado_tiendas', { empleado_id: uuid, sede_cod: tienda }, 'empleado_id,sede_cod');
    }

    console.log(`  ✔ ${emp.id} → ${uuid}  (${email}, sedes: ${sedes.join(',') || '—'})`);
    ok++;
  } catch (e) {
    console.error(`  [FALLO] ${emp.id}: ${e.message}`);
    fail++;
  }
}

if (LIVE) {
  writeFileSync(IDMAP, JSON.stringify(idmap, null, 2));
  console.log(`\nMapa E0x→uuid guardado en ${IDMAP}`);
  console.log(`Resultado: ${ok} ok, ${fail} fallidos.`);
}
if (sinCodHash.length) {
  console.log(`\n⚠ Sin cod_hash (no podrán entrar con código hasta resetear): ${sinCodHash.join(', ')}`);
}
console.log('');
