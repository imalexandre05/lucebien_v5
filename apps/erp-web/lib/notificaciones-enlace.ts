// A qué pantalla lleva cada notificación: la pantalla donde se RESUELVE el pendiente, no una
// donde sólo se lo vuelve a leer (tablero#5).
//
// FUNCIÓN PURA, a propósito: la usan la página /notificaciones y la campana del topbar, y las dos
// tienen que llevar al mismo lugar. Con un `switch` copiado en cada una, el día que se agregue una
// regla nueva una de las dos se va a quedar sin enlace (ya pasó: el `refHref` de la página sólo
// conocía los 4 `ref_tipo` del módulo comercial y las 6 reglas de la 0107 salían sin enlace).
//
// DE DÓNDE SALE CADA DATO. Todo lo que se usa acá lo escribe la RPC tal cual, verificado contra
// la última definición de cada función (no contra documentos — no-negociable 7):
//   · generar_alertas() — 0109_notificaciones_motor_unico.sql (las 11 reglas).
//   · reportes_auto_evaluar_vencidos() — 0064_reportes_auto_evaluar.sql (reporte_auto_evaluado).
// Si una RPC cambia su `ref_tipo`/`ref_id`/`dedup_key`, este archivo y su test cambian con ella.
//
// SÓLO SE ENLAZA A LO QUE EL QUE MIRA PUEDE ABRIR. Las pantallas de asistencia, liquidaciones,
// datos de la persona y catálogo son del administrador (gate hardcodeado en cada page.tsx). A la
// persona que recibe su copia de `dia_con_hora_estimada`/`dia_sin_marca` (fila ':persona') no se
// le ofrece un enlace que termina en un candado: hoy no existe una pantalla propia donde pueda
// ver o corregir su asistencia — la corrección la hace el administrador.

export type NotificacionEnlazable = {
  tipo: string;
  refTipo: string | null;
  refId: string | null;
  dedupKey: string | null;
  mensaje: string;
  /**
   * Datos que la notificación no trae pero su `ref_id` permite buscar. Hoy sólo para
   * `ref_tipo = 'liquidacion'`: la persona y el contrato de esa liquidación (los completa
   * listarNotificaciones() con una lectura bajo RLS). Ausente si no se pudo leer.
   */
  contexto?: { empleadoId: string; acuerdoId: string } | null;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Período `desde`–`hasta` de una alerta `dia_con_hora_estimada`.
 *
 * `desde` sale del dedup_key (`dia_con_hora_estimada:<empleado>:<YYYY-MM-DD>:<admin|persona>`),
 * que es la parte estable: es la identidad de la fila. `hasta` no está en el dedup_key, sólo en el
 * mensaje ("del período YYYY-MM-DD a YYYY-MM-DD"); si el texto cambiara y no se encontrara, se usa
 * `desde` como un período de un día, que alcanza para que la pantalla elija el contrato correcto.
 */
export function periodoHoraEstimada(n: Pick<NotificacionEnlazable, 'dedupKey' | 'mensaje'>): { desde: string; hasta: string } | null {
  const partes = (n.dedupKey ?? '').split(':');
  const desde = partes[2];
  if (partes[0] !== 'dia_con_hora_estimada' || !desde || !FECHA.test(desde)) return null;
  const m = /per[ií]odo (\d{4}-\d{2}-\d{2}) a (\d{4}-\d{2}-\d{2})/.exec(n.mensaje);
  const hasta = m && m[1] === desde ? m[2] : desde;
  return { desde, hasta };
}

/** Enlace a la pantalla donde se resuelve la notificación, o null si no hay una que sirva. */
export function enlaceNotificacion(n: NotificacionEnlazable, esAdmin: boolean): string | null {
  const id = n.refId ? encodeURIComponent(n.refId) : null;

  switch (n.tipo) {
    // ── Control interno (0107/0109) ────────────────────────────────────────────────────────────
    case 'declaracion_incompleta': {
      // ref = liquidación 'borrador'. Se resuelve declarando los días que faltan sobre el
      // contrato de esa liquidación, en la ficha de la persona.
      if (!esAdmin) return null;
      const c = n.contexto;
      if (c) {
        return `/personal/${encodeURIComponent(c.empleadoId)}/asistencias?acuerdo=${encodeURIComponent(c.acuerdoId)}`;
      }
      // Sin poder leer la liquidación: la pantalla general de declarar asistencia.
      return '/sueldos/asistencia';
    }
    case 'periodo_liquidable':
      // ref = contrato vencido sin liquidación. Se resuelve creando la liquidación de ese contrato.
      if (!esAdmin) return null;
      return id ? `/sueldos/liquidaciones?acuerdo=${id}` : '/sueldos/liquidaciones';
    case 'dia_con_hora_estimada': {
      // ref = persona. Se revisan sus días con hora puesta por el sistema, en el período del aviso.
      if (!esAdmin || !id) return null;
      const p = periodoHoraEstimada(n);
      return p ? `/personal/${id}/asistencias?desde=${p.desde}&hasta=${p.hasta}` : `/personal/${id}/asistencias`;
    }
    case 'dia_sin_marca':
      // ref = persona. Los días son de la última semana: el período por defecto (mes en curso) los
      // muestra salvo en los primeros días del mes — ver la nota de mejora en el PR de tablero#5.
      if (!esAdmin || !id) return null;
      return `/personal/${id}/asistencias`;
    case 'extra_sin_valor':
      // ref = quien registró el extra (puede ser null). Se resuelve poniendo el peso en el catálogo.
      return esAdmin ? '/configuracion/actividades' : null;
    case 'falta_fecha_ingreso':
      if (!esAdmin || !id) return null;
      return `/personal/${id}/datos`;

    // ── Reportes ───────────────────────────────────────────────────────────────────────────────
    case 'reporte_sin_evaluar':
    case 'reporte_auto_evaluado':
      return id ? `/reportes/${id}` : null;
  }

  // Reglas del módulo comercial (apagadas desde la 0101, pueden quedar avisos viejos): el aviso se
  // lee pero no navega — POS, materiales y caja salieron de la navegación (18-oct-2026, decisión
  // del dueño n.º 9). Cualquier tipo futuro sin caso propio: por el origen, como antes.
  if (!id) return null;
  switch (n.refTipo) {
    case 'reporte':
      return `/reportes/${id}`;
    default:
      return null;
  }
}
