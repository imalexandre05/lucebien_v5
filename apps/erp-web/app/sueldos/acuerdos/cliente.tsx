'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Copy, FileSignature, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  ESCALAS_SUELDO_DEFAULT,
  PARAMETROS_SUELDO_DEFAULT,
  diaSemanaISO,
  diasDelPeriodo,
  finDePeriodo,
  parametrosDeContratoNuevo,
  resumirHorario,
  sueldoSugerido,
  type ParametrosSueldo,
} from '@scilb/core';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { Aviso, Input, Label, Select, LabelGrupo } from '../../../components/ui/form';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { OpcionBotones, type Opcion } from '../../../components/ui/opcion-botones';
import { PersonaPicker } from '../../../components/ui/persona-picker';
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui/table';
import type { AcuerdoSueldo, EstadoAcuerdo, ModalidadAcuerdo } from '../../../lib/sueldos-repo';
import { DialogoConfirmar, useConfirmacion } from '../../../components/ui/confirmar';
import {
  avisoComisionBaja,
  comisionRequiereConfirmacion,
  fraccionAPorcentaje,
  leerNumero,
  porcentajeAFraccion,
  type Lectura,
} from '../../../lib/porcentaje';
import { accionActualizarAcuerdo, accionCambiarEstado, accionCrearAcuerdo, type AcuerdoForm } from './actions';

// C-2: dni/telefono/recomendaciones sólo llegan poblados cuando este tipo se usa como
// `personaFija` (app/personal/[id]/contrato/page.tsx) — el arreglo `empleados` del picker no los
// necesita, por eso son opcionales en vez de forzar a poblarlos en los dos usos.
type Emp = {
  id: string;
  nombre: string;
  rol: string;
  sedeCod: string | null;
  dni?: string | null;
  telefono?: string | null;
  recomendaciones?: string | null;
};

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_CORTO = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

const TONO_ESTADO: Record<EstadoAcuerdo, 'gray' | 'green' | 'navy'> = {
  borrador: 'gray',
  vigente: 'green',
  liquidado: 'navy',
};

const OPC_MODALIDAD: Opcion[] = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'semanal', label: 'Semanal' },
];

const OPC_META_FIJA: Opcion[] = [
  { value: 'no', label: 'Sube con las horas trabajadas' },
  { value: 'si', label: 'Fija: no cambia' },
];

const OPC_ALMUERZO: Opcion[] = [
  { value: 'no', label: 'Sólo en días de tiempo completo' },
  { value: 'si', label: 'Cualquier día trabajado' },
];

