// ═══════════════════════════════════════════════════════════════════════
// LUCEBIEN · routes/pagos.js
// Cierre del ciclo evaluación → pago. Cada evaluación mensual cerrada
// puede generar un pago al colaborador, con comprobante imprimible.
//
// Endpoints:
//   GET  /api/pagos                    — listar (filtros emp_id, mes, estado, sede)
//   GET  /api/pagos/:id                — detalle + datos del empleado y evaluación
//   POST /api/pagos                    — admin · registrar pago
//   PUT  /api/pagos/:id                — admin · editar / marcar como pagado
//   DELETE /api/pagos/:id              — admin · anular (soft delete via estado)
//   GET  /api/pagos/:id/comprobante    — HTML imprimible
//   GET  /api/pagos/sugerir            — sugiere monto basado en evaluación
//                                        ?emp_id=&ciclo_desde=&ciclo_hasta=
// ═══════════════════════════════════════════════════════════════════════

const router = require('express').Router();
const { getDB, hoyLocal } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// ── Migración silenciosa idempotente ────────────────────────────────────
(function migrarPagos() {
  try {
    const db = getDB();
    db.exec(
      "CREATE TABLE IF NOT EXISTS pagos (" +
      "  id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "  emp_id TEXT NOT NULL," +
      "  evaluacion_id TEXT," +
      "  ciclo_desde TEXT," +
      "  ciclo_hasta TEXT," +
      "  mes TEXT," +
      "  monto REAL DEFAULT 0," +
      "  monto_base REAL DEFAULT 0," +
      "  bonus REAL DEFAULT 0," +
      "  descuentos REAL DEFAULT 0," +
      "  nota_final REAL," +
      "  metodo TEXT DEFAULT 'efectivo'," +
      "  comprobante_num TEXT," +
      "  fecha_pago TEXT," +
      "  estado TEXT DEFAULT 'pendiente'," +
      "  observaciones TEXT DEFAULT ''," +
      "  registrado_por TEXT," +
      "  registrado_por_cod TEXT," +
      "  anulado INTEGER DEFAULT 0," +
      "  anulado_motivo TEXT," +
      "  created_at TEXT DEFAULT (datetime('now','localtime'))" +
      ")"
    );
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_pagos_emp ON pagos(emp_id)"); } catch(e){}
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_pagos_mes ON pagos(mes)"); } catch(e){}
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_pagos_estado ON pagos(estado, anulado)"); } catch(e){}

    // Empleados: campos opcionales para que el sistema esté listo cuando
    // empiecen a poblarse datos.
    try { db.exec("ALTER TABLE empleados ADD COLUMN salario_base REAL DEFAULT 0"); } catch(e){}
    try { db.exec("ALTER TABLE empleados ADD COLUMN tipo_contrato TEXT"); } catch(e){}
    try { db.exec("ALTER TABLE empleados ADD COLUMN vencimiento_contrato TEXT"); } catch(e){}
    try { db.exec("ALTER TABLE empleados ADD COLUMN fecha_nacimiento TEXT"); } catch(e){}
    try { db.exec("ALTER TABLE empleados ADD COLUMN dni TEXT"); } catch(e){}
    try { db.exec("ALTER TABLE empleados ADD COLUMN telefono TEXT"); } catch(e){}
  } catch (e) { console.warn('[pagos] migración:', e.message); }
})();

function esAdmin(u) {
  const r = (u && u.rol || '').toLowerCase();
  return r === 'admin' || r === 'dueno' || r === 'dueño';
}
function safe(fn) {
  return function(req, res){ try { fn(req, res); } catch(e){ res.status(500).json({error:e.message}); } };
}
// Helper: las sedes del empleado viven en empleado_tiendas (relación N:M),
// no en una columna empleados.sede (que NO existe). Devuelve "ST,LB,TR".
function sedesDe(db, empId) {
  try {
    return db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?')
      .all(empId).map(r => r.tienda).join(',');
  } catch (e) { return ''; }
}

