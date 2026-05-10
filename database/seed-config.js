const { getDB } = require('./db');

function ensureTables() {
  var db = getDB();
  try { db.exec("CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT)"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS reportes (id TEXT PRIMARY KEY, sede TEXT, turno TEXT, fecha TEXT, encargado TEXT, puntaje INTEGER DEFAULT 0, puntaje_eval INTEGER DEFAULT 0, act_total INTEGER DEFAULT 0, act_done INTEGER DEFAULT 0, evaluado INTEGER DEFAULT 0, evaluador TEXT, bloqueado INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS reporte_trabajadores (id INTEGER PRIMARY KEY AUTOINCREMENT, reporte_id TEXT, nombre TEXT)"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS reporte_actividades (id INTEGER PRIMARY KEY AUTOINCREMENT, reporte_id TEXT, cod TEXT, nombre TEXT, cat TEXT, peso REAL DEFAULT 0, realizada INTEGER DEFAULT 0, calificacion REAL, obs TEXT, obs_eval TEXT)"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS reporte_extras (id INTEGER PRIMARY KEY AUTOINCREMENT, reporte_id TEXT, tipo TEXT, nombre TEXT, cantidad INTEGER DEFAULT 1, precio_unitario REAL DEFAULT 0, monto_total REAL DEFAULT 0, detalle TEXT, registrado_por TEXT)"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS actividades_config (id INTEGER PRIMARY KEY AUTOINCREMENT, sede TEXT NOT NULL DEFAULT 'GLOBAL', cod TEXT NOT NULL, nombre TEXT NOT NULL, categoria TEXT DEFAULT 'PO', tipo_act TEXT DEFAULT 'obligatoria', peso REAL DEFAULT 5, precio_unitario REAL DEFAULT 0, unidad TEXT DEFAULT 'unidad', turno TEXT DEFAULT 'ambos', aparece_dia INTEGER DEFAULT 0, frecuencia_dias INTEGER DEFAULT 0, dia_semana TEXT DEFAULT '', acumula INTEGER DEFAULT 0, orden INTEGER DEFAULT 0, activa INTEGER DEFAULT 1, descuento REAL DEFAULT 0, UNIQUE(sede, cod))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS actividades_pendientes (id INTEGER PRIMARY KEY AUTOINCREMENT, act_cod TEXT, sede TEXT, desde_fecha TEXT, desde_turno TEXT, resuelta INTEGER DEFAULT 0, resuelta_en TEXT, UNIQUE(act_cod, sede, desde_fecha))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS incidencias (id INTEGER PRIMARY KEY AUTOINCREMENT, sede TEXT, fecha TEXT, tipo TEXT, descripcion TEXT, nivel TEXT DEFAULT 'Medio', responsable TEXT, reporte_id TEXT, reportado_por TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS evaluaciones_valores (id INTEGER PRIMARY KEY AUTOINCREMENT, evaluador_id INTEGER, evaluado_id INTEGER, mes TEXT, integridad INTEGER, respeto INTEGER, honestidad INTEGER, amabilidad INTEGER, relacion INTEGER, actitud INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')), UNIQUE(evaluador_id, evaluado_id, mes))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS evaluaciones_mensuales (id TEXT PRIMARY KEY, emp_id INTEGER, mes TEXT, evaluador TEXT, nota_competencias REAL DEFAULT 0, nota_valores REAL DEFAULT 0, nota_operaciones REAL DEFAULT 0, nota_tardanza REAL DEFAULT 0, descuento_incidencias REAL DEFAULT 0, nota_final REAL DEFAULT 0, recomendacion TEXT, obs_general TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT, hora TEXT, usuario_id TEXT, usuario_nombre TEXT, sede TEXT, accion TEXT, modulo TEXT, detalle TEXT, ip TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS horarios (id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id INTEGER NOT NULL, dia TEXT NOT NULL, turno TEXT NOT NULL DEFAULT 'M', sede TEXT NOT NULL, hora_inicio TEXT, hora_fin TEXT, activo INTEGER DEFAULT 1, UNIQUE(emp_id, dia, turno))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS ventas_metas (id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id INTEGER NOT NULL, mes TEXT NOT NULL, meta_soles REAL DEFAULT 0, vendido_soles REAL DEFAULT 0, bonus_nota REAL DEFAULT 0, registrado_por TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), UNIQUE(emp_id, mes))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS layout_zonas (id INTEGER PRIMARY KEY AUTOINCREMENT, sede TEXT NOT NULL, cod TEXT DEFAULT '', nombre TEXT DEFAULT '', turno TEXT DEFAULT 'ambos', tipo TEXT DEFAULT 'mueble', peso INTEGER DEFAULT 1, pos_x REAL DEFAULT 0, pos_y REAL DEFAULT 0, ancho REAL DEFAULT 60, alto REAL DEFAULT 40, color TEXT DEFAULT '#3b82f6', forma TEXT DEFAULT 'rect', orden INTEGER DEFAULT 0)"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS solicitudes (id INTEGER PRIMARY KEY AUTOINCREMENT, sede TEXT, solicitante TEXT, fecha TEXT, urgencia TEXT DEFAULT 'media', estado TEXT DEFAULT 'pendiente', obs TEXT, obs_respuesta TEXT, aprobado_por TEXT, fecha_respuesta TEXT, entregado_por TEXT, fecha_entrega TEXT, confirmado INTEGER DEFAULT 0, confirmado_por TEXT, fecha_confirmacion TEXT, rechazado_por TEXT, motivo_rechazo TEXT, pedido_impreso INTEGER DEFAULT 0, confirmacion_impresa INTEGER DEFAULT 0, fecha_pedido_impreso TEXT, fecha_confirmacion_impresa TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS solicitud_items (id INTEGER PRIMARY KEY AUTOINCREMENT, solicitud_id INTEGER, categoria TEXT DEFAULT 'prenda', tipo TEXT, cantidad INTEGER DEFAULT 1, cantidad_enviada INTEGER DEFAULT 0, cantidad_recibida INTEGER DEFAULT 0, color TEXT, talla TEXT, tela TEXT, modelo TEXT, detalle TEXT, obs TEXT DEFAULT '', obs_recepcion TEXT DEFAULT '', estado_item TEXT DEFAULT 'pendiente')"); } catch(e) {}
  // Ensure new columns on empleados
  try { db.exec("ALTER TABLE empleados ADD COLUMN nombre_completo TEXT DEFAULT ''"); } catch(e) {}
  try { db.exec("ALTER TABLE empleados ADD COLUMN password_hash TEXT DEFAULT ''"); } catch(e) {}
  try { db.exec("ALTER TABLE empleados ADD COLUMN salario_base REAL DEFAULT 0"); } catch(e) {}
  try { db.exec("ALTER TABLE empleados ADD COLUMN tipo_jornada TEXT DEFAULT 'completo'"); } catch(e) {}
  // Ensure new columns on reporte_extras
  try { db.exec("ALTER TABLE reporte_extras ADD COLUMN registrado_por TEXT DEFAULT ''"); } catch(e) {}
  console.log('✅ All tables ensured');
}

function seedConfig() {
  var db = getDB();
  var ins = db.prepare('INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)');
  ins.run('peso_operaciones','10');ins.run('peso_limpieza','10');ins.run('peso_software','10');
  ins.run('peso_valores360','25');ins.run('peso_competencias','25');ins.run('peso_conocimientos','15');ins.run('peso_tardanzas','5');
  ins.run('inc_uniforme','1');ins.run('inc_orden_limpieza','1');ins.run('inc_documentacion','2');
  ins.run('inc_equipos_electricos','3');ins.run('inc_seguridad_cerrar','4');ins.run('inc_graves','8');ins.run('inc_otros','2');
  ins.run('hora_inicio_m','08:00');ins.run('hora_inicio_t','14:00');ins.run('hora_fin_m','14:00');ins.run('hora_fin_t','20:00');
  ins.run('pipeline_meta_mensual','80');ins.run('pipeline_meta_semanal','20');ins.run('pipeline_precio_punto','0.05');
  ins.run('eval_valores_habilitado','0');
  console.log('✅ Config defaults seeded');
}

function ensureAsistencias() {
  var db = getDB();
  try { db.exec("CREATE TABLE IF NOT EXISTS asistencias (id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id INTEGER NOT NULL, fecha TEXT NOT NULL, hora_entrada TEXT, hora_salida TEXT, turno TEXT DEFAULT 'M', tipo_jornada TEXT DEFAULT 'completo', minutos_tardanza INTEGER DEFAULT 0, fuente TEXT DEFAULT 'manual', obs TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), UNIQUE(emp_id, fecha, turno))"); } catch(e) {}
  console.log('✅ Asistencias table ready');
}

// Índices en FKs y columnas filtrables. Idempotente — todos con IF NOT EXISTS.
// Crear estos al boot evita degradación de queries conforme crece la BD.
function ensureIndexes() {
  var db = getDB();
  var sqls = [
    'CREATE INDEX IF NOT EXISTS idx_rep_act_repid ON reporte_actividades(reporte_id)',
    'CREATE INDEX IF NOT EXISTS idx_rep_trab_repid ON reporte_trabajadores(reporte_id)',
    'CREATE INDEX IF NOT EXISTS idx_rep_extras_repid ON reporte_extras(reporte_id)',
    'CREATE INDEX IF NOT EXISTS idx_lista_items_lid ON lista_items(lista_id)',
    'CREATE INDEX IF NOT EXISTS idx_envio_acc_items_eid ON envio_accesorios_items(envio_id)',
    'CREATE INDEX IF NOT EXISTS idx_solic_items_sid ON solicitud_items(solicitud_id)',
    'CREATE INDEX IF NOT EXISTS idx_reportes_fecha ON reportes(fecha)',
    'CREATE INDEX IF NOT EXISTS idx_reportes_sede ON reportes(sede)',
    'CREATE INDEX IF NOT EXISTS idx_rep_trab_nombre ON reporte_trabajadores(nombre)',
    'CREATE INDEX IF NOT EXISTS idx_incidencias_fecha ON incidencias(fecha)',
    'CREATE INDEX IF NOT EXISTS idx_incidencias_resp ON incidencias(responsable)',
    'CREATE INDEX IF NOT EXISTS idx_asist_emp_fecha ON asistencias(emp_id, fecha)',
    'CREATE INDEX IF NOT EXISTS idx_asist_fecha ON asistencias(fecha)',
    'CREATE INDEX IF NOT EXISTS idx_emp_tiendas_emp ON empleado_tiendas(emp_id)',
    'CREATE INDEX IF NOT EXISTS idx_emp_tiendas_tienda ON empleado_tiendas(tienda)',
    'CREATE INDEX IF NOT EXISTS idx_prenda_calif_pid ON prenda_calificacion(prenda_id)'
  ];
  var n = 0;
  sqls.forEach(function(s){ try { db.exec(s); n++; } catch(e){} });
  console.log('✅ Indexes ensured ('+n+'/'+sqls.length+')');
}

module.exports = { ensureTables, seedConfig, ensureAsistencias, ensureIndexes };

if (require.main === module) {
  ensureTables();
  seedConfig();
  ensureAsistencias();
  ensureIndexes();
}
