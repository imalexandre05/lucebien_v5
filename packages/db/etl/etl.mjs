// ETL one-shot SQLite (ERP viejo) → Postgres (Supabase). W4 — ESQUELETO.
// Idempotente, read-only sobre el origen, loguea huérfanos sin fallar. Ver docs/mapeo-migracion.md.
//
// Uso (cuando esté completo):
//   SUPABASE_DB_URL=postgres://... node packages/db/etl/etl.mjs --sqlite ./snapshot.db --dry-run
//
// Estado: estructura + resolución de pseudo-FK. Los loops por tabla están marcados con TODO.

import { appendFileSync } from 'node:fs';

const LOG = 'etl_huerfanos.log';
const logHuerfano = (tabla, valor) =>
  appendFileSync(LOG, `[${tabla}] sin match: ${JSON.stringify(valor)}\n`);

// Normaliza nombres para el match difuso: trim, lower y quita tildes (descompone y filtra
// las marcas combinantes U+0300–U+036F sin usar un regex con caracteres combinantes literales).
const norm = (s) =>
  [...(s ?? '').toString().trim().toLowerCase().normalize('NFD')]
    .filter((c) => {
      const cp = c.charCodeAt(0);
      return cp < 0x300 || cp > 0x36f;
    })
    .join('');

// Construye el mapa de equivalencia nombre/cod → empleado_id (uuid) a partir de empleados.
function buildEmpleadoIndex(empleados) {
  const porCod = new Map();
  const porNombre = new Map();
  for (const e of empleados) {
    if (e.cod) porCod.set(e.cod, e.id);
    if (e.nombre) porNombre.set(norm(e.nombre), e.id);
  }
  return {
    // Resuelve un pseudo-FK: intenta por cod, luego por nombre; si no, loguea y devuelve null.
    resolver(tabla, { nombre, cod } = {}) {
      if (cod && porCod.has(cod)) return porCod.get(cod);
      if (nombre && porNombre.has(norm(nombre))) return porNombre.get(norm(nombre));
      logHuerfano(tabla, { nombre, cod });
      return null;
    },
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  // TODO: abrir SQLite (better-sqlite3, read-only) y cliente Postgres (pg) desde SUPABASE_DB_URL.
  // const empleados = sqlite.prepare('SELECT id, cod, nombre FROM empleados').all();
  const empleados = []; // placeholder
  const idx = buildEmpleadoIndex(empleados);

  // Orden de carga (respeta FKs): sedes → empleados → empleado_tiendas → config →
  // clientes/inventario_activo → pedidos/pedido_items → prenda_pasada → historial/puntos/envios →
  // reportes(+hijas) → incidencias → evaluaciones → asistencias → pagos.
  //
  // Ejemplo de patrón por tabla con pseudo-FK (incidencias):
  // for (const r of sqlite.prepare('SELECT * FROM incidencias').all()) {
  //   const responsable_id   = idx.resolver('incidencias.responsable',   { nombre: r.responsable });
  //   const reportado_por_id = idx.resolver('incidencias.reportado_por', { nombre: r.reportado_por, cod: r.reportado_por_cod });
  //   if (!dryRun) upsertIncidencia({ ...r, responsable_id, reportado_por_id });
  // }

  console.log(`ETL ${dryRun ? '(dry-run) ' : ''}listo para implementar. Huerfanos -> ${LOG}`);
  void idx;
}

main().catch((e) => {
  console.error('ETL fallo:', e.message);
  process.exit(1);
});
