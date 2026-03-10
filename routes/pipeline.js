// ═══════════════════════════════════════════════════════
// LUCEBIEN · routes/pipeline.js — Pipeline de prendas
// Tracking individual por prenda a través de las etapas
// ═══════════════════════════════════════════════════════
const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// Etapas válidas del pipeline en orden
const ETAPAS = ['recepcion','lavado','empatado','revision','refaccion','compostura','planchado','control_calidad','listo','enviado'];
const ETAPA_LABELS = {
  recepcion:'Recepción', lavado:'Lavado', empatado:'Empatado',
  revision:'Revisión', refaccion:'Refacción', compostura:'Compostura',
  planchado:'Planchado', control_calidad:'Control Calidad',
  listo:'Listo p/ Envío', enviado:'Enviado'
};

// GET /api/pipeline — obtener prendas (filtrable)
router.get('/', verifyToken, (req, res) => {
  const db = getDB();
  let sql = 'SELECT * FROM prendas WHERE 1=1';
  const p = [];
  if (req.query.sede_origen) { sql += ' AND sede_origen=?'; p.push(req.query.sede_origen); }
  if (req.query.etapa)       { sql += ' AND etapa=?';       p.push(req.query.etapa); }
  if (req.query.no_enviado)  { sql += " AND etapa!='enviado'"; }
  sql += ' ORDER BY fecha_ingreso DESC, id DESC';
  if (req.query.limit) { sql += ' LIMIT ?'; p.push(parseInt(req.query.limit) || 200); }
  res.json(db.prepare(sql).all(...p));
});

// GET /api/pipeline/kanban — datos agrupados por etapa
router.get('/kanban', verifyToken, (req, res) => {
  const db = getDB();
  const prendas = db.prepare("SELECT * FROM prendas WHERE etapa!='enviado' ORDER BY fecha_ingreso").all();
  const kanban = {};
  ETAPAS.filter(e => e !== 'enviado').forEach(et => { kanban[et] = []; });
  prendas.forEach(p => { if (kanban[p.etapa]) kanban[p.etapa].push(p); });
  res.json({ kanban, etapas: ETAPAS.filter(e => e !== 'enviado'), labels: ETAPA_LABELS });
});

// GET /api/pipeline/stats — conteo por etapa
router.get('/stats', verifyToken, (req, res) => {
  const db = getDB();
  const rows = db.prepare("SELECT etapa, COUNT(*) as n FROM prendas WHERE etapa!='enviado' GROUP BY etapa").all();
  const stats = {};
  rows.forEach(r => { stats[r.etapa] = r.n; });
  const total = db.prepare("SELECT COUNT(*) as n FROM prendas WHERE etapa!='enviado'").get().n;
  res.json({ stats, total, labels: ETAPA_LABELS });
});

// POST /api/pipeline — ingresar prenda al pipeline
router.post('/', verifyToken, (req, res) => {
  const db = getDB();
  const { codigo, tipo, color, talla, sede_origen, tipo_lavado, fecha_ingreso } = req.body;
  if (!codigo || !sede_origen) return res.status(400).json({ error: 'Código y sede origen requeridos' });
  const r = db.prepare(`INSERT INTO prendas (codigo,tipo,color,talla,sede_origen,etapa,tipo_lavado,fecha_ingreso)
    VALUES (?,?,?,?,?,'recepcion',?,?)`)
    .run(codigo, tipo||'', color||'', talla||'', sede_origen, tipo_lavado||'normal',
         fecha_ingreso || new Date().toISOString().slice(0,10));
  // Historial
  db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_nueva,responsable,obs) VALUES (?,?,?,?)')
    .run(r.lastInsertRowid, 'recepcion', req.user?.nombre||'', 'Ingreso al pipeline');
  res.json({ id: r.lastInsertRowid, ok: true });
});

// POST /api/pipeline/batch — ingresar múltiples prendas (envío desde tienda)
router.post('/batch', verifyToken, (req, res) => {
  const db = getDB();
  const { prendas: items, sede_origen, fecha_ingreso } = req.body;
  if (!items?.length || !sede_origen) return res.status(400).json({ error: 'Prendas y sede requeridos' });
  const fecha = fecha_ingreso || new Date().toISOString().slice(0,10);
  const ins = db.prepare(`INSERT INTO prendas (codigo,tipo,color,talla,sede_origen,etapa,tipo_lavado,fecha_ingreso)
    VALUES (?,?,?,?,?,'recepcion',?,?)`);
  const insH = db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_nueva,responsable,obs) VALUES (?,?,?,?)');
  const ids = [];
  const tx = db.transaction(() => {
    for (const p of items) {
      const r = ins.run(p.codigo, p.tipo||'', p.color||'', p.talla||'', sede_origen, p.tipo_lavado||'normal', fecha);
      insH.run(r.lastInsertRowid, 'recepcion', req.user?.nombre||'', 'Ingreso batch');
      ids.push(r.lastInsertRowid);
    }
  });
  tx();
  res.json({ ids, count: ids.length, ok: true });
});

