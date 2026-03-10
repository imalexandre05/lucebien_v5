// ═══════════════════════════════════════════════════════
// LUCEBIEN · routes/auth.js — Autenticación
// ═══════════════════════════════════════════════════════
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getDB } = require('../database/db');
const { JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { cod, sede } = req.body;
  if (!cod || !sede) return res.status(400).json({ error: 'Código y sede requeridos' });

  const db  = getDB();
  const emp = db.prepare('SELECT * FROM empleados WHERE activo=1 AND cod=?').get(cod);
  if (!emp) return res.status(401).json({ error: 'Código incorrecto' });

  const ok = bcrypt.compareSync(String(cod), emp.cod_hash);
  if (!ok) return res.status(401).json({ error: 'Código incorrecto' });

  // Tiendas del empleado
  const tiendas = db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?')
    .all(emp.id).map(r => r.tienda);

  const payload = { id: emp.id, cod: emp.cod, nombre: emp.nombre, iniciales: emp.iniciales, rol: emp.rol, tiendas, sede };
  const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

  res.json({ token, user: payload });
});

// GET /api/auth/me — refrescar info
router.get('/me', require('../middleware/auth').verifyToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
