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
// Encargado_tienda y encargado_almacen son supervisores LIMITADOS:
// solo ven datos de SUS sedes (las que tiene asignadas en empleado_tiendas
// o las que el JWT trae en .tiendas/.sede). Admin/dueño ven todo.
function sedesPermitidas(u) {
  if (!u) return [];
  if (esAdmin(u)) return null; // null = sin filtro (ve todas)
  if (Array.isArray(u.tiendas) && u.tiendas.length) return u.tiendas;
  if (u.sede) return [u.sede];
  return [];
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
    // Encargados solo pueden ver SU sede; admin/dueño pueden filtrar por la que quieran
    // (o ninguna). Si un encargado intenta ?sede=OTRA, se ignora.
    const permitidas = sedesPermitidas(req.user);
    let sedeFiltro = req.query.sede || '';
    if (permitidas !== null) {
      // Encargado: forzar a una de sus sedes asignadas
      if (sedeFiltro && permitidas.indexOf(sedeFiltro) < 0) sedeFiltro = permitidas[0] || '';
      if (!sedeFiltro) sedeFiltro = permitidas[0] || '';
    }
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

// ═══════════════════════════════════════════════════════════════════════
// GET /api/dashboard/empleado?emp_id=...&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//   ó
// GET /api/dashboard/empleado?nombre=...&desde=...&hasta=...
//
// Dashboard PERSONAL del trabajador (vive en page-evaluacion-mensual).
// Devuelve un objeto con:
//   empleado            — datos del colaborador (cod, nombre, rol, sedes)
//   periodo             — desde/hasta resueltos (default: mes actual)
//   fechas              — lista de días del período (para el header Christie)
//   kpis                — reportes, evaluados, puntaje promedio, delta vs
//                         mes anterior, sede principal
//   cumplimiento_categoria — cumplimiento por categoría (IND/PO/SO/EXT)
//                            ponderado por peso × días con reporte
//   christie            — matriz [actividad x día] con celdas ok/no/na
//                         + totales por fila (realizadas/no_realizadas/%)
//   heatmap             — puntaje promedio por día del período
//   evolucion           — últimos 6 meses con puntaje + nº reportes
//   incidencias         — incidencias del trabajador en el período
//   evaluaciones_mes    — historial de evaluaciones mensuales (últimas 6)
// ═══════════════════════════════════════════════════════════════════════

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
function rangeMesActual() {
  const d = new Date();
  const f = new Date(d.getFullYear(), d.getMonth(), 1);
  const l = new Date(d.getFullYear(), d.getMonth()+1, 0);
  return { desde: fmtDate(f), hasta: fmtDate(l) };
}
function shiftMes(rng, deltaMeses) {
  const d0 = new Date(rng.desde + 'T12:00:00');
  const d1 = new Date(rng.hasta + 'T12:00:00');
  d0.setMonth(d0.getMonth() + deltaMeses);
  d1.setMonth(d1.getMonth() + deltaMeses);
  return { desde: fmtDate(d0), hasta: fmtDate(d1) };
}
function listarFechas(desde, hasta) {
  const out = [];
  const d0 = new Date(desde + 'T12:00:00');
  const d1 = new Date(hasta + 'T12:00:00');
  for (let d = new Date(d0); d <= d1; d.setDate(d.getDate()+1)) out.push(fmtDate(new Date(d)));
  return out;
}
function catLabel(c) {
  return ({ IND: 'Indispensables', PO: 'Primer Orden', SO: 'Segundo Orden', EXT: 'Extras' })[c] || c;
}

router.get('/empleado', verifyToken, (req, res) => {
  try {
    if (!esSupervisor(req.user)) return res.status(403).json({ error: 'Solo supervisores' });
    const db = getDB();

    // ── Resolver empleado: el frontend manda emp_id que es la PK 'id' (E02, E01...)
    //    Fallbacks: por cod (códigos numéricos), por nombre exacto.
    let nombre = req.query.nombre || '';
    const empId = req.query.emp_id || '';
    let emp = null;
    try {
      if (empId) emp = db.prepare('SELECT * FROM empleados WHERE id=? LIMIT 1').get(empId);
      if (!emp && empId) emp = db.prepare('SELECT * FROM empleados WHERE cod=? LIMIT 1').get(empId);
      if (!emp && nombre) emp = db.prepare('SELECT * FROM empleados WHERE nombre=? LIMIT 1').get(nombre);
    } catch (e) {}
    if (emp && !nombre) nombre = emp.nombre;
    if (!nombre) return res.status(404).json({ error: 'Empleado no encontrado' });

    // ── Sedes vienen de empleado_tiendas (relación N:M, columna 'tienda')
    let sedesEmp = [];
    if (emp && emp.id) {
      try {
        sedesEmp = db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?').all(emp.id).map(r => r.tienda);
      } catch (e) {}
    }

    // ── Filtro de visibilidad: encargado solo ve a quienes comparten al menos
    //    una sede con él. Admin/dueño ve a todos.
    const permitidas = sedesPermitidas(req.user);
    if (permitidas !== null) {
      const overlap = sedesEmp.some(s => permitidas.indexOf(s) >= 0);
      if (!overlap) return res.status(403).json({ error: 'Sin acceso a este colaborador (no comparte sede)' });
    }

    // ── Resolver período
    const rng = (req.query.desde && req.query.hasta)
      ? { desde: req.query.desde, hasta: req.query.hasta }
      : rangeMesActual();
    const rngPrev = shiftMes(rng, -1);

    // ── Reportes en los que participó el trabajador en el período
    const reps = safeAll(db,
      'SELECT r.* FROM reportes r ' +
      'WHERE r.id IN (SELECT reporte_id FROM reporte_trabajadores WHERE nombre=?) ' +
      'AND r.fecha BETWEEN ? AND ? ORDER BY r.fecha',
      [nombre, rng.desde, rng.hasta]
    );
    const repsPrev = safeAll(db,
      'SELECT r.puntaje FROM reportes r ' +
      'WHERE r.id IN (SELECT reporte_id FROM reporte_trabajadores WHERE nombre=?) ' +
      'AND r.fecha BETWEEN ? AND ?',
      [nombre, rngPrev.desde, rngPrev.hasta]
    );

    const puntajeAvg = reps.length
      ? Math.round(reps.reduce((s, r) => s + (r.puntaje||0), 0) / reps.length) : 0;
    const puntajePrev = repsPrev.length
      ? Math.round(repsPrev.reduce((s, r) => s + (r.puntaje||0), 0) / repsPrev.length) : 0;

    const kpis = {
      reportes: reps.length,
      reportes_prev: repsPrev.length,
      evaluados: reps.filter(r => r.evaluado).length,
      puntaje_avg: puntajeAvg,
      puntaje_prev: puntajePrev,
      delta: puntajeAvg - puntajePrev,
      sede_principal: sedesEmp[0] || '—'
    };

    // ── Catálogo de actividades para sus sedes (dedup por cod)
    let actsConfig = [];
    if (sedesEmp.length) {
      const ph = sedesEmp.map(() => '?').join(',');
      actsConfig = safeAll(db,
        "SELECT * FROM actividades_config WHERE activa=1 " +
        "AND (sede IN (" + ph + ") OR sede='GLOBAL') " +
        "AND (tipo_act='obligatoria' OR tipo_act IS NULL OR tipo_act='') " +
        "ORDER BY categoria, orden, id",
        sedesEmp
      );
    }
    const byCod = {};
    actsConfig.forEach(a => { if (!byCod[a.cod]) byCod[a.cod] = a; });
    const acts = Object.keys(byCod).map(k => byCod[k]);

    // ── Realizadas (cod, fecha)
    const realizadasMap = {};
    if (reps.length) {
      const ids = reps.map(r => r.id);
      const ph = ids.map(() => '?').join(',');
      safeAll(db,
        'SELECT ra.cod, ra.realizada, r.fecha FROM reporte_actividades ra ' +
        'JOIN reportes r ON r.id=ra.reporte_id WHERE ra.reporte_id IN (' + ph + ')',
        ids
      ).forEach(r => {
        if (!realizadasMap[r.cod]) realizadasMap[r.cod] = {};
        if (r.realizada) realizadasMap[r.cod][r.fecha] = 1;
      });
    }

    const fechas = listarFechas(rng.desde, rng.hasta);
    const fechasConRep = {};
    reps.forEach(r => { fechasConRep[r.fecha] = (fechasConRep[r.fecha]||0) + 1; });

    // ── Matriz Christie
    const christie = acts.map(a => {
      const celdas = fechas.map(f => {
        if (!fechasConRep[f]) return { fecha: f, status: 'na' };
        if (realizadasMap[a.cod] && realizadasMap[a.cod][f]) return { fecha: f, status: 'ok' };
        return { fecha: f, status: 'no' };
      });
      const diasConRep = celdas.filter(c => c.status !== 'na').length;
      const realizadas = celdas.filter(c => c.status === 'ok').length;
      const pct = diasConRep ? Math.round(realizadas * 100 / diasConRep) : 0;
      return {
        cod: a.cod,
        nombre: a.nombre,
        categoria: (a.categoria || 'PO').toUpperCase(),
        peso: a.peso || 0,
        celdas: celdas,
        realizadas: realizadas,
        no_realizadas: diasConRep - realizadas,
        dias_con_reporte: diasConRep,
        pct: pct
      };
    });

    // ── Resumen ponderado por categoría
    const resumenCat = {};
    christie.forEach(row => {
      const c = row.categoria;
      if (!resumenCat[c]) resumenCat[c] = { realizadas:0, esperadas:0, peso_realizado:0, peso_esperado:0 };
      resumenCat[c].realizadas += row.realizadas;
      resumenCat[c].esperadas  += row.dias_con_reporte;
      resumenCat[c].peso_realizado += row.realizadas * row.peso;
      resumenCat[c].peso_esperado  += row.dias_con_reporte * row.peso;
    });
    const cumpCat = Object.keys(resumenCat).map(c => {
      const x = resumenCat[c];
      return {
        cat: c,
        label: catLabel(c),
        realizadas: x.realizadas,
        esperadas: x.esperadas,
        peso_realizado: x.peso_realizado,
        peso_esperado: x.peso_esperado,
        pct: x.peso_esperado ? Math.round(x.peso_realizado * 100 / x.peso_esperado) : 0
      };
    });

    // ── Heatmap diario (puntaje promedio por día)
    const heatmap = fechas.map(f => {
      const rs = reps.filter(r => r.fecha === f);
      if (!rs.length) return { fecha: f, puntaje: null };
      const p = rs.reduce((s, r) => s + (r.puntaje||0), 0) / rs.length;
      return { fecha: f, puntaje: Math.round(p) };
    });

    // ── Evolución últimos 6 meses
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const evolucion = [];
    for (let m = 5; m >= 0; m--) {
      const d = new Date(rng.desde + 'T12:00:00');
      d.setMonth(d.getMonth() - m);
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const last = new Date(d.getFullYear(), d.getMonth()+1, 0);
      let row = null;
      try {
        row = db.prepare(
          'SELECT AVG(r.puntaje) AS p, COUNT(*) AS c FROM reportes r ' +
          'WHERE r.id IN (SELECT reporte_id FROM reporte_trabajadores WHERE nombre=?) ' +
          'AND r.fecha BETWEEN ? AND ?'
        ).get(nombre, fmtDate(first), fmtDate(last));
      } catch (e) {}
      evolucion.push({
        label: meses[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2),
        puntaje: row && row.p ? Math.round(row.p) : 0,
        reportes: row ? (row.c || 0) : 0
      });
    }

    // ── Incidencias del trabajador
    const incidencias = safeAll(db,
      'SELECT * FROM incidencias WHERE responsable=? AND fecha BETWEEN ? AND ? ORDER BY fecha DESC LIMIT 10',
      [nombre, rng.desde, rng.hasta]
    );

    // ── Evaluaciones mensuales históricas (emp_id en esa tabla = empleados.id)
    let evalsMes = [];
    if (emp && emp.id) {
      evalsMes = safeAll(db,
        'SELECT * FROM evaluaciones_mensuales WHERE emp_id=? ORDER BY mes DESC LIMIT 6',
        [emp.id]
      );
    }

    res.json({
      empleado: emp
        ? { id: emp.id, cod: emp.cod, nombre: emp.nombre, rol: emp.rol || '—', sedes: sedesEmp }
        : { nombre: nombre, sedes: sedesEmp },
      periodo: rng,
      fechas: fechas,
      kpis: kpis,
      cumplimiento_categoria: cumpCat,
      christie: christie,
      heatmap: heatmap,
      evolucion: evolucion,
      incidencias: incidencias,
      evaluaciones_mes: evalsMes
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
