// ═══════════════════════════════════════════════════════
// LUCEBIEN · routes/actividades.js
// Gestión de actividades configurables por admin
// ═══════════════════════════════════════════════════════
const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// ── OBTENER actividades de una sede ──────────────────
// GET /api/actividades?sede=LB&fecha=2026-03-05
router.get('/', verifyToken, (req, res) => {
  const db = getDB();
  const { sede, fecha } = req.query;
  if (!sede) return res.status(400).json({ error: 'sede requerida' });

  // Cargar TODAS las actividades configuradas para esta sede
  let allActs = db.prepare(
    'SELECT * FROM actividades_config WHERE sede=? AND activa=1 ORDER BY orden, id'
  ).all(sede);

  if (!allActs.length) {
    return res.json({ actividades: [], extras_puntos: [], extras_remuneradas: [], defaults: true });
  }

  // Separar por tipo
  let obligatorias = allActs.filter(a => a.tipo_act === 'obligatoria' || (!a.tipo_act && a.categoria !== 'EXT'));
  const extras_puntos = allActs.filter(a => a.tipo_act === 'por_puntos');
  const extras_remuneradas = allActs.filter(a => a.tipo_act === 'remunerada');

  // Filtrar obligatorias por día/frecuencia si hay fecha
  if (fecha) {
    const diaDelMes = new Date(fecha + 'T12:00:00').getDate();
    obligatorias = obligatorias.filter(a => {
      if (a.aparece_dia > 0 && diaDelMes < a.aparece_dia) return false;
      if (a.frecuencia_dias > 1 && (diaDelMes % a.frecuencia_dias !== 0)) return false;
      return true;
    });
  }

  // Pendientes acumulados
  const pendientes = db.prepare(
    'SELECT DISTINCT act_cod FROM actividades_pendientes WHERE sede=? AND resuelta=0'
  ).all(sede).map(r => r.act_cod);

  obligatorias = obligatorias.map(a => ({ ...a, pendiente_acumulado: pendientes.includes(a.cod) }));

  // Pendientes forzados
  if (fecha) {
    const pendExtras = pendientes.filter(cod => !obligatorias.find(a => a.cod === cod));
    for (const cod of pendExtras) {
      const actBase = db.prepare('SELECT * FROM actividades_config WHERE sede=? AND cod=? AND activa=1').get(sede, cod);
      if (actBase && actBase.acumula && actBase.tipo_act !== 'por_puntos' && actBase.tipo_act !== 'remunerada') {
        obligatorias.push({ ...actBase, pendiente_acumulado: true, forzada: true });
      }
    }
  }

  res.json({ actividades: obligatorias, extras_puntos, extras_remuneradas, defaults: false });
});

// ── OBTENER todas para admin ─────────────────────────
// GET /api/actividades/admin?sede=LB
router.get('/admin', verifyToken, requireAdmin, (req, res) => {
  const db = getDB();
  const { sede } = req.query;
  let sql = 'SELECT * FROM actividades_config WHERE 1=1';
  const p = [];
  if (sede) { sql += ' AND sede=?'; p.push(sede); }
  sql += ' ORDER BY sede, orden, id';
  res.json(db.prepare(sql).all(...p));
});

