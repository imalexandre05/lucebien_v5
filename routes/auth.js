// ═══════════════════════════════════════════════════════
// LUCEBIEN · routes/auth.js — Autenticación
// ═══════════════════════════════════════════════════════
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getDB } = require('../database/db');
const { JWT_SECRET } = require('../middleware/auth');

// Helper: si el empleado existe pero no está activo, devuelve un mensaje
// específico al estado (suspendido/deshabilitado) en vez del genérico
// "código incorrecto". Mejora UX cuando el operario no entiende por qué
// le rechaza el login.
function mensajeEstadoNoActivo(emp) {
  const estado = (emp.estado || '').toLowerCase();
  if (estado === 'suspendido') return 'Tu cuenta está suspendida. Contacta al administrador.';
  if (estado === 'deshabilitado') return 'Tu cuenta está deshabilitada. Contacta al administrador.';
  return 'Tu cuenta no está activa. Contacta al administrador.';
}

// POST /api/auth/login — Login por NOMBRE + CONTRASEÑA (no por código)
// El código de 4 dígitos es solo para operaciones internas (pipeline, reportes, etc.)
router.post('/login', (req, res) => {
  const b = req.body || {};
  // Aceptamos varios alias por compatibilidad: {nombre|usuario, password|pass|contrasena, sede}
  const nombre = (b.nombre || b.usuario || b.user || '').trim();
  const pass   = String(b.password || b.pass || b.contrasena || b.contraseña || '');
  const sede   = b.sede || '';
  if (!nombre || !pass) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  if (!sede) return res.status(400).json({ error: 'Sede requerida' });

  const db = getDB();
  // Buscar SIN filtro activo, para distinguir "no existe" de "no activo"
  let emp = db.prepare('SELECT * FROM empleados WHERE LOWER(nombre)=LOWER(?)').get(nombre);
  if (!emp) emp = db.prepare('SELECT * FROM empleados WHERE LOWER(nombre) LIKE LOWER(?)').get(nombre + '%');
  if (!emp) return res.status(401).json({ error: 'Usuario no encontrado' });

  // Verificar contraseña contra password_hash
  let ok = false;
  if (emp.password_hash) {
    try { ok = bcrypt.compareSync(pass, emp.password_hash); } catch (e) { ok = false; }
  }
  // Fallback: si no hay password_hash, permitir que la contraseña coincida con el código (legacy seed)
  if (!ok && emp.cod_hash) {
    try { ok = bcrypt.compareSync(pass, emp.cod_hash); } catch (e) {}
  }
  if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' });

  // Recién después de validar la contraseña, chequeo el estado activo.
  // Así no se filtra info ("este nombre existe pero está suspendido") a un atacante
  // que no sabe la contraseña — solo el dueño legítimo de la cuenta lo ve.
  if (emp.activo !== 1) return res.status(403).json({ error: mensajeEstadoNoActivo(emp) });

  // Tiendas del empleado
  const tiendas = db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?')
    .all(emp.id).map(r => r.tienda);

  const payload = { id: emp.id, cod: emp.cod, nombre: emp.nombre, iniciales: emp.iniciales, rol: emp.rol, tiendas, sede };
  const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

  res.json({ token, user: payload });
});

// POST /api/auth/login-code — alias usado por almacen-kanban (sólo código)
router.post('/login-code', (req, res) => {
  const { cod } = req.body || {};
  const sede = (req.body && req.body.sede) || 'AL';
  if (!cod) return res.status(400).json({ error: 'Código requerido' });
  const db  = getDB();
  // Sin filtro activo para distinguir "código no existe" de "código existe pero cuenta no activa"
  const emp = db.prepare('SELECT * FROM empleados WHERE cod=?').get(cod);
  if (!emp) return res.status(401).json({ error: 'Código incorrecto' });
  const ok = bcrypt.compareSync(String(cod), emp.cod_hash);
  if (!ok) return res.status(401).json({ error: 'Código incorrecto' });
  // Mensaje específico solo después de validar el código: el dueño del
  // código sabe por qué le rechazan, alguien adivinando solo ve "incorrecto".
  if (emp.activo !== 1) return res.status(403).json({ error: mensajeEstadoNoActivo(emp) });
  const tiendas = db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?').all(emp.id).map(r => r.tienda);
  const payload = { id: emp.id, cod: emp.cod, nombre: emp.nombre, iniciales: emp.iniciales, rol: emp.rol, tiendas, sede };
  const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: payload });
});

// GET /api/auth/me — refrescar info
router.get('/me', require('../middleware/auth').verifyToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
