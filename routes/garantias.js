// ═══════════════════════════════════════════════════════
// LUCEBIEN · routes/garantias.js — Devolución de garantía (Yape)
// ═══════════════════════════════════════════════════════
const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// GET /api/garantias?tienda=&estado=
router.get('/', verifyToken, (req, res) => {
  const db = getDB();
  let sql = 'SELECT * FROM devoluciones_garantia WHERE 1=1';
  const p = [];
  if (req.query.tienda) { sql += ' AND tienda=?'; p.push(req.query.tienda); }
  if (req.query.estado) { sql += ' AND estado=?'; p.push(req.query.estado); }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  res.json(db.prepare(sql).all(...p));
});

// GET /api/garantias/resumen — estadísticas rápidas
router.get('/resumen', verifyToken, (req, res) => {
  const db = getDB();
  const sede = req.query.tienda;
  let where = '1=1';
  const p = [];
  if (sede) { where = 'tienda=?'; p.push(sede); }
  const pend  = db.prepare(`SELECT COUNT(*) as n, COALESCE(SUM(monto),0) as total FROM devoluciones_garantia WHERE ${where} AND estado='pendiente'`).get(...p);
  const hecho = db.prepare(`SELECT COUNT(*) as n, COALESCE(SUM(monto),0) as total FROM devoluciones_garantia WHERE ${where} AND estado='devuelto'`).get(...p);
  res.json({ pendientes: pend, devueltos: hecho });
});

// POST /api/garantias — registrar nueva devolución pendiente
router.post('/', verifyToken, (req, res) => {
  const db = getDB();
  const { nombre_cliente, celular, num_boleta, monto, tienda, responsable, obs } = req.body;
  if (!nombre_cliente || !celular || !monto) return res.status(400).json({ error: 'Nombre, celular y monto requeridos' });
  const r = db.prepare(`INSERT INTO devoluciones_garantia
    (nombre_cliente,celular,num_boleta,monto,tienda,responsable,estado,fecha_registro,obs)
    VALUES (?,?,?,?,?,?,'pendiente',?,?)`)
    .run(nombre_cliente, celular, num_boleta||'', monto, tienda||'', responsable||'',
         new Date().toISOString().slice(0,10), obs||'');
  res.json({ id: r.lastInsertRowid, ok: true });
});

// PUT /api/garantias/:id — marcar como devuelto
router.put('/:id', verifyToken, (req, res) => {
  const db = getDB();
  const { estado, responsable, obs } = req.body;
  const gar = db.prepare('SELECT * FROM devoluciones_garantia WHERE id=?').get(req.params.id);
  if (!gar) return res.status(404).json({ error: 'Garantía no encontrada' });
  const nuevoEstado = estado || 'devuelto';
  const fechaDev = nuevoEstado === 'devuelto' ? new Date().toISOString().slice(0,10) : null;
  db.prepare('UPDATE devoluciones_garantia SET estado=?,fecha_devolucion=?,responsable=COALESCE(?,responsable),obs=COALESCE(?,obs) WHERE id=?')
    .run(nuevoEstado, fechaDev, responsable||null, obs||null, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/garantias/:id (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  getDB().prepare('DELETE FROM devoluciones_garantia WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
