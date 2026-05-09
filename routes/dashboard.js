// ═══════════════════════════════════════════════════════════════════════
// LUCEBIEN · routes/dashboard.js
// Endpoint único que alimenta el Dashboard Administrativo.
// Diseñado para que cuando los datos lleguen (asistencias, evaluaciones
// cerradas, fechas de ingreso, etc.) la UI se ilumine sola sin código nuevo.
//
// GET /api/dashboard/admin?sede=
//   Devuelve un objeto con:
//     kpis                — métricas grandes para el hero
//     alertas_criticas    — top N cosas que requieren atención HOY
//     pipeline_estado     — conteo por etapa del kanban
//     proximas_evaluaciones — colaboradores con ciclo cerrando en ≤7 días
//     salud_sistema       — métricas de configuración faltante (admin)
//     tendencia_7d        — series para sparklines (reportes, incidencias)
// ═══════════════════════════════════════════════════════════════════════

const router = require('express').Router();
const { getDB, hoyLocal } = require('../database/db');
const { verifyToken } = require('../middleware/auth');

function esSupervisor(u) {
  if (!u) return false;
  const r = (u.rol || '').toLowerCase();
  return r === 'admin' || r === 'dueno' || r === 'dueño' || r === 'encargado_almacen' || r === 'encargado_tienda';
}
function esAdmin(u) {
  const r = (u && u.rol || '').toLowerCase();
  return r === 'admin' || r === 'dueno' || r === 'dueño';
}
function safeGet(db, sql, params) {
  try { const r = db.prepare(sql).get(...(params||[])); return r ? (r.n||0) : 0; }
  catch (e) { return 0; }
}
function safeAll(db, sql, params) {
  try { return db.prepare(sql).all(...(params||[])); }
  catch (e) { return []; }
}
function fechaMenosDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0,10);
}
function fechaMasDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}

