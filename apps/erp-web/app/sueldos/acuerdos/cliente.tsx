'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { AlertTriangle, ArrowLeft, Copy, FileSignature, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  ESCALAS_SUELDO_DEFAULT,
  PARAMETROS_SUELDO_DEFAULT,
  diaSemanaISO,
  diasDelPeriodo,
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
import { accionActualizarAcuerdo, accionCambiarEstado, accionCrearAcuerdo, type AcuerdoForm } from './actions';

type Emp = { id: string; nombre: string; rol: string; sedeCod: string | null };

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const TONO_ESTADO: Record<EstadoAcuerdo, 'gray' | 'green' | 'navy'> = {
  borrador: 'gray',
  vigente: 'green',
  liquidado: 'navy',
};

const OPC_MODALIDAD: Opcion[] = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'semanal', label: 'Semanal' },
];

const OPC_ALMUERZO: Opcion[] = [
  { value: 'no', label: 'Sólo en días de tiempo completo' },
  { value: 'si', label: 'Cualquier día trabajado' },
];

const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Los 14 parámetros que un contrato puede pisar. El orden agrupa por tema, no por importancia.
 *
 * Se listan acá y no se generan desde `PARAMETROS_SUELDO_DEFAULT` porque cada uno necesita una
 * etiqueta que un administrador entienda y un paso de edición propio: `factorMeta` se mueve de a
 * 0,05 y `penalidadTardanza` de a 1 sol. Un formulario generado sin eso obliga a tipear 0.85 a
 * mano en un campo que sube de a 1.
 */
const PARAMETROS: { clave: keyof ParametrosSueldo; label: string; ayuda: string; paso: number }[] = [
  { clave: 'toleranciaMinutos', label: 'Tolerancia', ayuda: 'minutos de gracia antes de que sea tardanza', paso: 1 },
  { clave: 'tardanzasLibres', label: 'Tardanzas libres', ayuda: 'no se descuentan nunca', paso: 1 },
  { clave: 'penalidadTardanza', label: 'Penalidad por tardanza', ayuda: 'soles por tardanza injustificada', paso: 1 },
  { clave: 'diasDescuentoPorFalta', label: 'Días por falta', ayuda: 'días de sueldo que cuesta una falta EN TOTAL', paso: 1 },
  { clave: 'valorAlmuerzo', label: 'Valor del almuerzo', ayuda: 'soles por almuerzo no entregado', paso: 1 },
  { clave: 'horasMinimasAlmuerzo', label: 'Horas para el almuerzo', ayuda: 'horas que hacen del día un tiempo completo', paso: 1 },
  { clave: 'valorCapacitacion', label: 'Valor por capacitación', ayuda: 'soles por persona nueva capacitada', paso: 1 },
  { clave: 'metaSemanal', label: 'Meta semanal pactada', ayuda: 'vacío = se sugiere con las horas', paso: 50 },
  { clave: 'metaPorHora', label: 'Meta por hora', ayuda: 'sólo se usa para sugerir la meta', paso: 1 },
  { clave: 'factorMeta', label: 'Factor de la meta', ayuda: 'fracción de la meta que hay que superar', paso: 0.05 },
  { clave: 'bonoMetaSemanal', label: 'Bono por meta', ayuda: 'soles por semana cumplida', paso: 5 },
  { clave: 'pctComision', label: 'Comisión', ayuda: 'porcentaje sobre la base', paso: 0.5 },
  { clave: 'montoMinimoComision', label: 'Boleta mínima', ayuda: 'sólo boletas por encima entran a la comisión', paso: 10 },
];