// ════════════════════════════════════════════════════════════════════════
// GET /  — listar pagos
// ════════════════════════════════════════════════════════════════════════
router.get('/', verifyToken, safe(function(req, res){
  const db = getDB();
  // emp_sede se calcula desde empleado_tiendas (subquery con GROUP_CONCAT).
  // Filtro opcional por sede usa EXISTS contra empleado_tiendas.
  let sql =
    "SELECT p.*, e.nombre as emp_nombre, e.rol as emp_rol, " +
    "  (SELECT GROUP_CONCAT(tienda) FROM empleado_tiendas WHERE emp_id=p.emp_id) as emp_sede " +
    "FROM pagos p LEFT JOIN empleados e ON e.id=p.emp_id WHERE 1=1";
  const params = [];
  if (req.query.emp_id) { sql += ' AND p.emp_id=?'; params.push(req.query.emp_id); }
  if (req.query.mes)    { sql += ' AND p.mes=?';    params.push(req.query.mes); }
  if (req.query.estado) { sql += ' AND p.estado=?'; params.push(req.query.estado); }
  if (req.query.sede)   { sql += ' AND EXISTS (SELECT 1 FROM empleado_tiendas WHERE emp_id=p.emp_id AND tienda=?)'; params.push(req.query.sede); }
  if (req.query.solo_activos !== '0') sql += ' AND COALESCE(p.anulado,0)=0';
  sql += ' ORDER BY p.created_at DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params));
}));

// ════════════════════════════════════════════════════════════════════════
// GET /sugerir — sugiere monto basado en evaluación cerrada del periodo
//   monto = salario_base × (nota_final / 20)  +  bonus  −  descuentos
//   (fórmula simple a falta de regla más detallada del usuario)
// ════════════════════════════════════════════════════════════════════════
router.get('/sugerir', verifyToken, safe(function(req, res){
  const db = getDB();
  const empId = req.query.emp_id;
  const cicloDesde = req.query.ciclo_desde || null;
  const cicloHasta = req.query.ciclo_hasta || null;
  if (!empId) return res.status(400).json({error:'emp_id requerido'});

  const emp = db.prepare("SELECT id, nombre, salario_base, rol FROM empleados WHERE id=?").get(empId);
  if (!emp) return res.status(404).json({error:'empleado no encontrado'});
  emp.sede = sedesDe(db, emp.id);

  // Buscar evaluación más reciente del periodo
  let evalRow = null;
  if (cicloDesde) {
    evalRow = db.prepare("SELECT * FROM evaluaciones_mensuales WHERE emp_id=? AND ciclo_desde=?").get(empId, cicloDesde);
  }
  if (!evalRow) {
    const mes = (cicloDesde||hoyLocal()).slice(0,7);
    evalRow = db.prepare("SELECT * FROM evaluaciones_mensuales WHERE emp_id=? AND mes=? ORDER BY created_at DESC LIMIT 1").get(empId, mes);
  }

  const salarioBase = parseFloat(emp.salario_base) || 0;
  const notaFinal = evalRow ? (parseFloat(evalRow.nota_final) || 0) : null;
  const bonus = evalRow ? (parseFloat(evalRow.bonus_ventas) || 0) : 0;
  const descuentos = evalRow ? (parseFloat(evalRow.descuento_incidencias) || 0) : 0;

  // Sugerencia: si hay nota, modular el salario; si no, usar salario completo como base.
  let montoSugerido = salarioBase;
  if (notaFinal != null) {
    montoSugerido = salarioBase * (notaFinal / 20) + bonus - descuentos;
    montoSugerido = Math.max(0, montoSugerido);
  }
  montoSugerido = +montoSugerido.toFixed(2);

  res.json({
    empleado: { id: emp.id, nombre: emp.nombre, sede: emp.sede, rol: emp.rol, salario_base: salarioBase },
    evaluacion: evalRow,
    sugerido: {
      monto_base: salarioBase,
      bonus: bonus,
      descuentos: descuentos,
      nota_final: notaFinal,
      monto_total: montoSugerido,
      formula: 'salario_base × (nota_final / 20) + bonus − descuentos'
    }
  });
}));

