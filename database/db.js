// ═══════════════════════════════════════════════════════
// LUCEBIEN · database/db.js v5.0
// Tablas: empleados, reportes, pipeline prendas, solicitudes,
//         actividades (3 tipos), préstamos, garantías
// ═══════════════════════════════════════════════════════
const Database = require('better-sqlite3');
const path     = require('path');
const DB_PATH  = path.join(__dirname, 'lucebien.db');
let db;

function getDB() { if (!db) db = new Database(DB_PATH); return db; }

function initDB() {
  const d = getDB();
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');

  d.exec(`
    -- ═══ EMPLEADOS ═══
    CREATE TABLE IF NOT EXISTS empleados (
      id TEXT PRIMARY KEY, cod TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL,
      iniciales TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'trabajador',
      activo INTEGER NOT NULL DEFAULT 1, cod_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS empleado_tiendas (
      emp_id TEXT NOT NULL, tienda TEXT NOT NULL,
      PRIMARY KEY (emp_id, tienda), FOREIGN KEY (emp_id) REFERENCES empleados(id)
    );

    -- ═══ REPORTES FR01 ═══
    CREATE TABLE IF NOT EXISTS reportes (
      id TEXT PRIMARY KEY, sede TEXT NOT NULL, turno TEXT NOT NULL,
      fecha TEXT NOT NULL, encargado TEXT,
      puntaje INTEGER DEFAULT 0, puntaje_eval INTEGER,
      act_total INTEGER DEFAULT 0, act_done INTEGER DEFAULT 0,
      evaluado INTEGER DEFAULT 0, evaluador TEXT, bloqueado INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS reporte_trabajadores (
      reporte_id TEXT NOT NULL, nombre TEXT NOT NULL,
      FOREIGN KEY (reporte_id) REFERENCES reportes(id)
    );
    CREATE TABLE IF NOT EXISTS reporte_actividades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporte_id TEXT NOT NULL, cod TEXT NOT NULL, nombre TEXT NOT NULL,
      cat TEXT, peso INTEGER DEFAULT 0, realizada INTEGER DEFAULT 0,
      obs TEXT, calificacion REAL DEFAULT 1,
      FOREIGN KEY (reporte_id) REFERENCES reportes(id)
    );
    -- Actividades extras registradas en un reporte
    CREATE TABLE IF NOT EXISTS reporte_extras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporte_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      cantidad INTEGER DEFAULT 1,
      precio_unitario REAL DEFAULT 0,
      monto_total REAL DEFAULT 0,
      detalle TEXT,
      FOREIGN KEY (reporte_id) REFERENCES reportes(id)
    );

    -- ═══ ACTIVIDADES CONFIGURABLES (admin) ═══
    CREATE TABLE IF NOT EXISTS actividades_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sede TEXT NOT NULL, cod TEXT NOT NULL, nombre TEXT NOT NULL,
      categoria TEXT DEFAULT 'PO',
      tipo_act TEXT DEFAULT 'obligatoria',
      peso INTEGER DEFAULT 5, activa INTEGER DEFAULT 1,
      aparece_dia INTEGER DEFAULT 0,
      frecuencia_dias INTEGER DEFAULT 0,
      turno TEXT DEFAULT 'ambos',
      dia_semana TEXT,
      acumula INTEGER DEFAULT 1,
      precio_unitario REAL DEFAULT 0,
      unidad TEXT DEFAULT 'unidad',
      orden INTEGER DEFAULT 0,
      UNIQUE(sede, cod)
    );
    CREATE TABLE IF NOT EXISTS actividades_pendientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      act_cod TEXT NOT NULL, sede TEXT NOT NULL,
      desde_fecha TEXT, desde_turno TEXT,
      resuelta INTEGER DEFAULT 0, resuelta_en TEXT,
      UNIQUE(act_cod, sede, desde_fecha, desde_turno)
    );

    -- ═══ PIPELINE DE PRENDAS (lavandería individual) ═══
    CREATE TABLE IF NOT EXISTS prendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL,
      tipo TEXT,
      color TEXT,
      talla TEXT,
      sede_origen TEXT NOT NULL,
      etapa TEXT DEFAULT 'recepcion',
      tipo_lavado TEXT,
      cod_lavador TEXT,
      cod_planchador TEXT,
      necesita_compostura INTEGER DEFAULT 0,
      obs_refaccion TEXT,
      obs_compostura TEXT,
      obs_calidad TEXT,
      aprobada INTEGER DEFAULT 0,
      envio_id INTEGER,
      fecha_ingreso TEXT NOT NULL,
      fecha_actualizado TEXT DEFAULT (datetime('now','localtime')),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    -- Historial de movimientos de cada prenda
    CREATE TABLE IF NOT EXISTS prenda_historial (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prenda_id INTEGER NOT NULL,
      etapa_anterior TEXT,
      etapa_nueva TEXT NOT NULL,
      responsable TEXT,
      obs TEXT,
      fecha TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (prenda_id) REFERENCES prendas(id)
    );
    -- Envíos agrupados (cuando almacén manda a tienda lo que esté listo)
    CREATE TABLE IF NOT EXISTS envios_prendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sede_destino TEXT NOT NULL,
      fecha TEXT NOT NULL,
      responsable TEXT,
      estado TEXT DEFAULT 'enviado',
      validado_tienda INTEGER DEFAULT 0,
      obs_tienda TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    -- Calificación de prendas recibidas en tienda
    CREATE TABLE IF NOT EXISTS prenda_calificacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prenda_id INTEGER NOT NULL,
      envio_id INTEGER,
      aceptada INTEGER DEFAULT 1,
      obs TEXT,
      calificador TEXT,
      fecha TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (prenda_id) REFERENCES prendas(id)
    );

    -- ═══ LISTAS LAVANDERÍA LEGACY (se mantiene para compatibilidad) ═══
    CREATE TABLE IF NOT EXISTS listas_lavanderia (
      id TEXT PRIMARY KEY, sede TEXT NOT NULL, tipo TEXT NOT NULL,
      estado TEXT DEFAULT 'En proceso', validado_tienda INTEGER DEFAULT 0,
      obs_retorno TEXT, fecha TEXT NOT NULL,
      resp_inv TEXT, resp_traslado TEXT,
      camisas INTEGER DEFAULT 0, corbatas INTEGER DEFAULT 0,
      michis INTEGER DEFAULT 0, corbatones INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS lista_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lista_id TEXT NOT NULL, cod TEXT NOT NULL,
      tipo TEXT, color TEXT, talla TEXT, obs TEXT, motivo TEXT,
      devolver TEXT, estado_proceso TEXT, estado_retorno TEXT,
      FOREIGN KEY (lista_id) REFERENCES listas_lavanderia(id)
    );
    CREATE TABLE IF NOT EXISTS lista_counters (
      sede TEXT NOT NULL, tipo TEXT NOT NULL, contador INTEGER DEFAULT 0,
      PRIMARY KEY (sede, tipo)
    );

    -- ═══ INCIDENCIAS ═══
    CREATE TABLE IF NOT EXISTS incidencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sede TEXT NOT NULL, fecha TEXT NOT NULL, tipo TEXT NOT NULL,
      descripcion TEXT, nivel TEXT DEFAULT 'Medio',
      responsable TEXT, reporte_id TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- ═══ EVALUACIONES ═══
    CREATE TABLE IF NOT EXISTS evaluaciones_mensuales (
      id TEXT PRIMARY KEY, emp_id TEXT NOT NULL, mes TEXT NOT NULL,
      evaluador TEXT,
      nota_competencias REAL DEFAULT 0, nota_valores REAL DEFAULT 0,
      nota_operaciones REAL DEFAULT 0, descuento_tardanzas REAL DEFAULT 0,
      descuento_incidencias REAL DEFAULT 0, nota_tardanza REAL DEFAULT 0,
      nota_final REAL DEFAULT 0, recomendacion TEXT, obs_general TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (emp_id) REFERENCES empleados(id)
    );
    CREATE TABLE IF NOT EXISTS evaluaciones_valores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluador_id TEXT NOT NULL, evaluado_id TEXT NOT NULL, mes TEXT NOT NULL,
      integridad INTEGER DEFAULT 3, respeto INTEGER DEFAULT 3,
      honestidad INTEGER DEFAULT 3, amabilidad INTEGER DEFAULT 3,
      relacion INTEGER DEFAULT 3, actitud INTEGER DEFAULT 3,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(evaluador_id, evaluado_id, mes),
      FOREIGN KEY (evaluador_id) REFERENCES empleados(id),
      FOREIGN KEY (evaluado_id) REFERENCES empleados(id)
    );

    -- ═══ PRÉSTAMOS + BAJAS ═══
    CREATE TABLE IF NOT EXISTS prestamos_prendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL, quien_lleva TEXT NOT NULL,
      codigo TEXT NOT NULL, tienda_origen TEXT NOT NULL,
      tienda_destino TEXT NOT NULL,
      tipo_prenda TEXT, color TEXT, talla TEXT,
      responsable TEXT, estado TEXT DEFAULT 'prestado',
      devuelto INTEGER DEFAULT 0, para_lavanderia INTEGER DEFAULT 0,
      obs TEXT, created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS prendas_baja (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL, tipo_prenda TEXT, color TEXT, talla TEXT,
      tienda TEXT NOT NULL, motivo TEXT, fecha TEXT NOT NULL,
      responsable TEXT, prestamo_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- ═══ GARANTÍAS YAPE ═══
    CREATE TABLE IF NOT EXISTS devoluciones_garantia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_cliente TEXT NOT NULL, celular TEXT NOT NULL,
      num_boleta TEXT, monto REAL NOT NULL,
      tienda TEXT NOT NULL, responsable TEXT,
      estado TEXT DEFAULT 'pendiente',
      fecha_registro TEXT NOT NULL, fecha_devolucion TEXT,
      obs TEXT, created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- ═══ SOLICITUD DE PRENDAS ═══
    CREATE TABLE IF NOT EXISTS solicitudes_prendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sede_solicitante TEXT NOT NULL,
      sede_destino TEXT NOT NULL,
      solicitante TEXT NOT NULL,
      fecha TEXT NOT NULL,
      estado TEXT DEFAULT 'pendiente',
      aprobado_por TEXT,
      fecha_respuesta TEXT,
      obs TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS solicitud_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitud_id INTEGER NOT NULL,
      codigo TEXT,
      tipo_prenda TEXT,
      color TEXT,
      talla TEXT,
      cantidad INTEGER DEFAULT 1,
      obs TEXT,
      FOREIGN KEY (solicitud_id) REFERENCES solicitudes_prendas(id)
    );

    -- ═══ CONFIG GLOBAL (admin) ═══
    CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);

  // Configs por defecto
  const ins = d.prepare('INSERT OR IGNORE INTO config (clave,valor) VALUES (?,?)');
  ins.run('eval_valores_habilitado', '0');
  ins.run('precio_lavado_mano', '5.00');
  ins.run('precio_michi', '3.00');

  console.log('✅ Base de datos inicializada:', DB_PATH);
}

module.exports = { getDB, initDB };
