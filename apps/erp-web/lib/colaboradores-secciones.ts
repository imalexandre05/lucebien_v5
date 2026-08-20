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
  LayoutDashboard,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type ClaveSeccion =
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
  /** Segmento de ruta bajo /colaboradores/[id]. Vacío en el resumen, que es la raíz. */
  segmento: string;
  icon: LucideIcon;
  /** Módulo de permisos que ya gobernaba la pantalla original. */
  modulo: string;
  /** Qué se hace acá, en una línea. Se muestra como título de la sección. */
  descripcion: string;
};

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
    clave: 'asistencias',
    label: 'Asistencias',
    segmento: 'asistencias',
    icon: CalendarCheck,
    modulo: 'sueldos',
    descripcion: 'Declarar qué pasó cada día del período',
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
  {
    clave: 'pago',
    label: 'Pago',
    segmento: 'pago',
    icon: Wallet,
    modulo: 'pagos',
    descripcion: 'La liquidación del período y su registro',
  },
  {
    clave: 'movimientos',
    label: 'Adelantos',
    segmento: 'movimientos',
    icon: HandCoins,
    modulo: 'sueldos',
    descripcion: 'Adelantos, descuentos y ventas atribuidas',
  },
  {
    clave: 'contrato',
    label: 'Contrato',
    segmento: 'contrato',
    icon: FileSignature,
    modulo: 'sueldos',
    descripcion: 'Lo pactado: modalidad, sueldo y horario',
  },
];

/** La ruta de una sección, con el período pegado para que no se pierda al navegar. */
export function rutaSeccion(empleadoId: string, seccion: ClaveSeccion | string, query: string): string {
  const s = SECCIONES.find((x) => x.clave === seccion);
  const segmento = s?.segmento ?? String(seccion);
  const base = `/colaboradores/${empleadoId}${segmento ? `/${segmento}` : ''}`;
  return query ? `${base}?${query}` : base;
}

/** Los módulos que abren el módulo entero: con ver uno alcanza para entrar a la lista. */
export const MODULOS_DEL_MODULO = Array.from(new Set(SECCIONES.map((s) => s.modulo)));
