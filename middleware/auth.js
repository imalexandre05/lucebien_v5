const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'lucebien-secret-2026-xK9mP3qR';

function verifyToken(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = auth.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.rol !== 'admin' && req.user.rol !== 'dueno') return res.status(403).json({ error: 'Solo administradores' });
    next();
  });
}

module.exports = { verifyToken, requireAdmin, JWT_SECRET };
