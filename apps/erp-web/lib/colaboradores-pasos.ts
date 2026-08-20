// Los pasos que separan a una persona de su pago. Módulo PURO a propósito.
//
// POR QUÉ ESTÁ SEPARADO DEL REPO. La lista y el hilo son componentes de cliente, y el repo importa
// el cliente de Supabase del servidor. Si esta lógica viviera ahí, importarla desde el navegador
// arrastraría medio backend al bundle. Acá no hay ni una consulta: entra el estado ya calculado y
// sale la lista de pasos.

export type EstadoPeriodo = {
  empleadoId: string;
  reportes: number;
  /** Días con al menos una fila de asistencia declarada (no 'sin_dato'). */
  diasDeclarados: number;
  /** Días con fila pero sin declarar. Cada uno corta la liquidación del período entero. */
  diasSinDato: number;
  /** Días con hora de entrada y sin hora de salida: el hueco típico del huellero. */
  diasSinSalida: number;
  incidencias: number;
  puntosPipeline: number;
  /** Nota de la evaluación que cubre el período, si ya se hizo. */
  nota: number | null;
  /** Hay un pago no anulado cuyo ciclo cae dentro del período. */
  pagado: boolean;
  /** Hay un contrato que cubre el período. */
  contrato: boolean;
};

export const estadoVacio = (empleadoId: string): EstadoPeriodo => ({
  empleadoId,
  reportes: 0,
  diasDeclarados: 0,
  diasSinDato: 0,
  diasSinSalida: 0,
  incidencias: 0,
  puntosPipeline: 0,
  nota: null,
  pagado: false,
  contrato: false,
});

export type ClavePaso = 'contrato' | 'salidas' | 'asistencia' | 'evaluacion' | 'pago';

export type Pendiente = {
  clave: ClavePaso;
  titulo: string;
  detalle: string;
  /** `true` cuando ese paso ya está resuelto. */
  listo: boolean;
  /** Sección del módulo que lo resuelve. */
  seccion: string;
};

/**
 * Los cinco pasos, en el orden en que hay que resolverlos.
 *
 * ESTO NO INVENTA NINGUNA REGLA (no-negociable 5). Cada paso refleja una condición que el motor de
 * sueldos ya impone hoy y que hasta ahora sólo se descubría cuando la liquidación se negaba a
 * correr: `sueldo_entrada` corta el período entero nombrando cada fecha sin declarar
 * (0073_sueldos_rpc.sql:128-145), y un día con entrada y sin salida queda en 'sin_dato', que es la
 * misma condición vista desde el otro lado. Lo único que cambia es CUÁNDO se entera una persona:
 * antes de sentarse a liquidar, en vez de cuando el motor se planta.
 *
 * El orden tampoco es estético. Es el orden en que se destraban: sin contrato no hay con qué
 * liquidar; sin las horas de salida los días quedan sin declarar; sin días declarados no hay
 * liquidación; recién ahí la evaluación y el pago.
 */
export function pendientesDelPeriodo(e: EstadoPeriodo): Pendiente[] {
  const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
  return [
    {
      clave: 'contrato',
      titulo: 'Contrato vigente',
      detalle: e.contrato ? 'Cubre el período' : 'Sin contrato no hay con qué liquidar',
      listo: e.contrato,
      seccion: 'contrato',
    },
    {
      clave: 'salidas',
      titulo: 'Horas de salida',
      detalle:
        e.diasSinSalida === 0
          ? 'Ningún día quedó a medias'
          : `${e.diasSinSalida} ${plural(e.diasSinSalida, 'día espera', 'días esperan')} su hora de salida`,
      listo: e.diasSinSalida === 0,
      seccion: 'asistencias',
    },
    {
      clave: 'asistencia',
      titulo: 'Días declarados',
      detalle:
        e.diasSinDato === 0
          ? `${e.diasDeclarados} ${plural(e.diasDeclarados, 'día', 'días')}`
          : `${e.diasSinDato} sin declarar cortan el período`,
      listo: e.diasSinDato === 0 && e.diasDeclarados > 0,
      seccion: 'asistencias',
    },
    {
      clave: 'evaluacion',
      titulo: 'Evaluación',
      detalle: e.nota != null ? `${e.nota.toFixed(2)} / 20` : 'Todavía sin evaluar',
      listo: e.nota != null,
      seccion: 'evaluacion',
    },
    {
      clave: 'pago',
      titulo: 'Pago',
      detalle: e.pagado ? 'Registrado' : 'Falta registrarlo',
      listo: e.pagado,
      seccion: 'pago',
    },
  ];
}

/** El primer paso sin resolver, que es el único accionable. `null` si está todo listo. */
export function corteDelHilo(pasos: Pendiente[]): Pendiente | null {
  return pasos.find((p) => !p.listo) ?? null;
}
