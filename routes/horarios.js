// ═══════════════════════════════════════════════════════
// LUCEBIEN · routes/horarios.js — Sistema de horarios v1
// ═══════════════════════════════════════════════════════
// Modelo de datos:
//
//  horario_periodos  — cada vez que el admin sube un horario nuevo (el Excel
//                      semanal/quincenal) queda como un periodo versionado.
//                      Solo un periodo es "vigente" a la vez, pero el histo-
//                      rial se conserva para reportes, asistencia y salarios
//                      retroactivos.
//
//  horario_slots     — un slot = asignación atómica de un empleado a un
//                      (sede, dia, turno, rol). Un empleado puede tener
//                      varios slots en el mismo día (turno M y T, o dos
//                      roles). Trae hora_inicio / hora_fin reales extraídos
//                      del Excel.
//
// El módulo expone además HELPERS que otras rutas pueden usar:
//   getPeriodoVigente(fecha)  — periodo activo para una fecha dada
//   getSlotsDelDia(sede, fecha, turno?)  — quiénes deben estar
//   getEncargadoTurno(sede, fecha, turno)  — rol="encargado" o primer slot M/T
//   getHorasMensuales(emp_id, anio, mes)  — suma de horas programadas
//
// Con esto reportes / evaluaciones / salarios pueden autopoblar al encargado
// y validar que las personas presentes coincidan con las programadas.
// ═══════════════════════════════════════════════════════

const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// ── Migración silenciosa ─────────────────────────────────────────────
(function migrar() {
  try {
    var db = getDB();
    db.exec(
      "CREATE TABLE IF NOT EXISTS horario_periodos (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "nombre TEXT NOT NULL," +
      "fecha_desde TEXT NOT NULL," +
      "fecha_hasta TEXT," +
      "activo INTEGER DEFAULT 0," +
      "notas TEXT," +
      "created_by TEXT," +
      "created_at TEXT DEFAULT (datetime('now','localtime'))" +
      ")"
    );
    db.exec(
      "CREATE TABLE IF NOT EXISTS horario_slots (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "periodo_id INTEGER NOT NULL," +
      "emp_id INTEGER NOT NULL," +
      "sede TEXT NOT NULL," +
      "sector TEXT," +
      "dia TEXT NOT NULL," +
      "turno TEXT NOT NULL," +
      "rol TEXT," +
      "hora_inicio TEXT," +
      "hora_fin TEXT," +
      "minutos INTEGER DEFAULT 0," +
      "notas TEXT," +
      "FOREIGN KEY(periodo_id) REFERENCES horario_periodos(id)" +
      ")"
    );
    db.exec("CREATE INDEX IF NOT EXISTS idx_hs_periodo ON horario_slots(periodo_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_hs_emp ON horario_slots(emp_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_hs_dt ON horario_slots(periodo_id, dia, turno)");
  } catch (e) { console.error('[horarios.migrar]', e.message); }
})();

// ── Utilidades ───────────────────────────────────────────────────────
var DIAS_ES = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
function diaDeFecha(fechaYYYYMMDD) {
  try {
    var p = fechaYYYYMMDD.split('-').map(Number);
    var d = new Date(p[0], p[1]-1, p[2]);
    return DIAS_ES[d.getDay()];
  } catch(e) { return null; }
}
function minutosDiff(hi, hf) {
  if (!hi || !hf) return 0;
  var a = hi.split(':').map(Number), b = hf.split(':').map(Number);
  var m = (b[0]*60+b[1]) - (a[0]*60+a[1]);
  return m > 0 ? m : 0;
}

// ═══════════════════════════════════════════════════════
// HELPERS — para usar desde otros módulos via require
// ═══════════════════════════════════════════════════════

function getPeriodoVigente(fecha) {
  try {
    var db = getDB();
    fecha = fecha || (new Date()).toISOString().slice(0,10);
    // Prioridad: (1) vigente que contiene la fecha, (2) marcado activo más reciente
    var row = db.prepare(
      "SELECT * FROM horario_periodos " +
      "WHERE fecha_desde<=? AND (fecha_hasta IS NULL OR fecha_hasta>=?) AND activo=1 " +
      "ORDER BY fecha_desde DESC LIMIT 1"
    ).get(fecha, fecha);
    if (row) return row;
    // Fallback: último activo aunque no cubra la fecha
    return db.prepare("SELECT * FROM horario_periodos WHERE activo=1 ORDER BY fecha_desde DESC LIMIT 1").get() || null;
  } catch(e) { return null; }
}

