// ═══════════════════════════════════════════════════════════════════════
// LUCEBIEN · routes/evaluaciones.js — Evaluaciones mensuales
// ═══════════════════════════════════════════════════════════════════════
// Endpoints:
//   GET  /mensual                  — listar (filtros emp_id, mes, ciclo)
//   POST /mensual                  — guardar/actualizar evaluación
//   GET  /pesos                    — pesos vigentes (autoinicializa default)
//   PUT  /pesos                    — actualizar pesos (admin)
//   GET  /ciclo-actual?emp_id=     — calcula el ciclo personal del empleado
//                                    a partir de fecha_ingreso (aniversario);
//                                    fallback a mes calendario si no la hay.
//   GET  /calcular?emp_id=&desde=&hasta= — autopuebla nota_operaciones,
//                                    nota_software, nota_limpieza,
//                                    nota_tardanza, descuento_incidencias,
//                                    cumplimiento_reportes a partir de los
//                                    datos reales del periodo. Útil para
//                                    pre-llenar la UI de evaluación mensual.
//
// Notas de schema:
//   - evaluaciones_mensuales mantiene `mes` (YYYY-MM) por compat hacia atrás.
//   - Se agregaron columnas idempotentemente: nota_software, nota_limpieza,
//     nota_examenes, bonus_ventas, ciclo_desde, ciclo_hasta, pesos_usados.
//   - Los pesos se guardan en la tabla config (key/value) con prefijo `peso_`.
//   - No se versiona historial de pesos: cada evaluación guarda en
//     `pesos_usados` los pesos exactos que se usaron al cierre, así
//     ediciones futuras NO recalculan retroactivamente.
//
// Mapeo a notas de evaluación mensual (regla del usuario):
//   - cat='IND'                              → LIMPIEZA (cubre AT01
//                                              "Limpieza de almacén" aunque
//                                              su prefijo sea AT)
//   - cod LIKE 'AS%' OR cod LIKE 'BS%'       → SOFTWARE
//   - cod LIKE 'AT%' OR cod LIKE 'BT%'       → OPERACIONES
//   - cat='EXT' (prefijos XT*)               → no se cuenta
// La distinción 'PO' vs 'SO' es de prioridad/peso de la actividad y NO
// determina la categoría de la nota mensual.
// Almacén típicamente tendrá software=null (no hay AS/BS de software allí
// excepto un par de "AS" relacionados con verificación de sistema).
// ═══════════════════════════════════════════════════════════════════════

const router = require('express').Router();
const { getDB } = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// ── Migración silenciosa (idempotente) ───────────────────────────────────
(function migrarEvaluaciones() {
  try {
    const db = getDB();
    // Columnas adicionales en evaluaciones_mensuales
    [
      "ALTER TABLE evaluaciones_mensuales ADD COLUMN nota_software REAL DEFAULT 0",
      "ALTER TABLE evaluaciones_mensuales ADD COLUMN nota_limpieza REAL DEFAULT 0",
      "ALTER TABLE evaluaciones_mensuales ADD COLUMN nota_examenes REAL DEFAULT 0",
      "ALTER TABLE evaluaciones_mensuales ADD COLUMN bonus_ventas REAL DEFAULT 0",
      "ALTER TABLE evaluaciones_mensuales ADD COLUMN ciclo_desde TEXT",
      "ALTER TABLE evaluaciones_mensuales ADD COLUMN ciclo_hasta TEXT",
      "ALTER TABLE evaluaciones_mensuales ADD COLUMN pesos_usados TEXT",
      "ALTER TABLE evaluaciones_mensuales ADD COLUMN cumplimiento REAL"
    ].forEach((sql) => { try { db.exec(sql); } catch (e) { /* ya existe */ } });

    // Inicializar pesos default si no están en config
    const PESOS_DEFAULT = {
      peso_competencias: 25,
      peso_valores360:   25,
      peso_operaciones:  10,
      peso_software:     10,
      peso_limpieza:     10,
      peso_conocimientos:15,
      peso_tardanzas:     5
    };
    const ins = db.prepare("INSERT OR IGNORE INTO config (clave, valor) VALUES (?,?)");
    Object.entries(PESOS_DEFAULT).forEach(([k, v]) => ins.run(k, String(v)));
  } catch (e) {
    console.warn('[evaluaciones] migración:', e.message);
  }
})();