const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Los parámetros que se editan en un contrato (los demás se copian pero no se ajustan acá). El orden agrupa por tema, no por importancia.
 *
 * Se listan acá y no se generan desde `PARAMETROS_SUELDO_DEFAULT` porque cada uno necesita una
 * etiqueta que un administrador entienda y su rango.
 *
 * Los campos son de TEXTO libre (ticket tablero#1, spec 2026-10-03-comision-en-porcentaje): un
 * `type="number"` controlado con `Number()` reescribía `1.50` a `1.5` mientras se tipeaba. El texto
 * vive en su propio estado y el número se deriva de él; un texto inválido bloquea guardar.
 *
 * `min` y `max` repiten lo que cada parámetro global ya declara en `lib/config-catalogo.ts`: el
 * mismo número tiene que pedir lo mismo se escriba donde se escriba. No reemplazan a la validación
 * del servidor: `validar()` en `actions.ts` vuelve a comprobar el rango, porque una Server Action
 * es un endpoint público.
 */
type ParametroEditable = {
  clave: keyof ParametrosSueldo;
  label: string;
  ayuda: string;
  min: number;
  /** Sólo donde el parámetro tiene techo real. */
  max?: number;
  /**
   * `porcentaje`: se escribe `1.5` (= 1,5 %) y se guarda la fracción `0.015`, que es lo que el motor
   * multiplica (RN-13). El rango de pantalla es 0–100; `min`/`max` no aplican.
   */
  unidad?: 'porcentaje';
};

const PARAMETROS: ParametroEditable[] = [
  { clave: 'toleranciaMinutos', label: 'Tolerancia', ayuda: 'minutos de gracia antes de que sea tardanza', min: 0 },
  { clave: 'tardanzasLibres', label: 'Tardanzas libres', ayuda: 'no se descuentan nunca', min: 0 },
  { clave: 'penalidadTardanza', label: 'Penalidad por tardanza', ayuda: 'soles por tardanza injustificada', min: 0 },
  { clave: 'diasDescuentoPorFalta', label: 'Días por falta', ayuda: 'días de sueldo que cuesta una falta EN TOTAL', min: 1 },
  { clave: 'valorAlmuerzo', label: 'Valor del almuerzo', ayuda: 'soles por almuerzo no entregado', min: 0 },
  { clave: 'horasMinimasAlmuerzo', label: 'Horas para el almuerzo', ayuda: 'horas que hacen del día un tiempo completo', min: 0 },
  { clave: 'valorCapacitacion', label: 'Valor por capacitación', ayuda: 'soles por persona nueva capacitada', min: 0 },
  { clave: 'metaSemanal', label: 'Meta semanal pactada', ayuda: 'vacío = se sugiere con las horas', min: 0 },
  { clave: 'metaPorHora', label: 'Meta por hora', ayuda: 'sólo se usa para sugerir la meta', min: 0 },
  { clave: 'factorMeta', label: 'Factor de la meta', ayuda: 'fracción de la meta que hay que superar', min: 0 },
  { clave: 'bonoMetaSemanal', label: 'Bono por meta', ayuda: 'soles por semana cumplida', min: 0 },
  // La comisión se ESCRIBE en porcentaje y se GUARDA como fracción: el motor la multiplica tal cual
  // por la base (RN-13). Pedir la fracción rechazaba un «1.50» escrito pensando en 1,5 %.
  { clave: 'pctComision', label: 'Comisión (%)', ayuda: 'porcentaje sobre la base: 1,5 = 1,5 %', min: 0, unidad: 'porcentaje' },
  { clave: 'montoMinimoComision', label: 'Boleta mínima', ayuda: 'sólo boletas por encima entran a la comisión', min: 0 },
  { clave: 'factorHoraFueraContrato', label: 'Hora fuera de contrato', ayuda: 'cuántas veces vale la hora trabajada fuera del horario pactado', min: 0 },
  { clave: 'pausaMinimaMinutos', label: 'Pausa mínima', ayuda: 'minutos de hueco a partir de los cuales no se paga', min: 0 },
  // Pago por puntos (spec 2026-10-05-pago-por-puntos-design.md §8.1): se pactan por contrato. Vacío
  // = este contrato no cobra por puntos; las dos tienen que estar definidas para que se pague algo.
  { clave: 'puntosMetaMensual', label: 'Meta de puntos del mes', ayuda: 'vacío = este contrato no cobra por puntos', min: 0 },
  { clave: 'solesPorPunto', label: 'Soles por punto', ayuda: 'vacío = este contrato no cobra por puntos', min: 0 },
];

// Claves donde vaciar el campo guarda `null` EXPLÍCITO (= apagado en este contrato) en vez de
// borrar la clave: borrarla haría que el servidor la complete con lo de Configuración.
const APAGABLES: ReadonlySet<keyof ParametrosSueldo> = new Set(['puntosMetaMensual', 'solesPorPunto']);

const ETIQUETA_PARAMETRO = new Map(PARAMETROS.map((p) => [p.clave, p.label]));
const PARAMETRO_POR_CLAVE = new Map(PARAMETROS.map((p) => [p.clave, p]));

/** Valor guardado → texto del campo, en la unidad en la que se escribe. */
const aTextoParametro = (p: ParametroEditable | undefined, valor: number): string =>
  p?.unidad === 'porcentaje' ? fraccionAPorcentaje(valor) : String(valor);

/** Texto del campo → valor a guardar (`null` = usa el global). */
const leerParametro = (p: ParametroEditable, texto: string): Lectura =>
  p.unidad === 'porcentaje' ? porcentajeAFraccion(texto) : leerNumero(texto, { min: p.min, max: p.max });

/** Para el resumen: `1,5 %` en vez de `0.015`. */
const mostrarParametro = (clave: keyof ParametrosSueldo, valor: unknown): string => {
  const p = PARAMETRO_POR_CLAVE.get(clave);
  if (p?.unidad === 'porcentaje' && typeof valor === 'number') return `${fraccionAPorcentaje(valor).replace('.', ',')} %`;
  return String(valor);
};

type TurnoForm = { diaSemana: number; horaInicio: string; horaFin: string; lugar: string | null };

type Borrador = {
  empleadoId: string;
  fechaInicio: string;
  fechaFin: string;
  modalidad: ModalidadAcuerdo;
  sueldoPactado: string;
  escala: string;
  almuerzoHabilitado: boolean;
  parametros: Partial<ParametrosSueldo>;
  turnos: TurnoForm[];
};

const VACIO: Borrador = {
  empleadoId: '',
  fechaInicio: '',
  fechaFin: '',
  modalidad: 'mensual',
  sueldoPactado: '',
  escala: '',
  almuerzoHabilitado: false,
  parametros: {},
  turnos: [],
};

const deAcuerdo = (a: AcuerdoSueldo): Borrador => ({
  empleadoId: a.empleadoId,
  fechaInicio: a.fechaInicio,
  fechaFin: a.fechaFin,
  modalidad: a.modalidad,
  sueldoPactado: String(a.sueldoPactado),
  escala: a.escala == null ? '' : String(a.escala),
  almuerzoHabilitado: a.almuerzoHabilitado,
  parametros: { ...a.parametros },
  turnos: a.turnos.map((t) => ({
    diaSemana: t.diaSemana,
    horaInicio: t.horaInicio,
    horaFin: t.horaFin,
    lugar: t.lugar,
  })),
});

const minutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Atajos de tipeo, no regla de negocio: son los dos horarios reales que ya menciona el texto de
// la pantalla. El administrador puede escribir cualquier otra hora.
const TURNOS_RAPIDOS = [
  { label: 'Mañana 09–13', horaInicio: '09:00', horaFin: '13:00' },
  { label: 'Tarde 13–20', horaInicio: '13:00', horaFin: '20:00' },
] as const;

// La ventana visible de la barra: cubre los horarios reales con margen. Un turno fuera de la
// ventana se recorta visualmente, nunca se pierde como dato.
const BARRA_DESDE = 6 * 60;
const BARRA_HASTA = 22 * 60;

const pctBarra = (hhmm: string): number => {
  const m = Math.min(Math.max(minutos(hhmm), BARRA_DESDE), BARRA_HASTA);
  return ((m - BARRA_DESDE) / (BARRA_HASTA - BARRA_DESDE)) * 100;
};

/**
 * Lo que la pantalla puede decir del contrato **antes** de guardarlo: horas del periodo, valor de
 * la hora y avisos.
 *
 * Las horas salen de las mismas funciones del core que va a usar la liquidación
 * (`resumirHorario` + `diasDelPeriodo`), no de una cuenta paralela. Si se calcularan acá aparte,
 * el número que el administrador ve al pactar y el que después le paga al colaborador podrían
 * separarse sin que nadie lo note.
 */
function analizar(b: Borrador, vigentes: ParametrosSueldo): {
  horas: number;
  dias: number;
  valorHora: number | null;
  sugerido: number | null;
  // C-6 (spec liquidación-por-tramos, 24-ago-2026): `sueldoPactado` pasa a ser la cuota de CADA
  // liquidación (mensual o semanal, según `modalidad`), no el total del contrato — ya no hay nada
  // que prorratear. Se muestra tal cual, igual que "Pago del periodo" (no es un alias por accidente:
  // hasta que se corrija C-5 el dato real del acuerdo puede seguir siendo el total viejo).
  pagoMensual: number | null;
  horasMensuales: number | null; // horas / (dias/30)
  almuerzoPeriodo: number | null; // techo: días con horario "completo" × valor almuerzo
  almuerzoMensual: number | null;
  error: string | null;
  avisos: string[];
} {
  const vacio = {
    horas: 0,
    dias: 0,
    valorHora: null,
    sugerido: null,
    pagoMensual: null,
    horasMensuales: null,
    almuerzoPeriodo: null,
    almuerzoMensual: null,
    error: null,
    avisos: [] as string[],
  };
  if (!b.fechaInicio || !b.fechaFin || b.turnos.length === 0) return vacio;

  try {
    const porDia = resumirHorario(b.turnos);
    const fechas = diasDelPeriodo(b.fechaInicio, b.fechaFin);
    const horas = fechas.reduce((s, f) => s + (porDia.get(diaSemanaISO(f))?.horas ?? 0), 0);
    const pactado = Number(b.sueldoPactado);

    // F-4 (addendum liquidación-por-tramos, 24-ago-2026): `valorHora` y `sugerido` se calculan
    // contra las horas de UNA UNIDAD de la modalidad (un mes o una semana, según corresponda) desde
    // `fechaInicio` — no contra las horas de TODO el contrato. Con `sueldoPactado` como la cuota de
    // CADA liquidación (C-6), dividirla entre las horas del contrato completo la encogía a una
    // fracción varias veces menor que la real; y `sugerido` (tarifaHora × horas) sugería varias
    // veces la cuota real — si el administrador copiaba esa sugerencia al campo, pagaba de más cada
    // mes. `dias`, `horasMensuales`, `almuerzoPeriodo`/`almuerzoMensual` siguen del contrato
    // completo: son informativos sobre el contrato y siguen siendo correctos así.
    const hastaTramo = finDePeriodo(b.fechaInicio, b.modalidad, b.fechaFin);
    const fechasTramo = diasDelPeriodo(b.fechaInicio, hastaTramo);
    const horasTramo = fechasTramo.reduce((s, f) => s + (porDia.get(diaSemanaISO(f))?.horas ?? 0), 0);

    const meses = fechas.length / 30;
    const horasMin = b.parametros.horasMinimasAlmuerzo ?? vigentes.horasMinimasAlmuerzo;
    const valorAlm = b.parametros.valorAlmuerzo ?? vigentes.valorAlmuerzo;
    // Techo de almuerzos (C-4): cuenta los días del periodo cuyo horario contratado llega a las
    // horas mínimas — o todos los días con horario, si el almuerzo está habilitado a mano. Es lo
    // MÁXIMO si cumple el horario todos los días; el real sale de la asistencia (RN-15).
    const diasConAlmuerzo = fechas.filter((f) => {
      const h = porDia.get(diaSemanaISO(f))?.horas ?? 0;
      return b.almuerzoHabilitado ? h > 0 : h >= horasMin;
    }).length;
    const almuerzoPeriodo = diasConAlmuerzo * valorAlm;

    const avisos: string[] = [];

    // El hueco entre turnos del mismo día. Desde C-01 la liquidación suma los TRAMOS, así que el
    // hueco NO se paga: las horas contratadas de ese día tampoco lo incluyen. No se bloquea
    // —sería inventar una regla de negocio que nadie decidió (no-negociable 5)— pero tampoco se
    // calla: quien pacta el horario tiene que saber qué va a pagar.
    //
    // Este aviso decía lo contrario hasta el 17-ago-2026, y era cierto entonces.
    for (let dia = 1; dia <= 7; dia++) {
      const delDia = b.turnos.filter((t) => t.diaSemana === dia).sort((x, y) => minutos(x.horaInicio) - minutos(y.horaInicio));
      for (let i = 1; i < delDia.length; i++) {
        const hueco = minutos(delDia[i].horaInicio) - minutos(delDia[i - 1].horaFin);
        if (hueco > 0) {
          avisos.push(
            `${DIAS[dia - 1]}: hay ${hueco} minutos de hueco entre ${delDia[i - 1].horaFin} y ${delDia[i].horaInicio}. ` +
              `Ese hueco no se paga: la liquidación suma los tramos trabajados y descuenta las pausas.`,
          );
        }
      }
    }

    if (horas === 0) {
      avisos.push('El horario no cae en ningún día del periodo: las horas contratadas dan cero y no se puede liquidar.');
    }

    return {
      horas,
      dias: fechas.length,
      valorHora: horasTramo > 0 && pactado > 0 ? pactado / horasTramo : null,
      sugerido: b.escala && horasTramo > 0 ? sueldoSugerido(Number(b.escala), horasTramo) : null,
      // Ya no se divide entre `meses` (C-6): `pactado` ES la cuota de cada liquidación, dividirla
      // otra vez por la duración del contrato completo la encogería a una fracción que nadie paga.
      pagoMensual: pactado > 0 ? pactado : null,
      horasMensuales: horas > 0 && meses > 0 ? horas / meses : null,
      almuerzoPeriodo: horas > 0 ? almuerzoPeriodo : null,
      almuerzoMensual: horas > 0 && meses > 0 ? almuerzoPeriodo / meses : null,
      error: null,
      avisos,
    };
  } catch (e) {
    // resumirHorario lanza ante turnos solapados y diasDelPeriodo ante una fecha imposible. Los
    // dos mensajes son mejores que cualquiera que escribiéramos acá.
    return { ...vacio, error: e instanceof Error ? e.message : 'No se pudo calcular el horario.' };
  }
}

/**
 * POR QUÉ EL CONTRATO NO ES UN MODAL (21-ago-2026).
 *
 * Un modal es para una decisión corta: confirmar, elegir de una lista, ajustar un número. Un
 * contrato de sueldo es trabajo: fechas, modalidad, siete días de horario, sueldo, escala y una
 * vista previa que hay que leer antes de guardar, porque lo que se pacta acá es lo que después se
 * paga. Metido en un modal, el formulario necesitaba scroll interno propio — y un formulario que
 * necesita scroll interno es un formulario que quería ser una página.
 *
 * Así que el editor vive en la misma página, dentro del contenedor de contratos, y reemplaza a la
 * lista mientras se trabaja. Lo único que sigue en modal son los valores pactados: números que casi
 * nunca se tocan y que, en línea, tapaban lo que sí se mira siempre.
 */
// El borrador con el que arranca un contrato nuevo: vacío, salvo que sea el PRIMER contrato de
// una persona fija — ahí la fecha de inicio se precompleta con su fecha de ingreso (C-2). Función
// aparte para que abrirNuevo() y el arranque directo de la alta encadenada (abrirNuevoAlMontar)
// no repitan el mismo literal por separado.
function borradorNuevo(
  personaFija: Emp | undefined,
  fechaIngresoPersona: string | null | undefined,
  esPrimero: boolean,
  vigentes: ParametrosSueldo,
): Borrador {
  return {
    ...VACIO,
    // Valores pactados: el contrato nuevo parte de lo que dice /configuracion HOY y lo guarda como
    // suyo (spec 2026-10-05-contrato-valores-pactados-design.md). El servidor vuelve a copiarlos.
    parametros: parametrosDeContratoNuevo(vigentes),
    empleadoId: personaFija?.id ?? '',
    fechaInicio: personaFija && esPrimero ? (fechaIngresoPersona ?? '') : '',
  };
}

// F-1 (spec docs/superpowers/specs/empleados/2026-09-08-borrador-persistente-design.md): sólo para
// un contrato NUEVO — editar uno que ya existe carga siempre desde la base (deAcuerdo), nunca de
// acá. try/catch en las tres funciones porque localStorage puede faltar (SSR, navegación privada,
// cuota llena) y eso no puede tirar abajo el editor: sin borrador es exactamente el comportamiento
// de hoy.
const claveBorrador = (personaFija: Emp | undefined) => `sueldos-acuerdo-borrador:${personaFija?.id ?? 'picker'}`;

function leerBorrador(personaFija: Emp | undefined, vigentes: ParametrosSueldo): Borrador | null {
  try {
    const crudo = localStorage.getItem(claveBorrador(personaFija));
    if (!crudo) return null;
    const b = JSON.parse(crudo) as Borrador;
    // El borrador guarda sólo lo que se cambió: lo demás sale de los valores vigentes de AHORA.
    return { ...b, parametros: parametrosDeContratoNuevo(vigentes, b.parametros) };
  } catch {
    return null;
  }
}

function guardarBorrador(personaFija: Emp | undefined, b: Borrador, vigentes: ParametrosSueldo): void {
  try {
    // Sólo los valores que el administrador cambió frente a los vigentes: un borrador viejo no
    // tiene que fijar valores de hace días (spec 2026-10-05, enmienda).
    const cambiados = Object.fromEntries(
      Object.entries(b.parametros).filter(([k, v]) => vigentes[k as keyof ParametrosSueldo] !== v),
    );
    localStorage.setItem(claveBorrador(personaFija), JSON.stringify({ ...b, parametros: cambiados }));
  } catch {
    // Cuota llena o localStorage inaccesible: se sigue trabajando sin borrador, sin avisar en cada
    // tecla — el aviso sería más ruido que la pérdida ocasional que esto mismo existe para evitar.
  }
}

function borrarBorrador(personaFija: Emp | undefined): void {
  try {
    localStorage.removeItem(claveBorrador(personaFija));
  } catch {
    /* nada que limpiar si ni siquiera se pudo leer */
  }
}

export function AcuerdosCliente({
  acuerdos,
  empleados,
  personaFija,
  fechaIngresoPersona,
  abrirNuevoAlMontar,
  valoresVigentes,
}: {
  acuerdos: AcuerdoSueldo[];
  empleados: Emp[];
  /** Contexto /personal/[id]/contrato: la persona no se elige, ya está dada. */
  personaFija?: Emp;
  /** Fecha de ingreso de la persona fija: precompleta el primer contrato (C-2). */
  fechaIngresoPersona?: string | null;
  /**
   * Alta encadenada (R2, spec §2.4): si viene marcado y todavía no hay ningún contrato, arranca
   * directo en el editor con el borrador de un contrato nuevo, en vez de mostrar primero la lista
   * vacía y obligar a un clic más en «Nuevo contrato». Sólo importa al MONTAR — es estado
   * inicial, no un efecto: así no puede pisar una edición que la persona ya esté haciendo.
   */
  abrirNuevoAlMontar?: boolean;
  /**
   * Lo que /configuracion tiene HOY (ya completado con los defaults del código). Es de dónde parte
   * un contrato nuevo, y lo que se muestra como respaldo si a un contrato le faltara una clave.
   */
  valoresVigentes?: ParametrosSueldo;
}) {
  const router = useRouter();
  const vigentes = valoresVigentes ?? PARAMETROS_SUELDO_DEFAULT;
  // R2 (spec §2.4) más el hallazgo F6 del validador de flujo (23-ago-2026): con `personaFija`
  // (montado en /personal/[id]/contrato) y CERO contratos, arranca directo en el editor aunque no
  // venga `?continuar=alta` — quien vuelve a una ficha sin contrato (alta interrumpida, o
  // cualquier otra vuelta) cae lista para trabajar, no frente a un "Todavía no hay ningún
  // contrato" que exige un clic más para llegar a donde ya se sabe que hay que ir.
  const arrancaEnEditor = (Boolean(abrirNuevoAlMontar) || Boolean(personaFija)) && acuerdos.length === 0;
  const [editando, setEditando] = useState<string | null>(null);
  const [enEditor, setEnEditor] = useState(arrancaEnEditor);
  const [parametrosAbierto, setParametrosAbierto] = useState(false);
  // Texto de cada campo del modal de parámetros, tal como se escribió, y el error de los que no se
  // pueden leer. Mientras haya un error no se guarda el contrato: si no, viajaría el valor anterior
  // sin que nadie lo note.
  const [textosParametros, setTextosParametros] = useState<Partial<Record<keyof ParametrosSueldo, string>>>({});
  const [erroresParametros, setErroresParametros] = useState<Partial<Record<keyof ParametrosSueldo, string>>>({});
  const confirmacion = useConfirmacion();
  // F-1: si al arrancar directo en el editor (alta encadenada) hay un borrador guardado, se
  // restaura en vez de empezar vacío — `leerBorrador` es null en el server (sin localStorage), así
  // que el primer render en SSR siempre es el vacío y el cliente lo corrige en el montaje si hace
  // falta (ver el useEffect de abajo), sin desajuste de hidratación visible: el usuario no llega a
  // ver el formulario vacío antes del reemplazo.
  const [b, setB] = useState<Borrador>(() =>
    arrancaEnEditor ? borradorNuevo(personaFija, fechaIngresoPersona, true, vigentes) : VACIO,
  );
  const [borradorRestaurado, setBorradorRestaurado] = useState(false);

  useEffect(() => {
    if (!arrancaEnEditor || editando) return;
    const guardado = leerBorrador(personaFija, vigentes);
    if (guardado) {
      setB(guardado);
      setBorradorRestaurado(true);
    }
    // Sólo al montar: abrirNuevo()/abrirEdicion() ya manejan su propio caso al hacer clic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [error, setError] = useState<string | null>(null);
  // El error de una acción de la lista —poner vigente— no puede vivir en el error del formulario:
  // cuando se dispara, el formulario no está en pantalla y el mensaje se renderizaría donde nadie
  // lo ve.
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const analisis = useMemo(() => analizar(b, vigentes), [b, vigentes]);
  const pactados = PARAMETROS.filter((p) => b.parametros[p.clave] != null);

  // Al entrar o salir del editor cambia todo lo que hay en pantalla. Sin volver arriba, quien abre
  // un contrato desde el final de una lista larga cae en la mitad del formulario.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [enEditor]);

  const abrirNuevo = () => {
    setEditando(null);
    // F-1: un borrador sin guardar de un contrato nuevo gana al vacío — es exactamente el caso que
    // esto existe para cubrir (cambiar de pantalla y volver a «Nuevo contrato»).
    const guardado = leerBorrador(personaFija, vigentes);
    if (guardado) {
      setB(guardado);
      setBorradorRestaurado(true);
    } else {
      // C-2: el PRIMER contrato de la persona arranca en su fecha de ingreso, editable. Una
      // renovación no: tiene su propia fecha y atarla al ingreso original la pisaría.
      setB(borradorNuevo(personaFija, fechaIngresoPersona, acuerdos.length === 0, vigentes));
      setBorradorRestaurado(false);
    }
    setErroresParametros({});
    setError(null);
    setEnEditor(true);
  };

  const abrirEdicion = (a: AcuerdoSueldo) => {
    // F-1 (spec §2): un contrato que YA EXISTE carga siempre desde la base, nunca de un borrador
    // sin guardar — el que hubiera para "nuevo contrato" no le corresponde a este id.
    setEditando(a.id);
    setB(deAcuerdo(a));
    setBorradorRestaurado(false);
    setErroresParametros({});
    setError(null);
    setEnEditor(true);
  };

  const descartarBorrador = () => {
    borrarBorrador(personaFija);
    setBorradorRestaurado(false);
    setErroresParametros({});
    setB(borradorNuevo(personaFija, fechaIngresoPersona, acuerdos.length === 0, vigentes));
  };

  const volver = () => {
    setParametrosAbierto(false);
    setEnEditor(false);
  };

  // F-1: se guarda mientras se edita un contrato NUEVO (no una edición existente — spec §2). Sin
  // debounce: `b` es un objeto chico, escribirlo en cada tecla no se nota.
  useEffect(() => {
    if (!enEditor || editando) return;
    guardarBorrador(personaFija, b, vigentes);
    // personaFija no cambia dentro de la vida de este componente; incluirlo en las dependencias
    // sólo agregaría ruido a la lista sin cambiar cuándo corre esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, enEditor, editando, vigentes]);

  const guardar = () => {
    setError(null);
    const malEscritos = Object.keys(erroresParametros) as (keyof ParametrosSueldo)[];
    if (malEscritos.length > 0) {
      setError(
        `Revisa los parámetros del contrato: ${malEscritos.map((c) => ETIQUETA_PARAMETRO.get(c) ?? c).join(', ')}.`,
      );
      return;
    }
    // Una comisión entre 0 y 0,5 % suele ser la unidad vieja (`0.02` pensando en 2 %): se pide
    // confirmación, no se rechaza (spec 2026-10-03-comision-en-porcentaje §Aviso). Sólo si cambió:
    // una ya guardada así en este contrato no vuelve a preguntar en cada guardado.
    const comisionGuardada = editando ? acuerdos.find((a) => a.id === editando)?.parametros.pctComision : undefined;
    const comision = b.parametros.pctComision;
    if (comision !== comisionGuardada && comisionRequiereConfirmacion(comision)) {
      confirmacion.pedir({
        titulo: '¿La comisión es correcta?',
        detalle: avisoComisionBaja(b.parametros.pctComision),
        confirmarLabel: editando ? 'Guardar igual' : 'Pactar igual',
        tono: 'aviso',
        alConfirmar: () => {
          confirmacion.cerrar();
          enviar();
        },
      });
      return;
    }
    enviar();
  };

  const enviar = () => {
    const form: AcuerdoForm = {
      empleadoId: b.empleadoId,
      fechaInicio: b.fechaInicio,
      fechaFin: b.fechaFin,
      modalidad: b.modalidad,
      sueldoPactado: Number(b.sueldoPactado),
      escala: b.escala ? Number(b.escala) : null,
      almuerzoHabilitado: b.almuerzoHabilitado,
      parametros: b.parametros,
      turnos: b.turnos,
    };
    empezar(async () => {
      const eraNuevo = !editando;
      const r = editando ? await accionActualizarAcuerdo(editando, form) : await accionCrearAcuerdo(form);
      if (r.ok) {
        // F-1: el borrador cumplió su función — guardarlo después de esto pisaría el próximo
        // contrato nuevo con lo que ya se guardó.
        if (eraNuevo) borrarBorrador(personaFija);
        volver();
        // ROTURA 3 (validador de flujo 23-ago-2026): las acciones sólo revalidan la ruta vieja
        // /sueldos/acuerdos. Montado en /personal/[id]/contrato nadie volvía a pedirle datos al
        // servidor, así que la lista seguía mostrando lo de antes de guardar. router.refresh()
        // reobtiene la página actual — sea cual sea la ruta en la que este cliente esté montado.
        router.refresh();
      } else setError(r.error ?? 'No se pudo guardar.');
    });
  };

  const cambiarEstado = (id: string, estado: EstadoAcuerdo) => {
    setErrorLista(null);
    empezar(async () => {
      const r = await accionCambiarEstado(id, estado);
      if (!r.ok) setErrorLista(r.error ?? 'No se pudo cambiar el estado.');
      else router.refresh();
    });
  };

  const setTurno = (i: number, campo: keyof TurnoForm, valor: string) =>
    setB((v) => ({ ...v, turnos: v.turnos.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)) }));

  const agregarTurno = (dia: number) =>
    setB((v) => ({
      ...v,
      turnos: [...v.turnos, { diaSemana: dia, horaInicio: '09:00', horaFin: '13:00', lugar: null }],
    }));

  const agregarTurnoRapido = (dia: number, r: (typeof TURNOS_RAPIDOS)[number]) =>
    setB((v) => ({
      ...v,
      turnos: [...v.turnos, { diaSemana: dia, horaInicio: r.horaInicio, horaFin: r.horaFin, lugar: null }],
    }));

  // Copia los turnos de `dia` a los días SIGUIENTES que estén vacíos. No pisa un día con turnos:
  // pisar en silencio lo que alguien ya cargó es exactamente lo que este editor no hace.
  const copiarDiaASiguientes = (dia: number) =>
    setB((v) => {
      const base = v.turnos.filter((t) => t.diaSemana === dia);
      if (base.length === 0) return v;
      const nuevos: TurnoForm[] = [];
      for (let d = dia + 1; d <= 7; d++) {
        if (v.turnos.some((t) => t.diaSemana === d)) continue;
        for (const t of base) nuevos.push({ ...t, diaSemana: d });
      }
      return nuevos.length === 0 ? v : { ...v, turnos: [...v.turnos, ...nuevos] };
    });

  const quitarTurno = (i: number) => setB((v) => ({ ...v, turnos: v.turnos.filter((_, j) => j !== i) }));

  // Los textos del modal se arman desde lo guardado cada vez que se abre: así un contrato recién
  // cargado o un borrador restaurado se ven en la unidad en la que se escriben.
  const abrirParametros = () => {
    const textos: Partial<Record<keyof ParametrosSueldo, string>> = {};
    for (const p of PARAMETROS) {
      const actual = b.parametros[p.clave];
      // Un campo con error conserva lo que se escribió, para que se vea qué hay que corregir.
      if (p.clave in erroresParametros) textos[p.clave] = textosParametros[p.clave] ?? '';
      else if (typeof actual === 'number') textos[p.clave] = aTextoParametro(p, actual);
    }
    setTextosParametros(textos);
    setParametrosAbierto(true);
  };

  const setParametro = (param: ParametroEditable, texto: string) => {
    const clave = param.clave;
    setTextosParametros((t) => ({ ...t, [clave]: texto }));
    const lectura = leerParametro(param, texto);
    setErroresParametros((e) => {
      const resto = { ...e };
      delete resto[clave];
      return lectura.ok ? resto : { ...resto, [clave]: lectura.error };
    });
    // Un texto que no se puede leer no toca lo guardado: el error bloquea guardar hasta corregirlo.
    if (!lectura.ok) return;
    setB((v) => {
      const p = { ...v.parametros };
      // `metaSemanal` es el único cuyo null significa algo ("no hay meta pactada, sugerila"), así
      // que borrar el campo NO es lo mismo que ponerlo en cero.
      if (lectura.valor === null) {
        // Pago por puntos: vacío = «este contrato no cobra por puntos», un null que se conserva.
        if (APAGABLES.has(clave)) (p as Record<string, number | null>)[clave] = null;
        else delete p[clave];
      } else (p as Record<string, number>)[clave] = lectura.valor;
      return { ...v, parametros: p };
    });
  };

  // Sólo en un contrato nuevo (#55): uno ya pactado conserva sus valores. Vuelve a los de
  // Configuración de hoy, con los textos en la unidad en la que se escriben (la comisión en %).
  const volverALosDeConfiguracion = () => {
    const parametros = parametrosDeContratoNuevo(vigentes);
    const textos: Partial<Record<keyof ParametrosSueldo, string>> = {};
    for (const p of PARAMETROS) {
      const valor = parametros[p.clave];
      if (typeof valor === 'number') textos[p.clave] = aTextoParametro(p, valor);
    }
    setB((v) => ({ ...v, parametros }));
    setTextosParametros(textos);
    setErroresParametros({});
  };

  // ── El editor: la página de trabajo ──────────────────────────────────────────────────────
  if (enEditor) {
    return (
      <>
        <Card>
          <CardHeader className="flex-wrap gap-3">
            <div className="min-w-0">
              <CardTitle>{editando ? 'Editar contrato' : 'Nuevo contrato'}</CardTitle>
              <p className="mt-1 text-apoyo text-muted">
                Sueldo, periodo y horario. De acá salen las horas contratadas y el valor de la hora.
              </p>
            </div>
            <Button variant="ghost" onClick={volver} className="shrink-0">
              <ArrowLeft className="h-4 w-4" /> Volver a contratos
            </Button>
          </CardHeader>

          <CardContent className="space-y-6 border-t border-line pt-5">
            {/* F-1: sólo aparece para un contrato nuevo (borradorRestaurado nunca se prende en
                abrirEdicion, spec §2). */}
            {borradorRestaurado && (
              <Aviso tono="info">
                Se restauró un borrador sin guardar.{' '}
                <button type="button" onClick={descartarBorrador} className="font-medium underline underline-offset-2">
                  Descartar y empezar de cero
                </button>
              </Aviso>
            )}
            {personaFija ? (
              <div>
                <LabelGrupo>Persona</LabelGrupo>
                <p className="text-cuerpo font-medium text-navy">Contrato de {personaFija.nombre}</p>
                {/* C-2: cel/DNI/recomendaciones en el contrato — vacío se ve como «—», nunca se
                    oculta la línea (spec §4: lo que falta se ve como falta, no desaparece). */}
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-apoyo text-muted sm:grid-cols-2">
                  <div className="flex gap-1">
                    <dt className="shrink-0 font-medium text-ink">DNI:</dt>
                    <dd>{personaFija.dni || '—'}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="shrink-0 font-medium text-ink">Teléfono:</dt>
                    <dd>{personaFija.telefono || '—'}</dd>
                  </div>
                  <div className="col-span-full flex gap-1">
                    <dt className="shrink-0 font-medium text-ink">Recomendaciones:</dt>
                    <dd>{personaFija.recomendaciones || '—'}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div>
                <LabelGrupo>Persona</LabelGrupo>
                <PersonaPicker
                  empleados={empleados}
                  selected={b.empleadoId ? [b.empleadoId] : []}
                  onChange={(ids) => setB((v) => ({ ...v, empleadoId: ids[0] ?? '' }))}
                  single
                  placeholder="Buscar a la persona…"
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="desde" required>Desde</Label>
                <Input
                  id="desde"
                  type="date"
                  value={b.fechaInicio}
                  onChange={(e) => setB((v) => ({ ...v, fechaInicio: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="hasta" required>Hasta</Label>
                <Input
                  id="hasta"
                  type="date"
                  value={b.fechaFin}
                  onChange={(e) => setB((v) => ({ ...v, fechaFin: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <LabelGrupo>Modalidad de pago</LabelGrupo>
              <OpcionBotones
                opciones={OPC_MODALIDAD}
                value={b.modalidad}
                onChange={(x) => setB((v) => ({ ...v, modalidad: x as ModalidadAcuerdo }))}
                ariaLabel="Modalidad"
              />
            </div>

            {/* ── Horario semanal ───────────────────────────────────────────────────────── */}
            <div>
              <LabelGrupo>Horario contratado</LabelGrupo>
              <p className="mb-2 text-apoyo text-muted">
                El horario real de LuceBien es 09:00–13:00 y 13:00–20:00, contiguo. Se cargan los dos
                turnos, no uno solo de 09:00 a 20:00: dos turnos que se pisan inflan las horas y
                hunden el valor de la hora de todo el periodo.
              </p>
              <div className="space-y-2">
                {DIAS.map((nombre, idx) => {
                  const dia = idx + 1;
                  const delDia = b.turnos
                    .map((t, i) => ({ t, i }))
                    .filter(({ t }) => t.diaSemana === dia);
                  return (
                    <div key={dia} className="flex flex-wrap items-center gap-2 rounded-r-chico border border-line px-3 py-2">
                      <span className="w-24 shrink-0 text-cuerpo font-medium text-navy">{nombre}</span>
                      {/* Barra 06:00–22:00: cada turno es un segmento. Estática a propósito. */}
                      <div className="relative h-4 w-full max-w-[16rem] shrink-0 overflow-hidden rounded-r-pastilla bg-paper sm:w-40" aria-hidden>
                        {delDia.map(({ t, i }) => (
                          <span
                            key={i}
                            className="absolute inset-y-0 rounded-r-pastilla bg-gold/60"
                            style={{ left: `${pctBarra(t.horaInicio)}%`, width: `${Math.max(pctBarra(t.horaFin) - pctBarra(t.horaInicio), 1)}%` }}
                          />
                        ))}
                      </div>
                      {delDia.length === 0 && <span className="text-apoyo text-muted">sin turnos</span>}
                      {delDia.map(({ t, i }) => (
                        <span key={i} className="flex items-center gap-1">
                          <Input
                            type="time"
                            className="w-28"
                            value={t.horaInicio}
                            onChange={(e) => setTurno(i, 'horaInicio', e.target.value)}
                            aria-label={`Inicio del turno de ${nombre}`}
                          />
                          <span className="text-muted">–</span>
                          <Input
                            type="time"
                            className="w-28"
                            value={t.horaFin}
                            onChange={(e) => setTurno(i, 'horaFin', e.target.value)}
                            aria-label={`Fin del turno de ${nombre}`}
                          />
                          <Button variant="ghost" onClick={() => quitarTurno(i)} aria-label={`Quitar turno de ${nombre}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </span>
                      ))}
                      {delDia.length === 0 &&
                        TURNOS_RAPIDOS.map((r) => (
                          <Button key={r.label} variant="ghost" onClick={() => agregarTurnoRapido(dia, r)}>
                            <Plus className="h-4 w-4" /> {r.label}
                          </Button>
                        ))}
                      {delDia.length > 0 && dia < 7 && (() => {
                        // F5 (validador de flujo 23-ago-2026): el botón decía "días vacíos
                        // siguientes" sin decir cuáles, así que copiar era un salto de fe —
                        // ¿pisa domingo o no? Acá se listan los días que de verdad van a recibir
                        // la copia (los que hoy no tienen ningún turno), sin excluir ninguno: los
                        // locales de LuceBien SÍ abren domingo, así que excluirlo sería inventar
                        // una regla de negocio que nadie pidió.
                        const vacios: number[] = [];
                        for (let d = dia + 1; d <= 7; d++) {
                          if (!b.turnos.some((t) => t.diaSemana === d)) vacios.push(d);
                        }
                        const etiqueta =
                          vacios.length === 0
                            ? 'Copiar a los días vacíos siguientes'
                            : `Copiar a ${vacios.map((d) => DIAS_CORTO[d - 1]).join(', ')}`;
                        return (
                          <Button variant="ghost" onClick={() => copiarDiaASiguientes(dia)}>
                            <Copy className="h-4 w-4" /> {etiqueta}
                          </Button>
                        );
                      })()}
                      <Button variant="ghost" className="ml-auto" onClick={() => agregarTurno(dia)}>
                        <Plus className="h-4 w-4" /> Turno
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Sueldo ────────────────────────────────────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="sueldo" required>Sueldo pactado del periodo</Label>
                <Input
                  id="sueldo"
                  type="number"
                  min={0}
                  step="0.01"
                  value={b.sueldoPactado}
                  onChange={(e) => setB((v) => ({ ...v, sueldoPactado: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="escala">Escala (opcional)</Label>
                <Select
                  id="escala"
                  value={b.escala}
                  onChange={(e) => setB((v) => ({ ...v, escala: e.target.value }))}
                >
                  <option value="">Sin escala</option>
                  {ESCALAS_SUELDO_DEFAULT.map((e) => (
                    <option key={e.escala} value={e.escala}>
                      {e.escala} — S/ {e.tarifaHora.toFixed(2)}/h ({e.antiguedad})
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <LabelGrupo>Cuándo se gana el almuerzo</LabelGrupo>
              <OpcionBotones
                opciones={OPC_ALMUERZO}
                value={b.almuerzoHabilitado ? 'si' : 'no'}
                onChange={(x) => setB((v) => ({ ...v, almuerzoHabilitado: x === 'si' }))}
                ariaLabel="Cuándo se gana el almuerzo"
              />
              <p className="mt-1 text-apoyo text-muted">
                Un día de tiempo completo es el que llega a las horas mínimas del parámetro «Horas
                para el almuerzo».
              </p>
            </div>

            {/* ── Vista previa ──────────────────────────────────────────────────────────── */}
            <div className="rounded-r-chico border border-line bg-paper px-4 py-3">
              <p className="mb-2 text-cuerpo font-medium text-navy">Resumen del contrato</p>
              {analisis.error ? (
                <p className="text-cuerpo text-error-deep">{analisis.error}</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 text-cuerpo sm:grid-cols-4">
                    <div>
                      <p className="text-apoyo text-muted">Días del periodo</p>
                      <p className="tabular-nums text-navy">{analisis.dias}</p>
                    </div>
                    <div>
                      <p className="text-apoyo text-muted">Horas contratadas</p>
                      <p className="tabular-nums text-navy">{analisis.horas.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-apoyo text-muted">Valor de la hora</p>
                      <p className="tabular-nums text-navy">
                        {analisis.valorHora == null ? '—' : soles(analisis.valorHora)}
                      </p>
                    </div>
                    <div>
                      <p className="text-apoyo text-muted">Sugerido por escala</p>
                      <p className="tabular-nums text-navy">
                        {analisis.sugerido == null ? '—' : soles(analisis.sugerido)}
                      </p>
                    </div>
                    <div>
                      <p className="text-apoyo text-muted">Pago del periodo</p>
                      <p className="tabular-nums text-navy">
                        {Number(b.sueldoPactado) > 0 ? soles(Number(b.sueldoPactado)) : '—'}
                      </p>
                    </div>
                    <div>
                      {/* C-6 (spec liquidación-por-tramos): ya no es una aproximación. Con
                          `sueldoPactado` como cuota de CADA liquidación, este número es el mismo
                          que "Pago del periodo" — sin dividir por la duración del contrato. */}
                      <p className="text-apoyo text-muted">Pago por liquidación</p>
                      <p className="tabular-nums text-navy">
                        {analisis.pagoMensual == null ? '—' : soles(analisis.pagoMensual)}
                      </p>
                    </div>
                    <div>
                      <p className="text-apoyo text-muted">Horas mensuales (aprox.)</p>
                      <p className="tabular-nums text-navy">
                        {analisis.horasMensuales == null ? '—' : analisis.horasMensuales.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-apoyo text-muted">Almuerzos (máx. mes / periodo)</p>
                      <p className="tabular-nums text-navy">
                        {analisis.almuerzoMensual == null
                          ? '—'
                          : `${soles(analisis.almuerzoMensual)} · ${soles(analisis.almuerzoPeriodo!)}`}
                      </p>
                    </div>
                  </div>
                  {analisis.sugerido != null && (
                    <p className="mt-2 text-apoyo text-muted">
                      La escala es una referencia para negociar, no una obligación: el que manda es
                      el sueldo pactado.
                    </p>
                  )}
                  {analisis.almuerzoPeriodo != null && analisis.almuerzoPeriodo > 0 && (
                    <p className="mt-2 text-apoyo text-muted">
                      Almuerzos: es el máximo si cumple el horario todos los días; lo que
                      efectivamente gane sale de la asistencia.
                    </p>
                  )}
                </>
              )}

              {analisis.avisos.map((a) => (
                <p key={a} className="mt-2 flex gap-2 text-apoyo text-aviso-deep">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  {a}
                </p>
              ))}
            </div>

            {/* ── Valores pactados: lo único que sigue siendo un modal ───────────────────── */}
            <div className="rounded-r-chico border border-line px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-cuerpo font-medium text-navy">Valores pactados de este contrato</p>
                  <p className="text-apoyo text-muted">
                    {editando
                      ? 'La liquidación usa estos valores. Cambiar Configuración no los mueve.'
                      : 'Parten de lo que dice Configuración hoy y quedan como valores de este contrato: cambiar Configuración después no los mueve.'}
                  </p>
                </div>
                <Button variant="outline" onClick={abrirParametros} className="shrink-0">
                  <SlidersHorizontal className="h-4 w-4" />
                  Ver y ajustar
                </Button>
              </div>
              {pactados.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {pactados.map((p) => (
                    <Badge key={p.clave} tone="gold">
                      {p.label}: <span className="tabular-nums">{mostrarParametro(p.clave, b.parametros[p.clave])}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Con un parámetro mal escrito el botón de guardar queda deshabilitado: sin este aviso
                no se ve por qué, porque el modal ya está cerrado. */}
            {Object.keys(erroresParametros).length > 0 && (
              <Aviso tono="error">
                Revisa los parámetros del contrato:{' '}
                {(Object.keys(erroresParametros) as (keyof ParametrosSueldo)[])
                  .map((c) => ETIQUETA_PARAMETRO.get(c) ?? c)
                  .join(', ')}
                .
              </Aviso>
            )}
            {error && <Aviso tono="error">{error}</Aviso>}
          </CardContent>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4">
            <Button variant="outline" onClick={volver}>
              Cancelar
            </Button>
            <Button
              onClick={guardar}
              pending={pendiente}
              disabled={analisis.error != null || Object.keys(erroresParametros).length > 0}
            >
              {editando ? 'Guardar cambios' : 'Pactar contrato'}
            </Button>
          </div>
        </Card>

        <Modal
          open={parametrosAbierto}
          onClose={() => setParametrosAbierto(false)}
          title="Valores pactados de este contrato"
          subtitle="Son los valores de este contrato; no cambian si se modifica Configuración."
          size="xl"
        >
          <ModalBody>
            <div className="grid gap-3 sm:grid-cols-2">
              {PARAMETROS.map((p) => {
                const respaldo = vigentes[p.clave];
                const errorCampo = erroresParametros[p.clave];
                const avisoCampo = p.clave === 'pctComision' ? avisoComisionBaja(b.parametros.pctComision) : null;
                return (
                  <div key={p.clave}>
                    <Label htmlFor={p.clave}>{p.label}</Label>
                    <Input
                      id={p.clave}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={textosParametros[p.clave] ?? ''}
                      // El campo muestra el valor pactado, en la unidad en la que se escribe (la
                      // comisión en %). Sólo si le falta (un contrato raro) dice qué valor de
                      // Configuración se usaría: nunca un texto de ejemplo.
                      placeholder={
                        APAGABLES.has(p.clave)
                          ? 'apagado'
                          : typeof respaldo === 'number'
                          ? `usa ${aTextoParametro(p, respaldo)} de Configuración`
                          : 'sin meta pactada'
                      }
                      aria-invalid={errorCampo ? true : undefined}
                      onChange={(e) => setParametro(p, e.target.value)}
                    />
                    {errorCampo ? (
                      <p className="mt-1 text-apoyo text-error-deep">{errorCampo}</p>
                    ) : avisoCampo ? (
                      <p className="mt-1 text-apoyo text-aviso-deep">{avisoCampo}</p>
                    ) : (
                      <p className="mt-1 text-apoyo text-muted">{p.ayuda}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <LabelGrupo>Meta semanal</LabelGrupo>
              <OpcionBotones
                opciones={OPC_META_FIJA}
                value={(b.parametros.metaSemanalFija ?? vigentes.metaSemanalFija) ? 'si' : 'no'}
                onChange={(x) => setB((v) => ({ ...v, parametros: { ...v.parametros, metaSemanalFija: x === 'si' } }))}
                ariaLabel="Meta semanal fija"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            {/* Nada se guarda desde acá: los cambios quedan en el formulario y viajan cuando se
                guarda el contrato. Por eso no hay «Cancelar»: prometería deshacer algo que este
                diálogo no escribió. */}
            {!editando && (
              <Button variant="ghost" onClick={volverALosDeConfiguracion}>
                Volver a los de Configuración
              </Button>
            )}
            <Button onClick={() => setParametrosAbierto(false)}>Listo</Button>
          </ModalFooter>
        </Modal>
        <DialogoConfirmar {...confirmacion.props} pending={pendiente} />
      </>
    );
  }

  // ── La lista ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {errorLista && (
        <Aviso tono="error" className="mb-3">
          {errorLista}
        </Aviso>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contratos de sueldo</CardTitle>
          <Button onClick={abrirNuevo}>
            <Plus className="h-4 w-4" /> Nuevo contrato
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {acuerdos.length === 0 ? (
            <EmptyState icon={FileSignature} titulo="Todavía no hay ningún contrato">
              Un contrato pacta el sueldo, el periodo y el horario de una persona. Sin horario
              cargado no se puede liquidar: de ahí salen las horas y el valor de la hora.
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  {!personaFija && <TH>Persona</TH>}
                  <TH>Periodo</TH>
                  <TH>Modalidad</TH>
                  <TH className="text-right">Sueldo</TH>
                  <TH className="text-right">Turnos</TH>
                  <TH>Estado</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {acuerdos.map((a) => (
                  <TR key={a.id}>
                    {!personaFija && <TD className="font-medium text-navy">{a.empleadoNombre ?? '—'}</TD>}
                    <TD>
                      {a.fechaInicio} → {a.fechaFin}
                    </TD>
                    <TD className="capitalize">{a.modalidad}</TD>
                    <TD className="text-right tabular-nums">{soles(a.sueldoPactado)}</TD>
                    <TD className="text-right tabular-nums">
                      {a.turnos.length === 0 ? (
                        <Badge tone="amber">sin horario</Badge>
                      ) : (
                        a.turnos.length
                      )}
                    </TD>
                    <TD>
                      <Badge tone={TONO_ESTADO[a.estado]}>{a.estado}</Badge>
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        {a.estado === 'borrador' && a.turnos.length > 0 && (
                          <Button variant="outline" onClick={() => cambiarEstado(a.id, 'vigente')} pending={pendiente}>
                            Poner vigente
                          </Button>
                        )}
                        {a.estado !== 'liquidado' && (
                          <Button variant="ghost" onClick={() => abrirEdicion(a)} aria-label="Editar contrato">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