// ════════════════════════════════════════════════════════════════════════
// GET /:id — detalle del pago + empleado + evaluación
// ════════════════════════════════════════════════════════════════════════
router.get('/:id', verifyToken, safe(function(req, res){
  const db = getDB();
  const p = db.prepare(
    "SELECT p.*, e.nombre as emp_nombre, e.rol as emp_rol, e.dni as emp_dni, " +
    "  (SELECT GROUP_CONCAT(tienda) FROM empleado_tiendas WHERE emp_id=p.emp_id) as emp_sede " +
    "FROM pagos p LEFT JOIN empleados e ON e.id=p.emp_id WHERE p.id=?"
  ).get(req.params.id);
  if (!p) return res.status(404).json({error:'pago no encontrado'});
  let evalRow = null;
  if (p.evaluacion_id) evalRow = db.prepare("SELECT * FROM evaluaciones_mensuales WHERE id=?").get(p.evaluacion_id);
  res.json({ pago: p, evaluacion: evalRow });
}));

// ════════════════════════════════════════════════════════════════════════
// POST / — admin registra pago
// ════════════════════════════════════════════════════════════════════════
router.post('/', requireAdmin, safe(function(req, res){
  const db = getDB();
  const b = req.body || {};
  if (!b.emp_id) return res.status(400).json({error:'emp_id requerido'});
  const monto = parseFloat(b.monto)||0;
  if (monto < 0) return res.status(400).json({error:'monto inválido'});

  const fechaPago = b.fecha_pago || hoyLocal();
  const mes = b.mes || (b.ciclo_desde ? b.ciclo_desde.slice(0,7) : fechaPago.slice(0,7));
  const estado = b.estado || (b.fecha_pago ? 'pagado' : 'pendiente');

  const r = db.prepare(
    "INSERT INTO pagos (emp_id, evaluacion_id, ciclo_desde, ciclo_hasta, mes, " +
    "monto, monto_base, bonus, descuentos, nota_final, metodo, comprobante_num, " +
    "fecha_pago, estado, observaciones, registrado_por, registrado_por_cod) " +
    "VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?, ?,?,?, ?,?)"
  ).run(
    b.emp_id, b.evaluacion_id || null, b.ciclo_desde || null, b.ciclo_hasta || null, mes,
    monto, parseFloat(b.monto_base)||0, parseFloat(b.bonus)||0, parseFloat(b.descuentos)||0, b.nota_final!=null?parseFloat(b.nota_final):null,
    b.metodo || 'efectivo', b.comprobante_num || null,
    fechaPago, estado, b.observaciones || '',
    req.user.nombre || '', req.user.cod || ''
  );
  res.json({ id: r.lastInsertRowid, ok: true });
}));

