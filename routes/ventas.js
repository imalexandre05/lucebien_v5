const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { getDB } = require('../database/db');
const SECRET = process.env.JWT_SECRET || 'lucebien-secret-2026-xK9mP3qR';
function auth(q,r,n){try{var h=q.headers['authorization'];if(!h||!h.startsWith('Bearer '))return r.status(401).json({error:'Token requerido'});q.user=jwt.verify(h.slice(7),SECRET);n();}catch(e){return r.status(401).json({error:'Token invalido'});}}
function admin(q,r,n){auth(q,r,function(){if(q.user.rol!=='admin'&&q.user.rol!=='dueno')return r.status(403).json({error:'Solo admin'});n();});}

router.get('/', auth, function(req, res) {
  try {
    var db = getDB();
    var sql = 'SELECT v.*, e.nombre FROM ventas_metas v JOIN empleados e ON e.id=v.emp_id WHERE 1=1';
    var p = [];
    if (req.query.mes) { sql += ' AND v.mes=?'; p.push(req.query.mes); }
    if (req.query.emp_id) { sql += ' AND v.emp_id=?'; p.push(req.query.emp_id); }
    sql += ' ORDER BY e.nombre';
    res.json(db.prepare(sql).all(...p));
  } catch(e) { res.status(500).json({error: e.message}); }
});

router.post('/', admin, function(req, res) {
  try {
    var db = getDB();
    var b = req.body;
    if (!b.emp_id || !b.mes) return res.status(400).json({error: 'emp_id y mes requeridos'});
    var cfg = {};
    try { db.prepare('SELECT * FROM config').all().forEach(function(r){cfg[r.clave]=r.valor;}); } catch(e){}
    var meta = parseFloat(b.meta_soles) || 0;
    var vendido = parseFloat(b.vendido_soles) || 0;
    var pct = meta > 0 ? (vendido / meta) * 100 : 0;
    var bonus = 0;
    if (pct >= 120) bonus = parseFloat(cfg.venta_bonus_max) || 2.0;
    else if (pct >= 100) bonus = parseFloat(cfg.venta_bonus_120) || 1.5;
    else if (pct >= 80) bonus = parseFloat(cfg.venta_bonus_80) || 0.5;
    db.prepare('INSERT OR REPLACE INTO ventas_metas (emp_id,mes,meta_soles,vendido_soles,bonus_nota,registrado_por) VALUES (?,?,?,?,?,?)')
      .run(b.emp_id, b.mes, meta, vendido, bonus, req.user.nombre || '');
    res.json({ok: true, bonus: bonus, pct: Math.round(pct)});
  } catch(e) { res.status(500).json({error: e.message}); }
});

router.get('/bonus/:emp_id/:mes', auth, function(req, res) {
  try {
    var db = getDB();
    var row = db.prepare('SELECT * FROM ventas_metas WHERE emp_id=? AND mes=?').get(req.params.emp_id, req.params.mes);
    if (!row) return res.json({bonus: 0, meta: 0, vendido: 0, pct: 0});
    var pct = row.meta_soles > 0 ? Math.round((row.vendido_soles / row.meta_soles) * 100) : 0;
    res.json({bonus: row.bonus_nota, meta: row.meta_soles, vendido: row.vendido_soles, pct: pct});
  } catch(e) { res.status(500).json({error: e.message}); }
});

router.get('/pipeline-bonus/:emp_id/:mes', auth, function(req, res) {
  try {
    var db = getDB();
    var emp = db.prepare('SELECT nombre FROM empleados WHERE id=?').get(req.params.emp_id);
    if (!emp) return res.json({puntos: 0, meta: 0, extra: 0, bonificacion: 0});
    var cfg = {};
    try { db.prepare('SELECT * FROM config').all().forEach(function(r){cfg[r.clave]=r.valor;}); } catch(e){}
    var meta = parseInt(cfg.pipeline_meta_mensual) || 80;
    var precio = parseFloat(cfg.pipeline_precio_punto) || 0.05;
    var desde = req.params.mes + '-01', hasta = req.params.mes + '-31';
    var puntos = 0;
    var desglose = {planchado:0,lavado:0,empatado:0,compostura:0,refaccion:0};
    var desgloseCant = {planchado:0,lavado:0,empatado:0,compostura:0,refaccion:0};
    try {
      db.prepare("SELECT ph.etapa_nueva FROM prenda_historial ph JOIN prendas p ON p.id=ph.prenda_id WHERE ph.responsable=? AND ph.fecha>=? AND ph.fecha<=?").all(emp.nombre, desde, hasta)
        .forEach(function(r) {
          var e = r.etapa_nueva || '';
          var pts = 0;
          if (e === 'planchado') { pts = parseInt(cfg.pts_planchado) || 5; }
          else if (e === 'lavado') { pts = parseInt(cfg.pts_lavado) || 3; }
          else if (e === 'empatado') { pts = parseInt(cfg.pts_empatado) || 2; }
          else if (e === 'compostura') { pts = parseInt(cfg.pts_compostura) || 3; }
          else if (e === 'refaccion') { pts = parseInt(cfg.pts_refaccion) || 2; }
          if (pts > 0 && desglose[e] !== undefined) {
            puntos += pts;
            desglose[e] += pts;
            desgloseCant[e] = (desgloseCant[e]||0) + 1;
          }
        });
    } catch(e) {}
    var extra = Math.max(0, puntos - meta);
        // Weekly breakdown
    var semanas = {};
    try {
      db.prepare("SELECT ph.etapa_nueva, ph.fecha FROM prenda_historial ph JOIN prendas p ON p.id=ph.prenda_id WHERE ph.responsable=? AND ph.fecha>=? AND ph.fecha<=?").all(emp.nombre, desde, hasta)
        .forEach(function(r) {
          var d = new Date(r.fecha + 'T12:00:00');
          var weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay() + 1);
          var wk = weekStart.toISOString().slice(0,10);
          if (!semanas[wk]) semanas[wk] = {pts:0, items:0};
          var e2 = r.etapa_nueva || '';
          var pts2 = 0;
          if (e2==='planchado') pts2 = parseInt(cfg.pts_planchado)||5;
          else if (e2==='lavado') pts2 = parseInt(cfg.pts_lavado)||3;
          else if (e2==='empatado') pts2 = parseInt(cfg.pts_empatado)||2;
          else if (e2==='compostura') pts2 = parseInt(cfg.pts_compostura)||3;
          semanas[wk].pts += pts2;
          semanas[wk].items++;
        });
    } catch(e3) {}
    var metaSemanal = parseInt(cfg.pipeline_meta_semanal) || 20;
    res.json({puntos: puntos, meta: meta, metaSemanal: metaSemanal, extra: extra, precio: precio, bonificacion: Math.round(extra * precio * 100) / 100, desglose: desglose, desgloseCant: desgloseCant, semanas: semanas});
  } catch(e) { res.status(500).json({error: e.message}); }
});

module.exports = router;
