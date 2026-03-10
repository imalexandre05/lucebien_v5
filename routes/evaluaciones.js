const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// GET /api/evaluaciones/mensual?emp_id=&mes=
router.get('/mensual', verifyToken, (req, res) => {
  const db = getDB();
  let sql = 'SELECT * FROM evaluaciones_mensuales WHERE 1=1';
  const p = [];
  if (req.query.emp_id) { sql += ' AND emp_id=?'; p.push(req.query.emp_id); }
  if (req.query.mes)    { sql += ' AND mes=?';    p.push(req.query.mes); }
  sql += ' ORDER BY mes DESC';
  res.json(db.prepare(sql).all(...p));
});

// POST /api/evaluaciones/mensual — guardar evaluación mensual (admin)
router.post('/mensual', requireAdmin, (req, res) => {
  const db = getDB();
  const { emp_id, mes, evaluador, nota_competencias, nota_valores, nota_operaciones,
          nota_tardanza, descuento_incidencias, nota_final, recomendacion, obs_general } = req.body;
  const id = `EM-${emp_id}-${mes}`;
  db.prepare(`INSERT OR REPLACE INTO evaluaciones_mensuales
    (id,emp_id,mes,evaluador,nota_competencias,nota_valores,nota_operaciones,
     nota_tardanza,descuento_incidencias,nota_final,recomendacion,obs_general)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,emp_id,mes,evaluador,nota_competencias||0,nota_valores||0,nota_operaciones||0,
         nota_tardanza||0,descuento_incidencias||0,nota_final||0,recomendacion||'',obs_general||'');
  res.json({ id, ok: true });
});

module.exports = router;
