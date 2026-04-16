// ═══════════════════════════════════════════════════════
// LUCEBIEN · routes/lavanderia.js v5.3
// Envío desde tienda → auto-insert al pipeline de almacén
// ═══════════════════════════════════════════════════════
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { getDB, hoyLocal } = require('../database/db');
const SECRET = process.env.JWT_SECRET || 'lucebien-secret-2026-xK9mP3qR';

function auth(req, res, next) {
  try {
    var h = req.headers['authorization'];
    if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
    req.user = jwt.verify(h.slice(7), SECRET);
    next();
  } catch (e) { return res.status(401).json({ error: 'Token invalido' }); }
}

function genListaId(db, sede, tipo) {
  db.prepare('INSERT OR IGNORE INTO lista_counters (sede,tipo,contador) VALUES (?,?,0)').run(sede, tipo);
  db.prepare('UPDATE lista_counters SET contador=contador+1 WHERE sede=? AND tipo=?').run(sede, tipo);
  var row = db.prepare('SELECT contador FROM lista_counters WHERE sede=? AND tipo=?').get(sede, tipo);
  return tipo + '-' + sede + String(row.contador).padStart(3, '0');
}

// GET
router.get('/', auth, function(req, res) {
  try {
    var db = getDB();
    var sql = 'SELECT * FROM listas_lavanderia WHERE 1=1';
    var p = [];
    if (req.query.sede) { sql += ' AND sede=?'; p.push(req.query.sede); }
    if (req.query.tipo) { sql += ' AND tipo=?'; p.push(req.query.tipo); }
    if (req.query.estado) { sql += ' AND estado=?'; p.push(req.query.estado); }
    sql += ' ORDER BY created_at DESC';
    var listas = db.prepare(sql).all(...p);
    listas.forEach(function(l) {
      l.items = db.prepare('SELECT * FROM lista_items WHERE lista_id=?').all(l.id);
      l.generales = { camisas: l.camisas, corbatas: l.corbatas, michis: l.michis, corbatones: l.corbatones, porta_ternos: l.porta_ternos||0, zapatos: l.zapatos||0 };
      l.prendas = l.items.length;
    });
    res.json(listas);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST — crear lista + auto-insert al pipeline
router.post('/', auth, function(req, res) {
  try {
    var db = getDB();
    var b = req.body;
    var id = genListaId(db, b.sede, b.tipo);
    var g = b.generales || {};
    var fecha = b.fecha || hoyLocal();
    var pipelineCount = 0;

    db.transaction(function() {
      try{db.exec('ALTER TABLE listas_lavanderia ADD COLUMN porta_ternos INTEGER DEFAULT 0');}catch(e){}
      try{db.exec('ALTER TABLE listas_lavanderia ADD COLUMN zapatos INTEGER DEFAULT 0');}catch(e){}
      db.prepare('INSERT INTO listas_lavanderia (id,sede,tipo,fecha,resp_inv,resp_traslado,camisas,corbatas,michis,corbatones,porta_ternos,zapatos) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, b.sede, b.tipo, fecha, b.resp_inv || '', b.resp_traslado || '', g.camisas || 0, g.corbatas || 0, g.michis || 0, g.corbatones || 0, g.porta_ternos || 0, g.zapatos || 0);

      var insI = db.prepare('INSERT INTO lista_items (lista_id,cod,tipo,color,talla,obs,motivo) VALUES (?,?,?,?,?,?,?)');
      var insPr = db.prepare("INSERT INTO prendas (codigo,tipo,color,talla,sede_origen,etapa,tipo_lavado,fecha_ingreso,lista_lavanderia_id) VALUES (?,?,?,?,?,?,?,?,?)");
      var insH = db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_nueva,responsable,obs) VALUES (?,?,?,?)');

      var items = b.items || [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var obs = Array.isArray(it.obs) ? it.obs.join('|') : (it.obs || '');
        insI.run(id, it.cod, it.tipo, it.color, it.talla, obs, it.motivo || '');

        // Auto-insert al pipeline
        if (it.cod && it.cod.trim()) {
          var etapa = it.destino === 'compostura' ? 'compostura' : it.destino === 'refaccion' ? 'refaccion' : 'recepcion';
          var r = insPr.run(it.cod.trim(), it.tipo || '', it.color || '', it.talla || '', b.sede, etapa, it.tipo_lavado || 'normal', fecha, id);
          insH.run(r.lastInsertRowid, etapa, b.resp_traslado || req.user.nombre || '', 'Lista ' + id);
          pipelineCount++;
        }
      }
    })();

    res.json({ id: id, ok: true, pipeline_ingresadas: pipelineCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT estado
router.put('/:id/estado', auth, function(req, res) {
  try {
    getDB().prepare('UPDATE listas_lavanderia SET estado=? WHERE id=?').run(req.body.estado, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT validar retorno
router.put('/:id/validar', auth, function(req, res) {
  try {
    var db = getDB();
    var ie = req.body.itemsEstado || [];
    if (ie.length) {
      var upd = db.prepare('UPDATE lista_items SET estado_retorno=? WHERE id=?');
      ie.forEach(function(i) { upd.run(i.estado, i.id); });
    }
    var hayProblemas = ie.some(function(i) { return i.estado && i.estado !== 'bien'; });
    var estado = hayProblemas ? 'Devuelto-Observado' : 'Validado';
    db.prepare('UPDATE listas_lavanderia SET estado=?,validado_tienda=?,obs_retorno=? WHERE id=?')
      .run(estado, hayProblemas ? 0 : 1, req.body.obs_retorno || '', req.params.id);
    res.json({ ok: true, estado: estado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