const ETIQUETA_PARAMETRO = new Map(PARAMETROS.map((p) => [p.clave, p.label]));

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
function analizar(b: Borrador): {
  horas: number;
  dias: number;
  valorHora: number | null;
  sugerido: number | null;
  error: string | null;
  avisos: string[];
} {
  const vacio = { horas: 0, dias: 0, valorHora: null, sugerido: null, error: null, avisos: [] as string[] };
  if (!b.fechaInicio || !b.fechaFin || b.turnos.length === 0) return vacio;

  try {
    const porDia = resumirHorario(b.turnos);
    const fechas = diasDelPeriodo(b.fechaInicio, b.fechaFin);
    const horas = fechas.reduce((s, f) => s + (porDia.get(diaSemanaISO(f))?.horas ?? 0), 0);
    const pactado = Number(b.sueldoPactado);

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
      valorHora: horas > 0 && pactado > 0 ? pactado / horas : null,
      sugerido: b.escala && horas > 0 ? sueldoSugerido(Number(b.escala), horas) : null,
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
 * lista mientras se trabaja. Lo único que sigue en modal son los parámetros: trece números que casi
 * nunca se tocan y que, en línea, tapaban lo que sí se mira siempre.
 */
export function AcuerdosCliente({
  acuerdos,
  empleados,
  personaFija,
  fechaIngresoPersona,
}: {
  acuerdos: AcuerdoSueldo[];
  empleados: Emp[];
  /** Contexto /colaboradores/[id]/contrato: la persona no se elige, ya está dada. */
  personaFija?: Emp;
  /** Fecha de ingreso de la persona fija: precompleta el primer contrato (C-2). */
  fechaIngresoPersona?: string | null;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [enEditor, setEnEditor] = useState(false);
  const [parametrosAbierto, setParametrosAbierto] = useState(false);
  const [b, setB] = useState<Borrador>(VACIO);
  const [error, setError] = useState<string | null>(null);
  // El error de una acción de la lista —poner vigente— no puede vivir en el error del formulario:
  // cuando se dispara, el formulario no está en pantalla y el mensaje se renderizaría donde nadie
  // lo ve.
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const analisis = useMemo(() => analizar(b), [b]);
  const propios = Object.keys(b.parametros) as (keyof ParametrosSueldo)[];

  // Al entrar o salir del editor cambia todo lo que hay en pantalla. Sin volver arriba, quien abre
  // un contrato desde el final de una lista larga cae en la mitad del formulario.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [enEditor]);

  const abrirNuevo = () => {
    setEditando(null);
    setB({
      ...VACIO,
      empleadoId: personaFija?.id ?? '',
      // C-2: el PRIMER contrato de la persona arranca en su fecha de ingreso, editable. Una
      // renovación no: tiene su propia fecha y atarla al ingreso original la pisaría.
      fechaInicio: personaFija && acuerdos.length === 0 ? (fechaIngresoPersona ?? '') : '',
    });
    setError(null);
    setEnEditor(true);
  };

  const abrirEdicion = (a: AcuerdoSueldo) => {
    setEditando(a.id);
    setB(deAcuerdo(a));
    setError(null);
    setEnEditor(true);
  };

  const volver = () => {
    setParametrosAbierto(false);
    setEnEditor(false);
  };

  const guardar = () => {
    setError(null);
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
      const r = editando ? await accionActualizarAcuerdo(editando, form) : await accionCrearAcuerdo(form);
      if (r.ok) volver();
      else setError(r.error ?? 'No se pudo guardar.');
    });
  };

  const cambiarEstado = (id: string, estado: EstadoAcuerdo) => {
    setErrorLista(null);
    empezar(async () => {
      const r = await accionCambiarEstado(id, estado);
      if (!r.ok) setErrorLista(r.error ?? 'No se pudo cambiar el estado.');
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

  const setParametro = (clave: keyof ParametrosSueldo, texto: string) =>
    setB((v) => {
      const p = { ...v.parametros };
      if (texto === '') delete p[clave];
      // `metaSemanal` es el único cuyo null significa algo ("no hay meta pactada, sugerila"), así
      // que borrar el campo NO es lo mismo que ponerlo en cero.
      else (p as Record<string, number>)[clave] = Number(texto);
      return { ...v, parametros: p };
    });

  // ── El editor: la página de trabajo ──────────────────────────────────────────────────────
  if (enEditor) {
    return (
      <>
        <Card>
          <CardHeader className="flex-wrap gap-3">
            <div className="min-w-0">
              <CardTitle>{editando ? 'Editar contrato' : 'Nuevo contrato'}</CardTitle>
              <p className="mt-1 text-xs text-muted">
                Sueldo, periodo y horario. De acá salen las horas contratadas y el valor de la hora.
              </p>
            </div>
            <Button variant="ghost" onClick={volver} className="shrink-0">
              <ArrowLeft className="h-4 w-4" /> Volver a contratos
            </Button>
          </CardHeader>

          <CardContent className="space-y-6 border-t border-line pt-5">
            {personaFija ? (
              <div>
                <LabelGrupo>Persona</LabelGrupo>
                <p className="text-sm font-medium text-navy">Contrato de {personaFija.nombre}</p>
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
              <p className="mb-2 text-xs text-muted">
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
                    <div key={dia} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2">
                      <span className="w-24 shrink-0 text-sm font-medium text-navy">{nombre}</span>
                      {/* Barra 06:00–22:00: cada turno es un segmento. Estática a propósito. */}
                      <div className="relative h-4 w-full max-w-[16rem] shrink-0 overflow-hidden rounded bg-paper sm:w-40" aria-hidden>
                        {delDia.map(({ t, i }) => (
                          <span
                            key={i}
                            className="absolute inset-y-0 rounded-sm bg-gold/60"
                            style={{ left: `${pctBarra(t.horaInicio)}%`, width: `${Math.max(pctBarra(t.horaFin) - pctBarra(t.horaInicio), 1)}%` }}
                          />
                        ))}
                      </div>
                      {delDia.length === 0 && <span className="text-xs text-muted">sin turnos</span>}
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
                      {delDia.length > 0 && dia < 7 && (
                        <Button variant="ghost" onClick={() => copiarDiaASiguientes(dia)}>
                          <Copy className="h-4 w-4" /> Copiar a los días vacíos siguientes
                        </Button>
                      )}
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
              <p className="mt-1 text-xs text-muted">
                Un día de tiempo completo es el que llega a las horas mínimas del parámetro «Horas
                para el almuerzo».
              </p>
            </div>

            {/* ── Vista previa ──────────────────────────────────────────────────────────── */}
            <div className="rounded-md border border-line bg-paper px-4 py-3">
              {analisis.error ? (
                <p className="text-sm text-error-deep">{analisis.error}</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted">Días del periodo</p>
                      <p className="tabular-nums text-navy">{analisis.dias}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Horas contratadas</p>
                      <p className="tabular-nums text-navy">{analisis.horas.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Valor de la hora</p>
                      <p className="tabular-nums text-navy">
                        {analisis.valorHora == null ? '—' : soles(analisis.valorHora)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Sugerido por escala</p>
                      <p className="tabular-nums text-navy">
                        {analisis.sugerido == null ? '—' : soles(analisis.sugerido)}
                      </p>
                    </div>
                  </div>
                  {analisis.sugerido != null && (
                    <p className="mt-2 text-xs text-muted">
                      La escala es una referencia para negociar, no una obligación: el que manda es
                      el sueldo pactado.
                    </p>
                  )}
                </>
              )}

              {analisis.avisos.map((a) => (
                <p key={a} className="mt-2 flex gap-2 text-xs text-aviso-deep">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  {a}
                </p>
              ))}
            </div>

            {/* ── Parámetros propios: lo único que sigue siendo un modal ─────────────────── */}
            <div className="rounded-md border border-line px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy">Parámetros propios de este contrato</p>
                  <p className="text-xs text-muted">
                    En blanco usa el valor global de Configuración. Lo que se escriba acá vale sólo
                    para esta persona y sólo en este contrato.
                  </p>
                </div>
                <Button variant="outline" onClick={() => setParametrosAbierto(true)} className="shrink-0">
                  <SlidersHorizontal className="h-4 w-4" />
                  {propios.length === 0 ? 'Ajustar parámetros' : `Ajustar (${propios.length})`}
                </Button>
              </div>
              {propios.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {propios.map((clave) => (
                    <Badge key={clave} tone="gold">
                      {ETIQUETA_PARAMETRO.get(clave) ?? clave}: {String(b.parametros[clave])}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {error && <Aviso tono="error">{error}</Aviso>}
          </CardContent>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4">
            <Button variant="outline" onClick={volver}>
              Cancelar
            </Button>
            <Button onClick={guardar} pending={pendiente} disabled={analisis.error != null}>
              {editando ? 'Guardar cambios' : 'Pactar contrato'}
            </Button>
          </div>
        </Card>

        <Modal
          open={parametrosAbierto}
          onClose={() => setParametrosAbierto(false)}
          title="Parámetros de este contrato"
          subtitle="Un campo en blanco usa el valor global de Configuración."
          size="xl"
        >
          <ModalBody>
            <div className="grid gap-3 sm:grid-cols-2">
              {PARAMETROS.map((p) => {
                const global = PARAMETROS_SUELDO_DEFAULT[p.clave];
                const actual = b.parametros[p.clave];
                return (
                  <div key={p.clave}>
                    <Label htmlFor={p.clave}>{p.label}</Label>
                    <Input
                      id={p.clave}
                      type="number"
                      step={p.paso}
                      value={actual == null ? '' : String(actual)}
                      placeholder={global == null ? 'sin meta pactada' : String(global)}
                      onChange={(e) => setParametro(p.clave, e.target.value)}
                    />
                    <p className="mt-1 text-xs text-muted">{p.ayuda}</p>
                  </div>
                );
              })}
            </div>
          </ModalBody>
          <ModalFooter>
            {/* Nada se guarda desde acá: los cambios quedan en el formulario y viajan cuando se
                guarda el contrato. Por eso no hay «Cancelar»: prometería deshacer algo que este
                diálogo no escribió. */}
            {propios.length > 0 && (
              <Button variant="ghost" onClick={() => setB((v) => ({ ...v, parametros: {} }))}>
                Volver a los globales
              </Button>
            )}
            <Button onClick={() => setParametrosAbierto(false)}>Listo</Button>
          </ModalFooter>
        </Modal>
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