function getSlotsDelDia(sede, fecha, turno) {
  try {
    var db = getDB();
    var per = getPeriodoVigente(fecha);
    if (!per) return [];
    var dia = diaDeFecha(fecha);
    if (!dia) return [];
    var sql = "SELECT s.*, e.nombre, e.iniciales, e.cod FROM horario_slots s " +
      "JOIN empleados e ON e.id=s.emp_id WHERE s.periodo_id=? AND s.dia=?";
    var p = [per.id, dia];
    if (sede)  { sql += " AND s.sede=?";  p.push(sede); }
    if (turno) { sql += " AND s.turno=?"; p.push(turno); }
    sql += " ORDER BY s.sede, s.turno, s.rol";
    return db.prepare(sql).all(...p);
  } catch(e) { return []; }
}

function getEncargadoTurno(sede, fecha, turno) {
  var slots = getSlotsDelDia(sede, fecha, turno);
  if (!slots.length) return null;
  // 1) rol='encargado'
  var enc = slots.find(function(s){ return (s.rol||'').toLowerCase()==='encargado'; });
  if (enc) return enc;
  // 2) quien tiene hora más temprana (responsable natural)
  slots.sort(function(a,b){ return (a.hora_inicio||'99')<(b.hora_inicio||'99')?-1:1; });
  return slots[0];
}

function getHorasMensuales(emp_id, anio, mes) {
  try {
    var db = getDB();
    // Un mes tiene de 28 a 31 días; calcular recorriendo cada día del mes y
    // sumando los slots programados en el periodo vigente para esa fecha.
    var diasMes = new Date(anio, mes, 0).getDate();
    var total = 0;
    for (var d=1; d<=diasMes; d++) {
      var fecha = anio + '-' + String(mes).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      var per = getPeriodoVigente(fecha);
      if (!per) continue;
      var dia = diaDeFecha(fecha);
      var slots = db.prepare(
        "SELECT hora_inicio, hora_fin, minutos FROM horario_slots " +
        "WHERE periodo_id=? AND emp_id=? AND dia=?"
      ).all(per.id, emp_id, dia);
      slots.forEach(function(s){ total += (s.minutos || minutosDiff(s.hora_inicio, s.hora_fin)); });
    }
    return { minutos: total, horas: Math.round(total/60*10)/10 };
  } catch(e) { return { minutos:0, horas:0 }; }
}

// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

// GET /api/horarios/periodos — listar periodos (todos o solo vigente)
router.get('/periodos', verifyToken, (req, res) => {
  try {
    var db = getDB();
    var rows = db.prepare(
      "SELECT p.*, (SELECT COUNT(*) FROM horario_slots s WHERE s.periodo_id=p.id) AS total_slots " +
      "FROM horario_periodos p ORDER BY p.activo DESC, p.fecha_desde DESC"
    ).all();
    res.json(rows);
  } catch(e) { res.status(500).json({error:e.message}); }
});