router.get('/admin', verifyToken, (req, res) => {
  try {
    if (!esSupervisor(req.user)) return res.status(403).json({ error: 'Solo supervisores' });
    const db = getDB();
    const sedeFiltro = req.query.sede || '';
    const hoy = hoyLocal();
    const mes = hoy.slice(0, 7);
    const desde7 = fechaMenosDias(6);
    const desde30 = fechaMenosDias(29);
    const sedeWhere = sedeFiltro ? ' AND sede=?' : '';
    const sedeParams = sedeFiltro ? [sedeFiltro] : [];

    // ───── KPIs ─────
    const kpis = {
      prendas_en_proceso: safeGet(db,
        "SELECT COUNT(*) as n FROM prendas WHERE etapa!='enviado' AND COALESCE(dividida,0)=0" + (sedeFiltro ? " AND sede_origen=?" : ''),
        sedeFiltro ? [sedeFiltro] : []),
      prendas_listas: safeGet(db,
        "SELECT COUNT(*) as n FROM prendas WHERE etapa='listo' AND COALESCE(dividida,0)=0" + (sedeFiltro ? " AND sede_origen=?" : ''),
        sedeFiltro ? [sedeFiltro] : []),
      reportes_hoy: safeGet(db,
        "SELECT COUNT(*) as n FROM reportes WHERE fecha=?" + sedeWhere, [hoy].concat(sedeParams)),
      reportes_sin_evaluar: safeGet(db,
        "SELECT COUNT(*) as n FROM reportes WHERE COALESCE(evaluado,0)=0 AND COALESCE(no_evaluable,0)=0" + sedeWhere, sedeParams),
      incidencias_hoy: safeGet(db,
        "SELECT COUNT(*) as n FROM incidencias WHERE fecha=?" + sedeWhere, [hoy].concat(sedeParams)),
      incidencias_mes: safeGet(db,
        "SELECT COUNT(*) as n FROM incidencias WHERE fecha LIKE ?" + sedeWhere, [mes+'%'].concat(sedeParams)),
      solicitudes_pendientes: safeGet(db,
        "SELECT COUNT(*) as n FROM solicitudes WHERE estado='pendiente'" + (sedeFiltro ? " AND sede=?" : ''),
        sedeFiltro ? [sedeFiltro] : []),
      solicitudes_sin_confirmar: safeGet(db,
        "SELECT COUNT(*) as n FROM solicitudes WHERE estado='entregada'" + (sedeFiltro ? " AND sede=?" : ''),
        sedeFiltro ? [sedeFiltro] : []),
      envios_sin_validar: safeGet(db,
        "SELECT COUNT(*) as n FROM envios_prendas WHERE COALESCE(validado_tienda,0)=0" + (sedeFiltro ? " AND sede_destino=?" : ''),
        sedeFiltro ? [sedeFiltro] : []),
      prendas_observadas: safeGet(db,
        "SELECT COUNT(*) as n FROM prendas WHERE obs_calidad IS NOT NULL AND obs_calidad!='' AND etapa!='enviado'" + (sedeFiltro ? " AND sede_origen=?" : ''),
        sedeFiltro ? [sedeFiltro] : []),
      empleados_activos: safeGet(db,
        "SELECT COUNT(*) as n FROM empleados WHERE activo=1"),
      evaluaciones_mes: safeGet(db,
        "SELECT COUNT(*) as n FROM evaluaciones_mensuales WHERE mes=?", [mes])
    };

    // ───── ALERTAS CRÍTICAS (accionables) ─────
    const alertas = [];
    if (kpis.envios_sin_validar > 0) alertas.push({
      nivel: kpis.envios_sin_validar >= 3 ? 'alta' : 'media',
      titulo: kpis.envios_sin_validar + ' envío(s) llegaron a tienda y nadie confirmó recepción',
      detalle: 'Pídeles a las tiendas que entren a "Envíos Recibidos" y validen lo que llegó.',
      goto: 'pipeline-envios'
    });
    if (kpis.prendas_observadas > 0) alertas.push({
      nivel: kpis.prendas_observadas >= 5 ? 'alta' : 'media',
      titulo: kpis.prendas_observadas + ' prenda(s) regresaron al almacén con observación',
      detalle: 'La tienda las rechazó por algún defecto. Revisa qué etapa se debe rehacer.',
      goto: 'kanban-almacen'
    });
    if (kpis.solicitudes_pendientes > 0) alertas.push({
      nivel: kpis.solicitudes_pendientes >= 5 ? 'alta' : 'media',
      titulo: kpis.solicitudes_pendientes + ' solicitud(es) de tiendas esperando tu aprobación',
      detalle: 'Las tiendas pidieron prendas, accesorios o suministros y necesitan respuesta.',
      goto: 'solicitudes'
    });
    if (kpis.solicitudes_sin_confirmar > 0) alertas.push({
      nivel: 'media',
      titulo: kpis.solicitudes_sin_confirmar + ' entrega(s) en tienda sin confirmar',
      detalle: 'El almacén ya entregó pero la tienda aún no acusa recibo. Pídeselo.',
      goto: 'solicitudes'
    });
    if (kpis.reportes_sin_evaluar > 0) alertas.push({
      nivel: kpis.reportes_sin_evaluar >= 5 ? 'alta' : 'baja',
      titulo: kpis.reportes_sin_evaluar + ' reporte(s) de turno aún sin calificar',
      detalle: 'El siguiente turno debe calificar al anterior. Sin eso, la nota mensual no se cierra bien.',
      goto: 'evaluacion'
    });
    if (kpis.incidencias_hoy > 0) alertas.push({
      nivel: kpis.incidencias_hoy >= 3 ? 'alta' : 'media',
      titulo: kpis.incidencias_hoy + ' incidencia(s) reportadas hoy',
      detalle: 'Revisa si alguna requiere conversación o sanción inmediata.',
      goto: 'incidencias-admin'
    });
    // Sin reporte del turno mañana cuando ya pasaron las 11 AM
    const ahora = new Date();
    if (ahora.getHours() >= 11) {
      const sedesActivas = ['LB','ST','TR','AL'].filter(s => !sedeFiltro || s === sedeFiltro);
      sedesActivas.forEach(s => {
        const repM = safeGet(db, "SELECT COUNT(*) as n FROM reportes WHERE fecha=? AND turno='M' AND sede=?", [hoy, s]);
        if (repM === 0) alertas.push({
          nivel: 'media',
          titulo: 'Sede ' + s + ' aún no envió el reporte de Mañana',
          detalle: 'Ya cerró el turno de Mañana. Avísale al encargado para que lo envíe.',
          goto: 'reporte'
        });
      });
    }

    // Ordenar por nivel
    const ordNivel = { alta: 0, media: 1, baja: 2 };
    alertas.sort((a,b) => ordNivel[a.nivel] - ordNivel[b.nivel]);

    // ───── PIPELINE ESTADO (kanban) ─────
    const pipeline_estado = {};
    safeAll(db,
      "SELECT etapa, COUNT(*) as n FROM prendas WHERE etapa!='enviado' AND COALESCE(dividida,0)=0" +
      (sedeFiltro ? " AND sede_origen=?" : '') + " GROUP BY etapa",
      sedeFiltro ? [sedeFiltro] : []
    ).forEach(r => { pipeline_estado[r.etapa] = r.n; });

    // ───── PRÓXIMAS EVALUACIONES (≤7 días para cierre del ciclo) ─────
    const proximas_evaluaciones = [];
    try {
      const empleados = safeAll(db, "SELECT id, nombre, fecha_ingreso, sede, rol FROM empleados WHERE activo=1");
      const hoyD = new Date();
      empleados.forEach(emp => {
        if (!emp.fecha_ingreso || !/^\d{4}-\d{2}-\d{2}$/.test(emp.fecha_ingreso)) return;
        const dInicio = parseInt(emp.fecha_ingreso.slice(8,10), 10);
        // Día del próximo cierre = día anterior al próximo aniversario
        let y = hoyD.getFullYear(), m = hoyD.getMonth();
        if (hoyD.getDate() >= dInicio) { m += 1; if (m > 11) { m = 0; y += 1; } }
        const proxAniv = new Date(y, m, dInicio);
        const cierre = new Date(proxAniv); cierre.setDate(cierre.getDate() - 1);
        const diasFaltan = Math.ceil((cierre - hoyD) / (1000*60*60*24));
        if (diasFaltan >= 0 && diasFaltan <= 7) {
          proximas_evaluaciones.push({
            emp_id: emp.id, nombre: emp.nombre, sede: emp.sede, rol: emp.rol,
            cierre: cierre.toISOString().slice(0,10),
            dias_faltan: diasFaltan
          });
        }
      });
      proximas_evaluaciones.sort((a,b) => a.dias_faltan - b.dias_faltan);
    } catch(e) {}

    // ───── SALUD DEL SISTEMA (solo admin) ─────
    let salud_sistema = null;
    if (esAdmin(req.user)) {
      const totalEmp = safeGet(db, "SELECT COUNT(*) as n FROM empleados WHERE activo=1");
      const sinFechaIng = safeGet(db, "SELECT COUNT(*) as n FROM empleados WHERE activo=1 AND (fecha_ingreso IS NULL OR fecha_ingreso='')");
      const auditUlt = (function(){
        try {
          const r = db.prepare("SELECT MAX(created_at) as m FROM audit_log").get();
          return r ? r.m : null;
        } catch(e) { return null; }
      })();
      const evalsPendientesMes = totalEmp - safeGet(db, "SELECT COUNT(DISTINCT emp_id) as n FROM evaluaciones_mensuales WHERE mes=?", [mes]);
      const horarioPlanasUsadas = safeGet(db, "SELECT COUNT(*) as n FROM horarios");
      const horarioSlotsUsados = safeGet(db, "SELECT COUNT(*) as n FROM horario_slots");
      salud_sistema = {
        empleados_total: totalEmp,
        empleados_sin_fecha_ingreso: sinFechaIng,
        evaluaciones_mes_pendientes: Math.max(0, evalsPendientesMes),
        audit_log_ultima: auditUlt,
        audit_log_hoy: safeGet(db, "SELECT COUNT(*) as n FROM audit_log WHERE fecha=?", [hoy]),
        horarios_legacy: horarioPlanasUsadas,
        horario_slots: horarioSlotsUsados,
        backup_dirs: (function(){
          try {
            const fs = require('fs'); const path = require('path');
            const dir = path.join(__dirname, '..', 'database', 'backups');
            if (!fs.existsSync(dir)) return 0;
            return fs.readdirSync(dir).filter(f => f.endsWith('.db')).length;
          } catch(e) { return 0; }
        })()
      };
    }

    // ───── TENDENCIA ÚLTIMOS 7 DÍAS ─────
    const tendencia_7d = { fechas: [], reportes: [], incidencias: [], pipeline_acciones: [] };
    for (let i = 6; i >= 0; i--) {
      const f = fechaMenosDias(i);
      tendencia_7d.fechas.push(f);
      tendencia_7d.reportes.push(safeGet(db,
        "SELECT COUNT(*) as n FROM reportes WHERE fecha=?" + sedeWhere, [f].concat(sedeParams)));
      tendencia_7d.incidencias.push(safeGet(db,
        "SELECT COUNT(*) as n FROM incidencias WHERE fecha=?" + sedeWhere, [f].concat(sedeParams)));
      tendencia_7d.pipeline_acciones.push(safeGet(db,
        "SELECT COUNT(*) as n FROM pipeline_puntos WHERE fecha=?", [f]));
    }

    // ───── RESUMEN POR SEDE ─────
    const resumen_sedes = {};
    ['LB','ST','TR','AL'].forEach(s => {
      resumen_sedes[s] = {
        reportes_hoy: safeGet(db, "SELECT COUNT(*) as n FROM reportes WHERE fecha=? AND sede=?", [hoy, s]),
        incidencias_hoy: safeGet(db, "SELECT COUNT(*) as n FROM incidencias WHERE fecha=? AND sede=?", [hoy, s]),
        empleados_activos: safeGet(db, "SELECT COUNT(DISTINCT et.emp_id) as n FROM empleado_tiendas et JOIN empleados e ON e.id=et.emp_id WHERE et.tienda=? AND e.activo=1", [s])
      };
    });

    res.json({
      ts: new Date().toISOString(),
      hoy: hoy,
      mes: mes,
      sede_filtro: sedeFiltro,
      kpis,
      alertas_criticas: alertas,
      pipeline_estado,
      proximas_evaluaciones,
      salud_sistema,
      tendencia_7d,
      resumen_sedes
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
