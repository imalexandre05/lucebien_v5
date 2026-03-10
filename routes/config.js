// ═══════════════════════════════════════════════════════
// LUCEBIEN · routes/config.js — Configuración global (admin)
// ═══════════════════════════════════════════════════════
const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// GET /api/config — obtener todas las configs
router.get('/', verifyToken, (req, res) => {
  const rows = getDB().prepare('SELECT * FROM config').all();
  const cfg = {};
  rows.forEach(r => { cfg[r.clave] = r.valor; });
  res.json(cfg);
});

// PUT /api/config — actualizar una config
router.put('/', requireAdmin, (req, res) => {
  const db = getDB();
  const { clave, valor } = req.body;
  if (!clave) return res.status(400).json({ error: 'Clave requerida' });
  db.prepare('INSERT OR REPLACE INTO config (clave,valor) VALUES (?,?)').run(clave, String(valor));
  res.json({ ok: true });
});

module.exports = router;