// PUT /api/pipeline/:id/avanzar — mover prenda a siguiente etapa
router.put('/:id/avanzar', verifyToken, (req, res) => {
  const db = getDB();
  const { etapa_destino, responsable, obs, tipo_lavado, necesita_compostura, cod_responsable } = req.body;
  const prenda = db.prepare('SELECT * FROM prendas WHERE id=?').get(req.params.id);
  if (!prenda) return res.status(404).json({ error: 'Prenda no encontrada' });
  if (!ETAPAS.includes(etapa_destino)) return res.status(400).json({ error: 'Etapa inválida' });

  // Construir updates dinámicos
  let updates = 'etapa=?, fecha_actualizado=datetime("now","localtime")';
  const params = [etapa_destino];
  if (tipo_lavado)          { updates += ', tipo_lavado=?';          params.push(tipo_lavado); }
  if (necesita_compostura !== undefined) { updates += ', necesita_compostura=?'; params.push(necesita_compostura?1:0); }
  if (cod_responsable && etapa_destino === 'lavado')   { updates += ', cod_lavador=?';    params.push(cod_responsable); }
  if (cod_responsable && etapa_destino === 'planchado') { updates += ', cod_planchador=?'; params.push(cod_responsable); }
  if (etapa_destino === 'control_calidad') { updates += ', aprobada=0'; }
  if (etapa_destino === 'listo') { updates += ', aprobada=1'; }

  params.push(req.params.id);
  db.prepare(`UPDATE prendas SET ${updates} WHERE id=?`).run(...params);

  // Historial
  db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_anterior,etapa_nueva,responsable,obs) VALUES (?,?,?,?,?)')
    .run(req.params.id, prenda.etapa, etapa_destino, responsable||req.user?.nombre||'', obs||'');

  res.json({ ok: true, etapa: etapa_destino });
});

// PUT /api/pipeline/:id/rechazar — devolver prenda a una etapa anterior (fallo en calidad)
router.put('/:id/rechazar', verifyToken, (req, res) => {
  const db = getDB();
  const { etapa_destino, obs } = req.body;
  const prenda = db.prepare('SELECT * FROM prendas WHERE id=?').get(req.params.id);
  if (!prenda) return res.status(404).json({ error: 'Prenda no encontrada' });
  db.prepare('UPDATE prendas SET etapa=?, aprobada=0, fecha_actualizado=datetime("now","localtime") WHERE id=?')
    .run(etapa_destino || 'refaccion', req.params.id);
  db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_anterior,etapa_nueva,responsable,obs) VALUES (?,?,?,?,?)')
    .run(req.params.id, prenda.etapa, etapa_destino||'refaccion', req.user?.nombre||'', obs||'Rechazado en control');
  res.json({ ok: true });
});

// GET /api/pipeline/:id/historial — historial de una prenda
router.get('/:id/historial', verifyToken, (req, res) => {
  const rows = getDB().prepare('SELECT * FROM prenda_historial WHERE prenda_id=? ORDER BY fecha').all(req.params.id);
  res.json(rows);
});

// ── ENVÍOS A TIENDA ──────────────────────────────────

// POST /api/pipeline/enviar — crear envío con prendas listas
router.post('/enviar', verifyToken, (req, res) => {
  const db = getDB();
  const { prenda_ids, sede_destino, responsable } = req.body;
  if (!prenda_ids?.length || !sede_destino) return res.status(400).json({ error: 'Prendas y destino requeridos' });
  const fecha = new Date().toISOString().slice(0,10);
  const envio = db.prepare('INSERT INTO envios_prendas (sede_destino,fecha,responsable) VALUES (?,?,?)')
    .run(sede_destino, fecha, responsable||req.user?.nombre||'');
  const envioId = envio.lastInsertRowid;
  const upd = db.prepare("UPDATE prendas SET etapa='enviado', envio_id=?, fecha_actualizado=datetime('now','localtime') WHERE id=? AND etapa='listo'");
  const insH = db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_anterior,etapa_nueva,responsable,obs) VALUES (?,?,?,?,?)');
  const tx = db.transaction(() => {
    for (const pid of prenda_ids) {
      upd.run(envioId, pid);
      insH.run(pid, 'listo', 'enviado', responsable||'', 'Envío #'+envioId);
    }
  });
  tx();
  res.json({ envio_id: envioId, count: prenda_ids.length, ok: true });
});

// GET /api/pipeline/envios — listar envíos
router.get('/envios', verifyToken, (req, res) => {
  const db = getDB();
  let sql = 'SELECT * FROM envios_prendas WHERE 1=1';
  const p = [];
  if (req.query.sede_destino) { sql += ' AND sede_destino=?'; p.push(req.query.sede_destino); }
  sql += ' ORDER BY fecha DESC LIMIT 50';
  const envios = db.prepare(sql).all(...p);
  envios.forEach(e => {
    e.prendas = db.prepare('SELECT * FROM prendas WHERE envio_id=?').all(e.id);
    e.count = e.prendas.length;
  });
  res.json(envios);
});

// PUT /api/pipeline/envios/:id/calificar — tienda califica prendas recibidas
router.put('/envios/:id/calificar', verifyToken, (req, res) => {
  const db = getDB();
  const { calificaciones, obs_tienda } = req.body;
  // calificaciones: [{prenda_id, aceptada, obs}]
  if (calificaciones?.length) {
    const ins = db.prepare('INSERT INTO prenda_calificacion (prenda_id,envio_id,aceptada,obs,calificador) VALUES (?,?,?,?,?)');
    const rechazar = db.prepare("UPDATE prendas SET etapa='revision', envio_id=NULL, aprobada=0 WHERE id=?");
    const tx = db.transaction(() => {
      for (const c of calificaciones) {
        ins.run(c.prenda_id, req.params.id, c.aceptada?1:0, c.obs||'', req.user?.nombre||'');
        if (!c.aceptada) rechazar.run(c.prenda_id);
      }
    });
    tx();
  }
  const hayRechazo = (calificaciones||[]).some(c => !c.aceptada);
  db.prepare('UPDATE envios_prendas SET validado_tienda=1, obs_tienda=? WHERE id=?')
    .run(obs_tienda||'', req.params.id);
  res.json({ ok: true, rechazos: hayRechazo });
});

// Exportar constantes para uso externo
router.ETAPAS = ETAPAS;
router.ETAPA_LABELS = ETAPA_LABELS;

module.exports = router;
