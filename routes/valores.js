const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// GET /api/valores/pendientes/:mes — quién no ha evaluado todavía
router.get('/pendientes/:mes', verifyToken, (req, res) => {
  const db  = getDB();
  const mes = req.params.mes;
  const empId = req.user.id;
  // Empleados a quienes debería haber evaluado (todos menos sí mismo)
  const todos  = db.prepare("SELECT e.id,e.nombre FROM empleados e WHERE e.activo=1 AND e.id!=?").all(empId);
  const yaEval = db.prepare('SELECT evaluado_id FROM evaluaciones_valores WHERE evaluador_id=? AND mes=?').all(empId,mes).map(r=>r.evaluado_id);
  const pendientes = todos.filter(e=>!yaEval.includes(e.id));
  res.json({ pendientes, yaEvaluados: yaEval, total: todos.length });
});

// GET /api/valores/resumen/:emp_id/:mes — resumen para el admin
router.get('/resumen/:emp_id/:mes', requireAdmin, (req, res) => {
  const db = getDB();
  const { emp_id, mes } = req.params;
  const evals = db.prepare(`
    SELECT ev.*, e.nombre as evaluador_nombre
    FROM evaluaciones_valores ev
    JOIN empleados e ON e.id=ev.evaluador_id
    WHERE ev.evaluado_id=? AND ev.mes=?
  `).all(emp_id, mes);

  if (!evals.length) return res.json({ evals: [], promedios: null });

  const campos = ['integridad','respeto','honestidad','amabilidad','relacion','actitud'];
  const promedios = {};
  campos.forEach(c => {
    const vals = evals.map(e=>e[c]).filter(v=>v!=null);
    promedios[c] = vals.length ? +(vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(2) : 0;
  });
  promedios.total = +(Object.values(promedios).reduce((s,v)=>s+v,0)/campos.length).toFixed(2);
  // Nota /20 — max posible por valor es 5 → 6 valores × 5 = 30 → /30 × 20
  promedios.nota20 = +((promedios.total/5)*20).toFixed(1);

  res.json({ evals, promedios, cantidad: evals.length });
});

// POST /api/valores — guardar evaluación de valores (cualquier empleado)
router.post('/', verifyToken, (req, res) => {
  const db = getDB();
  const { evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud } = req.body;
  const evaluador_id = req.user.id;
  if (evaluador_id === evaluado_id) return res.status(400).json({ error: 'No puedes evaluarte a ti mismo' });
  db.prepare(`INSERT OR REPLACE INTO evaluaciones_valores
    (evaluador_id,evaluado_id,mes,integridad,respeto,honestidad,amabilidad,relacion,actitud)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(evaluador_id,evaluado_id,mes,integridad,respeto,honestidad,amabilidad,relacion,actitud);
  res.json({ ok: true });
});

// GET /api/valores/mis-pendientes/:mes
router.get('/mis-pendientes/:mes', verifyToken, (req, res) => {
  const db  = getDB();
  const mes = req.params.mes;
  const empId = req.user.id;
  const todos  = db.prepare("SELECT e.id,e.nombre,e.iniciales FROM empleados e WHERE e.activo=1 AND e.id!=?").all(empId);
  const yaEval = new Set(
    db.prepare('SELECT evaluado_id FROM evaluaciones_valores WHERE evaluador_id=? AND mes=?')
      .all(empId,mes).map(r=>r.evaluado_id)
  );
  res.json(todos.map(e=>({...e, evaluado: yaEval.has(e.id)})));
});

module.exports = router;
