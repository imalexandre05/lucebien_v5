const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// ───────────────────────────────────────────────────────
// Migración silenciosa: columnas de quién reporta y puntos
// ───────────────────────────────────────────────────────
(function migrar() {
  try {
    var db = getDB();
    var cols = db.prepare("PRAGMA table_info(incidencias)").all().map(function(c){return c.name;});
    if (cols.indexOf('reportado_por')       < 0) db.exec("ALTER TABLE incidencias ADD COLUMN reportado_por TEXT");
    if (cols.indexOf('reportado_por_cod')   < 0) db.exec("ALTER TABLE incidencias ADD COLUMN reportado_por_cod TEXT");
    if (cols.indexOf('origen')              < 0) db.exec("ALTER TABLE incidencias ADD COLUMN origen TEXT DEFAULT 'manual'"); // manual | reporte
    if (cols.indexOf('puntos_penalidad')    < 0) db.exec("ALTER TABLE incidencias ADD COLUMN puntos_penalidad REAL DEFAULT 0");
    // Tabla de tipificaciones (tipo → puntos + nivel por defecto)
    db.exec("CREATE TABLE IF NOT EXISTS incidencia_tipos (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "tipo TEXT UNIQUE NOT NULL," +
      "categoria TEXT," +
      "nivel_default TEXT DEFAULT 'Medio'," +
      "puntos_default REAL DEFAULT 2," +
      "activo INTEGER DEFAULT 1," +
      "created_at TEXT DEFAULT (datetime('now','localtime'))" +
      ")");
    // Seed: si la tabla está vacía, cargar el catálogo conocido
    var cnt = db.prepare("SELECT COUNT(*) c FROM incidencia_tipos").get().c;
    if (!cnt) {
      var seed = [
        ['No contar con el uniforme completo','Uniforme','Bajo',1],
        ['No colocar candados en su lugar al abrir','Seguridad','Medio',3],
        ['Cerrar mal puertas','Seguridad','Medio',2],
        ['No cerrar llaves del agua','Seguridad','Medio',2],
        ['No bajar cuchillas de luz','Seguridad','Medio',2],
        ['Dejar prendida la PC','Equipos','Bajo',1],
        ['Dejar prendidas las luces','Equipos','Bajo',1],
        ['Dejar prendida la plancha','Equipos','Alto',4],
        ['No desconectar plancha','Equipos','Medio',2],
        ['Dejar desordenada la tienda','Orden','Bajo',1],
        ['No actualizar cuadernillos físicos','Documentación','Medio',2],
        ['No subir lista de actividades diarias','Documentación','Medio',2],
        ['No evaluó al turno anterior','Documentación','Medio',2],
        ['Hurto o robo de prenda','Graves','Alto',10],
        ['Prenda entregada en mal estado','Graves','Alto',5],
        ['Accidente dentro del local','Graves','Alto',5],
        ['Conflicto grave con cliente','Graves','Alto',5],
        ['Faltante de caja significativo','Graves','Alto',6],
        ['Pérdida o extravío de documento','Graves','Alto',5],
        ['Daño en infraestructura','Graves','Alto',5],
        ['Otro (especificar)','Otros','Medio',2]
      ];
      var ins = db.prepare("INSERT OR IGNORE INTO incidencia_tipos (tipo,categoria,nivel_default,puntos_default) VALUES (?,?,?,?)");
      seed.forEach(function(s){ ins.run(s[0],s[1],s[2],s[3]); });
    }
  } catch (e) { console.error('[incidencias.migrar]', e.message); }
})();

// Helper: normaliza nivel con o sin emoji
function normNivel(n) {
  if (!n) return 'Medio';
  var s = String(n).replace(/[^\wáéíóúñÁÉÍÓÚÑ ]/g,'').trim();
  if (/alto/i.test(s))  return 'Alto';
  if (/bajo/i.test(s))  return 'Bajo';
  return 'Medio';
}

