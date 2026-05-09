// ════════════════════════════════════════════════════════════════════
//  LUCEBIEN · migracion_produccion.js
//  ──────────────────────────────────────────────────────────────────
//  Script de migración SEGURO para la BD viva (database/lucebien.db).
//  - No borra datos.
//  - No reescribe tablas existentes.
//  - Es idempotente: correrlo dos veces no hace daño.
//
//  USO desde la raíz del proyecto en la PC de producción:
//      node migracion_produccion.js
//
//  Pasos previos (HACERLOS ANTES de ejecutar este script):
//   1. Asegurarse de que NADIE esté usando el sistema en ese momento.
//   2. Detener PM2:    pm2 stop LuceBienApp   (o el nombre real)
//   3. Hacer backup:   copy database\lucebien.db database\lucebien_pre_migracion.db
//
//  Después de ejecutar:
//   4. Reemplazar los archivos del bundle (frontend + backend).
//   5. Reiniciar PM2:  pm2 restart LuceBienApp
//
//  Si algo falla: restaurar el backup hecho en el paso 3 y avisar.
// ════════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const fs   = require('fs');

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('\n❌  No se pudo cargar better-sqlite3.');
  console.error('    Ejecuta este script desde la RAÍZ del proyecto LuceBien');
  console.error('    (donde existe node_modules/better-sqlite3).\n');
  process.exit(1);
}

