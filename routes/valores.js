const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// ── Migración silenciosa: activar módulo una sola vez ─────────────────
(function activarModulo() {
  try {
    const db = getDB();
    const init = db.prepare("SELECT valor FROM config WHERE clave='eval_valores_init_v1'").get();
    if (!init) {
      db.prepare("INSERT OR REPLACE INTO config (clave, valor) VALUES ('eval_valores_habilitado', '0')").run();
      db.prepare("INSERT OR REPLACE INTO config (clave, valor) VALUES ('eval_valores_init_v1', '1')").run();
      // Programación por defecto: días 25..28 de cada mes (ventana de evaluación
      // antes del cierre típico). El admin puede cambiarlos.
      db.prepare("INSERT OR IGNORE INTO config (clave, valor) VALUES ('eval_valores_modo', 'manual')").run();
      db.prepare("INSERT OR IGNORE INTO config (clave, valor) VALUES ('eval_valores_dias', '25,26,27,28')").run();
    }
  } catch (e) {}
})();

// ── Helper: ¿está habilitado HOY? ─────────────────────────────────────
// modo='manual'  → solo respeta el flag eval_valores_habilitado
// modo='auto'    → habilita automáticamente en los días configurados
//                  (eval_valores_dias = "25,26,27,28")
function estaHabilitadoHoy(db) {
  try {
    const modo = (db.prepare("SELECT valor FROM config WHERE clave='eval_valores_modo'").get()||{}).valor || 'manual';
    if (modo === 'auto') {
      const dias = ((db.prepare("SELECT valor FROM config WHERE clave='eval_valores_dias'").get()||{}).valor || '')
        .split(',').map(s=>parseInt(s.trim())).filter(n=>n>=1&&n<=31);
      return dias.includes(new Date().getDate());
    }
    return ((db.prepare("SELECT valor FROM config WHERE clave='eval_valores_habilitado'").get()||{}).valor || '0') === '1';
  } catch(e) { return false; }
}