// ── Helpers ───────────────────────────────────────────────────────────────
function esSupervisor(u) {
  if (!u) return false;
  const rol = (u.rol || '').toLowerCase();
  return rol === 'admin' || rol === 'dueno' || rol === 'dueño' || rol === 'encargado_almacen' || rol === 'encargado_tienda';
}

function getPesos(db) {
  const claves = ['peso_competencias','peso_valores360','peso_operaciones','peso_software','peso_limpieza','peso_conocimientos','peso_tardanzas'];
  const placeholders = claves.map(()=>'?').join(',');
  const rows = db.prepare(`SELECT clave, valor FROM config WHERE clave IN (${placeholders})`).all(...claves);
  const out = {};
  rows.forEach(r => { out[r.clave] = parseFloat(r.valor) || 0; });
  // Defaults por si falta alguna
  return Object.assign({
    peso_competencias: 25, peso_valores360: 25, peso_operaciones: 10,
    peso_software: 10, peso_limpieza: 10, peso_conocimientos: 15, peso_tardanzas: 5
  }, out);
}

function calcularCiclo(empleado, hoyStr) {
  // Devuelve {desde, hasta} en YYYY-MM-DD basado en fecha_ingreso (aniversario).
  // Si fecha_ingreso vacía o inválida → fallback al mes calendario actual.
  const hoy = hoyStr ? new Date(hoyStr + 'T12:00:00') : new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const fechaIng = (empleado && empleado.fecha_ingreso || '').trim();
  if (!fechaIng || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIng)) {
    // fallback: mes calendario
    const y = hoy.getFullYear(), m = hoy.getMonth();
    return {
      desde: fmt(new Date(y, m, 1)),
      hasta: fmt(new Date(y, m + 1, 0)),
      fuente: 'mes_calendario'
    };
  }
  // Día del mes del aniversario
  const dInicio = parseInt(fechaIng.slice(8, 10), 10);
  // Construir el "ciclo actual": desde el aniversario más reciente, hasta el día
  // anterior al próximo aniversario.
  let y = hoy.getFullYear(), m = hoy.getMonth();
  if (hoy.getDate() < dInicio) {
    // todavía no llegamos al aniversario de este mes → ciclo arrancó el mes pasado
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  const desde = new Date(y, m, dInicio);
  const hasta = new Date(y, m + 1, dInicio);
  hasta.setDate(hasta.getDate() - 1);
  return { desde: fmt(desde), hasta: fmt(hasta), fuente: 'aniversario' };
}

function avg(arr) {
  const v = arr.filter(x => x != null && !isNaN(x));
  if (!v.length) return null;
  return +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2);
}

