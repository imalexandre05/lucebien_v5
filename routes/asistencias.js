const router = require('express').Router();
const { getDB } = require('../database/db');
const jwt=require('jsonwebtoken');const SECRET=process.env.JWT_SECRET||'lucebien-secret-2026-xK9mP3qR';
function verifyToken(q,r,n){try{var h=q.headers['authorization'];if(!h||!h.startsWith('Bearer '))return r.status(401).json({error:'Token requerido'});q.user=jwt.verify(h.slice(7),SECRET);n();}catch(e){return r.status(401).json({error:'Token invalido'});}}
function requireAdmin(q,r,n){verifyToken(q,r,function(){if(q.user.rol!=='admin'&&q.user.rol!=='dueno')return r.status(403).json({error:'Solo admin'});n();});}

function calcTardanza(horaEntrada, turno) {
  if (!horaEntrada) return 0;
  var db;try{db=getDB();}catch(e){}
  var HORA_INICIO_M='08:00',HORA_INICIO_T='14:00';
  if(db){try{var hm=db.prepare("SELECT valor FROM config WHERE clave='hora_inicio_m'").get();if(hm)HORA_INICIO_M=hm.valor;}catch(e){}}
  if(db){try{var ht=db.prepare("SELECT valor FROM config WHERE clave='hora_inicio_t'").get();if(ht)HORA_INICIO_T=ht.valor;}catch(e){}}
  var ref = turno === 'T' ? HORA_INICIO_T : HORA_INICIO_M;
  var parts1 = ref.split(':').map(Number);
  var parts2 = horaEntrada.split(':').map(Number);
  var diff = (parts2[0] * 60 + parts2[1]) - (parts1[0] * 60 + parts1[1]);
  return diff > 0 ? diff : 0;
}