// ── GET /api/valores/config — devuelve configuración actual + estado ─
router.get('/config', verifyToken, (req, res) => {
  try {
    const db = getDB();
    const get = (k, def) => ((db.prepare("SELECT valor FROM config WHERE clave=?").get(k)||{}).valor || def);
    res.json({
      habilitado: get('eval_valores_habilitado', '0') === '1',
      modo: get('eval_valores_modo', 'manual'),
      dias: get('eval_valores_dias', '25,26,27,28').split(',').map(s=>parseInt(s.trim())).filter(n=>n),
      activo_hoy: estaHabilitadoHoy(db)
    });
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ── PUT /api/valores/config — admin actualiza configuración ──────────
router.put('/config', verifyToken, requireAdmin, (req, res) => {
  try {
    const db = getDB();
    const b = req.body || {};
    const upd = db.prepare("INSERT OR REPLACE INTO config (clave, valor) VALUES (?,?)");
    if (b.habilitado !== undefined) upd.run('eval_valores_habilitado', b.habilitado ? '1' : '0');
    if (b.modo)                     upd.run('eval_valores_modo', b.modo === 'auto' ? 'auto' : 'manual');
    if (Array.isArray(b.dias))      upd.run('eval_valores_dias', b.dias.filter(n=>n>=1&&n<=31).join(','));
    res.json({ ok: true, activo_hoy: estaHabilitadoHoy(db) });
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/valores/pendientes/:mes — quién no ha evaluado todavía
router.get('/pendientes/:mes', verifyToken, (req, res) => {
  const db  = getDB();
  const mes = req.params.mes;
  const empId = req.user.id;
  // Empleados a quienes debería haber evaluado (todos menos sí mismo)
  const todos  = db.prepare("SELECT e.id,e.nombre FROM empleados e WHERE e.activo=1 AND e.id!=?").all(empId);
  const yaEval = db.prepare('SELECT evaluado_id FROM evaluaciones_valores WHERE evaluador_id=? AND mes=?').all(empId,mes).map(r=>r.evaluado_id);
  const pendientes = todos.filter(e=>!yaEval.includes(e.id));
  res.json({ pendientes, yaEvaluados: yaEval, total: todos.length });
});

// GET /api/valores/resumen/:emp_id/:mes — resumen para el admin
router.get('/resumen/:emp_id/:mes', requireAdmin, (req, res) => {
  const db = getDB();
  const { emp_id, mes } = req.params;
  const evals = db.prepare(`
    SELECT ev.*, e.nombre as evaluador_nombre
    FROM evaluaciones_valores ev
    JOIN empleados e ON e.id=ev.evaluador_id
    WHERE ev.evaluado_id=? AND ev.mes=?
  `).all(emp_id, mes);

  if (!evals.length) return res.json({ evals: [], promedios: null });

  const campos = ['integridad','respeto','honestidad','amabilidad','relacion','actitud'];
  const promedios = {};
  campos.forEach(c => {
    const vals = evals.map(e=>e[c]).filter(v=>v!=null);
    promedios[c] = vals.length ? +(vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(2) : 0;
  });
  promedios.total = +(Object.values(promedios).reduce((s,v)=>s+v,0)/campos.length).toFixed(2);
  // Nota /20 — max posible por valor es 5 → 6 valores × 5 = 30 → /30 × 20
  promedios.nota20 = +((promedios.total/5)*20).toFixed(1);

  res.json({ evals, promedios, cantidad: evals.length });
});

// POST /api/valores — guardar evaluación de valores (cualquier empleado)
router.post('/', verifyToken, (req, res) => {
  const db = getDB();
  const { evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud } = req.body;
  const evaluador_id = req.user.id;
  if (evaluador_id === evaluado_id) return res.status(400).json({ error: 'No puedes evaluarte a ti mismo' });
  db.prepare(`INSERT OR REPLACE INTO evaluaciones_valores
    (evaluador_id,evaluado_id,mes,integridad,respeto,honestidad,amabilidad,relacion,actitud)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(evaluador_id,evaluado_id,mes,integridad,respeto,honestidad,amabilidad,relacion,actitud);
  res.json({ ok: true });
});

// GET /api/valores/mis-pendientes/:mes
router.get('/mis-pendientes/:mes', verifyToken, (req, res) => {
  const db  = getDB();
  const mes = req.params.mes;
  const empId = req.user.id;
  const todos  = db.prepare("SELECT e.id,e.nombre,e.iniciales FROM empleados e WHERE e.activo=1 AND e.id!=?").all(empId);
  const yaEval = new Set(
    db.prepare('SELECT evaluado_id FROM evaluaciones_valores WHERE evaluador_id=? AND mes=?')
      .all(empId,mes).map(r=>r.evaluado_id)
  );
  res.json(todos.map(e=>({...e, evaluado: yaEval.has(e.id)})));
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/valores/seguimiento/:mes — vista admin
// Devuelve para todos los empleados activos del mes:
//   - cantidad de evaluaciones que recibieron
//   - cantidad de evaluaciones que enviaron
//   - promedios por valor (si recibió ≥ 1)
//   - faltantes: a quiénes le falta evaluar
// Útil para que el admin vea de un vistazo quién participa y quién no.
// ═══════════════════════════════════════════════════════════════════════
router.get('/seguimiento/:mes', requireAdmin, (req, res) => {
  try {
    const db  = getDB();
    const mes = req.params.mes;
    // Sedes vienen de empleado_tiendas (relación N:M); empleados.sede NO existe.
    const empleados = db.prepare(
      "SELECT id, nombre, iniciales, rol, fecha_ingreso, " +
      "  (SELECT GROUP_CONCAT(tienda) FROM empleado_tiendas WHERE emp_id=empleados.id) as sede " +
      "FROM empleados WHERE activo=1 ORDER BY nombre"
    ).all();
    const evals     = db.prepare('SELECT * FROM evaluaciones_valores WHERE mes=?').all(mes);

    // Mapeo: evaluado_id → array de evaluaciones recibidas
    const recibidasPor = {}, enviadasPor = {};
    evals.forEach(e => {
      (recibidasPor[e.evaluado_id]   = recibidasPor[e.evaluado_id]   || []).push(e);
      (enviadasPor[e.evaluador_id]   = enviadasPor[e.evaluador_id]   || []).push(e);
    });

    const campos = ['integridad','respeto','honestidad','amabilidad','relacion','actitud'];
    const filas = empleados.map(emp => {
      const rec  = recibidasPor[emp.id] || [];
      const env  = enviadasPor[emp.id] || [];
      const evaluadosIds = new Set(env.map(e => e.evaluado_id));
      const faltantes = empleados
        .filter(e => e.id !== emp.id && !evaluadosIds.has(e.id))
        .map(e => ({ id: e.id, nombre: e.nombre, iniciales: e.iniciales }));
      const promedios = {};
      campos.forEach(c => {
        const vals = rec.map(e => e[c]).filter(v => v != null);
        promedios[c] = vals.length ? +(vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(2) : null;
      });
      const promValores = campos.map(c => promedios[c]).filter(v => v != null);
      const total = promValores.length ? +(promValores.reduce((s,v)=>s+v,0)/promValores.length).toFixed(2) : null;
      const nota20 = total != null ? +((total/5)*20).toFixed(1) : null;

      return {
        id:        emp.id,
        nombre:    emp.nombre,
        iniciales: emp.iniciales,
        rol:       emp.rol,
        sede:      emp.sede,
        recibidas: rec.length,
        enviadas:  env.length,
        debe_enviar: empleados.length - 1, // todos menos sí mismo
        cumplimiento: empleados.length > 1 ? +(env.length/(empleados.length-1)).toFixed(2) : 1,
        promedios,
        nota20,
        faltantes
      };
    });

    res.json({
      mes,
      total_empleados: empleados.length,
      total_evaluaciones: evals.length,
      esperadas:           empleados.length * (empleados.length - 1),
      cumplimiento_global: empleados.length > 1 ? +(evals.length / (empleados.length * (empleados.length - 1))).toFixed(2) : 1,
      filas
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/valores/mi-resumen/:mes — el colaborador ve su propio resumen
router.get('/mi-resumen/:mes', verifyToken, (req, res) => {
  try {
    const db    = getDB();
    const mes   = req.params.mes;
    const empId = req.user.id;
    const evals = db.prepare("SELECT * FROM evaluaciones_valores WHERE evaluado_id=? AND mes=?").all(empId, mes);
    if (!evals.length) return res.json({ recibidas: 0, promedios: null, nota20: null });
    const campos = ['integridad','respeto','honestidad','amabilidad','relacion','actitud'];
    const promedios = {};
    campos.forEach(c => {
      const vals = evals.map(e => e[c]).filter(v => v != null);
      promedios[c] = vals.length ? +(vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(2) : null;
    });
    const promValores = campos.map(c => promedios[c]).filter(v => v != null);
    const total  = promValores.length ? +(promValores.reduce((s,v)=>s+v,0)/promValores.length).toFixed(2) : null;
    const nota20 = total != null ? +((total/5)*20).toFixed(1) : null;
    res.json({ recibidas: evals.length, promedios, nota20 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