// POST /api/horarios/periodos — crear periodo
router.post('/periodos', requireAdmin, (req, res) => {
  try {
    var db = getDB();
    var b = req.body || {};
    if (!b.nombre || !b.fecha_desde) return res.status(400).json({error:'nombre y fecha_desde requeridos'});
    var r = db.prepare(
      "INSERT INTO horario_periodos (nombre,fecha_desde,fecha_hasta,activo,notas,created_by) VALUES (?,?,?,?,?,?)"
    ).run(b.nombre, b.fecha_desde, b.fecha_hasta||null, b.activo?1:0, b.notas||null, (req.user&&req.user.cod)||null);
    res.json({id:r.lastInsertRowid, ok:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// PUT /api/horarios/periodos/:id/activar — marcar como vigente y desactivar overlap
router.put('/periodos/:id/activar', requireAdmin, (req, res) => {
  try {
    var db = getDB();
    var per = db.prepare("SELECT * FROM horario_periodos WHERE id=?").get(req.params.id);
    if (!per) return res.status(404).json({error:'Periodo no encontrado'});
    db.transaction(function(){
      // Desactivar los periodos con rango solapado (si éste no tiene fecha_hasta, todos los anteriores que no tengan hasta_fin)
      if (per.fecha_hasta) {
        db.prepare("UPDATE horario_periodos SET activo=0 WHERE id<>? AND fecha_desde<=? AND (fecha_hasta IS NULL OR fecha_hasta>=?)")
          .run(per.id, per.fecha_hasta, per.fecha_desde);
      } else {
        db.prepare("UPDATE horario_periodos SET activo=0, fecha_hasta=date(?, '-1 day') WHERE id<>? AND activo=1 AND (fecha_hasta IS NULL)")
          .run(per.fecha_desde, per.id);
      }
      db.prepare("UPDATE horario_periodos SET activo=1 WHERE id=?").run(per.id);
    })();
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// PUT /api/horarios/periodos/:id — editar metadata
router.put('/periodos/:id', requireAdmin, (req, res) => {
  try {
    var db = getDB();
    var b = req.body || {};
    db.prepare("UPDATE horario_periodos SET nombre=COALESCE(?,nombre), fecha_desde=COALESCE(?,fecha_desde), fecha_hasta=?, notas=COALESCE(?,notas) WHERE id=?")
      .run(b.nombre||null, b.fecha_desde||null, b.fecha_hasta||null, b.notas||null, req.params.id);
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// DELETE /api/horarios/periodos/:id — borrar periodo + slots
router.delete('/periodos/:id', requireAdmin, (req, res) => {
  try {
    var db = getDB();
    db.transaction(function(){
      db.prepare("DELETE FROM horario_slots WHERE periodo_id=?").run(req.params.id);
      db.prepare("DELETE FROM horario_periodos WHERE id=?").run(req.params.id);
    })();
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/horarios/periodos/:id — detalle + slots agrupados
router.get('/periodos/:id', verifyToken, (req, res) => {
  try {
    var db = getDB();
    var per = db.prepare("SELECT * FROM horario_periodos WHERE id=?").get(req.params.id);
    if (!per) return res.status(404).json({error:'Periodo no encontrado'});
    var slots = db.prepare(
      "SELECT s.*, e.nombre, e.iniciales, e.cod FROM horario_slots s " +
      "JOIN empleados e ON e.id=s.emp_id WHERE s.periodo_id=? " +
      "ORDER BY s.sede, s.sector, s.dia, s.turno, s.rol"
    ).all(req.params.id);
    per.slots = slots;
    res.json(per);
  } catch(e) { res.status(500).json({error:e.message}); }
});

// POST /api/horarios/periodos/:id/slots/bulk — reemplazar slots (import Excel)
router.post('/periodos/:id/slots/bulk', requireAdmin, (req, res) => {
  try {
    var db = getDB();
    var slots = Array.isArray(req.body.slots) ? req.body.slots : [];
    var periodo_id = parseInt(req.params.id, 10);
    if (!db.prepare("SELECT id FROM horario_periodos WHERE id=?").get(periodo_id))
      return res.status(404).json({error:'Periodo no encontrado'});
    var ins = db.prepare(
      "INSERT INTO horario_slots (periodo_id,emp_id,sede,sector,dia,turno,rol,hora_inicio,hora_fin,minutos,notas) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    );
    var count = 0;
    db.transaction(function(){
      db.prepare("DELETE FROM horario_slots WHERE periodo_id=?").run(periodo_id);
      slots.forEach(function(s){
        if (!s || !s.emp_id || !s.dia || !s.turno || !s.sede) return;
        var min = minutosDiff(s.hora_inicio, s.hora_fin);
        ins.run(periodo_id, s.emp_id, s.sede, s.sector||null, s.dia, s.turno, s.rol||null, s.hora_inicio||null, s.hora_fin||null, min, s.notas||null);
        count++;
      });
    })();
    res.json({ok:true, count:count});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/horarios/vigente?fecha=&sede= — slots del periodo vigente
router.get('/vigente', verifyToken, (req, res) => {
  try {
    var per = getPeriodoVigente(req.query.fecha);
    if (!per) return res.json({periodo:null, slots:[]});
    var db = getDB();
    var sql = "SELECT s.*, e.nombre, e.iniciales, e.cod FROM horario_slots s JOIN empleados e ON e.id=s.emp_id WHERE s.periodo_id=?";
    var p = [per.id];
    if (req.query.sede) { sql += " AND s.sede=?"; p.push(req.query.sede); }
    sql += " ORDER BY s.sede, s.sector, s.dia, s.turno, s.rol";
    res.json({periodo:per, slots: db.prepare(sql).all(...p)});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/horarios/mi-horario — horario del usuario autenticado (periodo vigente)
router.get('/mi-horario', verifyToken, (req, res) => {
  try {
    var db = getDB();
    var empCod = req.user && req.user.cod;
    if (!empCod) return res.status(400).json({error:'Usuario sin código'});
    var emp = db.prepare("SELECT id, nombre, iniciales FROM empleados WHERE cod=?").get(empCod);
    if (!emp) return res.status(404).json({error:'Empleado no encontrado'});
    var per = getPeriodoVigente();
    if (!per) return res.json({periodo:null, empleado:emp, slots:[]});
    var slots = db.prepare(
      "SELECT * FROM horario_slots WHERE periodo_id=? AND emp_id=? " +
      "ORDER BY CASE dia WHEN 'lunes' THEN 1 WHEN 'martes' THEN 2 WHEN 'miercoles' THEN 3 WHEN 'jueves' THEN 4 WHEN 'viernes' THEN 5 WHEN 'sabado' THEN 6 WHEN 'domingo' THEN 7 END, turno, hora_inicio"
    ).all(per.id, emp.id);
    // calcular total de horas
    var minutos = 0; slots.forEach(function(s){ minutos += (s.minutos || minutosDiff(s.hora_inicio,s.hora_fin)); });
    res.json({periodo:per, empleado:emp, slots:slots, horas_semana: Math.round(minutos/60*10)/10});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/horarios/empleado/:id — horario de un empleado específico (admin/self)
router.get('/empleado/:id', verifyToken, (req, res) => {
  try {
    var db = getDB();
    var empId = req.params.id;
    var isAdmin = req.user && (req.user.rol==='admin'||req.user.rol==='dueno');
    if (!isAdmin) {
      var myEmp = db.prepare("SELECT id FROM empleados WHERE cod=?").get(req.user.cod);
      if (!myEmp || myEmp.id != empId) return res.status(403).json({error:'Solo tu propio horario'});
    }
    var per = getPeriodoVigente();
    var emp = db.prepare("SELECT id, nombre, iniciales FROM empleados WHERE id=?").get(empId);
    if (!emp) return res.status(404).json({error:'Empleado no encontrado'});
    if (!per) return res.json({periodo:null, empleado:emp, slots:[]});
    var slots = db.prepare(
      "SELECT * FROM horario_slots WHERE periodo_id=? AND emp_id=? " +
      "ORDER BY CASE dia WHEN 'lunes' THEN 1 WHEN 'martes' THEN 2 WHEN 'miercoles' THEN 3 WHEN 'jueves' THEN 4 WHEN 'viernes' THEN 5 WHEN 'sabado' THEN 6 WHEN 'domingo' THEN 7 END, turno, hora_inicio"
    ).all(per.id, empId);
    var minutos = 0; slots.forEach(function(s){ minutos += (s.minutos || minutosDiff(s.hora_inicio,s.hora_fin)); });
    res.json({periodo:per, empleado:emp, slots:slots, horas_semana: Math.round(minutos/60*10)/10});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/horarios/del-dia?sede=&fecha=&turno= — quiénes deben trabajar
router.get('/del-dia', verifyToken, (req, res) => {
  try {
    var slots = getSlotsDelDia(req.query.sede, req.query.fecha, req.query.turno);
    res.json(slots);
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/horarios/encargado?sede=&fecha=&turno= — encargado del turno
router.get('/encargado', verifyToken, (req, res) => {
  try {
    res.json(getEncargadoTurno(req.query.sede, req.query.fecha, req.query.turno) || null);
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/horarios/horas-mes?emp_id=&mes=YYYY-MM — horas programadas en el mes
router.get('/horas-mes', verifyToken, (req, res) => {
  try {
    var empId = parseInt(req.query.emp_id, 10);
    var mes = req.query.mes || (new Date()).toISOString().slice(0,7);
    var p = mes.split('-');
    res.json(getHorasMensuales(empId, parseInt(p[0],10), parseInt(p[1],10)));
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ═══════════════════════════════════════════════════════
// CONSTRUCTOR DE HORARIOS — endpoints por slot (v2)
// ═══════════════════════════════════════════════════════

// POST /api/horarios/periodos/:id/slots — agregar UN slot
// Body: { emp_id, sede, sector, dia, turno, rol, hora_inicio, hora_fin, notas }
router.post('/periodos/:id/slots', requireAdmin, (req, res) => {
  try {
    var db = getDB();
    var s = req.body || {};
    var periodo_id = parseInt(req.params.id, 10);
    if (!db.prepare("SELECT id FROM horario_periodos WHERE id=?").get(periodo_id))
      return res.status(404).json({error:'Periodo no encontrado'});
    if (!s.emp_id || !s.dia || !s.turno || !s.sede)
      return res.status(400).json({error:'emp_id, dia, turno y sede requeridos'});
    var min = minutosDiff(s.hora_inicio, s.hora_fin);
    var r = db.prepare(
      "INSERT INTO horario_slots (periodo_id,emp_id,sede,sector,dia,turno,rol,hora_inicio,hora_fin,minutos,notas) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    ).run(periodo_id, s.emp_id, s.sede, s.sector||null, s.dia, s.turno, s.rol||null, s.hora_inicio||null, s.hora_fin||null, min, s.notas||null);
    // Devolver slot con datos de empleado
    var full = db.prepare(
      "SELECT s.*, e.nombre, e.iniciales, e.cod FROM horario_slots s JOIN empleados e ON e.id=s.emp_id WHERE s.id=?"
    ).get(r.lastInsertRowid);
    res.json({ok:true, id:r.lastInsertRowid, slot:full});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// PUT /api/horarios/slots/:id — editar UN slot
router.put('/slots/:id', requireAdmin, (req, res) => {
  try {
    var db = getDB();
    var s = req.body || {};
    var id = parseInt(req.params.id, 10);
    var cur = db.prepare("SELECT * FROM horario_slots WHERE id=?").get(id);
    if (!cur) return res.status(404).json({error:'Slot no encontrado'});
    var nuevos = {
      emp_id:      s.emp_id      != null ? s.emp_id      : cur.emp_id,
      sede:        s.sede        != null ? s.sede        : cur.sede,
      sector:      s.sector      !== undefined ? s.sector      : cur.sector,
      dia:         s.dia         != null ? s.dia         : cur.dia,
      turno:       s.turno       != null ? s.turno       : cur.turno,
      rol:         s.rol         !== undefined ? s.rol         : cur.rol,
      hora_inicio: s.hora_inicio !== undefined ? s.hora_inicio : cur.hora_inicio,
      hora_fin:    s.hora_fin    !== undefined ? s.hora_fin    : cur.hora_fin,
      notas:       s.notas       !== undefined ? s.notas       : cur.notas
    };
    var min = minutosDiff(nuevos.hora_inicio, nuevos.hora_fin);
    db.prepare(
      "UPDATE horario_slots SET emp_id=?, sede=?, sector=?, dia=?, turno=?, rol=?, hora_inicio=?, hora_fin=?, minutos=?, notas=? WHERE id=?"
    ).run(nuevos.emp_id, nuevos.sede, nuevos.sector, nuevos.dia, nuevos.turno, nuevos.rol, nuevos.hora_inicio, nuevos.hora_fin, min, nuevos.notas, id);
    var full = db.prepare(
      "SELECT s.*, e.nombre, e.iniciales, e.cod FROM horario_slots s JOIN empleados e ON e.id=s.emp_id WHERE s.id=?"
    ).get(id);
    res.json({ok:true, slot:full});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// DELETE /api/horarios/slots/:id — borrar UN slot
router.delete('/slots/:id', requireAdmin, (req, res) => {
  try {
    var db = getDB();
    db.prepare("DELETE FROM horario_slots WHERE id=?").run(req.params.id);
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// POST /api/horarios/periodos/:id/duplicar — clonar periodo con todos sus slots
// Body: { nombre, fecha_desde, fecha_hasta? }
router.post('/periodos/:id/duplicar', requireAdmin, (req, res) => {
  try {
    var db = getDB();
    var b = req.body || {};
    var src = db.prepare("SELECT * FROM horario_periodos WHERE id=?").get(req.params.id);
    if (!src) return res.status(404).json({error:'Periodo origen no existe'});
    if (!b.nombre || !b.fecha_desde) return res.status(400).json({error:'nombre y fecha_desde requeridos'});
    var newId;
    db.transaction(function(){
      var r = db.prepare(
        "INSERT INTO horario_periodos (nombre,fecha_desde,fecha_hasta,activo,notas,created_by) VALUES (?,?,?,0,?,?)"
      ).run(b.nombre, b.fecha_desde, b.fecha_hasta||null, b.notas||('Clonado de: '+src.nombre), (req.user&&req.user.cod)||null);
      newId = r.lastInsertRowid;
      db.prepare(
        "INSERT INTO horario_slots (periodo_id,emp_id,sede,sector,dia,turno,rol,hora_inicio,hora_fin,minutos,notas) " +
        "SELECT ?, emp_id, sede, sector, dia, turno, rol, hora_inicio, hora_fin, minutos, notas " +
        "FROM horario_slots WHERE periodo_id=?"
      ).run(newId, src.id);
    })();
    res.json({ok:true, id:newId});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Exponer helpers para otros módulos
router.helpers = {
  getPeriodoVigente: getPeriodoVigente,
  getSlotsDelDia: getSlotsDelDia,
  getEncargadoTurno: getEncargadoTurno,
  getHorasMensuales: getHorasMensuales,
  diaDeFecha: diaDeFecha,
  minutosDiff: minutosDiff
};

module.exports = router;
