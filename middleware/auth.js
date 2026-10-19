const jwt = require('jsonwebtoken');
// Sin respaldo en el código: el repositorio es público y un secreto escrito acá permitiría
// fabricar tokens de cualquier persona. Se exige la variable de entorno (auditoría 1, 19-oct-2026).
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en el entorno (.env). Define un valor largo y aleatorio y reinicia el servidor.');
}

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
