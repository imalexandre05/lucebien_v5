'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Filter, ChevronRight, Award, AlertTriangle } from 'lucide-react';
import {
  COMPONENTES,
  calcularCiclo,
  notaCompetencias,
  revisarPesos,
  tramoEval,
  TRAMO_LABEL,
  notaDesdePuntos,
  bandaDesdeNota,
  BANDA_LABEL,
  type ComponentesEval,
  type PesosEval,
  type EscalaPuntos,
  type TramoEval,
  type BandaEval,
  type Ciclo,
} from '@scilb/core';
import { accionCrearEvaluacion, accionComponentesEval } from './actions';
import type { Evaluacion, EmpleadoParaEvaluacion, CompetenciaConfig } from '../../lib/evaluaciones-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { OpcionBotones } from '../../components/ui/opcion-botones';
import { StatBox } from '../../components/ui/stat-box';
import { EmptyState } from '../../components/ui/empty-state';
import { campoCls, Aviso } from '../../components/ui/form';
import { PerfilComponentes } from '../../components/ui/perfil-componentes';
import { cn } from '../../lib/cn';
import { hoyPeru } from '../../lib/fechas';

// Aviso de C-2 (spec nota-sin-ceros-silenciosos): comas de miles/decimales al estilo peruano,
// mismo criterio que el resto de la pantalla (S/ en app/estadisticas, app/compras, etc.).
const fmtSuma = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 2 });

const TRAMO_TONE: Record<TramoEval, Tone> = {
  excelente: 'green',
  bueno: 'navy',
  mejorar: 'amber',
  bajo: 'gray',
};
const TRAMOS: TramoEval[] = ['excelente', 'bueno', 'mejorar', 'bajo'];

// Bandas de la nota "puntos como moneda" (spec docs/superpowers/specs/evaluaciones/2026-08-25-
// puntos-como-moneda-design.md §2 C-3) — distintas de TRAMO_TONE de arriba, que sigue usándose SÓLO
// para evaluaciones viejas metodo='ponderado' (spec §2 C-5: lo ya guardado no cambia de sistema de
// lectura). 'sobresaliente' en gold: es la única banda sin techo, "más que perfección".
const BANDA_TONE: Record<BandaEval, Tone> = {
  riesgo: 'red',
  en_desarrollo: 'amber',
  ideal: 'green',
  sobresaliente: 'gold',
};
const fieldCls = campoCls;

const CERO: ComponentesEval = {
  competencias: 0,
  valores: 0,
  operaciones: 0,
  software: 0,
  limpieza: 0,
  examenes: 0,
  tardanza: 20,
  descuentoIncidencias: 0,
  bonusVentas: 0,
};

// Evaluación recién guardada: el contexto mínimo para la nota de referencia que aparece debajo
// (R4, spec §2.6: "la liquidación ES el pago" — acá ya no se registra nada, sólo se informa).
type EvalGuardada = {
  id: string;
  empleadoId: string;
  nombre: string;
  notaFinal: number;
  banda: BandaEval;
  cicloDesde: string;
  cicloHasta: string;
};

