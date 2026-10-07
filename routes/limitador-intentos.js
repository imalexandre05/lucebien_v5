// ═══════════════════════════════════════════════════════
// LUCEBIEN · routes/limitador-intentos.js — límite de intentos de /api/auth/login-code
// ═══════════════════════════════════════════════════════
// H3 de docs/auditorias/2026-10-06-seguridad.md. Tocar el sistema viejo fue autorizado por el
// dueño SÓLO para esto. Spec: docs/superpowers/specs/permisos/2026-10-06-login-usuario-contrasena-design.md §9.
//
// El código de 4 dígitos es usuario y contraseña a la vez: sin límite, 10 000 peticiones dan la
// sesión de cualquiera. Dos frenos, en memoria (sin dependencias ni tablas nuevas en un sistema
// congelado; reiniciar el servidor borra los contadores):
//   · por IP:  5 fallos en 15 min → esa IP espera 15 min.
//   · global: 20 fallos en 1 h   → /login-code se pausa para todos hasta que la ventana baje
//     (como mucho 1 h). Frena a quien reparte intentos entre muchas IP. 1 h y no 24 h porque
//     /login-code se usa a diario (kanban, cambiarSede en public/js/app.js): una pausa de un día
//     por 30 pedidos de cualquiera sería peor que el riesgo que mitiga.
// Un acierto NO borra fallos: si lo hiciera, un empleado que entra bien "resetearía" el contador
// de un atacante. Los fallos simplemente vencen.
//
// Defaults fijos (no hay pantalla de configuración en el sistema viejo), anotados en
// docs/pendientes-negocio.md. La hora se recibe de afuera para poder probarlo.

const POR_IP_MAX = 5;
const POR_IP_VENTANA_MS = 15 * 60 * 1000;
const GLOBAL_MAX = 20;
const GLOBAL_VENTANA_MS = 60 * 60 * 1000;

function crearLimitador(opts) {
  const o = Object.assign(
    { porIpMax: POR_IP_MAX, porIpVentanaMs: POR_IP_VENTANA_MS, globalMax: GLOBAL_MAX, globalVentanaMs: GLOBAL_VENTANA_MS },
    opts || {},
  );
  const porIp = new Map(); // ip → [timestamps de fallos]
  let global = []; // timestamps de fallos

  function podar(ahora) {
    global = global.filter((t) => ahora - t < o.globalVentanaMs);
    for (const [ip, lista] of porIp) {
      const vivos = lista.filter((t) => ahora - t < o.porIpVentanaMs);
      if (vivos.length) porIp.set(ip, vivos);
      else porIp.delete(ip);
    }
  }

  // Minutos (redondeados hacia arriba) hasta que vence el fallo que hace falta que venza.
  function espera(lista, max, ventana, ahora) {
    const t = lista[lista.length - max];
    return Math.max(1, Math.ceil((t + ventana - ahora) / 60000));
  }

  return {
    /** ¿Se puede intentar? { ok: true } o { ok: false, minutos, alcance: 'ip' | 'global' } */
    verificar(ip, ahora) {
      podar(ahora);
      if (global.length >= o.globalMax) {
        return { ok: false, alcance: 'global', minutos: espera(global, o.globalMax, o.globalVentanaMs, ahora) };
      }
      const lista = porIp.get(ip) || [];
      if (lista.length >= o.porIpMax) {
        return { ok: false, alcance: 'ip', minutos: espera(lista, o.porIpMax, o.porIpVentanaMs, ahora) };
      }
      return { ok: true };
    },
    registrarFallo(ip, ahora) {
      podar(ahora);
      global.push(ahora);
      const lista = porIp.get(ip) || [];
      lista.push(ahora);
      porIp.set(ip, lista);
      if (global.length === o.globalMax) {
        console.warn('[login-code] ' + o.globalMax + ' fallos en la ventana global: ingreso por código pausado para todos.');
      }
    },
  };
}

module.exports = { crearLimitador };
