// Cargar variables de entorno desde .env (si existe) ANTES de requerir
// nada que use process.env. Loader propio sin dependencia.
try { require('./_env-loader')(); } catch (e) { console.warn('[env]', e.message); }

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
var _db = require('./database/db');
var initDB = _db.initDB, getDB = _db.getDB, hoyLocal = _db.hoyLocal;
var registrarAudit = function(req,accion,modulo,detalle){try{var db=getDB();db.exec("CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT, hora TEXT, usuario_cod TEXT, usuario_nombre TEXT, sede TEXT, accion TEXT, modulo TEXT, detalle TEXT, ip TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))");var u=req.user||{};var now=new Date();db.prepare('INSERT INTO audit_log (fecha,hora,usuario_cod,usuario_nombre,sede,accion,modulo,detalle,ip) VALUES (?,?,?,?,?,?,?,?,?)').run(hoyLocal(),now.toTimeString().slice(0,8),String(u.cod||u.id||''),u.nombre||'',u.sede||'',accion||'',modulo||'',JSON.stringify(detalle||{}),(req.headers||{})['x-forwarded-for']||'');}catch(e){}};
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'lucebien-secret-2026-xK9mP3qR';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0, setHeaders: function(res) { res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); res.set('Pragma', 'no-cache'); } }));

// ═══ MIDDLEWARE DE AUDITORÍA AUTOMÁTICA ═══
// Registra TODA acción POST/PUT/DELETE con usuario, sede, IP
app.use('/api', function(req, res, next) {
  if (req.method === 'GET') return next();

  // Decodificar usuario del token (sin bloquear si no hay)
  try {
    var auth = req.headers['authorization'];
    if (auth && auth.startsWith('Bearer ')) {
      var decoded = jwt.verify(auth.slice(7), SECRET);
      req._auditUser = decoded;
    }
  } catch(e) {}

  // Interceptar la respuesta para loguear después
  var originalJson = res.json.bind(res);
  res.json = function(body) {
    // Solo loguear si fue exitoso (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      var modulo = req.originalUrl.split('/')[2] || '';
      var accion = req.method + ' ' + req.originalUrl;

      // Resumen inteligente del body enviado
      var detalle = {};
      var b = req.body || {};
      if (b.id) detalle.id = b.id;
      if (b.codigo) detalle.codigo = b.codigo;
      if (b.sede) detalle.sede = b.sede;
      if (b.sede_origen) detalle.origen = b.sede_origen;
      if (b.sede_destino) detalle.destino = b.sede_destino;
      if (b.estado) detalle.estado = b.estado;
      if (b.nombre) detalle.nombre = b.nombre;
      if (b.etapa_destino) detalle.etapa = b.etapa_destino;
      if (b.responsable) detalle.resp = b.responsable;
      if (b.quien_lleva) detalle.lleva = b.quien_lleva;
      if (b.turno) detalle.turno = b.turno;
      if (b.evaluador) detalle.evaluador = b.evaluador;
      if (b.items && Array.isArray(b.items)) detalle.items = b.items.length;
      if (b.prendas && Array.isArray(b.prendas)) detalle.prendas = b.prendas.length;
      if (b.prenda_ids && Array.isArray(b.prenda_ids)) detalle.prenda_ids = b.prenda_ids.length;
      if (b.calificaciones && Array.isArray(b.calificaciones)) detalle.calificaciones = b.calificaciones.length;
      // Result info
      if (body && body.id) detalle.result_id = body.id;
      if (body && body.envio_id) detalle.envio_id = body.envio_id;

      var fakeReq = {
        user: req._auditUser || req.user || {},
        body: b,
        headers: req.headers,
        connection: req.connection
      };
      try { registrarAudit(fakeReq, accion, modulo, detalle); } catch(e2) {}
    }
    return originalJson(body);
  };

  next();
});