// GET /api/asistencias?emp_id=&fecha_desde=&fecha_hasta=
router.get('/', verifyToken, function(req, res) {
  try {
    var db = getDB();
    var sql = 'SELECT a.*, e.nombre, e.iniciales FROM asistencias a JOIN empleados e ON e.id=a.emp_id WHERE 1=1';
    var p = [];
    if (req.query.emp_id) { sql += ' AND a.emp_id=?'; p.push(req.query.emp_id); }
    if (req.query.fecha_desde) { sql += ' AND a.fecha>=?'; p.push(req.query.fecha_desde); }
    if (req.query.fecha_hasta) { sql += ' AND a.fecha<=?'; p.push(req.query.fecha_hasta); }
    sql += ' ORDER BY a.fecha, a.turno';
    res.json(db.prepare(sql).all(...p));
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/asistencias/resumen
router.get('/resumen', verifyToken, function(req, res) {
  try {
    var db = getDB();
    var empId = req.query.emp_id;
    if (!empId) return res.status(400).json({error:'emp_id requerido'});
    var sql = 'SELECT * FROM asistencias WHERE emp_id=?';
    var p = [empId];
    if (req.query.fecha_desde) { sql += ' AND fecha>=?'; p.push(req.query.fecha_desde); }
    if (req.query.fecha_hasta) { sql += ' AND fecha<=?'; p.push(req.query.fecha_hasta); }
    var rows = db.prepare(sql).all(...p);
    var totalMinTardanza = 0;
    var diasTardanza = {};
    rows.forEach(function(r) {
      totalMinTardanza += (r.minutos_tardanza || 0);
      if (r.minutos_tardanza > 0) diasTardanza[r.fecha] = true;
    });
    var notaTardanza = Math.max(0, 20 - Math.floor(totalMinTardanza / 15));
    res.json({totalDias: rows.length, totalTardanzas: Object.keys(diasTardanza).length, totalMinTardanza: totalMinTardanza, notaTardanza: notaTardanza});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// POST /api/asistencias — crear/actualizar registro individual
router.post('/', verifyToken, requireAdmin, function(req, res) {
  try {
    var db = getDB();
    var b = req.body;
    if (!b.emp_id || !b.fecha) return res.status(400).json({error:'emp_id y fecha requeridos'});
    var turno = b.turno || 'M';
    var min = calcTardanza(b.hora_entrada, turno);
    db.prepare('INSERT OR REPLACE INTO asistencias (emp_id,fecha,turno,hora_entrada,hora_salida,minutos_tardanza,fuente,obs) VALUES (?,?,?,?,?,?,?,?)')
      .run(b.emp_id, b.fecha, turno, b.hora_entrada||null, b.hora_salida||null, min, b.fuente||'manual', b.obs||null);
    res.json({ok:true, minutos_tardanza:min});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// POST /api/asistencias/bulk — guardar grilla completa
router.post('/bulk', verifyToken, requireAdmin, function(req, res) {
  try {
    var db = getDB();
    var rows = req.body.rows || [];
    var ins = db.prepare('INSERT OR REPLACE INTO asistencias (emp_id,fecha,turno,hora_entrada,hora_salida,minutos_tardanza,fuente) VALUES (?,?,?,?,?,?,?)');
    var count = 0;
    db.transaction(function() {
      rows.forEach(function(r) {
        if (!r.emp_id || !r.fecha) return;
        var min = calcTardanza(r.hora_entrada, r.turno || 'M');
        ins.run(r.emp_id, r.fecha, r.turno||'M', r.hora_entrada||null, r.hora_salida||null, min, 'manual');
        count++;
      });
    })();
    res.json({ok:true, count:count});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// DELETE /api/asistencias/:id
router.delete('/:id', verifyToken, requireAdmin, function(req, res) {
  try { getDB().prepare('DELETE FROM asistencias WHERE id=?').run(req.params.id); res.json({ok:true}); }
  catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/asistencias/horarios/:emp_id
router.get('/horarios/:emp_id', verifyToken, function(req, res) {
  try {
    var db = getDB();
    try { db.exec("CREATE TABLE IF NOT EXISTS horarios (id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id INTEGER NOT NULL, dia TEXT NOT NULL, turno TEXT NOT NULL DEFAULT 'M', sede TEXT NOT NULL, hora_inicio TEXT, hora_fin TEXT, activo INTEGER DEFAULT 1, UNIQUE(emp_id, dia, turno))"); } catch(e2) {}
    res.json(db.prepare("SELECT * FROM horarios WHERE emp_id=? AND activo=1 ORDER BY CASE dia WHEN 'lunes' THEN 1 WHEN 'martes' THEN 2 WHEN 'miercoles' THEN 3 WHEN 'jueves' THEN 4 WHEN 'viernes' THEN 5 WHEN 'sabado' THEN 6 WHEN 'domingo' THEN 7 END, turno").all(req.params.emp_id));
  } catch(e) { res.status(500).json({error:e.message}); }
});

// PUT /api/asistencias/horarios/:emp_id — guardar horario completo
router.put('/horarios/:emp_id', verifyToken, requireAdmin, function(req, res) {
  try {
    var db = getDB();
    var empId = req.params.emp_id;
    var slots = req.body.slots || [];
    db.transaction(function() {
      db.prepare('DELETE FROM horarios WHERE emp_id=?').run(empId);
      var ins = db.prepare('INSERT INTO horarios (emp_id,dia,turno,sede) VALUES (?,?,?,?)');
      slots.forEach(function(s) { if (s.sede) ins.run(empId, s.dia, s.turno, s.sede); });
    })();
    res.json({ok:true, slots:slots.length});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// POST /api/asistencias/horarios/bulk — importar horarios de múltiples empleados
// Body: { empleados: [{emp_id, slots:[{dia,turno,sede}]}, ...] }
// Aplica una sola transacción: borra todos los horarios de los empleados
// recibidos y re-inserta los nuevos. Útil para importar desde Excel.
router.post('/horarios/bulk', verifyToken, requireAdmin, function(req, res) {
  try {
    var db = getDB();
    try { db.exec("CREATE TABLE IF NOT EXISTS horarios (id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id INTEGER NOT NULL, dia TEXT NOT NULL, turno TEXT NOT NULL DEFAULT 'M', sede TEXT NOT NULL, hora_inicio TEXT, hora_fin TEXT, activo INTEGER DEFAULT 1, UNIQUE(emp_id, dia, turno))"); } catch(e2) {}
    var empleados = Array.isArray(req.body.empleados) ? req.body.empleados : [];
    if (!empleados.length) return res.status(400).json({error:'Sin empleados'});
    var totalSlots = 0, afectados = 0;
    db.transaction(function(){
      var del = db.prepare('DELETE FROM horarios WHERE emp_id=?');
      var ins = db.prepare('INSERT INTO horarios (emp_id,dia,turno,sede) VALUES (?,?,?,?)');
      empleados.forEach(function(e){
        if (!e || !e.emp_id) return;
        del.run(e.emp_id);
        (e.slots||[]).forEach(function(s){
          if (s && s.sede && s.dia && s.turno) { ins.run(e.emp_id, s.dia, s.turno, s.sede); totalSlots++; }
        });
        afectados++;
      });
    })();
    res.json({ok:true, empleados:afectados, slots:totalSlots});
  } catch(e) { res.status(500).json({error:e.message}); }
});

module.exports = router;
