import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  Shirt,
  ClipboardCheck,
  ClipboardList,
  AlertTriangle,
  Trophy,
  Activity,
  LayoutGrid,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';
import {
  ETAPAS_PIPELINE,
  estadoReporte,
  estadoActividadReporte,
  ESTADO_ACTIVIDAD_LABEL,
  type EstadoActividad,
  coberturaTurno,
  ESTADO_COBERTURA_LABEL,
  type EstadoCobertura,
  minutosHastaCierre,
  TURNO_LABEL,
  puede,
  type MatrizPermisos,
} from '@scilb/core';
import { listarPasadas, rankingHoy } from '../lib/pipeline-repo';
import { listarReportes } from '../lib/reportes-repo';
import { listarIncidencias } from '../lib/incidencias-repo';
import { getSesion } from '../lib/auth';
import { listarSedes } from '../lib/sedes-repo';
import { leerMatrizPermisos } from '../lib/permisos-repo';
import { leerConfigMap, CIERRE_TURNO_DEFAULT } from '../lib/config-repo';
import { hoyPeru, fechaLargaPeru, saludoPeru, tiempoRelativo, fechaHoraCorta } from '../lib/fechas';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table';
import { Badge, type Tone } from '../components/ui/badge';
import { StatBox } from '../components/ui/stat-box';
import { CountUp } from '../components/ui/count-up';
import { EmptyState } from '../components/ui/empty-state';
import { BandaModulo } from '../components/ui/banda-modulo';
import { cn } from '../lib/cn';

const ETAPA_LABEL: Record<string, string> = {
  recepcion: 'Recepción',
  lavado: 'Lavado',
  empatado: 'Empatado',
  vacio: 'Vacío',
  refaccion: 'Refacción',
  compostura: 'Compostura',
  planchado: 'Planchado',
  control_calidad: 'Calidad',
  listo: 'Listo',
  enviado: 'Enviada',
  recibido: 'Recibida',
  dividido: 'Dividida',
};

// Segunda pasada visual: el tile pasa a la superficie/sombra teñida del acento del módulo
// (--acento, fase 5 -- en `/` es navy) en vez del blanco liso de antes.
const KPI_TONE = 'border-acento-line bg-acento-soft text-acento-deep shadow-elev-1';
// Semáforo (Fase 6 tarea 3): mismo tile, solo cambia de tono cuando el valor amerita atención.
const KPI_TONE_AMBER = 'border-aviso-line bg-aviso-soft text-aviso-deep shadow-elev-1';

// Badge de estado por color (Fase 6 tarea 1) — icono circular de la fila de "Actividad reciente"
// y Badge de texto comparten la misma paleta para que se lean como el mismo estado.
const ESTADO_ACTIVIDAD_TONE: Record<EstadoActividad, Tone> = {
  ok: 'green',
  por_evaluar: 'amber',
  no_enviado: 'red',
  sin_actividad: 'gray',
};
const ICONO_ESTADO_CLS: Record<EstadoActividad, string> = {
  ok: 'bg-exito/10 text-exito-deep',
  por_evaluar: 'bg-aviso/15 text-aviso-deep',
  no_enviado: 'bg-error/15 text-error-deep',
  sin_actividad: 'bg-ink/10 text-muted',
};
// Cobertura de turnos (tarea 2): verde = cubierto, rojo = falta (no_enviado o sin_reportar),
// gris = todavía no vence — mismo criterio "de un vistazo" que el resto del dashboard.
const ESTADO_COBERTURA_TONE: Record<EstadoCobertura, Tone> = {
  cubierto: 'green',
  no_enviado: 'red',
  sin_reportar: 'red',
  en_curso: 'gray',
};

type Evento = {
  kind: 'reporte' | 'incidencia' | 'pipeline';
  ts: string;
  icon: LucideIcon;
  titulo: ReactNode;
  detalle: string | null;
  href: string;
  // Solo kind === 'reporte' (tarea 1): badge de estado + % de cumplimiento cuando ya se evaluó.
  estado?: EstadoActividad;
  puntaje?: number | null;
};

