const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { getDB } = require('../database/db');
const SECRET = process.env.JWT_SECRET || 'lucebien-secret-2026-xK9mP3qR';
function admin(q,r,n){try{var h=q.headers['authorization'];if(!h||!h.startsWith('Bearer '))return r.status(401).json({error:'Token requerido'});var u=jwt.verify(h.slice(7),SECRET);if(u.rol!=='admin'&&u.rol!=='dueno')return r.status(403).json({error:'Solo admin'});q.user=u;n();}catch(e){return r.status(401).json({error:'Token invalido'});}}

function ensureTable(db) {
  try {
    db.exec("CREATE TABLE IF NOT EXISTS layout_zonas (id INTEGER PRIMARY KEY AUTOINCREMENT, sede TEXT NOT NULL, cod TEXT DEFAULT '', nombre TEXT DEFAULT '', turno TEXT DEFAULT 'ambos', tipo TEXT DEFAULT 'mueble', peso INTEGER DEFAULT 1, pos_x REAL DEFAULT 0, pos_y REAL DEFAULT 0, ancho REAL DEFAULT 60, alto REAL DEFAULT 40, color TEXT DEFAULT '#3b82f6', forma TEXT DEFAULT 'rect', orden INTEGER DEFAULT 0, nivel TEXT DEFAULT 'piso', sobre_cod TEXT DEFAULT '', frecuencia_dias INTEGER DEFAULT 0, dia_semana TEXT DEFAULT '')");
    // Migrate existing tables — each ALTER will silently fail if column already exists
    try { db.exec("ALTER TABLE layout_zonas ADD COLUMN nivel TEXT DEFAULT 'piso'"); } catch(e) {}
    try { db.exec("ALTER TABLE layout_zonas ADD COLUMN sobre_cod TEXT DEFAULT ''"); } catch(e) {}
    try { db.exec("ALTER TABLE layout_zonas ADD COLUMN frecuencia_dias INTEGER DEFAULT 0"); } catch(e) {}
    try { db.exec("ALTER TABLE layout_zonas ADD COLUMN dia_semana TEXT DEFAULT ''"); } catch(e) {}
  } catch(e) {}
}

// GET /api/layout?sede=LB — NO AUTH — workers need this
router.get('/', function(req, res) {
  try {
    var db = getDB();
    ensureTable(db);
    var sede = req.query.sede || 'LB';
    res.json(db.prepare('SELECT * FROM layout_zonas WHERE sede=? ORDER BY turno, orden').all(sede));
  } catch(e) { res.status(500).json({error: e.message}); }
});

// PUT /api/layout/bulk — ADMIN ONLY
router.put('/bulk', admin, function(req, res) {
  try {
    var db = getDB();
    ensureTable(db);
    var zonas = req.body.zonas || [];
    var sede = req.body.sede;
    if (!sede) return res.status(400).json({error: 'sede requerida'});
    db.transaction(function() {
      db.prepare('DELETE FROM layout_zonas WHERE sede=?').run(sede);
      var ins = db.prepare('INSERT INTO layout_zonas (sede,cod,nombre,turno,tipo,peso,pos_x,pos_y,ancho,alto,color,forma,orden,nivel,sobre_cod,frecuencia_dias,dia_semana) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      zonas.forEach(function(z, i) {
        ins.run(sede, z.cod||'Z'+i, z.nombre||'', z.turno||'ambos', z.tipo||'mueble',
          z.peso||1, z.pos_x||0, z.pos_y||0, z.ancho||60, z.alto||40,
          z.color||'#3b82f6', z.forma||'rect', i,
          z.nivel||'piso', z.sobre_cod||'', z.frecuencia_dias||0, z.dia_semana||'');
      });
    })();
    res.json({ok: true, count: zonas.length});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// POST /api/layout/zona — ADMIN ONLY
router.post('/zona', admin, function(req, res) {
  try {
    var db = getDB();
    ensureTable(db);
    var b = req.body;
    var r = db.prepare('INSERT INTO layout_zonas (sede,cod,nombre,turno,tipo,peso,pos_x,pos_y,ancho,alto,color,forma,orden,nivel,sobre_cod,frecuencia_dias,dia_semana) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(b.sede, b.cod, b.nombre||'', b.turno||'ambos', b.tipo||'mueble', b.peso||1, b.pos_x||0, b.pos_y||0, b.ancho||60, b.alto||40, b.color||'#3b82f6', b.forma||'rect', b.orden||0, b.nivel||'piso', b.sobre_cod||'', b.frecuencia_dias||0, b.dia_semana||'');
    res.json({id: r.lastInsertRowid, ok: true});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// DELETE /api/layout/zona/:id — ADMIN ONLY
router.delete('/zona/:id', admin, function(req, res) {
  try { getDB().prepare('DELETE FROM layout_zonas WHERE id=?').run(req.params.id); res.json({ok:true}); }
  catch(e) { res.status(500).json({error: e.message}); }
});

module.exports = router;
