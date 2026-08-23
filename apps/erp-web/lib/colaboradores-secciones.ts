// Las secciones del módulo de colaboradores, en un solo lugar.
//
// POR QUÉ UN CATÁLOGO Y NO ENLACES SUELTOS. La navegación del módulo, el gate de cada página y el
// hilo de pasos tienen que estar de acuerdo sobre qué secciones existen y quién puede verlas. Con
// tres listas distintas, agregar una sección significa acordarse de tres lugares — y el que se
// olvida es siempre el del permiso.
//
// EL PERMISO NO ES NUEVO. Cada sección conserva EXACTAMENTE el módulo de permisos que ya tenía su
// pantalla suelta: 'evaluaciones' para evaluar, 'pagos' para pagar, 'sueldos' para el contrato.
// Unificar la navegación no puede ampliar lo que alguien ve — sería inventar un permiso, y encima
// sobre datos de personas (no-negociable 3).

import {
  Award,
  CalendarCheck,
  FileSignature,
  HandCoins,
  HeartHandshake,
  IdCard,
  LayoutDashboard,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type ClaveSeccion =
  | 'datos'
  | 'resumen'
  | 'evaluacion'
  | 'asistencias'
  | 'pago'
  | 'movimientos'
  | 'contrato'
  | 'valores';

export type Seccion = {
  clave: ClaveSeccion;
  label: string;
  /** Segmento de ruta bajo /personal/[id]. Vacío en el resumen, que es la raíz. */
  segmento: string;
  icon: LucideIcon;
  /** Módulo de permisos que ya gobernaba la pantalla original. */
  modulo: string;
  /** Qué se hace acá, en una línea. Se muestra como título de la sección. */
  descripcion: string;
  /**
   * true si la PANTALLA de esta sección hardcodea `rol === 'admin' || rol === 'dueno'` por
   * dentro, además de lo que diga la matriz (ver cada page.tsx bajo app/personal/[id]/). Sin
   * esto, un rol no-admin al que el administrador le tildó 'ver' en el módulo de la sección
   * (p.ej. 'sueldos' o 'pagos', configurables en /configuracion/permisos) ve la pestaña en la
   * navegación y adentro choca con un candado fijo — la pestaña queda como un callejón sin
   * salida (ROTURA 3, hotfix R1.1). Con esto, accesoColaboradores() ya no la ofrece; el gate
   * hardcodeado de la pantalla se queda igual, como segunda defensa.
   */
  soloAdmin?: boolean;
};

// EL ORDEN DEL ARRAY ES EL ORDEN DE LAS PESTAÑAS (nav.tsx recorre SECCIONES tal cual). Resumen va
// primero porque ES el landing: el bare /personal/{id} resuelve ahí (segmento ''), así que primero
// visualmente tiene que ser primero de verdad — antes Datos ocupaba el índice 0 y Resumen el 1, y
// se aterrizaba en la SEGUNDA pestaña (fricción 4+5, hotfix R1.1). De ahí en más, el orden del
// flujo real aprobado en la spec: Datos → Contrato → Asistencias → Movimientos → Evaluación → Pago
// → Valores 360° (docs/superpowers/specs/sueldos/2026-08-23-personal-fusion-design.md §2.3).
export const SECCIONES: Seccion[] = [
  {
    clave: 'resumen',
    label: 'Resumen',
    segmento: '',
    icon: LayoutDashboard,
    modulo: 'evaluaciones',
    descripcion: 'Qué pasó en el período y qué falta para cerrarlo',
  },
  {
    clave: 'datos',
    label: 'Datos',
    segmento: 'datos',
    icon: IdCard,
    // 'empleados', no 'evaluaciones' ni 'sueldos': es el mismo permiso que ya tenía /empleados
    // (hoy sin fila propia en permisos_modulos — puede() sólo deja pasar a admin/dueño por
    // mecanismo, igual que el gate hardcodeado que tenía la pantalla suelta).
    modulo: 'empleados',
    descripcion: 'Identidad, rol, sede, contacto y acceso de la persona',
    soloAdmin: true,
  },
  {
    clave: 'contrato',
    label: 'Contrato',
    segmento: 'contrato',
    icon: FileSignature,
    modulo: 'sueldos',
    descripcion: 'Lo pactado: modalidad, sueldo y horario',
    soloAdmin: true,
  },
  {
    clave: 'asistencias',
    label: 'Asistencias',
    segmento: 'asistencias',
    icon: CalendarCheck,
    modulo: 'sueldos',
    descripcion: 'Declarar qué pasó cada día del período',
    soloAdmin: true,
  },
  {
    clave: 'movimientos',
    label: 'Adelantos',
    segmento: 'movimientos',
    icon: HandCoins,
    modulo: 'sueldos',
    descripcion: 'Adelantos, descuentos y ventas atribuidas',
    soloAdmin: true,
  },
  {
    clave: 'evaluacion',
    label: 'Evaluación',
    segmento: 'evaluacion',
    icon: Award,
    modulo: 'evaluaciones',
    descripcion: 'La nota del período sobre 20 y su desglose',
  },
  {
    clave: 'pago',
    label: 'Pago',
    segmento: 'pago',
    icon: Wallet,
    modulo: 'pagos',
    descripcion: 'La liquidación del período y su registro',
    soloAdmin: true,
  },
  {
    clave: 'valores',
    label: 'Valores 360°',
    segmento: 'valores',
    icon: HeartHandshake,
    // NO es el permiso 'valores'. Ese está sembrado para los 7 roles porque /valores es el peer
    // review que llena TODO el equipo. Mirar el puntaje que recibió OTRA persona es una lectura
    // administrativa, tan sensible como su nota, y el aislamiento 2 dice que nadie ve la nota de
    // otro. Por eso va con 'evaluaciones', que es el permiso del administrador.
    modulo: 'evaluaciones',
    descripcion: 'Cómo lo puntuó el equipo este mes',
  },
];

/** La ruta de una sección, con el período pegado para que no se pierda al navegar. */
export function rutaSeccion(empleadoId: string, seccion: ClaveSeccion | string, query: string): string {
  const s = SECCIONES.find((x) => x.clave === seccion);
  const segmento = s?.segmento ?? String(seccion);
  const base = `/personal/${empleadoId}${segmento ? `/${segmento}` : ''}`;
  return query ? `${base}?${query}` : base;
}
