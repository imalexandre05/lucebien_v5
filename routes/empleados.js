const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

function getEmpWithTiendas(db, id) {
  const e = db.prepare('SELECT * FROM empleados WHERE id=?').get(id);
  if (!e) return null;
  e.tiendas = db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?').all(id).map(r=>r.tienda);
  delete e.cod_hash;
  return e;
}

// GET /api/empleados — todos
router.get('/', verifyToken, (req, res) => {
  const db  = getDB();
  const all = db.prepare('SELECT * FROM empleados WHERE activo=1 ORDER BY nombre').all();
  const result = all.map(e => {
    e.tiendas = db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?').all(e.id).map(r=>r.tienda);
    delete e.cod_hash; return e;
  });
  res.json(result);
});

// GET /api/empleados/by-sede/:sede — filtrados por sede (propios primero)
router.get('/by-sede/:sede', verifyToken, (req, res) => {
  const db   = getDB();
  const sede = req.params.sede;
  const all  = db.prepare('SELECT * FROM empleados WHERE activo=1').all().map(e => {
    e.tiendas = db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?').all(e.id).map(r=>r.tienda);
    delete e.cod_hash; return e;
  });
  const propios = all.filter(e => e.tiendas.includes(sede));
  const otros   = all.filter(e => !e.tiendas.includes(sede));
  res.json([...propios, ...otros]);
});

// GET /api/empleados/:id/desempeno
router.get('/:id/desempeno', verifyToken, (req, res) => {
  const db  = getDB();
  const id  = req.params.id;
  const emp = getEmpWithTiendas(db, id);
  if (!emp) return res.status(404).json({ error: 'No encontrado' });

  const nombre   = emp.nombre;
  const reportes = db.prepare(`
    SELECT r.* FROM reportes r
    JOIN reporte_trabajadores rt ON rt.reporte_id=r.id
    WHERE rt.nombre=? ORDER BY r.fecha DESC LIMIT 60
  `).all(nombre);

  const evals = db.prepare('SELECT * FROM evaluaciones_mensuales WHERE emp_id=? ORDER BY mes DESC').all(id);
  const valoresRecibidos = db.prepare('SELECT * FROM evaluaciones_valores WHERE evaluado_id=? ORDER BY mes DESC').all(id);
  const incidencias = db.prepare('SELECT * FROM incidencias WHERE responsable=? ORDER BY fecha DESC LIMIT 20').all(nombre);

  const avgPuntaje = reportes.length
    ? Math.round(reportes.reduce((s,r)=>s+(r.puntaje||0),0)/reportes.length) : 0;

  res.json({ emp, reportes, evals, valoresRecibidos, incidencias, stats: {
    avgPuntaje, totalReportes: reportes.length,
    evaluados: reportes.filter(r=>r.evaluado).length,
    totalIncidencias: incidencias.length,
    ultimaEval: evals[0] || null,
  }});
});

// POST /api/empleados — crear
router.post('/', requireAdmin, (req, res) => {
  const db = getDB();
  const { id, cod, nombre, iniciales, rol, tiendas } = req.body;
  if (db.prepare('SELECT id FROM empleados WHERE cod=?').get(cod))
    return res.status(400).json({ error: 'Código ya existe' });
  const hash = bcrypt.hashSync(String(cod), 10);
  db.prepare('INSERT INTO empleados (id,cod,nombre,iniciales,rol,cod_hash) VALUES (?,?,?,?,?,?)').run(id,cod,nombre,iniciales,rol||'trabajador',hash);
  const ins = db.prepare('INSERT OR IGNORE INTO empleado_tiendas (emp_id,tienda) VALUES (?,?)');
  (tiendas||[]).forEach(t=>ins.run(id,t));
  res.json(getEmpWithTiendas(db, id));
});

// PUT /api/empleados/:id — actualizar
router.put('/:id', requireAdmin, (req, res) => {
  const db = getDB();
  const { nombre, iniciales, rol, tiendas, cod } = req.body;
  const id = req.params.id;
  const emp = db.prepare('SELECT * FROM empleados WHERE id=?').get(id);
  if (!emp) return res.status(404).json({ error: 'No encontrado' });
  const updates = { nombre: nombre||emp.nombre, iniciales: iniciales||emp.iniciales, rol: rol||emp.rol };
  if (cod && cod !== emp.cod) {
    if (db.prepare('SELECT id FROM empleados WHERE cod=? AND id!=?').get(cod,id))
      return res.status(400).json({ error: 'Código ya existe' });
    updates.cod     = cod;
    updates.cod_hash = bcrypt.hashSync(String(cod),10);
    db.prepare('UPDATE empleados SET nombre=?,iniciales=?,rol=?,cod=?,cod_hash=? WHERE id=?')
      .run(updates.nombre,updates.iniciales,updates.rol,updates.cod,updates.cod_hash,id);
  } else {
    db.prepare('UPDATE empleados SET nombre=?,iniciales=?,rol=? WHERE id=?')
      .run(updates.nombre,updates.iniciales,updates.rol,id);
  }
  db.prepare('DELETE FROM empleado_tiendas WHERE emp_id=?').run(id);
  const ins = db.prepare('INSERT INTO empleado_tiendas (emp_id,tienda) VALUES (?,?)');
  (tiendas||[]).forEach(t=>ins.run(id,t));
  res.json(getEmpWithTiendas(db, id));
});

// DELETE /api/empleados/:id (soft delete)
router.delete('/:id', requireAdmin, (req, res) => {
  getDB().prepare('UPDATE empleados SET activo=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