export default async function Dashboard() {
  // Landing directo operativo (Fase 4): un usuario sin permiso de 've' el dashboard entra
  // directo a su Reporte de Actividades, como el sistema viejo — antes de disparar las
  // consultas pesadas del panel gerencial. Fallback seguro: si la matriz falla, no ve el
  // dashboard (solo admin/dueno pasan siempre, por el mecanismo de puede()).
  const sesionPrevia = await getSesion();
  let matriz: MatrizPermisos = {};
  if (sesionPrevia) {
    try {
      matriz = await leerMatrizPermisos();
    } catch {
      matriz = {};
    }
    if (!puede(matriz, sesionPrevia.usuario.rol, 'dashboard', 'ver', sesionPrevia.usuario.rolCod)) {
      redirect('/reportes/nuevo');
    }
  }

  // EL DASHBOARD YA NO MIRA DINERO (20-ago-2026, decisión de Alexander).
  //
  // Pedidos, caja, cobros pendientes y garantías salieron del panel junto con todo el módulo
  // comercial: lo va a manejar otro programador en un sistema aparte. Con eso se van también las
  // cuatro consultas que sólo los alimentaban — `pedidosRepo.listar()` traía TODOS los pedidos con
  // sus líneas y era, de lejos, la más cara de esta pantalla.
  const [sesion, pasadas, reportes, incidencias, ranking, sedes, config] = await Promise.all([
    getSesion(),
    listarPasadas(),
    listarReportes(),
    listarIncidencias(),
    rankingHoy(),
    listarSedes().catch(() => []),
    leerConfigMap().catch(() => ({}) as Record<string, string>),
  ]);
  const SEDE_NOMBRE = Object.fromEntries(sedes.map((s) => [s.cod, s.nombre]));

  const hoy = hoyPeru();
  const ahora = new Date();
  const primerNombre = sesion?.nombre.trim().split(/\s+/)[0] ?? '';
  const sede = sesion?.usuario.sede ?? '';

  // KPIs del día (§4A del brief): pipeline, evaluación, caja, incidencias.
  const etapas = ETAPAS_PIPELINE as readonly string[];
  const enPipeline = pasadas.filter((p) => etapas.includes(p.etapa)).length;
  const ingresaronHoy = pasadas.filter((p) => p.fechaIngreso === hoy).length;
  const porEvaluar = reportes.filter((r) => estadoReporte(r) === 'pendiente').length;
  const enviadosHoy = reportes.filter((r) => r.fecha === hoy).length;
  const incidenciasHoy = incidencias.filter((i) => i.fecha === hoy).length;
  const incidenciasMes = incidencias.filter((i) => i.fecha.startsWith(hoy.slice(0, 7))).length;

  // Cobertura de turnos de hoy (§tarea 2): matriz sede × turno lógico (M/T) — un reporte 'C'
  // cubre ambos. Mismas horas de cierre que /reportes/nuevo (config con default compartido).
  const cierres = {
    M: config.turno_m_cierre || CIERRE_TURNO_DEFAULT.M,
    T: config.turno_t_cierre || CIERRE_TURNO_DEFAULT.T,
  };
  const reportesHoy = reportes.filter((r) => r.fecha === hoy);
  const cobertura = sedes.map((s) => {
    const deLaSede = reportesHoy.filter((r) => r.sedeCod === s.cod);
    return {
      sedeCod: s.cod,
      sedeNombre: s.nombre || s.cod,
      m: coberturaTurno('M', deLaSede, minutosHastaCierre(ahora, cierres.M)),
      t: coberturaTurno('T', deLaSede, minutosHastaCierre(ahora, cierres.T)),
    };
  });
  const faltanPorCubrir = cobertura.reduce(
    (n, c) => n + (c.m === 'en_curso' || c.m === 'cubierto' ? 0 : 1) + (c.t === 'en_curso' || c.t === 'cubierto' ? 0 : 1),
    0,
  );


  // Distribución del pipeline por etapa (flujo de 9 pasos).
  const porEtapa = new Map<string, number>();
  for (const p of pasadas) porEtapa.set(p.etapa, (porEtapa.get(p.etapa) ?? 0) + 1);
  const maxEtapa = Math.max(1, ...ETAPAS_PIPELINE.map((e) => porEtapa.get(e) ?? 0));
  const totalFlujo = ETAPAS_PIPELINE.reduce((s, e) => s + (porEtapa.get(e) ?? 0), 0);

  // Actividad reciente: reportes + incidencias + movimientos de prendas, mezclados por fecha.
  // Los reportes (tarea 1) llevan además estado (color) y puntaje — es la fuente correcta
  // introducida en la Fase 4 (estadoEnvio tri-estado), no el chip uniforme de antes.
  const eventos: Evento[] = [
    ...reportes.slice(0, 12).map((r) => {
      const estado = estadoActividadReporte(r);
      return {
        kind: 'reporte' as const,
        ts: r.createdAt,
        icon: ClipboardList,
        titulo: (
          <>
            Reporte de Actividades · {r.sedeCod} · {TURNO_LABEL[r.turno] ?? r.turno}
          </>
        ),
        detalle: r.encargadoNombre ? `Encargado: ${r.encargadoNombre}` : null,
        href: `/reportes/${r.id}`,
        estado,
        puntaje: r.evaluado ? (r.puntajeEval ?? r.puntaje) : null,
      };
    }),
    ...incidencias.slice(0, 12).map((i) => ({
      kind: 'incidencia' as const,
      ts: i.createdAt,
      icon: AlertTriangle,
      titulo: (
        <>
          {i.tipo} · {i.sedeCod}
        </>
      ),
      detalle: i.responsableNombre ?? i.descripcion,
      href: '/incidencias',
    })),
    ...pasadas
      .filter((p) => p.fechaActualizado)
      .slice(0, 12)
      .map((p) => ({
        kind: 'pipeline' as const,
        ts: p.fechaActualizado as string,
        icon: Shirt,
        titulo: (
          <>
            <span className="tabular-nums">{p.codigo}</span> → {ETAPA_LABEL[p.etapa] ?? p.etapa}
          </>
        ),
        detalle: p.tipo || null,
        href: '/pipeline',
      })),
  ]
    .filter((e) => e.ts)
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 8);

  // BandaModulo (arquetipo A, spec §5): el saludo y la fecha ya decían todo lo que el
  // recuadro-espejo del día repetía como adorno — se cae sin perder dato. La sede se suma al
  // final del subtítulo en vez de vivir en un chip aparte.
  const saludo = `${saludoPeru(ahora)}${primerNombre ? `, ${primerNombre}` : ''}`;
  const subtituloBanda = sede
    ? `${fechaLargaPeru(ahora)} · Sede ${SEDE_NOMBRE[sede] ?? sede}`
    : fechaLargaPeru(ahora);

  return (
    <div>
      <BandaModulo titulo={saludo} subtitulo={subtituloBanda} icono={LayoutDashboard} />

      {/* ── KPIs del día: los tiles se montan sobre el borde inferior de la banda (spec §3.10). ── */}
      <section aria-label="Indicadores del día" className="relative z-10 -mt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatBox
            index={0}
            size="xl"
            align="left"
            icon={Shirt}
            href="/pipeline"
            tone={KPI_TONE}
            label="Prendas en pipeline"
            valor={<CountUp value={enPipeline} />}
            sub={ingresaronHoy > 0 ? `+${ingresaronHoy} ingresaron hoy` : 'en las 9 etapas del taller'}
          />
          <StatBox
            index={1}
            size="xl"
            align="left"
            icon={ClipboardCheck}
            href="/evaluar-reportes"
            tone={porEvaluar > 0 ? KPI_TONE_AMBER : KPI_TONE}
            label="Reportes por evaluar"
            valor={<CountUp value={porEvaluar} delayMs={60} />}
            sub={`${enviadosHoy} enviado(s) hoy`}
          />
          <StatBox
            index={3}
            size="xl"
            align="left"
            icon={AlertTriangle}
            href="/incidencias"
            tone={incidenciasHoy > 0 ? KPI_TONE_AMBER : KPI_TONE}
            label="Incidencias hoy"
            valor={<CountUp value={incidenciasHoy} delayMs={180} />}
            sub={`${incidenciasMes} en el mes`}
          />
        </div>
      </section>

      {/* ── Pipeline vivo: flujo de las 9 etapas ── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            Pipeline de lavandería
            <span className="rounded-r-pastilla bg-navy/5 px-2.5 py-0.5 tabular-nums text-xs font-semibold text-navy">
              {totalFlujo} en proceso
            </span>
          </CardTitle>
          <Link
            href="/pipeline"
            className="text-xs font-medium text-navy transition-colors duration-150 hover:text-gold"
          >
            Abrir tablero →
          </Link>
        </CardHeader>
        <CardContent className="pt-1">
          {totalFlujo === 0 ? (
            <EmptyState icon={Shirt} titulo="Sin prendas en el pipeline" compacto>
              Cuando el taller registre prendas verás aquí el flujo en vivo, etapa por etapa.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[680px]">
                <div className="flex items-stretch">
                  {ETAPAS_PIPELINE.map((e, i) => {
                    const n = porEtapa.get(e) ?? 0;
                    const esListo = e === 'listo';
                    const alto = n === 0 ? 0 : Math.max(10, Math.round((n / maxEtapa) * 72));
                    return (
                      <Link
                        key={e}
                        href="/pipeline"
                        title={`${n} prenda(s) en ${ETAPA_LABEL[e]}`}
                        aria-label={`${ETAPA_LABEL[e]}: ${n} prenda(s)`}
                        className="anillo group flex-1 rounded-t-lg px-1 pt-2 text-center transition-colors duration-150 hover:bg-navy/[0.04]"
                      >
                        <div
                          className={cn(
                            'animate-rise tabular-nums text-lg font-semibold',
                            n === 0 ? 'text-muted/60' : esListo ? 'text-gold-deep' : 'text-navy',
                          )}
                          style={{ animationDelay: `${i * 45}ms` }}
                        >
                          {n}
                        </div>
                        <div className="mt-1.5 flex h-[72px] items-end justify-center">
                          {n > 0 && (
                            <div
                              className={cn(
                                'w-6 origin-bottom animate-grow-y rounded-t-[4px]',
                                esListo ? 'bg-gold' : 'bg-navy',
                              )}
                              style={{ height: alto, animationDelay: `${i * 45}ms` }}
                            />
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
                {/* El hilo del atelier: riel que se enhebra bajo el flujo al montar. */}
                <div className="h-0.5 overflow-hidden rounded-r-pastilla bg-line/70">
                  <div className="h-full origin-left animate-draw-x bg-gradient-to-r from-gold via-gold/80 to-gold/40" />
                </div>
                <div className="flex" aria-hidden="true">
                  {ETAPAS_PIPELINE.map((e) => (
                    <div
                      key={e}
                      className="flex-1 px-0.5 pb-1 pt-2 text-center text-[10px] font-medium uppercase leading-tight tracking-wide text-muted"
                    >
                      {ETAPA_LABEL[e]}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Cobertura de turnos: matriz sede × turno de hoy (tarea 2) — "qué falta hoy" de un
          vistazo. Va ANTES de la actividad reciente a propósito (el brief pide "encima"). ── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden />
            Cobertura de turnos hoy
          </CardTitle>
          {faltanPorCubrir > 0 && (
            <Badge tone="red">{faltanPorCubrir} por cubrir</Badge>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 pb-3">
          {cobertura.length === 0 ? (
            <EmptyState icon={LayoutGrid} titulo="Sin sedes configuradas" compacto>
              Crea sedes en Configuración para ver la cobertura de turnos.
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Sede</TH>
                  <TH className="text-center">Mañana</TH>
                  <TH className="text-center">Tarde</TH>
                </TR>
              </THead>
              <TBody>
                {cobertura.map((c) => (
                  <TR key={c.sedeCod}>
                    <TD className="pl-5 font-medium text-navy">{c.sedeNombre}</TD>
                    <TD className="text-center">
                      <Badge tone={ESTADO_COBERTURA_TONE[c.m]}>{ESTADO_COBERTURA_LABEL[c.m]}</Badge>
                    </TD>
                    <TD className="text-center">
                      <Badge tone={ESTADO_COBERTURA_TONE[c.t]}>{ESTADO_COBERTURA_LABEL[c.t]}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Actividad reciente + ranking del día ── */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden />
              Actividad reciente
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-1">
            {eventos.length === 0 ? (
              <EmptyState icon={Activity} titulo="Aún no hay movimientos registrados" compacto>
                Los reportes, incidencias y avances de prendas aparecerán aquí.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line/70">
                {eventos.map((ev, i) => {
                  const Icon = ev.icon;
                  const esReporte = ev.kind === 'reporte';
                  const chipCls = esReporte && ev.estado ? ICONO_ESTADO_CLS[ev.estado] : 'bg-navy/5 text-navy';
                  return (
                    <li key={i} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                      <Link
                        href={ev.href}
                        className="group flex items-center gap-3 px-5 py-3 outline-none transition-colors duration-150 hover:bg-navy/[0.03] focus-visible:bg-navy/[0.05]"
                      >
                        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-r-pastilla', chipCls)}>
                          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm text-ink">{ev.titulo}</span>
                            {esReporte && ev.estado && (
                              <Badge tone={ESTADO_ACTIVIDAD_TONE[ev.estado]}>{ESTADO_ACTIVIDAD_LABEL[ev.estado]}</Badge>
                            )}
                            {esReporte && ev.puntaje != null && <PuntajePill puntaje={ev.puntaje} />}
                          </span>
                          {ev.detalle && <span className="block truncate text-xs text-muted">{ev.detalle}</span>}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block tabular-nums text-[11px] text-muted">{tiempoRelativo(ev.ts, ahora)}</span>
                          {/* Fecha absoluta (tarea 1): "hace 3 h" no dice CUÁNDO fue — solo en reportes. */}
                          {esReporte && (
                            <span className="block tabular-nums text-[10px] text-muted/70">{fechaHoraCorta(ev.ts)}</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden />
              Top operarios hoy
            </CardTitle>
            <Link
              href="/pipeline"
              className="text-xs font-medium text-navy transition-colors duration-150 hover:text-gold"
            >
              Tablero →
            </Link>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {ranking.length === 0 ? (
              <EmptyState icon={Trophy} titulo="Aún no hay puntos hoy" compacto>
                Cada avance de prenda suma puntos al operario.
              </EmptyState>
            ) : (
              ranking.slice(0, 6).map((r, i) => {
                const maxPts = Math.max(1, ranking[0]?.total ?? 1);
                return (
                  <div key={r.nombre} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="w-6 shrink-0 tabular-nums text-[11px] text-muted">#{i + 1}</span>
                        <span className="truncate text-sm text-ink">{r.nombre}</span>
                      </span>
                      <span
                        className={cn(
                          'tabular-nums text-sm font-bold',
                          i === 0 ? 'text-gold-deep' : 'text-navy',
                        )}
                      >
                        {r.total}
                      </span>
                    </div>
                    <div className="ml-8 mt-1.5 h-1.5 overflow-hidden rounded-r-pastilla bg-paper">
                      <div
                        className={cn('h-full rounded-r-pastilla', i === 0 ? 'bg-gold' : 'bg-navy')}
                        style={{ width: `${Math.round((r.total / maxPts) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

// Puntaje de un reporte evaluado, como pastilla compacta (tarea 1: "% de cumplimiento cuando
// exista"). Mismos umbrales que Puntaje en app/reportes/lista.tsx para leerse igual en todo
// el ERP: ≥85 verde, ≥60 dorado, el resto rojo.
function PuntajePill({ puntaje }: { puntaje: number }) {
  const cls =
    puntaje >= 85
      ? 'bg-exito/10 text-exito-deep'
      : puntaje >= 60
        ? 'bg-gold/20 text-gold-deep'
        : 'bg-error/15 text-error-deep';
  return (
    <span className={cn('rounded-r-pastilla px-2 py-0.5 tabular-nums text-[10px] font-bold', cls)}>
      {puntaje}%
    </span>
  );
}
