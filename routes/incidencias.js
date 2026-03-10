const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// GET /api/incidencias?sede=&nivel=
router.get('/', verifyToken, (req, res) => {
  const db = getDB();
  let sql = 'SELECT * FROM incidencias WHERE 1=1';
  const p = [];
  if (req.query.sede)  { sql += ' AND sede=?';  p.push(req.query.sede); }
  if (req.query.nivel) { sql += ' AND nivel=?'; p.push(req.query.nivel); }
  sql += ' ORDER BY fecha DESC, created_at DESC LIMIT 200';
  res.json(db.prepare(sql).all(...p));
});

// POST /api/incidencias
router.post('/', verifyToken, (req, res) => {
  const db = getDB();
  const { sede, fecha, tipo, descripcion, nivel, responsable, reporte_id } = req.body;
  const r = db.prepare('INSERT INTO incidencias (sede,fecha,tipo,descripcion,nivel,responsable,reporte_id) VALUES (?,?,?,?,?,?,?)')
    .run(sede,fecha,tipo,descripcion||'',nivel||'Medio',responsable||'—',reporte_id||null);
  res.json({ id: r.lastInsertRowid, ok: true });
});

// DELETE /api/incidencias/:id (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  getDB().prepare('DELETE FROM incidencias WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