// ═══════════════════════════════════════════════════════════════════════
// GET /mensual — listar evaluaciones (filtros: emp_id, mes, ciclo_desde)
// ═══════════════════════════════════════════════════════════════════════
router.get('/mensual', verifyToken, (req, res) => {
  try {
    const db = getDB();
    let sql = 'SELECT * FROM evaluaciones_mensuales WHERE 1=1';
    const p = [];
    if (req.query.emp_id) { sql += ' AND emp_id=?'; p.push(req.query.emp_id); }
    if (req.query.mes)    { sql += ' AND mes=?';    p.push(req.query.mes); }
    if (req.query.ciclo_desde) { sql += ' AND ciclo_desde=?'; p.push(req.query.ciclo_desde); }
    sql += ' ORDER BY COALESCE(ciclo_desde, mes) DESC';
    res.json(db.prepare(sql).all(...p));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /mensual — guardar evaluación (admin)
// Acepta los nuevos campos. Si no llegan, los persiste como 0/null.
// ═══════════════════════════════════════════════════════════════════════
router.post('/mensual', requireAdmin, (req, res) => {
  try {
    const db = getDB();
    const b = req.body || {};
    const empId = b.emp_id;
    if (!empId) return res.status(400).json({ error: 'emp_id requerido' });

    // Si vino ciclo, lo usamos; si no, mes calendario.
    const cicloDesde = b.ciclo_desde || null;
    const cicloHasta = b.ciclo_hasta || null;
    const mes = b.mes || (cicloDesde ? cicloDesde.slice(0, 7) : '');
    const id = b.id || `EM-${empId}-${cicloDesde || mes}`;

    const pesosUsados = b.pesos_usados ? (typeof b.pesos_usados === 'string' ? b.pesos_usados : JSON.stringify(b.pesos_usados)) : JSON.stringify(getPesos(db));

    db.prepare(`INSERT OR REPLACE INTO evaluaciones_mensuales (
      id, emp_id, mes, evaluador,
      nota_competencias, nota_valores, nota_operaciones, nota_software,
      nota_limpieza, nota_examenes, nota_tardanza,
      descuento_incidencias, descuento_tardanzas, bonus_ventas,
      nota_final, recomendacion, obs_general,
      ciclo_desde, ciclo_hasta, cumplimiento, pesos_usados
    ) VALUES (?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?,?,?)`).run(
      id, empId, mes, b.evaluador || '',
      b.nota_competencias || 0, b.nota_valores || 0, b.nota_operaciones || 0, b.nota_software || 0,
      b.nota_limpieza || 0, b.nota_examenes || 0, b.nota_tardanza || 0,
      b.descuento_incidencias || 0, b.descuento_tardanzas || 0, b.bonus_ventas || 0,
      b.nota_final || 0, b.recomendacion || '', b.obs_general || '',
      cicloDesde, cicloHasta, b.cumplimiento != null ? b.cumplimiento : null, pesosUsados
    );
    res.json({ id, ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /pesos — pesos vigentes (lectura pública para que el frontend los
// muestre, pero PUT requiere admin)
// ═══════════════════════════════════════════════════════════════════════
router.get('/pesos', (req, res) => {
  try { res.json(getPesos(getDB())); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/pesos', requireAdmin, (req, res) => {
  try {
    const db = getDB();
    const b = req.body || {};
    const upd = db.prepare("INSERT OR REPLACE INTO config (clave, valor) VALUES (?,?)");
    const claves = ['peso_competencias','peso_valores360','peso_operaciones','peso_software','peso_limpieza','peso_conocimientos','peso_tardanzas'];
    db.transaction(() => {
      claves.forEach(k => {
        if (b[k] != null) upd.run(k, String(parseFloat(b[k]) || 0));
      });
    })();
    res.json({ ok: true, pesos: getPesos(db) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /ciclo-actual?emp_id= — devuelve {desde, hasta, fuente}
// ═══════════════════════════════════════════════════════════════════════
router.get('/ciclo-actual', verifyToken, (req, res) => {
  try {
    const db = getDB();
    const empId = req.query.emp_id;
    if (!empId) return res.status(400).json({ error: 'emp_id requerido' });
    const emp = db.prepare('SELECT id, nombre, fecha_ingreso FROM empleados WHERE id=?').get(empId);
    if (!emp) return res.status(404).json({ error: 'empleado no encontrado' });
    const ciclo = calcularCiclo(emp, req.query.hoy || null);
    res.json({ empleado: { id: emp.id, nombre: emp.nombre, fecha_ingreso: emp.fecha_ingreso }, ciclo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /calcular?emp_id=&desde=&hasta=&sede=
// Autopuebla notas a partir de datos reales:
//   - nota_operaciones / nota_software / nota_limpieza
//       Promedio de calificaciones en reporte_actividades agrupado por
//       categoría (PO, SO, IND), filtrando reportes evaluados del empleado
//       como ENCARGADO en el periodo. Cada calificación se asume escala
//       0..20; si el sistema usa otra escala se preserva como está.
//   - cumplimiento
//       reportes_enviados / reportes_esperados. Si no hay horario_slots para
//       el periodo se devuelve null.
//   - nota_tardanza
//       max(0, 20 - floor(min_total / 15)) — coincide con asistencias.js.
//   - descuento_incidencias
//       cantidad de incidencias del empleado en el periodo (-1 por incidencia
//       grave o configurable). Por defecto: cuenta total de incidencias.
//   - bonus_ventas
//       lookup en tabla `ventas` si existe.
//   - nota_valores
//       promedio de evaluaciones_valores recibidas (peer) en el periodo
//       traducido a /20 (= total/5 × 20). null si no hay aún el módulo
//       de "examen" entre colaboradores.
// ═══════════════════════════════════════════════════════════════════════
router.get('/calcular', verifyToken, (req, res) => {
  try {
    const db = getDB();
    const empId = req.query.emp_id;
    const desde = req.query.desde;
    const hasta = req.query.hasta;
    if (!empId || !desde || !hasta) return res.status(400).json({ error: 'emp_id, desde, hasta requeridos' });

    const emp = db.prepare('SELECT id, nombre, sede, rol FROM empleados WHERE id=?').get(empId);
    if (!emp) return res.status(404).json({ error: 'empleado no encontrado' });

    // ── 1. Notas por categoría desde reporte_actividades ────────────────
    // El empleado puede haber sido encargado en reportes con su id O su nombre
    // (compat: encargado_id puede estar NULL en datos viejos).
    const reportes = db.prepare(`
      SELECT r.id, r.sede, r.turno, r.fecha, r.evaluado, r.no_evaluable
      FROM reportes r
      WHERE (r.encargado_id = ? OR r.encargado = ?)
        AND r.fecha >= ? AND r.fecha <= ?
      ORDER BY r.fecha
    `).all(empId, emp.nombre || '', desde, hasta);

    const repIds = reportes.map(r => r.id);
    let notasOps = [], notasSw = [], notasLimp = [];
    if (repIds.length) {
      const ph = repIds.map(()=>'?').join(',');
      const acts = db.prepare(`
        SELECT cod, cat, calificacion FROM reporte_actividades
        WHERE reporte_id IN (${ph}) AND calificacion IS NOT NULL
      `).all(...repIds);
      // Mapeo según convención del usuario:
      //   IND → limpieza (incluye AT01 "Limpieza de almacén" aunque su prefijo sea AT)
      //   prefijo AS/BS → software
      //   prefijo AT/BT → operaciones
      //   EXT → no cuenta
      acts.forEach(a => {
        const cat = (a.cat || '').toUpperCase();
        const cod = (a.cod || '').toUpperCase();
        const v = parseFloat(a.calificacion);
        if (isNaN(v)) return;
        if (cat === 'EXT') return;
        if (cat === 'IND') { notasLimp.push(v); return; }
        if (/^(AS|BS)/.test(cod)) { notasSw.push(v); return; }
        if (/^(AT|BT)/.test(cod)) { notasOps.push(v); return; }
        // Fallback prudente: si la actividad no encaja, no contamos.
      });
    }

    // ── 2. Cumplimiento de reportes vs horario programado ───────────────
    // Esperados = slots del horario_slots que cubren al empleado en el rango.
    let esperados = null, enviados = reportes.length, cumplimiento = null;
    try {
      const empIdNum = parseInt(empId.replace(/[^0-9]/g, ''), 10) || empId;
      const slotsRows = db.prepare(`
        SELECT s.dia, s.turno
        FROM horario_slots s
        JOIN horario_periodos p ON p.id = s.periodo_id
        WHERE s.emp_id = ?
          AND DATE(?) <= COALESCE(p.fecha_hasta, '9999-12-31')
          AND DATE(?) >= p.fecha_desde
      `).all(empIdNum, desde, hasta);
      // Aproximación: cada slot semanal cuenta 1 vez por semana del periodo.
      // Para el cálculo fino habrá que expandir días concretos; por ahora
      // multiplicamos por (semanas en el rango).
      if (slotsRows.length) {
        const d1 = new Date(desde + 'T12:00:00');
        const d2 = new Date(hasta + 'T12:00:00');
        const semanas = Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24 * 7)));
        esperados = slotsRows.length * semanas;
        cumplimiento = +Math.min(1, enviados / esperados).toFixed(3);
      }
    } catch (e) { /* sin horario, esperados=null */ }

    // ── 3. Tardanza ──────────────────────────────────────────────────────
    let totalMinTardanza = 0;
    try {
      const rows = db.prepare(`
        SELECT minutos_tardanza FROM asistencias
        WHERE emp_id = ? AND fecha >= ? AND fecha <= ?
      `).all(empId, desde, hasta);
      rows.forEach(r => { totalMinTardanza += (r.minutos_tardanza || 0); });
    } catch (e) {}
    const notaTardanza = Math.max(0, 20 - Math.floor(totalMinTardanza / 15));

    // ── 4. Descuento por incidencias ─────────────────────────────────────
    let descIncidencias = 0;
    try {
      const r = db.prepare(`
        SELECT COUNT(*) as n FROM incidencias
        WHERE emp_id = ? AND fecha >= ? AND fecha <= ?
      `).get(empId, desde, hasta);
      descIncidencias = r ? r.n : 0;
    } catch (e) {}

    // ── 5. Bonus de ventas (si existe la tabla) ──────────────────────────
    let bonusVentas = 0;
    try {
      const mes = desde.slice(0, 7);
      const r = db.prepare("SELECT * FROM ventas WHERE emp_id=? AND mes=?").get(empId, mes);
      if (r) {
        const meta = parseFloat(r.meta_soles) || 0;
        const vendido = parseFloat(r.vendido_soles) || 0;
        if (meta > 0 && vendido >= meta) bonusVentas = +Math.min(2, ((vendido - meta) / meta) * 2).toFixed(2);
      }
    } catch (e) {}

    // ── 6. Nota de valores (peer review traducida a /20) ─────────────────
    let notaValores = null;
    try {
      const mes = desde.slice(0, 7);
      const evals = db.prepare(`
        SELECT integridad, respeto, honestidad, amabilidad, relacion, actitud
        FROM evaluaciones_valores WHERE evaluado_id=? AND mes=?
      `).all(empId, mes);
      if (evals.length) {
        const campos = ['integridad','respeto','honestidad','amabilidad','relacion','actitud'];
        const promedios = campos.map(c => avg(evals.map(e => e[c])));
        const promTotal = avg(promedios);
        if (promTotal != null) notaValores = +((promTotal / 5) * 20).toFixed(1);
      }
    } catch (e) {}

    // ── 7. Pesos vigentes (informativo) ──────────────────────────────────
    const pesos = getPesos(db);

    res.json({
      empleado: { id: emp.id, nombre: emp.nombre, sede: emp.sede, rol: emp.rol },
      periodo: { desde, hasta },
      reportes: {
        enviados,
        esperados,
        cumplimiento,
        ids: repIds
      },
      notas: {
        operaciones: avg(notasOps),
        software:    avg(notasSw),
        limpieza:    avg(notasLimp),
        valores:     notaValores,
        tardanza:    notaTardanza,
        descuento_incidencias: descIncidencias,
        bonus_ventas: bonusVentas
      },
      detalle_actividades: {
        operaciones: notasOps.length,
        software:    notasSw.length,
        limpieza:    notasLimp.length
      },
      tardanza: { total_minutos: totalMinTardanza },
      pesos
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