// ── CREAR actividad ──────────────────────────────────
// POST /api/actividades
router.post('/', verifyToken, requireAdmin, (req, res) => {
  const db = getDB();
  const { sede, cod, nombre, categoria, tipo_act, peso, precio_unitario, unidad, turno, aparece_dia, frecuencia_dias, acumula, orden } = req.body;
  if (!sede || !nombre) return res.status(400).json({ error: 'sede y nombre requeridos' });
  const c = (cod || `ACT${Date.now()}`).toUpperCase();
  try {
    const result = db.prepare(
      `INSERT INTO actividades_config (sede,cod,nombre,categoria,tipo_act,peso,precio_unitario,unidad,turno,aparece_dia,frecuencia_dias,acumula,orden)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(sede, c, nombre, categoria||'PO', tipo_act||'obligatoria', peso||0, precio_unitario||0, unidad||'unidad', turno||'ambos', aparece_dia||0, frecuencia_dias||0, acumula!==false?1:0, orden||0);
    res.status(201).json({ id: result.lastInsertRowid, cod: c });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Código ya existe en esta sede' });
    res.status(500).json({ error: e.message });
  }
});

// ── ACTUALIZAR actividad ─────────────────────────────
// PUT /api/actividades/:id
router.put('/:id', verifyToken, requireAdmin, (req, res) => {
  const db = getDB();
  const { nombre, categoria, tipo_act, peso, precio_unitario, unidad, turno, aparece_dia, frecuencia_dias, acumula, orden, activa } = req.body;
  db.prepare(
    `UPDATE actividades_config SET nombre=?,categoria=?,tipo_act=?,peso=?,precio_unitario=?,unidad=?,turno=?,aparece_dia=?,frecuencia_dias=?,acumula=?,orden=?,activa=?
     WHERE id=?`
  ).run(nombre, categoria, tipo_act||'obligatoria', peso||0, precio_unitario||0, unidad||'unidad', turno||'ambos', aparece_dia||0, frecuencia_dias||0, acumula?1:0, orden||0, activa!==false?1:0, req.params.id);
  res.json({ ok: true });
});

// ── ELIMINAR actividad ───────────────────────────────
// DELETE /api/actividades/:id
router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM actividades_config WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── REORDENAR (drag & drop) ──────────────────────────
// PUT /api/actividades/reorder
router.put('/reorder/batch', verifyToken, requireAdmin, (req, res) => {
  const db = getDB();
  const { items } = req.body; // [{id, orden}]
  const update = db.prepare('UPDATE actividades_config SET orden=? WHERE id=?');
  const tx = db.transaction(() => { for (const i of items) update.run(i.orden, i.id); });
  tx();
  res.json({ ok: true });
});

// ── ACTIVIDADES PENDIENTES ────────────────────────────
// POST /api/actividades/pendiente — registrar que no se hizo
router.post('/pendiente', verifyToken, (req, res) => {
  const db = getDB();
  const { actos_no_realizados, sede, fecha, turno } = req.body;
  if (!actos_no_realizados?.length || !sede) return res.json({ ok: true });
  const ins = db.prepare(
    'INSERT OR IGNORE INTO actividades_pendientes (act_cod,sede,desde_fecha,desde_turno) VALUES (?,?,?,?)'
  );
  const tx = db.transaction(() => {
    for (const cod of actos_no_realizados) ins.run(cod, sede, fecha, turno||'');
  });
  tx();
  res.json({ ok: true });
});

// POST /api/actividades/resolver — marcar pendientes como resueltos
router.post('/resolver', verifyToken, (req, res) => {
  const db = getDB();
  const { actos_realizados, sede, fecha } = req.body;
  if (!actos_realizados?.length) return res.json({ ok: true });
  const upd = db.prepare(
    'UPDATE actividades_pendientes SET resuelta=1, resuelta_en=? WHERE act_cod=? AND sede=? AND resuelta=0'
  );
  const tx = db.transaction(() => {
    for (const cod of actos_realizados) upd.run(fecha, cod, sede);
  });
  tx();
  res.json({ ok: true });
});

// GET /api/actividades/pendientes?sede=LB
router.get('/pendientes', verifyToken, (req, res) => {
  const db = getDB();
  const { sede } = req.query;
  const rows = db.prepare(
    'SELECT ap.*, ac.nombre, ac.categoria, ac.peso FROM actividades_pendientes ap LEFT JOIN actividades_config ac ON ap.act_cod=ac.cod AND ap.sede=ac.sede WHERE ap.sede=? AND ap.resuelta=0 ORDER BY ap.desde_fecha'
  ).all(sede||'');
  res.json(rows);
});

// ── IMPORTAR actividades por defecto para una sede ───
// POST /api/actividades/importar-defaults
router.post('/importar-defaults', verifyToken, requireAdmin, (req, res) => {
  const db = getDB();
  const { sede } = req.body;
  if (!sede) return res.status(400).json({ error: 'sede requerida' });

  const DEFAULTS_TIENDA = [
    {cod:'AS01',nombre:'Revisión y control de prendas para entrega',  cat:'PO', peso:5},
    {cod:'AS02',nombre:'Control de devoluciones vencidas',            cat:'PO', peso:5},
    {cod:'AS03',nombre:'Revisión de prendas a confeccionar',          cat:'PO', peso:5},
    {cod:'AT01',nombre:'Alistado de trajes',                          cat:'PO', peso:5},
    {cod:'AT02',nombre:'Control del cuaderno de préstamos',           cat:'PO', peso:5},
    {cod:'AT03',nombre:'Planchado de ternos',                         cat:'PO', peso:5},
    {cod:'AT04',nombre:'Planchado y doblado de camisas',              cat:'PO', peso:5},
    {cod:'AT05',nombre:'Refacción de trajes y corbatas',              cat:'PO', peso:5},
    {cod:'OL01',nombre:'Limpieza del piso',                           cat:'IND',peso:5},
    {cod:'OL02',nombre:'Limpieza de muebles y mostradores',           cat:'IND',peso:3},
    {cod:'OL03',nombre:'Limpieza de mamparas y espejos',              cat:'IND',peso:3},
    {cod:'OL04',nombre:'Limpieza y orden de accesorios',              cat:'IND',peso:1},
    {cod:'OL05',nombre:'Limpieza de plancha',                         cat:'IND',peso:1},
    {cod:'OL06',nombre:'Limpieza del área de trabajo al cierre',      cat:'IND',peso:5},
    {cod:'BS01',nombre:'Actualización de garantías',                  cat:'SO', peso:5},
    {cod:'BS02',nombre:'Actualización de documentos',                 cat:'SO', peso:3},
    {cod:'BS03',nombre:'Control de lista de lavandería',              cat:'SO', peso:1},
    {cod:'BS04',nombre:'Control de lista de refacciones',             cat:'SO', peso:1},
    {cod:'BS05',nombre:'Cierre de caja',                              cat:'SO', peso:3},
    {cod:'BT01',nombre:'Cambio de maniquíes',                         cat:'SO', peso:5},
    {cod:'BT02',nombre:'Orden de prendas en exhibición',              cat:'SO', peso:5},
    {cod:'BT03',nombre:'Codificación y etiquetado de prendas',        cat:'SO', peso:5},
  ];
  const DEFAULTS_AL = [
    {cod:'AM01',nombre:'Recepción y registro de prendas recibidas',  cat:'ALM',peso:5},
    {cod:'AM02',nombre:'Clasificación de prendas por estado',         cat:'ALM',peso:5},
    {cod:'AM03',nombre:'Proceso de lavado y limpieza de prendas',     cat:'ALM',peso:8},
    {cod:'AM04',nombre:'Refacción y reparación de prendas',           cat:'ALM',peso:8},
    {cod:'AM05',nombre:'Control de calidad post-proceso',             cat:'ALM',peso:5},
    {cod:'AM06',nombre:'Cambio de precios en sistema Tuxedo',         cat:'ALM',peso:5},
    {cod:'AM07',nombre:'Preparación y despacho de ternos a tiendas',  cat:'ALM',peso:5},
    {cod:'AM08',nombre:'Registro de envíos completados',              cat:'ALM',peso:3},
    {cod:'AM09',nombre:'Orden y limpieza del almacén',                cat:'IND',peso:5},
    {cod:'AM10',nombre:'Inventario de prendas en proceso',            cat:'ALM',peso:5},
  ];

  const defaults = sede === 'AL' ? DEFAULTS_AL : DEFAULTS_TIENDA;
  const ins = db.prepare(
    `INSERT OR IGNORE INTO actividades_config (sede,cod,nombre,categoria,peso,aparece_dia,frecuencia_dias,acumula,orden)
     VALUES (?,?,?,?,?,0,0,1,?)`
  );
  const tx = db.transaction(() => {
    defaults.forEach((a, i) => ins.run(sede, a.cod, a.nombre, a.cat, a.peso, i));
  });
  tx();
  res.json({ ok: true, count: defaults.length });
});

module.exports = router;
