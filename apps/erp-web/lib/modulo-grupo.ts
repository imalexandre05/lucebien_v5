// Mapa ruta → grupo de módulo (spec §3.3, fase 5). Nueve grupos, cada uno con su acento — el
// grupo es lo que lleva color, no la ruta: así `/pipeline`, `/pipeline/metricas` y
// `/pipeline/envios` se leen como el mismo lugar.
//
// Gana el prefijo más largo que matchea (mismo criterio que `hrefActivo()` en sidebar.tsx, para
// que la sidebar y el acento de la pantalla nunca discrepen sobre en qué módulo está uno parado).
export type GrupoModulo =
  | 'inicio'
  | 'sueldos'
  | 'pipeline'
  | 'solicitudes'
  | 'inventario'
  | 'lavanderia'
  | 'personas'
  | 'desempeno'
  | 'sistema';

const RUTAS: readonly (readonly [prefijo: string, grupo: GrupoModulo])[] = [
  ['/', 'inicio'],
  ['/buscar', 'inicio'],
  ['/notificaciones', 'inicio'],
  ['/sueldos', 'sueldos'],
  ['/pagos', 'sueldos'],
  ['/pipeline', 'pipeline'],
  ['/solicitudes', 'solicitudes'],
  ['/inventario', 'inventario'],
  ['/envio-lavanderia', 'lavanderia'],
  ['/personal', 'personas'],
  ['/colaboradores', 'personas'],
  ['/empleados', 'personas'],
  ['/asistencias', 'personas'],
  ['/incidencias', 'personas'],
  // Huellero es del grupo Sistema, no Personas: es administración de hardware, no de personas —
  // aunque su ruta cuelgue de /asistencias. Va DESPUÉS en la lista pero gana por ser más largo.
  ['/asistencias/huellero', 'sistema'],
  ['/reportes', 'desempeno'],
  ['/administracion/reportes', 'desempeno'],
  ['/evaluar-reportes', 'desempeno'],
  ['/evaluaciones', 'desempeno'],
  ['/mi-desempeno', 'desempeno'],
  ['/mi-pago', 'desempeno'],
  ['/valores', 'desempeno'],
  ['/configuracion', 'sistema'],
  ['/dispositivos', 'sistema'],
  ['/dispositivo', 'sistema'],
  ['/administracion/auditoria', 'sistema'],
];

export function grupoDeRuta(path: string): GrupoModulo {
  let mejor = '';
  let grupo: GrupoModulo = 'inicio';
  for (const [prefijo, g] of RUTAS) {
    const coincide = prefijo === '/' ? path === '/' : path.startsWith(prefijo);
    if (coincide && prefijo.length > mejor.length) {
      mejor = prefijo;
      grupo = g;
    }
  }
  return grupo;
}