const DB_PATH = path.join(__dirname, 'database', 'lucebien.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('\n❌  No existe el archivo:', DB_PATH);
  console.error('    ¿Estás corriendo este script desde la raíz del proyecto?\n');
  process.exit(1);
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  MIGRACIÓN PRODUCCIÓN · LUCEBIEN');
console.log('══════════════════════════════════════════════════════════');
console.log('  BD destino:', DB_PATH);
const sizeMB = (fs.statSync(DB_PATH).size / (1024*1024)).toFixed(2);
console.log('  Tamaño actual:', sizeMB, 'MB');
console.log('──────────────────────────────────────────────────────────');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Resultado acumulado para reportar al final
const ok       = [];
const skip     = [];
const errores  = [];

// Helper: ejecuta SQL y captura "duplicate column" / "already exists" como skip
function tryExec(label, sql) {
  try {
    db.exec(sql);
    ok.push(label);
    console.log('  ✓', label);
  } catch (e) {
    const msg = (e.message || '').toLowerCase();
    if (msg.includes('duplicate column') || msg.includes('already exists') || msg.includes('duplicate index')) {
      skip.push(label);
      console.log('  ·', label, '(ya estaba aplicada)');
    } else {
      errores.push({ label, error: e.message });
      console.log('  ✗', label, '→', e.message);
    }
  }
}

// Helper: comprueba si una columna existe en una tabla (PRAGMA table_info)
function colExists(table, col) {
  try {
    const rows = db.prepare("PRAGMA table_info(" + table + ")").all();
    return rows.some(r => r.name === col);
  } catch (e) { return false; }
}
function indexExists(name) {
  try {
    const r = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(name);
    return !!r;
  } catch (e) { return false; }
}

console.log('\n  ── 1. NUEVAS COLUMNAS (idempotente) ──');

// FIX B5: marcado de prendas divididas (sin DELETE)
if (!colExists('prendas','dividida')) {
  tryExec('prendas.dividida (INTEGER DEFAULT 0)',
    "ALTER TABLE prendas ADD COLUMN dividida INTEGER DEFAULT 0");
} else { skip.push('prendas.dividida'); console.log('  ·', 'prendas.dividida (ya existe)'); }

if (!colExists('prendas','dividida_en')) {
  tryExec('prendas.dividida_en (TEXT)',
    "ALTER TABLE prendas ADD COLUMN dividida_en TEXT");
} else { skip.push('prendas.dividida_en'); console.log('  ·', 'prendas.dividida_en (ya existe)'); }

// FIX B6: trazabilidad por código además de nombre del operario
if (!colExists('prenda_historial','cod_responsable')) {
  tryExec('prenda_historial.cod_responsable (TEXT)',
    "ALTER TABLE prenda_historial ADD COLUMN cod_responsable TEXT");
} else { skip.push('prenda_historial.cod_responsable'); console.log('  ·', 'prenda_historial.cod_responsable (ya existe)'); }

// Refuerzo de columnas en accesorios_log (si vienes de una versión anterior a v5.4)
const accCols = [
  ['sede_origen', "ALTER TABLE accesorios_log ADD COLUMN sede_origen TEXT DEFAULT 'AL'"],
  ['enviado',    "ALTER TABLE accesorios_log ADD COLUMN enviado INTEGER DEFAULT 0"],
  ['envio_id',   "ALTER TABLE accesorios_log ADD COLUMN envio_id INTEGER"],
  ['sustento',   "ALTER TABLE accesorios_log ADD COLUMN sustento TEXT DEFAULT ''"],
  ['origen',     "ALTER TABLE accesorios_log ADD COLUMN origen TEXT DEFAULT 'almacen'"]
];
accCols.forEach(([col, sql]) => {
  if (!colExists('accesorios_log', col)) {
    tryExec('accesorios_log.' + col, sql);
  } else { skip.push('accesorios_log.' + col); console.log('  ·', 'accesorios_log.' + col, '(ya existe)'); }
});

console.log('\n  ── 2. ÍNDICES DE PERFORMANCE (idempotente) ──');

const indices = [
  ['idx_prendas_etapa',     "CREATE INDEX IF NOT EXISTS idx_prendas_etapa ON prendas(etapa)"],
  ['idx_prendas_envio',     "CREATE INDEX IF NOT EXISTS idx_prendas_envio ON prendas(envio_id)"],
  ['idx_prenda_hist_pid',   "CREATE INDEX IF NOT EXISTS idx_prenda_hist_pid ON prenda_historial(prenda_id)"],
  ['idx_prenda_hist_fecha', "CREATE INDEX IF NOT EXISTS idx_prenda_hist_fecha ON prenda_historial(fecha)"],
  ['idx_prenda_hist_resp',  "CREATE INDEX IF NOT EXISTS idx_prenda_hist_resp  ON prenda_historial(responsable)"],
  ['idx_acc_log_fecha',     "CREATE INDEX IF NOT EXISTS idx_acc_log_fecha ON accesorios_log(fecha)"],
  ['idx_envios_sede',       "CREATE INDEX IF NOT EXISTS idx_envios_sede ON envios_prendas(sede_destino, validado_tienda)"]
];
indices.forEach(([name, sql]) => {
  if (indexExists(name)) {
    skip.push('índice ' + name);
    console.log('  ·', 'índice', name, '(ya existe)');
  } else {
    tryExec('índice ' + name, sql);
  }
});

console.log('\n  ── 3. TABLAS NUEVAS (CREATE IF NOT EXISTS) ──');

tryExec('envios_accesorios',
  "CREATE TABLE IF NOT EXISTS envios_accesorios (" +
  "  id INTEGER PRIMARY KEY AUTOINCREMENT," +
  "  sede_destino TEXT NOT NULL," +
  "  fecha TEXT NOT NULL," +
  "  responsable TEXT," +
  "  responsable_cod TEXT," +
  "  validado_tienda INTEGER DEFAULT 0," +
  "  validado_por TEXT," +
  "  fecha_validado TEXT," +
  "  obs TEXT," +
  "  created_at TEXT DEFAULT (datetime('now','localtime'))" +
  ")"
);

tryExec('envio_accesorios_items',
  "CREATE TABLE IF NOT EXISTS envio_accesorios_items (" +
  "  id INTEGER PRIMARY KEY AUTOINCREMENT," +
  "  envio_id INTEGER NOT NULL," +
  "  tipo TEXT NOT NULL," +
  "  cantidad INTEGER DEFAULT 0," +
  "  obs TEXT," +
  "  FOREIGN KEY (envio_id) REFERENCES envios_accesorios(id)" +
  ")"
);

console.log('\n  ── 4. VERIFICACIÓN POST-MIGRACIÓN ──');

const checklist = [
  ['Columna prendas.dividida',          () => colExists('prendas','dividida')],
  ['Columna prendas.dividida_en',       () => colExists('prendas','dividida_en')],
  ['Columna prenda_historial.cod_resp', () => colExists('prenda_historial','cod_responsable')],
  ['Índice idx_prendas_etapa',          () => indexExists('idx_prendas_etapa')],
  ['Índice idx_prendas_envio',          () => indexExists('idx_prendas_envio')],
  ['Índice idx_prenda_hist_pid',        () => indexExists('idx_prenda_hist_pid')],
  ['Índice idx_envios_sede',            () => indexExists('idx_envios_sede')],
  ['Tabla envios_accesorios',           () => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='envios_accesorios'").get()],
  ['Tabla envio_accesorios_items',      () => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='envio_accesorios_items'").get()]
];
let okCount = 0, failCount = 0;
checklist.forEach(([label, check]) => {
  const r = check();
  console.log('  ' + (r ? '✓' : '✗'), label);
  if (r) okCount++; else failCount++;
});

// Conteos de seguridad — no se modifica ninguna fila, solo se cuenta para
// confirmar que la migración no afectó la integridad de los datos.
console.log('\n  ── 5. CONTEOS DE INTEGRIDAD (solo lectura) ──');
function safeCount(table) {
  try { return db.prepare("SELECT COUNT(*) as n FROM " + table).get().n; }
  catch(e){ return 'N/A ('+e.message+')'; }
}
console.log('  · prendas              :', safeCount('prendas'));
console.log('  · prenda_historial     :', safeCount('prenda_historial'));
console.log('  · pipeline_puntos      :', safeCount('pipeline_puntos'));
console.log('  · envios_prendas       :', safeCount('envios_prendas'));
console.log('  · accesorios_log       :', safeCount('accesorios_log'));
console.log('  · envios_accesorios    :', safeCount('envios_accesorios'));
console.log('  · prenda_calificacion  :', safeCount('prenda_calificacion'));

console.log('\n══════════════════════════════════════════════════════════');
console.log('  RESUMEN');
console.log('══════════════════════════════════════════════════════════');
console.log('  Aplicadas:  ', ok.length);
console.log('  Ya existían:', skip.length);
console.log('  Errores:    ', errores.length);
console.log('  Verificación post-migración:', okCount, 'ok /', failCount, 'pendientes');

if (errores.length) {
  console.log('\n  ⚠  Errores que requieren atención:');
  errores.forEach(e => console.log('     -', e.label, '→', e.error));
  console.log('\n  La BD NO se reemplazó ni se borró nada. Si los errores');
  console.log('  son inesperados, restaura el backup de seguridad.\n');
  process.exit(2);
}

if (failCount > 0) {
  console.log('\n  ⚠  Algunas verificaciones no pasaron. Revisa la lista arriba.');
  console.log('     Si algo no se aplicó por una excepción esperada (ya existía)');
  console.log('     puedes ignorar el aviso. Si dudas, restaura el backup.\n');
  process.exit(3);
}

console.log('\n  ✓ Migración completada sin errores.');
console.log('  Próximo paso: reemplaza los archivos del bundle y reinicia PM2.\n');

db.close();
process.exit(0);
