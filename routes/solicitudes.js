// ═══════════════════════════════════════════════════════
// LUCEBIEN · routes/solicitudes.js — Solicitud de prendas
// ═══════════════════════════════════════════════════════
const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken } = require('../middleware/auth');

// GET /api/solicitudes?sede=
router.get('/', verifyToken, (req, res) => {
  const db = getDB();
  let sql = 'SELECT * FROM solicitudes_prendas WHERE 1=1';
  const p = [];
  if (req.query.sede) {
    sql += ' AND (sede_solicitante=? OR sede_destino=?)';
    p.push(req.query.sede, req.query.sede);
  }
  if (req.query.estado) { sql += ' AND estado=?'; p.push(req.query.estado); }
  sql += ' ORDER BY created_at DESC LIMIT 100';
  const solis = db.prepare(sql).all(...p);
  solis.forEach(s => {
    s.items = db.prepare('SELECT * FROM solicitud_items WHERE solicitud_id=?').all(s.id);
  });
  res.json(solis);
});

// POST /api/solicitudes — crear solicitud
router.post('/', verifyToken, (req, res) => {
  const db = getDB();
  const { sede_solicitante, sede_destino, solicitante, items, obs } = req.body;
  if (!sede_solicitante || !sede_destino || !items?.length) return res.status(400).json({ error: 'Datos incompletos' });
  const fecha = new Date().toISOString().slice(0,10);
  const r = db.prepare('INSERT INTO solicitudes_prendas (sede_solicitante,sede_destino,solicitante,fecha,obs) VALUES (?,?,?,?,?)')
    .run(sede_solicitante, sede_destino, solicitante||req.user?.nombre||'', fecha, obs||'');
  const insI = db.prepare('INSERT INTO solicitud_items (solicitud_id,codigo,tipo_prenda,color,talla,cantidad,obs) VALUES (?,?,?,?,?,?,?)');
  const tx = db.transaction(() => {
    for (const i of items) insI.run(r.lastInsertRowid, i.codigo||'', i.tipo_prenda||'', i.color||'', i.talla||'', i.cantidad||1, i.obs||'');
  });
  tx();
  res.json({ id: r.lastInsertRowid, ok: true });
});

// PUT /api/solicitudes/:id — aprobar/rechazar
router.put('/:id', verifyToken, (req, res) => {
  const db = getDB();
  const { estado, aprobado_por } = req.body;
  if (!['aprobada','rechazada','completada'].includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  db.prepare('UPDATE solicitudes_prendas SET estado=?,aprobado_por=?,fecha_respuesta=datetime("now","localtime") WHERE id=?')
    .run(estado, aprobado_por||req.user?.nombre||'', req.params.id);
  res.json({ ok: true });
});

module.exports = router;
