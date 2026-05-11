// ═══════════════════════════════════════════════════════════════════════
// LUCEBIEN · routes/notificaciones.js
// Conteos para la campana del header.
//
// GET /api/notificaciones/pendientes
//   Devuelve { mis: {...}, sistema: {...} | null, total_mis, total_sistema }
//   - "mis"     siempre se calcula (lo accionable del usuario actual).
//   - "sistema" solo si el usuario es supervisor (admin / dueño /
//                encargado_*); para operarios viene null.
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
function safeCount(db, sql, params) {
  try {
    const r = db.prepare(sql).get(...(params || []));
    return r ? (r.n || 0) : 0;
  } catch (e) { return 0; }
}

router.get('/pendientes', verifyToken, (req, res) => {
  try {
    const db = getDB();
    const u = req.user || {};
    const sede = u.sede || '';
    const empId = u.id || '';
    const empNombre = u.nombre || '';
    const hoy = hoyLocal();
    const mes = hoy.slice(0, 7);

    // ───── MIS PENDIENTES (lo accionable del usuario) ─────
    const mis = {};

    // 1. Solicitudes ENTREGADAS a mi sede esperando que YO o mi equipo confirmen
    if (sede) {
      mis.solicitudes_por_confirmar = safeCount(db,
        "SELECT COUNT(*) as n FROM solicitudes WHERE estado='entregada' AND sede=?", [sede]);
    } else {
      mis.solicitudes_por_confirmar = 0;
    }

    // 2. Prendas observadas devueltas a mi sede (rebote desde almacén)
    if (sede) {
      mis.prendas_observadas = safeCount(db,
        "SELECT COUNT(*) as n FROM prendas WHERE sede_origen=? AND obs_calidad IS NOT NULL AND obs_calidad!='' AND etapa!='enviado'",
        [sede]);
    } else {
      mis.prendas_observadas = 0;
    }

    // 3. Envíos a mi tienda sin validar (vista de tienda)
    if (sede && sede !== 'AL') {
      mis.envios_sin_validar = safeCount(db,
        "SELECT COUNT(*) as n FROM envios_prendas WHERE sede_destino=? AND COALESCE(validado_tienda,0)=0",
        [sede]);
      mis.envios_acc_sin_validar = safeCount(db,
        "SELECT COUNT(*) as n FROM envios_accesorios WHERE sede_destino=? AND COALESCE(validado_tienda,0)=0",
        [sede]);
    } else {
      mis.envios_sin_validar = 0;
      mis.envios_acc_sin_validar = 0;
    }

    // 4. Compañeros que aún tengo que evaluar en Valores 360 este mes
    try {
      // Habilitado?
      const habRow = db.prepare("SELECT valor FROM config WHERE clave='eval_valores_habilitado'").get();
      const habilitado = habRow && habRow.valor === '1';
      if (habilitado && empId) {
        // Compañeros activos (mismo modelo que /api/valores/mis-pendientes)
        const todos = safeCount(db,
          "SELECT COUNT(*) as n FROM empleados WHERE activo=1 AND id!=?", [empId]);
        const yaEvalue = safeCount(db,
          "SELECT COUNT(*) as n FROM evaluaciones_valores WHERE evaluador_id=? AND mes=?", [empId, mes]);
        mis.valores_pendientes = Math.max(0, todos - yaEvalue);
      } else {
        mis.valores_pendientes = 0;
      }
    } catch (e) { mis.valores_pendientes = 0; }

    // 5. Reporte del turno actual sin enviar (verificación blanda)
    // Nota: no se sabe sin huellero si el operario está físicamente en su
    // turno; se reporta solo si hay un slot del horario para HOY al cual
    // todavía no envió reporte. Lo dejamos en 0 por ahora — se calculará
    // mejor cuando los reportes estén linkeados al slot.
    mis.reporte_turno_pendiente = 0;

    // ───── SISTEMA (solo supervisor) ─────
    let sistema = null;
    if (esSupervisor(u)) {
      sistema = {};

      // Reportes sin evaluar (todo el sistema)
      sistema.reportes_sin_evaluar = safeCount(db,
        "SELECT COUNT(*) as n FROM reportes WHERE COALESCE(evaluado,0)=0 AND COALESCE(no_evaluable,0)=0");

      // Solicitudes pendientes (PENDIENTE en cualquier sede)
      sistema.solicitudes_pendientes = safeCount(db,
        "SELECT COUNT(*) as n FROM solicitudes WHERE estado='pendiente'");

      // Solicitudes entregadas pero sin confirmación (cualquier sede)
      sistema.solicitudes_sin_confirmar = safeCount(db,
        "SELECT COUNT(*) as n FROM solicitudes WHERE estado='entregada'");

      // Envíos a tienda sin validar (cualquier sede)
      sistema.envios_sin_validar = safeCount(db,
        "SELECT COUNT(*) as n FROM envios_prendas WHERE COALESCE(validado_tienda,0)=0");

      // Incidencias del día
      sistema.incidencias_hoy = safeCount(db,
        "SELECT COUNT(*) as n FROM incidencias WHERE fecha=?", [hoy]);

      // Prendas observadas (rebotes en proceso)
      sistema.prendas_observadas = safeCount(db,
        "SELECT COUNT(*) as n FROM prendas WHERE obs_calidad IS NOT NULL AND obs_calidad!='' AND etapa!='enviado'");

      // Empleados sin fecha_ingreso (afecta cálculo de ciclo personal)
      if (esAdmin(u)) {
        sistema.empleados_sin_fecha_ingreso = safeCount(db,
          "SELECT COUNT(*) as n FROM empleados WHERE activo=1 AND (fecha_ingreso IS NULL OR fecha_ingreso='')");
      }
    }

    const total_mis = Object.values(mis).reduce((s, n) => s + (n || 0), 0);
    const total_sistema = sistema ? Object.values(sistema).reduce((s, n) => s + (n || 0), 0) : 0;

    res.json({ mis, sistema, total_mis, total_sistema, ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
