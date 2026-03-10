// ═══════════════════════════════════════════════════════
// LUCEBIEN · routes/prestamos.js — Préstamo de prendas
// ═══════════════════════════════════════════════════════
const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// ── PRÉSTAMOS ─────────────────────────────────────────

// GET /api/prestamos?tienda_origen=&tienda_destino=&estado=
router.get('/', verifyToken, (req, res) => {
  const db = getDB();
  let sql = 'SELECT * FROM prestamos_prendas WHERE 1=1';
  const p = [];
  if (req.query.tienda_origen)  { sql += ' AND tienda_origen=?';  p.push(req.query.tienda_origen); }
  if (req.query.tienda_destino) { sql += ' AND tienda_destino=?'; p.push(req.query.tienda_destino); }
  if (req.query.estado)         { sql += ' AND estado=?';         p.push(req.query.estado); }
  if (req.query.sede) {
    sql += ' AND (tienda_origen=? OR tienda_destino=?)';
    p.push(req.query.sede, req.query.sede);
  }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  res.json(db.prepare(sql).all(...p));
});

// POST /api/prestamos — registrar préstamo
router.post('/', verifyToken, (req, res) => {
  const db = getDB();
  const { fecha, quien_lleva, codigo, tienda_origen, tienda_destino, tipo_prenda, color, talla, responsable, obs } = req.body;
  if (!codigo || !tienda_origen || !tienda_destino) return res.status(400).json({ error: 'Código, origen y destino requeridos' });
  const r = db.prepare(`INSERT INTO prestamos_prendas
    (fecha,quien_lleva,codigo,tienda_origen,tienda_destino,tipo_prenda,color,talla,responsable,obs)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(fecha || new Date().toISOString().slice(0,10), quien_lleva||'', codigo, tienda_origen, tienda_destino,
         tipo_prenda||'', color||'', talla||'', responsable||'', obs||'');
  res.json({ id: r.lastInsertRowid, ok: true });
});

// PUT /api/prestamos/:id — actualizar estado
router.put('/:id', verifyToken, (req, res) => {
  const db = getDB();
  const { estado, devuelto, para_lavanderia } = req.body;
  const prest = db.prepare('SELECT * FROM prestamos_prendas WHERE id=?').get(req.params.id);
  if (!prest) return res.status(404).json({ error: 'Préstamo no encontrado' });

  if (estado) db.prepare('UPDATE prestamos_prendas SET estado=? WHERE id=?').run(estado, req.params.id);
  if (devuelto !== undefined) db.prepare('UPDATE prestamos_prendas SET devuelto=? WHERE id=?').run(devuelto?1:0, req.params.id);
  if (para_lavanderia !== undefined) db.prepare('UPDATE prestamos_prendas SET para_lavanderia=? WHERE id=?').run(para_lavanderia?1:0, req.params.id);

  // Si se vendió, registrar para dar de baja
  if (estado === 'vendido') {
    db.prepare(`INSERT INTO prendas_baja (codigo,tipo_prenda,color,talla,tienda,motivo,fecha,responsable,prestamo_id)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(prest.codigo, prest.tipo_prenda, prest.color, prest.talla, prest.tienda_destino,
           'Venta en tienda de préstamo', new Date().toISOString().slice(0,10), prest.responsable, req.params.id);
  }

  res.json({ ok: true });
});

// DELETE /api/prestamos/:id
router.delete('/:id', requireAdmin, (req, res) => {
  getDB().prepare('DELETE FROM prestamos_prendas WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── PRENDAS DE BAJA ───────────────────────────────────

// GET /api/prestamos/bajas?tienda=
router.get('/bajas', verifyToken, (req, res) => {
  const db = getDB();
  let sql = 'SELECT * FROM prendas_baja WHERE 1=1';
  const p = [];
  if (req.query.tienda) { sql += ' AND tienda=?'; p.push(req.query.tienda); }
  sql += ' ORDER BY fecha DESC LIMIT 200';
  res.json(db.prepare(sql).all(...p));
});

// POST /api/prestamos/bajas — dar de baja manual
router.post('/bajas', verifyToken, (req, res) => {
  const db = getDB();
  const { codigo, tipo_prenda, color, talla, tienda, motivo, fecha, responsable } = req.body;
  if (!codigo || !tienda) return res.status(400).json({ error: 'Código y tienda requeridos' });
  const r = db.prepare(`INSERT INTO prendas_baja (codigo,tipo_prenda,color,talla,tienda,motivo,fecha,responsable)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(codigo, tipo_prenda||'', color||'', talla||'', tienda, motivo||'', fecha||new Date().toISOString().slice(0,10), responsable||'');
  res.json({ id: r.lastInsertRowid, ok: true });
});

module.exports = router;
