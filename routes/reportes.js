const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// GET /api/reportes?sede=&fecha=
router.get('/', verifyToken, (req, res) => {
  const db = getDB();
  let sql = 'SELECT * FROM reportes WHERE 1=1';
  const p = [];
  if (req.query.sede) { sql += ' AND sede=?'; p.push(req.query.sede); }
  if (req.query.fecha) { sql += ' AND fecha=?'; p.push(req.query.fecha); }
  sql += ' ORDER BY fecha DESC, created_at DESC LIMIT 100';
  const reps = db.prepare(sql).all(...p);
  reps.forEach(r => {
    r.trabajadores = db.prepare('SELECT nombre FROM reporte_trabajadores WHERE reporte_id=?').all(r.id).map(x=>x.nombre);
  });
  res.json(reps);
});

// GET /api/reportes/alertas/:sede — DEBE ir antes de /:id
router.get('/alertas/:sede', verifyToken, (req, res) => {
  const db   = getDB();
  const sede = req.params.sede;
  const hoy  = new Date().toISOString().slice(0,10);
  const hoyR = db.prepare('SELECT * FROM reportes WHERE sede=? AND fecha=?').all(sede,hoy);
  res.json({
    tieneM: hoyR.some(r=>r.turno==='M'||r.turno==='C'),
    tieneT: hoyR.some(r=>r.turno==='T'||r.turno==='C'),
    pendEval: db.prepare('SELECT COUNT(*) as n FROM reportes WHERE sede=? AND evaluado=0 AND bloqueado=1').get(sede).n > 0,
    hoyR,
  });
});

// POST /api/reportes — crear reporte
router.post('/', verifyToken, (req, res) => {
  const db = getDB();
  const { id, sede, turno, fecha, encargado, trabajadores, actividades, extras, incidencias, puntaje, actTotal, actDone } = req.body;
  if (db.prepare('SELECT id FROM reportes WHERE id=?').get(id))
    return res.status(409).json({ error: 'Reporte ya existe' });
  db.prepare('INSERT INTO reportes (id,sede,turno,fecha,encargado,puntaje,act_total,act_done,bloqueado) VALUES (?,?,?,?,?,?,?,?,1)')
    .run(id,sede,turno,fecha,encargado,puntaje||0,actTotal||0,actDone||0);
  const insTrab = db.prepare('INSERT INTO reporte_trabajadores (reporte_id,nombre) VALUES (?,?)');
  (trabajadores||[]).forEach(n=>insTrab.run(id,n));
  const insAct = db.prepare('INSERT INTO reporte_actividades (reporte_id,cod,nombre,cat,peso,realizada,obs) VALUES (?,?,?,?,?,?,?)');
  (actividades||[]).forEach(a=>insAct.run(id,a.cod,a.nombre,a.cat,a.peso,1,a.obs||''));
  // Guardar extras (remuneradas + por puntos)
  if (extras && extras.length) {
    const insExt = db.prepare('INSERT INTO reporte_extras (reporte_id,tipo,nombre,cantidad,precio_unitario,monto_total,detalle) VALUES (?,?,?,?,?,?,?)');
    extras.forEach(e=>insExt.run(id,e.tipo,e.nombre,e.cantidad||1,e.precio_unitario||0,e.monto_total||0,e.detalle||''));
  }
  if (incidencias && incidencias.length) {
    const insInc = db.prepare('INSERT INTO incidencias (sede,fecha,tipo,descripcion,nivel,responsable,reporte_id) VALUES (?,?,?,?,?,?,?)');
    incidencias.forEach(i=>insInc.run(sede,fecha,i.tipo,i.descripcion||'',i.nivel||'Medio',i.responsable||'—',id));
  }
  res.json({ id, ok: true });
});

// GET /api/reportes/:id/detalle — detalles completos (para restaurar evaluación)
router.get('/:id/detalle', verifyToken, (req, res) => {
  const db = getDB();
  const rep = db.prepare('SELECT * FROM reportes WHERE id=?').get(req.params.id);
  if (!rep) return res.status(404).json({ error: 'Reporte no encontrado' });
  rep.trabajadores = db.prepare('SELECT nombre FROM reporte_trabajadores WHERE reporte_id=?').all(req.params.id).map(x=>x.nombre);
  rep.actividades = db.prepare('SELECT * FROM reporte_actividades WHERE reporte_id=?').all(req.params.id);
  rep.extras = db.prepare('SELECT * FROM reporte_extras WHERE reporte_id=?').all(req.params.id);
  res.json(rep);
});

// PUT /api/reportes/:id/evaluar
router.put('/:id/evaluar', verifyToken, (req, res) => {
  const db = getDB();
  const { evaluador, calificaciones, puntajeEval } = req.body;
  const rep = db.prepare('SELECT * FROM reportes WHERE id=?').get(req.params.id);
  if (!rep) return res.status(404).json({ error: 'Reporte no encontrado' });
  const trabs = db.prepare('SELECT nombre FROM reporte_trabajadores WHERE reporte_id=?').all(req.params.id).map(r=>r.nombre);
  if (trabs.includes(evaluador)) return res.status(400).json({ error: 'El evaluante no puede ser del turno' });
  if (calificaciones) {
    const updAct = db.prepare('UPDATE reporte_actividades SET calificacion=? WHERE reporte_id=? AND cod=?');
    calificaciones.forEach(c=>updAct.run(c.cal,req.params.id,c.cod));
  }
  db.prepare('UPDATE reportes SET evaluado=1,evaluador=?,puntaje_eval=?,puntaje=?,bloqueado=0 WHERE id=?')
    .run(evaluador,puntajeEval,puntajeEval,req.params.id);
  res.json({ ok: true });
});

module.exports = router;
