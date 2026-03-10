const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken } = require('../middleware/auth');

function genListaId(db, sede, tipo) {
  // Incrementar contador
  db.prepare('INSERT OR IGNORE INTO lista_counters (sede,tipo,contador) VALUES (?,?,0)').run(sede,tipo);
  db.prepare('UPDATE lista_counters SET contador=contador+1 WHERE sede=? AND tipo=?').run(sede,tipo);
  const { contador } = db.prepare('SELECT contador FROM lista_counters WHERE sede=? AND tipo=?').get(sede,tipo);
  return `${tipo}-${sede}${String(contador).padStart(3,'0')}`;
}

// GET /api/lavanderia?sede=
router.get('/', verifyToken, (req, res) => {
  const db = getDB();
  let sql = 'SELECT * FROM listas_lavanderia WHERE 1=1';
  const p = [];
  if (req.query.sede)  { sql += ' AND sede=?';  p.push(req.query.sede); }
  if (req.query.tipo)  { sql += ' AND tipo=?';  p.push(req.query.tipo); }
  if (req.query.estado){ sql += ' AND estado=?';p.push(req.query.estado); }
  sql += ' ORDER BY created_at DESC';
  const listas = db.prepare(sql).all(...p);
  listas.forEach(l => {
    l.items = db.prepare('SELECT * FROM lista_items WHERE lista_id=?').all(l.id);
    l.generales = { camisas: l.camisas, corbatas: l.corbatas, michis: l.michis, corbatones: l.corbatones };
    l.prendas = l.items.length;
  });
  res.json(listas);
});

// POST /api/lavanderia — crear lista
router.post('/', verifyToken, (req, res) => {
  const db = getDB();
  const { sede, tipo, items, generales, resp_inv, resp_traslado, fecha } = req.body;
  const id = genListaId(db, sede, tipo);
  const g  = generales || {};
  db.prepare(`INSERT INTO listas_lavanderia (id,sede,tipo,fecha,resp_inv,resp_traslado,camisas,corbatas,michis,corbatones)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id,sede,tipo,fecha||new Date().toISOString().slice(0,10),resp_inv||'',resp_traslado||'',g.camisas||0,g.corbatas||0,g.michis||0,g.corbatones||0);
  const insI = db.prepare('INSERT INTO lista_items (lista_id,cod,tipo,color,talla,obs,motivo) VALUES (?,?,?,?,?,?,?)');
  (items||[]).forEach(i => {
    const obs = Array.isArray(i.obs) ? i.obs.join('|') : (i.obs||'');
    insI.run(id, i.cod, i.tipo, i.color, i.talla, obs, i.motivo||'');
  });
  res.json({ id, ok: true });
});

// PUT /api/lavanderia/:id/estado — cambiar estado
router.put('/:id/estado', verifyToken, (req, res) => {
  const { estado } = req.body;
  getDB().prepare('UPDATE listas_lavanderia SET estado=? WHERE id=?').run(estado, req.params.id);
  res.json({ ok: true });
});

// PUT /api/lavanderia/:id/validar — tienda valida retorno
router.put('/:id/validar', verifyToken, (req, res) => {
  const db = getDB();
  const { itemsEstado, obs_retorno } = req.body;
  // Actualizar estados de items
  if (itemsEstado) {
    const upd = db.prepare('UPDATE lista_items SET estado_retorno=? WHERE id=?');
    itemsEstado.forEach(i=>upd.run(i.estado,i.id));
  }
  const hayProblemas = (itemsEstado||[]).some(i=>i.estado && i.estado!=='bien');
  const nuevoEstado  = hayProblemas ? 'Devuelto-Observado' : 'Validado';
  db.prepare('UPDATE listas_lavanderia SET estado=?,validado_tienda=?,obs_retorno=? WHERE id=?')
    .run(nuevoEstado, hayProblemas?0:1, obs_retorno||'', req.params.id);
  res.json({ ok: true, estado: nuevoEstado });
});

module.exports = router;