// GET /api/incidencias?sede=&nivel=&responsable=&desde=&hasta=
router.get('/', verifyToken, (req, res) => {
  const db = getDB();
  let sql = 'SELECT * FROM incidencias WHERE 1=1';
  const p = [];
  if (req.query.sede)        { sql += ' AND sede=?';           p.push(req.query.sede); }
  if (req.query.nivel)       { sql += ' AND nivel=?';          p.push(normNivel(req.query.nivel)); }
  if (req.query.responsable) { sql += ' AND responsable=?';    p.push(req.query.responsable); }
  if (req.query.desde)       { sql += ' AND fecha>=?';         p.push(req.query.desde); }
  if (req.query.hasta)       { sql += ' AND fecha<=?';         p.push(req.query.hasta); }
  sql += ' ORDER BY fecha DESC, created_at DESC LIMIT 500';
  res.json(db.prepare(sql).all(...p));
});

// POST /api/incidencias
// Registra automáticamente a quién envía la incidencia:
//  - Desde "Agregar Incidencia" (manual): req.user.cod / nombre
//  - Desde reportes de actividad: el caller (routes/reportes.js) envía body.reportado_por
router.post('/', verifyToken, (req, res) => {
  const db = getDB();
  const b  = req.body || {};
  // Determinar quién reporta
  var repCod = b.reportado_por_cod || (req.user && req.user.cod) || null;
  var repNom = b.reportado_por || (req.user && req.user.nombre) || null;
  var origen = b.origen || 'manual';
  var nivel  = normNivel(b.nivel);
  // Puntos: si viene del cliente, respetarlos; si no, tomar del catálogo; si no, por nivel
  var puntos = (b.puntos_penalidad !== undefined && b.puntos_penalidad !== null && b.puntos_penalidad !== '')
    ? parseFloat(b.puntos_penalidad)
    : null;
  if (puntos === null || isNaN(puntos)) {
    try {
      var row = db.prepare("SELECT puntos_default, nivel_default FROM incidencia_tipos WHERE tipo=? AND activo=1").get(b.tipo);
      if (row) { puntos = row.puntos_default; if (!b.nivel) nivel = row.nivel_default || nivel; }
    } catch(e) {}
  }
  if (puntos === null || isNaN(puntos)) puntos = (nivel==='Alto'?5:(nivel==='Bajo'?1:2));
  const r = db.prepare(
    'INSERT INTO incidencias (sede,fecha,tipo,descripcion,nivel,responsable,reporte_id,reportado_por,reportado_por_cod,origen,puntos_penalidad) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(b.sede, b.fecha, b.tipo, b.descripcion||'', nivel, b.responsable||'—', b.reporte_id||null, repNom, repCod, origen, puntos);
  res.json({ id: r.lastInsertRowid, ok: true, reportado_por: repNom, puntos_penalidad: puntos });
});

// DELETE /api/incidencias/:id (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  getDB().prepare('DELETE FROM incidencias WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ───────────────────────────────────────────────────────
// Tipificaciones de incidencias (catálogo con puntos)
// ───────────────────────────────────────────────────────

// GET /api/incidencias/tipos
router.get('/tipos/list', verifyToken, (req, res) => {
  try {
    const db = getDB();
    const incluirInactivos = req.query.all === '1';
    const sql = incluirInactivos
      ? "SELECT * FROM incidencia_tipos ORDER BY categoria, tipo"
      : "SELECT * FROM incidencia_tipos WHERE activo=1 ORDER BY categoria, tipo";
    res.json(db.prepare(sql).all());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/incidencias/tipos  — reemplaza catálogo completo (admin)
router.put('/tipos/list', requireAdmin, (req, res) => {
  try {
    const db = getDB();
    const rows = Array.isArray(req.body.tipos) ? req.body.tipos : [];
    db.transaction(function() {
      db.prepare("DELETE FROM incidencia_tipos").run();
      const ins = db.prepare("INSERT INTO incidencia_tipos (tipo,categoria,nivel_default,puntos_default,activo) VALUES (?,?,?,?,?)");
      rows.forEach(function(t) {
        if (!t || !t.tipo) return;
        ins.run(
          String(t.tipo).trim().slice(0,160),
          (t.categoria||'Otros').trim().slice(0,60),
          normNivel(t.nivel_default),
          Math.max(0, Math.min(20, parseFloat(t.puntos_default)||0)),
          t.activo === 0 ? 0 : 1
        );
      });
    })();
    res.json({ ok: true, count: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