export function EvaluacionesCliente({
  evaluaciones,
  empleados,
  pesos,
  escala,
  esAdmin,
  competenciasConfig,
}: {
  evaluaciones: Evaluacion[];
  empleados: EmpleadoParaEvaluacion[];
  pesos: PesosEval;
  escala: EscalaPuntos;
  esAdmin: boolean;
  competenciasConfig: CompetenciaConfig[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [empleadoId, setEmpleadoId] = useState('');
  // Ciclo por aniversario (Fase 12 tarea 3): se auto-calcula al elegir empleado
  // (calcularCiclo, packages/core/src/evaluaciones.ts, puerto de routes/evaluaciones.js:98-127).
  // Los inputs quedan editables por si el admin necesita corregirlo a mano.
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [cicloEditado, setCicloEditado] = useState(false);
  const [comp, setComp] = useState<ComponentesEval>(CERO);
  // Competencias (Fase 12 tarea 2): nivel 0-4 elegido por competencia, cod → nivel. La nota se
  // deriva con notaCompetencias() y se mezcla en compParaCalculo, no se edita como número suelto.
  const [competenciaSel, setCompetenciaSel] = useState<Record<string, number>>({});
  // Desglose de puntos del período (spec docs/superpowers/specs/evaluaciones/2026-08-25-puntos-
  // como-moneda-design.md §2 C-1): desde el 25-ago-2026 esto YA NO es sólo contexto — puntosTotal
  // es lo que decide la nota (notaDesdePuntos, más abajo). null hasta que se calcula desde la data;
  // no hay forma manual de cargarlo (sale de pipeline/extras/actividades/ventas/incidencias reales).
  const [infoExtra, setInfoExtra] = useState<{
    puntosPipeline: number;
    extrasCantidad: number;
    extrasPuntos: number;
    puntosActividades: number;
    puntosVentas: number;
    ventasSinTasa: boolean;
    descuento: number;
    puntosTotal: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  // Nota de referencia (R4, spec §2.6): aparece justo después de guardar la evaluación, en la
  // MISMA pantalla. Antes acá vivía el panel que registraba el pago contra el sistema viejo — ese
  // camino se cerró (ROTURA 2, validador de flujo 23-ago-2026): la liquidación es el pago, y esta
  // pantalla ya no escribe nada, sólo apunta a dónde se registra.
  const [evalGuardada, setEvalGuardada] = useState<EvalGuardada | null>(null);

  // Filtros del historial.
  const [q, setQ] = useState('');
  const [fMes, setFMes] = useState('');
  const [fTramo, setFTramo] = useState('');
  const [expandida, setExpandida] = useState<string | null>(null);

  const competenciaNota = useMemo(() => {
    if (!competenciasConfig.length) return 0;
    return notaCompetencias(competenciasConfig.map((c) => competenciaSel[c.cod] ?? 0));
  }, [competenciaSel, competenciasConfig]);

  // Competencias sin responder. El nivel 0 es el PEOR escalón de la rúbrica, así que arrancar con
  // una opción preseleccionada hacía indistinguible «lo evalué en 0» de «no lo miré», y bastaba
  // abrir y guardar para mandar ocho ceros a una nota que termina en el sueldo de alguien. Se
  // arranca vacío y no se puede guardar hasta responder las ocho (mismo criterio que /valores).
  const competenciasFaltantes = useMemo(
    () => competenciasConfig.filter((c) => competenciaSel[c.cod] === undefined).length,
    [competenciaSel, competenciasConfig],
  );

  const compParaCalculo = useMemo(() => ({ ...comp, competencias: competenciaNota }), [comp, competenciaNota]);
  // Spec puntos-como-moneda §2 C-2/C-4: la nota deja de salir de compParaCalculo × pesos y pasa a
  // salir de puntosTotal (notaDesdePuntos). compParaCalculo/pesos siguen existiendo — alimentan el
  // perfil de PerfilComponentes de abajo, ya no la nota — y calcularNotaMensual() queda sin usar en
  // este panel (sigue viva para leer evaluaciones viejas metodo='ponderado' en el historial).
  //
  // null mientras no haya puntosTotal (no se calculó desde la data todavía): no hay número que
  // mostrar, así que no se inventa uno. Si notaDesdePuntos lanza (config rota, ver evaluaciones.ts
  // caso 8), el mensaje se atrapa acá — mismo criterio E-2 que ya usaba este panel con
  // calcularNotaMensual: lanzar DENTRO de un useMemo de render sube al error boundary y reemplaza
  // TODA la pantalla, incluido el historial de abajo que no tiene nada que ver con el panel roto.
  const notaResultado = useMemo((): { ok: true; valor: number; banda: BandaEval } | { ok: false; mensaje: string } => {
    if (infoExtra === null) {
      return { ok: false, mensaje: 'Calculá desde la data para obtener los puntos del período y la nota.' };
    }
    try {
      const { nota: valor, banda } = notaDesdePuntos(infoExtra.puntosTotal, escala);
      return { ok: true, valor, banda };
    } catch (e) {
      return { ok: false, mensaje: e instanceof Error ? e.message : String(e) };
    }
  }, [infoExtra, escala]);
  const nota = notaResultado.ok ? notaResultado.valor : null;
  const banda = notaResultado.ok ? notaResultado.banda : null;
  // Ventas en el período sin puntos por venta definidos (spec §4): frenar antes que emitir una
  // nota que calla que hubo ventas y el sistema no las contó.
  const ventasSinTasa = infoExtra?.ventasSinTasa === true;
  // C-2 (spec nota-sin-ceros-silenciosos): revisarPesos() no corrige nada — sólo hace visible
  // cuánto se alejan de 1 los pesos configurados, para que el administrador decida con el número
  // delante. Los pesos ya no deciden la nota (C-4 de la spec puntos-como-moneda la volvió sólo
  // informativa: sigue mostrándose porque el perfil de abajo la usa como etiqueta de contexto),
  // pero la decisión de forzar que sumen 1 sigue abierta igual (decisión 14, pendientes-negocio.md).
  const revisionPesos = useMemo(() => revisarPesos(pesos), [pesos]);

  const meses = useMemo(() => [...new Set(evaluaciones.map((e) => e.mes))].sort().reverse(), [evaluaciones]);

  const filtradas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return evaluaciones.filter((e) => {
      if (fMes && e.mes !== fMes) return false;
      if (fTramo && tramoEval(e.notaFinal) !== fTramo) return false;
      if (needle && !(e.empleadoNombre ?? '').toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [evaluaciones, q, fMes, fTramo]);

  const resumen = useMemo(() => {
    const total = filtradas.length;
    const prom = total ? filtradas.reduce((s, e) => s + e.notaFinal, 0) / total : 0;
    return {
      total,
      promedio: prom.toFixed(2),
      excelente: filtradas.filter((e) => tramoEval(e.notaFinal) === 'excelente').length,
      bajo: filtradas.filter((e) => tramoEval(e.notaFinal) === 'bajo').length,
    };
  }, [filtradas]);

  const set = (k: keyof ComponentesEval, v: number) => setComp((p) => ({ ...p, [k]: v }));

  function elegirEmpleado(id: string) {
    setEmpleadoId(id);
    setEvalGuardada(null);
    setInfoExtra(null);
    setComp(CERO);
    setCompetenciaSel({});
    setCicloEditado(false);
    const emp = empleados.find((e) => e.id === id);
    setCiclo(emp ? calcularCiclo(emp.fechaIngreso, hoyPeru()) : null);
  }

  function setCicloDesde(v: string) {
    setCiclo((c) => (c ? { ...c, desde: v } : c));
    setCicloEditado(true);
  }
  function setCicloHasta(v: string) {
    setCiclo((c) => (c ? { ...c, hasta: v } : c));
    setCicloEditado(true);
  }

  function calcularDesdeData() {
    if (!ciclo) return;
    setError('');
    startTransition(async () => {
      const r = await accionComponentesEval(empleadoId, ciclo.desde, ciclo.hasta);
      if (!r.ok || !r.comp) {
        setError(r.error ?? 'Error al calcular');
        return;
      }
      const c = r.comp;
      setComp((p) => ({
        ...p,
        operaciones: c.operaciones ?? 0,
        software: c.software ?? 0,
        limpieza: c.limpieza ?? 0,
        tardanza: c.tardanza ?? p.tardanza,
        descuentoIncidencias: c.descuento ?? 0,
        // valores (Fase 12, RPC 0057): nota real de Valores 360° del mes del ciclo. Sigue igual
        // (típicamente 0) si nadie evaluó a esta persona todavía este mes.
        valores: c.valores ?? p.valores,
        bonusVentas: c.bonusVentas ?? p.bonusVentas,
      }));
      // puntosTotal (0095) es lo único que de verdad hace falta para poder guardar: sin él no hay
      // nota que mostrar (notaResultado cae al mensaje "Calculá desde la data..." de arriba). El
      // resto de las claves puede faltar si esa migración todavía no corrió (undefined, no 0 — un
      // 0 real y "no lo sé" no son lo mismo) y en ese caso simplemente no se completa infoExtra.
      if (c.puntosTotal != null) {
        setInfoExtra({
          puntosPipeline: c.puntosPipeline ?? 0,
          extrasCantidad: c.extrasCantidad ?? 0,
          extrasPuntos: c.extrasPuntos ?? 0,
          puntosActividades: c.puntosActividades ?? 0,
          puntosVentas: c.puntosVentas ?? 0,
          ventasSinTasa: c.ventasSinTasa === true,
          // El valor QUE DE VERDAD entra en puntosTotal, congelado tal como lo devolvió el RPC —
          // no comp.descuentoIncidencias, que sigue siendo editable a mano después de este cálculo
          // y ya no tiene ningún efecto sobre la nota (sólo sobre el perfil que se guarda).
          descuento: c.descuento ?? 0,
          puntosTotal: c.puntosTotal,
        });
      } else {
        setInfoExtra(null);
      }
    });
  }

  function guardar() {
    // nota === null: sin puntosTotal, o notaDesdePuntos cortó (config rota). ventasSinTasa: la
    // spec §4 pide frenar, no sólo avisar. No hay nada que guardar en ninguno de los dos casos —
    // el botón ya está deshabilitado, esto es defensa en profundidad.
    if (!ciclo || nota === null || banda === null || ventasSinTasa || infoExtra === null) return;
    setError('');
    startTransition(async () => {
      const r = await accionCrearEvaluacion({
        empleadoId,
        mes: ciclo.desde.slice(0, 7),
        notaFinal: nota,
        componentes: compParaCalculo as unknown as Record<string, number>,
        pesos,
        cicloDesde: ciclo.desde,
        cicloHasta: ciclo.hasta,
        // Spec puntos-como-moneda §2 C-5: toda evaluación nueva se guarda con metodo='puntos' — el
        // valor 'ponderado' de MetodoEvaluacion queda para leer lo que ya existía antes de la 0095.
        metodo: 'puntos',
        puntosTotal: infoExtra.puntosTotal,
      });
      if (!r.ok || !r.id) {
        setError(r.error ?? 'Error al guardar');
        return;
      }
      const emp = empleados.find((e) => e.id === empleadoId);
      setEvalGuardada({
        id: r.id,
        empleadoId,
        nombre: emp?.nombre ?? '',
        notaFinal: nota,
        banda,
        cicloDesde: ciclo.desde,
        cicloHasta: ciclo.hasta,
      });
      router.refresh();
    });
  }

  function reiniciar() {
    setAbierto(false);
    setEmpleadoId('');
    setCiclo(null);
    setComp(CERO);
    setCompetenciaSel({});
    setEvalGuardada(null);
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox index={0} label="Evaluaciones" valor={resumen.total} tone="navy" />
        <StatBox index={1} label="Promedio" valor={resumen.promedio} tone="gold" />
        <StatBox index={2} label="Excelente" valor={resumen.excelente} tone="exito" />
        <StatBox index={3} label="Bajo" valor={resumen.bajo} tone="neutro" />
      </div>

      {/* Filtros + acción */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <span className="inline-flex items-center gap-1.5 text-rotulo font-semibold uppercase text-muted">
            <Filter className="h-3.5 w-3.5" strokeWidth={2} /> Filtros
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar empleado…"
            className={`${fieldCls} min-w-[12rem] flex-1`}
          />
          <select value={fMes} onChange={(e) => setFMes(e.target.value)} className={fieldCls} aria-label="Mes">
            <option value="">Todos los meses</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select value={fTramo} onChange={(e) => setFTramo(e.target.value)} className={fieldCls} aria-label="Tramo">
            <option value="">Todos los tramos</option>
            {TRAMOS.map((t) => (
              <option key={t} value={t}>
                {TRAMO_LABEL[t]}
              </option>
            ))}
          </select>
          {esAdmin && (
            <button
              type="button"
              onClick={() => (abierto ? reiniciar() : setAbierto(true))}
              className={cn(buttonVariants({ variant: abierto ? 'outline' : 'primary' }), 'ml-auto')}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              {abierto ? 'Cerrar' : 'Nueva evaluación'}
            </button>
          )}
        </CardContent>
      </Card>

      {esAdmin && abierto && !evalGuardada && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva evaluación</CardTitle>
            {nota !== null && banda !== null ? (
              <Badge tone={BANDA_TONE[banda]}>
                {nota.toFixed(2)} · {BANDA_LABEL[banda]}
              </Badge>
            ) : (
              <Badge tone="red">Nota no disponible</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {!notaResultado.ok && (
              // E-2: el mensaje tal cual, sin envolverlo ni inventar un título — es la explicación,
              // no un adorno. tono="error" trae role="alert" (Aviso, components/ui/form.tsx): esto
              // bloquea Guardar, no es un dato para mirar cuando haya tiempo.
              <Aviso tono="error">{notaResultado.mensaje}</Aviso>
            )}
            {ventasSinTasa && (
              // Spec §4: la persona tuvo ventas en el período y pts_por_sol_vendido está vacío —
              // frenar antes de emitir una nota que calla que hubo ventas sin contar.
              <Aviso tono="error">
                Las ventas todavía no suman puntos: falta definir cuántos puntos vale un sol vendido.{' '}
                <Link href="/configuracion" className="font-medium underline decoration-2 underline-offset-2">
                  Definir en Configuración
                </Link>
                .
              </Aviso>
            )}
            {revisionPesos.desviado && (
              <div className="flex items-start gap-3 rounded-r-chico border border-aviso-line bg-aviso-soft px-3 py-2.5 text-cuerpo text-aviso-deep">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                <span>
                  Los pesos configurados suman <strong>{fmtSuma(revisionPesos.suma)}</strong>: esta nota no
                  está sobre 20 sino sobre {fmtSuma(revisionPesos.suma * 20)}.
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-rotulo uppercase text-muted">Empleado</label>
                <select value={empleadoId} onChange={(e) => elegirEmpleado(e.target.value)} className={cn(fieldCls, 'w-full')} aria-label="Empleado">
                  <option value="">Elige…</option>
                  {empleados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-rotulo uppercase text-muted">
                  Ciclo
                  {ciclo && (
                    <span className="ml-1.5 font-normal normal-case text-muted">
                      ({ciclo.fuente === 'aniversario' ? 'por aniversario' : 'mes calendario — sin fecha de ingreso'}
                      {cicloEditado ? ', editado' : ''})
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <input type="date" value={ciclo?.desde ?? ''} disabled={!ciclo} onChange={(e) => setCicloDesde(e.target.value)} className={cn(fieldCls, 'w-full')} />
                  <span className="text-apoyo text-muted">a</span>
                  <input type="date" value={ciclo?.hasta ?? ''} disabled={!ciclo} onChange={(e) => setCicloHasta(e.target.value)} className={cn(fieldCls, 'w-full')} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-line/60 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={calcularDesdeData}
                disabled={!empleadoId || !ciclo}
                pending={pending}
                className="text-apoyo"
              >
                Calcular desde la data
              </Button>
              <span className="text-apoyo text-muted">
                Trae los puntos del período (pipeline, extras, actividades, ventas, incidencias) que dan la nota, y llena
                operaciones/software/limpieza/valores/tardanza del perfil.
              </span>
            </div>

            {infoExtra && (
              <div className="flex flex-wrap items-center gap-4 rounded-r-chico border border-line/60 bg-paper/60 px-3 py-2 text-apoyo text-muted">
                <span>
                  Pipeline <span className="tabular-nums font-semibold text-navy">{infoExtra.puntosPipeline} pts</span>
                </span>
                <span>
                  Extras <span className="tabular-nums font-semibold text-navy">{infoExtra.extrasCantidad}</span>
                  {' · '}
                  <span className="tabular-nums font-semibold text-navy">{infoExtra.extrasPuntos} pts</span>
                </span>
                <span>
                  Actividades <span className="tabular-nums font-semibold text-navy">{infoExtra.puntosActividades} pts</span>
                </span>
                <span>
                  Ventas <span className="tabular-nums font-semibold text-navy">{infoExtra.puntosVentas} pts</span>
                </span>
                <span>
                  Descuento por incidencias{' '}
                  <span className="tabular-nums font-semibold text-navy">−{infoExtra.descuento} pts</span>
                </span>
                <span className="font-semibold text-navy">
                  Total del período <span className="tabular-nums">{infoExtra.puntosTotal} pts</span>
                </span>
              </div>
            )}

            {/* Perfil (spec §2 C-4): los 7 componentes ya NO deciden la nota — de acá sale sólo el
                dato de en qué es fuerte la persona y en qué flaquea, al lado de la nota de arriba. */}
            <div className="border-t border-line/60 pt-3">
              <div className="mb-2 text-rotulo uppercase text-muted">Perfil (no entra a la nota)</div>
              <PerfilComponentes componentes={compParaCalculo as unknown as Record<string, number>} pesos={pesos as unknown as Record<string, number>} />
            </div>

            {/* Ya no pesan sobre la nota (por eso sin "×peso" al lado, a diferencia del perfil de
                arriba): son la carga a mano de los mismos siete componentes que arma el perfil. */}
            <div className="text-rotulo uppercase text-muted">Componentes (escala /20) — perfil, no fórmula</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {COMPONENTES.filter(({ key }) => key !== 'competencias').map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="flex-1 text-cuerpo text-navy">{label}</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={20}
                    value={comp[key]}
                    onChange={(e) => set(key, Number(e.target.value))}
                    className={cn(fieldCls, 'w-20 text-right')}
                  />
                </div>
              ))}
            </div>

            {/* Competencias con rúbrica (Fase 12 tarea 2): 8 competencias, catálogo editable en
                competencias_config — nunca hardcodeado. La nota se deriva, no se escribe a mano. */}
            <div className="border-t border-line/60 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-rotulo uppercase text-muted">Competencias</span>
                <span className="tabular-nums text-dato font-semibold text-navy">{competenciaNota.toFixed(1)}/20</span>
              </div>
              {competenciasConfig.length === 0 ? (
                <p className="text-apoyo text-muted">Sin catálogo de competencias todavía (falta aplicar la migración 0057) — la nota queda en 0.</p>
              ) : (
                <div className="space-y-3">
                  {competenciasConfig.map((c) => (
                    <div key={c.cod}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="text-apoyo font-medium text-navy">{c.nombre}</span>
                        {competenciaSel[c.cod] === undefined && (
                          <span className="text-micro text-muted">sin responder</span>
                        )}
                      </div>
                      <OpcionBotones
                        opciones={c.rubrica.map((texto, i) => ({ value: String(i), label: `${i} · ${texto}` }))}
                        value={competenciaSel[c.cod] === undefined ? '' : String(competenciaSel[c.cod])}
                        onChange={(v) => setCompetenciaSel((p) => ({ ...p, [c.cod]: Number(v) }))}
                        ariaLabel={c.nombre}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 border-t border-line/60 pt-3 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <label className="flex-1 text-cuerpo text-navy">Descuento por incidencias</label>
                <input type="number" step="0.5" value={comp.descuentoIncidencias} onChange={(e) => set('descuentoIncidencias', Number(e.target.value))} className={cn(fieldCls, 'w-20 text-right')} />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex-1 text-cuerpo text-navy">Bonus por ventas</label>
                <input type="number" step="0.5" value={comp.bonusVentas} onChange={(e) => set('bonusVentas', Number(e.target.value))} className={cn(fieldCls, 'w-20 text-right')} />
              </div>
            </div>

            {error && <p className="text-cuerpo text-error">{error}</p>}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={guardar}
                disabled={!empleadoId || !ciclo || competenciasFaltantes > 0 || nota === null || ventasSinTasa}
                pending={pending}
                aria-describedby="motivo-evaluacion"
              >
                {pending ? 'Guardando…' : nota !== null ? `Guardar · ${nota.toFixed(2)}` : 'Guardar'}
              </Button>
              <span id="motivo-evaluacion" className="text-apoyo text-muted">
                {nota === null
                  ? 'La nota no se pudo calcular: revisa el aviso de arriba.'
                  : ventasSinTasa
                    ? 'No se puede guardar con ventas sin puntos definidos: revisa el aviso de arriba.'
                    : competenciasFaltantes > 0
                      ? `Faltan ${competenciasFaltantes} de ${competenciasConfig.length} competencias.`
                      : 'La nota sale de los puntos del período; los componentes se guardan como perfil.'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nota de referencia (R4, spec §2.6): aparece justo después de guardar, misma pantalla.
          Ya NO registra ningún pago — hasta el 23-ago-2026 este panel sugería un monto con la
          fórmula vieja (salario_base) y escribía en la tabla `pagos`, un segundo camino de pago
          que contradecía «la liquidación ES el pago» (ROTURA 2, validador de flujo). El pago vive
          ahora en la pestaña de la persona; acá sólo queda la nota como referencia para el
          administrador. */}
      {esAdmin && evalGuardada && (
        <Card>
          <CardHeader>
            <CardTitle>Evaluación guardada — {evalGuardada.nombre}</CardTitle>
            <Badge tone={BANDA_TONE[evalGuardada.banda]}>
              {evalGuardada.notaFinal.toFixed(2)} · {BANDA_LABEL[evalGuardada.banda]}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-apoyo text-muted">Ciclo {evalGuardada.cicloDesde} a {evalGuardada.cicloHasta}.</p>

            <p className="rounded-r-chico border border-line bg-paper/60 px-3 py-2.5 text-cuerpo text-ink">
              El pago se registra en la pestaña{' '}
              <Link
                href={`/personal/${evalGuardada.empleadoId}/pago`}
                className="font-medium text-navy underline decoration-gold decoration-2 underline-offset-2 hover:text-navy-dark"
              >
                Liquidación y pago
              </Link>{' '}
              de la persona.
            </p>

            <button type="button" onClick={reiniciar} className="block text-apoyo text-muted underline underline-offset-2 hover:text-navy">
              Nueva evaluación
            </button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="w-10 pl-5">
                  <span className="sr-only">Desglose</span>
                </TH>
                <TH>Mes</TH>
                <TH>Empleado</TH>
                <TH className="text-right">Nota</TH>
                <TH className="pr-5">Tramo / banda</TH>
              </TR>
            </THead>
            <TBody>
              {filtradas.map((e) => {
                // Spec §2 C-5: lo ya guardado no cambia de sistema de lectura. Una evaluación vieja
                // (metodo='ponderado', incluidas las de antes de que 'metodo' existiera — quedan en
                // ese default) se sigue leyendo con tramoEval; una nueva (metodo='puntos') se lee
                // con la banda, contra los cortes ACTUALES de config (ver bandaDesdeNota).
                const esPuntos = e.metodo === 'puntos';
                const banda = esPuntos ? bandaDesdeNota(e.notaFinal, escala.bandaRiesgo, escala.bandaIdeal) : null;
                const t = esPuntos ? null : tramoEval(e.notaFinal);
                const abierta = expandida === e.id;
                return (
                  <Fragment key={e.id}>
                    <TR
                      onClick={() => setExpandida(abierta ? null : e.id)}
                      className="cursor-pointer"
                    >
                      <TD className="pl-5">
                        <button
                          type="button"
                          aria-expanded={abierta}
                          aria-label={`Ver desglose de ${e.empleadoNombre ?? 'evaluación'} ${e.mes}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setExpandida(abierta ? null : e.id);
                          }}
                          className="anillo flex h-7 w-7 items-center justify-center rounded-r-pastilla text-muted transition-colors duration-150 hover:bg-navy/5 hover:text-navy"
                        >
                          <ChevronRight
                            className={cn('h-4 w-4 transition-transform duration-200 ease-out-expo', abierta && 'rotate-90')}
                            strokeWidth={2}
                          />
                        </button>
                      </TD>
                      <TD className="tabular-nums text-dato text-muted">{e.mes}</TD>
                      <TD className="font-medium text-navy">{e.empleadoNombre ?? '—'}</TD>
                      <TD className="text-right tabular-nums text-base font-bold text-navy">{e.notaFinal.toFixed(2)}</TD>
                      <TD className="pr-5">
                        {banda ? (
                          <Badge tone={BANDA_TONE[banda]}>{BANDA_LABEL[banda]}</Badge>
                        ) : t ? (
                          <Badge tone={TRAMO_TONE[t]}>{TRAMO_LABEL[t]}</Badge>
                        ) : null}
                      </TD>
                    </TR>
                    {abierta && (
                      <TR className="hover:bg-transparent">
                        <TD colSpan={5} className="bg-paper/50 px-6 py-4">
                          {e.componentes ? (
                            <PerfilComponentes valoresOculto={e.valoresOculto} componentes={e.componentes} pesos={e.pesosUsados ?? (pesos as unknown as Record<string, number>)} />
                          ) : (
                            <p className="text-apoyo text-muted">Esta evaluación no guardó desglose por componente.</p>
                          )}
                        </TD>
                      </TR>
                    )}
                  </Fragment>
                );
              })}
              {filtradas.length === 0 && (
                <TR>
                  <TD colSpan={5}>
                    <EmptyState icon={Award} titulo={evaluaciones.length === 0 ? 'Sin evaluaciones registradas' : 'Ninguna coincide con el filtro'} compacto>
                      {evaluaciones.length === 0
                        ? 'Crea la primera evaluación del mes con "Nueva evaluación".'
                        : 'Prueba con otro mes, tramo o nombre.'}
                    </EmptyState>
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