// ═══ RUTAS API ═══
app.use('/api/auth', require('./routes/auth'));
app.use('/api/empleados', require('./routes/empleados'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/lavanderia', require('./routes/lavanderia'));
app.use('/api/evaluaciones', require('./routes/evaluaciones'));
app.use('/api/incidencias', require('./routes/incidencias'));
app.use('/api/valores', require('./routes/valores'));
app.use('/api/actividades', require('./routes/actividades'));
app.use('/api/prestamos', require('./routes/prestamos'));
app.use('/api/garantias', require('./routes/garantias'));
app.use('/api/pipeline', require('./routes/pipeline'));
try { app.use('/api/notificaciones', require('./routes/notificaciones')); } catch(e) { console.error('[notificaciones route]', e.message); }
try { app.use('/api/dashboard', require('./routes/dashboard')); } catch(e) { console.error('[dashboard route]', e.message); }
try { app.use('/api/pagos', require('./routes/pagos')); } catch(e) { console.error('[pagos route]', e.message); }
app.use('/api/solicitudes', require('./routes/solicitudes'));
app.use('/api/layout', require('./routes/layout'));
app.use('/api/config', require('./routes/config'));
app.use('/api/ventas', require('./routes/ventas'));
try { app.use('/api/asistencias', require('./routes/asistencias')); } catch(e) {}
try { app.use('/api/horarios', require('./routes/horarios')); } catch(e) { console.error('[horarios route]', e.message); }

// ═══ AUDITORÍA — Admin puede consultar ═══
app.get('/api/audit', function(req, res) {
  try {
    var auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
    var user = jwt.verify(auth.slice(7), SECRET);
    if (user.rol !== 'admin' && user.rol !== 'dueno') return res.status(403).json({ error: 'Solo admin' });

    var db = getDB();
    // Ensure table exists
    try { db.exec("CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT, hora TEXT, usuario_cod TEXT, usuario_nombre TEXT, sede TEXT, accion TEXT, modulo TEXT, detalle TEXT, ip TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))"); } catch(e2) {}
    var sql = 'SELECT * FROM audit_log WHERE 1=1';
    var p = [];
    if (req.query.fecha) { sql += ' AND fecha=?'; p.push(req.query.fecha); }
    if (req.query.sede) { sql += " AND sede IS NOT NULL AND sede=?"; p.push(req.query.sede); }
    if (req.query.usuario) { sql += ' AND usuario_nombre LIKE ?'; p.push('%' + req.query.usuario + '%'); }
    if (req.query.modulo) { sql += ' AND modulo=?'; p.push(req.query.modulo); }
    if (req.query.desde) { sql += ' AND fecha>=?'; p.push(req.query.desde); }
    if (req.query.hasta) { sql += ' AND fecha<=?'; p.push(req.query.hasta); }
    sql += ' ORDER BY id DESC LIMIT ' + (parseInt(req.query.limit) || 200);
    res.json(db.prepare(sql).all(...p));
  } catch(e) { res.json([]); }
});

app.get('/api/audit/stats', function(req, res) {
  try {
    var auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
    var user = jwt.verify(auth.slice(7), SECRET);
    if (user.rol !== 'admin' && user.rol !== 'dueno') return res.status(403).json({ error: 'Solo admin' });
    var db = getDB();
    try { db.exec("CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT, hora TEXT, usuario_cod TEXT, usuario_nombre TEXT, sede TEXT, accion TEXT, modulo TEXT, detalle TEXT, ip TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))"); } catch(e2) {}
    var hoy = hoyLocal();
    var total_hoy=0,por_modulo=[],por_usuario=[],por_sede=[],total=0;
    try{total_hoy=db.prepare('SELECT COUNT(*) as n FROM audit_log WHERE fecha=?').get(hoy).n;}catch(e2){}
    try{por_modulo=db.prepare("SELECT modulo, COUNT(*) as n FROM audit_log WHERE fecha=? AND modulo!='' GROUP BY modulo ORDER BY n DESC").all(hoy);}catch(e2){}
    try{por_usuario=db.prepare("SELECT usuario_nombre, COUNT(*) as n FROM audit_log WHERE fecha=? AND usuario_nombre!='' GROUP BY usuario_nombre ORDER BY n DESC").all(hoy);}catch(e2){}
    try{por_sede=db.prepare("SELECT sede, COUNT(*) as n FROM audit_log WHERE fecha=? AND sede!='' GROUP BY sede ORDER BY n DESC").all(hoy);}catch(e2){}
    try{total=db.prepare('SELECT COUNT(*) as n FROM audit_log').get().n;}catch(e2){}
    res.json({total_hoy:total_hoy,total:total,por_modulo:por_modulo,por_usuario:por_usuario,por_sede:por_sede});
  } catch(e) { res.json({total_hoy:0,total:0,por_modulo:[],por_usuario:[],por_sede:[]}); }
});

app.get('/api/test', function(r, s) { s.json({ ok: true }); });
app.all('/api/*', function(r, s) { s.status(404).json({ error: 'Ruta no encontrada' }); });
app.get('*', function(r, s) { s.sendFile(path.join(__dirname, 'public', 'index.html')); });

initDB();
try { const sc = require('./database/seed-config'); if(sc.ensureTables)sc.ensureTables(); if(sc.seedConfig)sc.seedConfig(); if(sc.ensureAsistencias)sc.ensureAsistencias(); if(sc.ensureColumnasExtra)sc.ensureColumnasExtra(); if(sc.ensureIndexes)sc.ensureIndexes(); } catch(e) { console.log('Config seed:', e.message); }

// ═══ CRON · Auto-envío de reportes al vencer deadline ═══
// Corre cada 5 min. El helper autoEnviarPendientes() internamente valida que
// el deadline haya pasado (M≥15:00, T/C≥23:00) antes de hacer nada.
try {
  var rep = require('./routes/reportes');
  var autoFn = rep && rep.autoEnviarPendientes;
  if (typeof autoFn === 'function') {
    setInterval(function(){
      try {
        var res = autoFn();
        if (res && res.length) console.log('[cron:auto-envio] procesados='+res.length);
      } catch(e) { console.warn('[cron:auto-envio]', e.message); }
    }, 5 * 60 * 1000);
    console.log('  Auto-envío reportes: ACTIVO (cada 5 min)');
  }
} catch(e) { console.warn('[cron:auto-envio] init:', e.message); }

// ═══ CRON · Backup automático de la BD ═══
try {
  var bk = require('./_backup-bd');
  if (bk && typeof bk.iniciarSchedulerBackup === 'function') {
    bk.iniciarSchedulerBackup(getDB);
  }
} catch(e) { console.warn('[cron:backup] init:', e.message); }

app.listen(PORT, '0.0.0.0', function() {
  var os = require('os'), ip = 'localhost';
  for (var ii of Object.values(os.networkInterfaces())) for (var i of ii) if (i.family === 'IPv4' && !i.internal) { ip = i.address; break; }
  console.log('\n  LUCEBIEN v5.4');
  console.log('  http://localhost:' + PORT);
  console.log('  http://' + ip + ':' + PORT);
  console.log('  Auditoría: ACTIVA — todo movimiento queda registrado\n');
});