// ════════════════════════════════════════════════════════════════════════
// PUT /:id — admin edita o marca como pagado
// ════════════════════════════════════════════════════════════════════════
router.put('/:id', requireAdmin, safe(function(req, res){
  const db = getDB();
  const b = req.body || {};
  const cur = db.prepare("SELECT * FROM pagos WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({error:'no encontrado'});
  if (cur.anulado) return res.status(409).json({error:'pago anulado, no editable'});

  const sets = [], vals = [];
  ['monto','monto_base','bonus','descuentos','nota_final','metodo','comprobante_num',
   'fecha_pago','estado','observaciones'].forEach(k => {
    if (b[k] !== undefined) { sets.push(k+'=?'); vals.push(b[k]); }
  });
  if (!sets.length) return res.json({ ok:true, sin_cambios:true });
  vals.push(req.params.id);
  db.prepare("UPDATE pagos SET "+sets.join(',')+" WHERE id=?").run(...vals);
  res.json({ ok:true });
}));

// ════════════════════════════════════════════════════════════════════════
// DELETE /:id — anula (soft) con motivo
// ════════════════════════════════════════════════════════════════════════
router.delete('/:id', requireAdmin, safe(function(req, res){
  const db = getDB();
  const motivo = (req.query.motivo || req.body && req.body.motivo || '').trim();
  if (!motivo) return res.status(400).json({error:'motivo requerido'});
  const r = db.prepare("UPDATE pagos SET anulado=1, anulado_motivo=? WHERE id=?").run(motivo, req.params.id);
  if (!r.changes) return res.status(404).json({error:'no encontrado'});
  res.json({ ok:true });
}));

// ════════════════════════════════════════════════════════════════════════
// GET /:id/comprobante — HTML imprimible (A4 portrait, blanco/navy/gold)
// ════════════════════════════════════════════════════════════════════════
router.get('/:id/comprobante', verifyToken, safe(function(req, res){
  const db = getDB();
  const p = db.prepare(
    "SELECT p.*, e.nombre as emp_nombre, e.rol as emp_rol, e.dni as emp_dni, " +
    "  (SELECT GROUP_CONCAT(tienda) FROM empleado_tiendas WHERE emp_id=p.emp_id) as emp_sede " +
    "FROM pagos p LEFT JOIN empleados e ON e.id=p.emp_id WHERE p.id=?"
  ).get(req.params.id);
  if (!p) return res.status(404).send('<h1>Pago no encontrado</h1>');

  const fmt = (n) => 'S/ ' + (parseFloat(n)||0).toFixed(2);
  const fNotaFinal = p.nota_final != null ? p.nota_final + '/20' : '—';
  const ciclo = p.ciclo_desde && p.ciclo_hasta ? (p.ciclo_desde + ' a ' + p.ciclo_hasta) : (p.mes || '—');
  const anulBanner = p.anulado ? '<div style="background:#fee2e2;border:2px solid #c0392b;padding:8px;text-align:center;font-weight:800;color:#c0392b;margin-bottom:14px">ANULADO · '+(p.anulado_motivo||'sin motivo')+'</div>' : '';

  const html = `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<title>Comprobante de pago #${p.id}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',Arial,sans-serif;background:#f0f2f7;color:#1a2035;padding:24px;font-size:12px}
  .doc{max-width:720px;margin:0 auto;background:#fff;border:1px solid #d8dce8;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(46,62,110,.08)}
  .head{background:linear-gradient(135deg,#1e2a4a 0%,#2e3e6e 100%);color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center}
  .head h1{font-size:18px;letter-spacing:1px}
  .head .num{font-family:'JetBrains Mono',monospace;font-weight:800;font-size:14px;color:#d4bf1e;background:rgba(184,165,21,.15);padding:5px 12px;border-radius:6px;border:1px solid rgba(184,165,21,.4)}
  .body{padding:24px 28px}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #e8eaf2;font-size:13px}
  .row .lbl{color:#8a90aa;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:1px;font-family:'JetBrains Mono',monospace}
  .row .val{font-weight:700}
  .section{margin:18px 0 8px;font-size:11px;font-weight:800;color:#2e3e6e;text-transform:uppercase;letter-spacing:1.5px;border-bottom:2px solid #b8a515;padding-bottom:4px}
  .montos{margin-top:14px;padding:14px;background:#f7f8fc;border-radius:8px;border:1px solid #d8dce8}
  .montos .row .val{font-family:'JetBrains Mono',monospace;font-size:14px}
  .total{margin-top:10px;padding:14px;background:linear-gradient(135deg,#2e3e6e,#3a4f8a);color:#fff;border-radius:8px;display:flex;justify-content:space-between;align-items:center}
  .total .lbl{color:rgba(255,255,255,.6);text-transform:uppercase;font-size:11px;letter-spacing:2px}
  .total .val{font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:900;color:#d4bf1e}
  .firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;padding-top:20px}
  .firma{text-align:center}
  .firma-line{border-top:1.5px solid #1a2035;margin-top:50px;padding-top:6px;font-size:11px;color:#4a5272;font-weight:600}
  .footer{padding:14px 28px;background:#f7f8fc;text-align:center;font-size:10px;color:#8a90aa;font-family:'JetBrains Mono',monospace}
  .obs{font-style:italic;color:#4a5272;font-size:11px;padding:10px;background:#f7f8fc;border-left:3px solid #b8a515;margin-top:10px}
  @media print{ body{background:#fff;padding:0} .doc{box-shadow:none;border:0;border-radius:0;max-width:100%} .no-print{display:none} }
  .actions{margin:0 auto 14px;max-width:720px;text-align:right}
  .btn-print{padding:8px 18px;background:#2e3e6e;color:#fff;border:0;border-radius:6px;font-weight:700;cursor:pointer}
  .btn-print:hover{background:#3a4f8a}
</style>
</head><body>
<div class="actions no-print">
  <button class="btn-print" onclick="window.print()">Imprimir</button>
</div>
<div class="doc">
  <div class="head">
    <div>
      <div style="font-size:9px;letter-spacing:3px;color:rgba(212,191,30,.85);font-family:'JetBrains Mono',monospace;margin-bottom:4px">LUCEBIEN · CONTROL INTERNO</div>
      <h1>Comprobante de Pago</h1>
    </div>
    <div class="num">N° ${String(p.id).padStart(6,'0')}</div>
  </div>
  <div class="body">
    ${anulBanner}
    <div class="section">Datos del colaborador</div>
    <div class="row"><span class="lbl">Nombre</span><span class="val">${p.emp_nombre || '—'}</span></div>
    <div class="row"><span class="lbl">DNI</span><span class="val">${p.emp_dni || '—'}</span></div>
    <div class="row"><span class="lbl">Sede</span><span class="val">${p.emp_sede || '—'}</span></div>
    <div class="row"><span class="lbl">Cargo</span><span class="val">${(p.emp_rol||'—').replace(/_/g,' ')}</span></div>

    <div class="section">Periodo evaluado</div>
    <div class="row"><span class="lbl">Ciclo</span><span class="val">${ciclo}</span></div>
    <div class="row"><span class="lbl">Nota final</span><span class="val">${fNotaFinal}</span></div>
    <div class="row"><span class="lbl">Evaluación id</span><span class="val">${p.evaluacion_id || '—'}</span></div>

    <div class="section">Detalle del pago</div>
    <div class="montos">
      <div class="row"><span class="lbl">Monto base</span><span class="val">${fmt(p.monto_base)}</span></div>
      <div class="row"><span class="lbl">Bonus</span><span class="val" style="color:#1a7a52">+ ${fmt(p.bonus)}</span></div>
      <div class="row" style="border-bottom:0"><span class="lbl">Descuentos</span><span class="val" style="color:#c0392b">− ${fmt(p.descuentos)}</span></div>
    </div>
    <div class="total">
      <span class="lbl">Total a pagar</span>
      <span class="val">${fmt(p.monto)}</span>
    </div>

    <div class="section" style="margin-top:18px">Información del pago</div>
    <div class="row"><span class="lbl">Fecha de pago</span><span class="val">${p.fecha_pago || '—'}</span></div>
    <div class="row"><span class="lbl">Método</span><span class="val">${(p.metodo||'—').toUpperCase()}</span></div>
    <div class="row"><span class="lbl">N° comprobante</span><span class="val">${p.comprobante_num || '—'}</span></div>
    <div class="row"><span class="lbl">Estado</span><span class="val">${(p.estado||'—').toUpperCase()}</span></div>
    <div class="row"><span class="lbl">Registrado por</span><span class="val">${p.registrado_por || '—'}</span></div>

    ${p.observaciones ? '<div class="obs">'+p.observaciones+'</div>' : ''}

    <div class="firmas">
      <div class="firma">
        <div class="firma-line">Firma del colaborador</div>
      </div>
      <div class="firma">
        <div class="firma-line">Firma de quien entrega</div>
      </div>
    </div>
  </div>
  <div class="footer">
    Generado el ${new Date().toLocaleString('es-PE')} · LuceBien Control Interno
  </div>
</div>
</body></html>`;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}));

module.exports = router;
