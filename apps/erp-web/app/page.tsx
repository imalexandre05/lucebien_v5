import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Shirt,
  ClipboardCheck,
  AlertTriangle,
  Trophy,
  LayoutGrid,
  LayoutDashboard,
  UserCheck,
  Wallet,
  Target,
  TrendingUp,
  Activity,
} from 'lucide-react';
import {
  ETAPAS_PIPELINE,
  coberturaTurno,
  ESTADO_COBERTURA_LABEL,
  type EstadoCobertura,
  minutosHastaCierre,
  puede,
  type MatrizPermisos,
} from '@scilb/core';
import { rankingHoy, movimientosRecientes } from '../lib/pipeline-repo';
import {
  prendasEnProceso,
  reportesDesde,
  reportesPorEvaluarPorSede,
  incidenciasDesde,
  asistenciaDelDia,
  actividadReciente,
  pagosPorCerrar,
  metasRecientes,
} from '../lib/dashboard-repo';
import {
  atrasoPorEtapa,
  luzMayorEsPeor,
  luzMenorEsPeor,
  peorLuz,
  umbralesDesdeConfig,
  ultimosDias,
  sumarDias,
} from '../lib/dashboard-semaforos';
import { getSesion } from '../lib/auth';
import { listarSedes } from '../lib/sedes-repo';
import { leerMatrizPermisos } from '../lib/permisos-repo';
import { leerConfigMap, CIERRE_TURNO_DEFAULT } from '../lib/config-repo';
import { hoyPeru, fechaLargaPeru, saludoPeru, tiempoRelativo } from '../lib/fechas';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table';
import { Badge, type Tone } from '../components/ui/badge';
import { CountUp } from '../components/ui/count-up';
import { EmptyState } from '../components/ui/empty-state';
import { BandaModulo } from '../components/ui/banda-modulo';
import { TarjetaLuz, PuntoLuz } from '../components/dashboard/semaforo';
import { Tendencia } from '../components/dashboard/tendencia';
import { cn } from '../lib/cn';

const ETAPA_LABEL: Record<string, string> = {
  recepcion: 'Recepción',
  codificacion: 'Codificación',
  lavado: 'Lavado',
  empatado: 'Empatado',
  vacio: 'Vacío',
  refaccion: 'Refacción',
  compostura: 'Compostura',
  planchado: 'Planchado',
  control_calidad: 'Calidad',
  listo: 'Listo',
};

// Cobertura de turnos: verde = cubierto, rojo = falta (no_enviado o sin_reportar), gris = todavía
// no vence.
const ESTADO_COBERTURA_TONE: Record<EstadoCobertura, Tone> = {
  cubierto: 'green',
  no_enviado: 'red',
  sin_reportar: 'red',
  en_curso: 'gray',
};

const ROLES_ADMIN = ['admin', 'dueno'];

const Titulo = ({ icon: Icon, children }: { icon: typeof Shirt; children: React.ReactNode }) => (
  <CardTitle className="flex items-center gap-2">
    <Icon className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden />
    {children}
  </CardTitle>
);

export default async function Dashboard() {
  // Landing directo operativo (Fase 4): un usuario sin permiso de 've' el dashboard entra
  // directo a su Reporte de Actividades, como el sistema viejo.
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

  // Dashboard de la sesión 8B: semáforos + gráficos, todo con consultas AGREGADAS (ver
  // lib/dashboard-repo.ts). Sin dinero, caja ni inventario (módulo comercial fuera de alcance).
  // Admin ve todo; un encargado sólo su(s) sede(s) y nada de pagos ni metas (la RLS ya se lo niega,
  // y acá ni se consulta).
  const sesion = sesionPrevia;
  const esAdmin = sesion ? ROLES_ADMIN.includes(sesion.usuario.rol) : false;
  const misSedes = esAdmin ? null : (sesion?.usuario.tiendas ?? []);
  const alcance = { sedes: misSedes };

  const hoy = hoyPeru();
  const ahora = new Date();
  const peru = new Date(Date.now() - 5 * 3600000);
  const diaSemanaHoy = peru.getUTCDay() || 7; // 1 = lunes … 7 = domingo, como los turnos del contrato
  const horaPeru = peru.toISOString().slice(11, 16);
  const dias = ultimosDias(hoy, 14);
  const desde14 = dias[0];

  const [actividad, pasadas, reportes, porEvaluarSede, incidencias, asistencia, movs, ranking, sedesTodas, config, pagos, metas] =
    await Promise.all([
      actividadReciente(alcance).catch(() => []),
      prendasEnProceso(hoy),
      reportesDesde(desde14, alcance),
      reportesPorEvaluarPorSede(alcance),
      incidenciasDesde(desde14, alcance),
      asistenciaDelDia(hoy, diaSemanaHoy, horaPeru),
      movimientosRecientes(14).catch(() => []),
      rankingHoy().catch(() => []),
      listarSedes().catch(() => []),
      leerConfigMap().catch(() => ({}) as Record<string, string>),
      esAdmin ? pagosPorCerrar(hoy) : Promise.resolve(null),
      esAdmin ? metasRecientes(sumarDias(hoy, -13)) : Promise.resolve(null),
    ]);

  const sedes = misSedes ? sedesTodas.filter((s) => misSedes.includes(s.cod)) : sedesTodas;
  const U = umbralesDesdeConfig(config);
  const primerNombre = sesion?.nombre.trim().split(/\s+/)[0] ?? '';

  // ── Prendas: atraso por etapa ──
  const atraso = atrasoPorEtapa(pasadas, U.atraso);
  const enPipeline = pasadas.length;
  const prendasRojas = [...atraso.values()].reduce((n, e) => n + e.rojo, 0);
  const prendasAmbar = [...atraso.values()].reduce((n, e) => n + e.ambar, 0);
  const luzPrendas = prendasRojas > 0 ? 'rojo' : prendasAmbar > 0 ? 'ambar' : 'verde';
  const maxEtapa = Math.max(1, ...ETAPAS_PIPELINE.map((e) => atraso.get(e)?.total ?? 0));

  // ── Reportes ──
  const porEvaluar = Object.values(porEvaluarSede).reduce((a, b) => a + b, 0);
  const enviadosHoy = reportes.filter((r) => r.fecha === hoy).length;
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
      porEvaluar: porEvaluarSede[s.cod] ?? 0,
    };
  });
  const faltanPorCubrir = cobertura.reduce(
    (n, c) => n + (c.m === 'en_curso' || c.m === 'cubierto' ? 0 : 1) + (c.t === 'en_curso' || c.t === 'cubierto' ? 0 : 1),
    0,
  );

  // ── Incidencias ──
  const incidenciasHoy = incidencias.filter((i) => i.fecha === hoy);

  // ── Asistencia ──
  const luzAsistencia = peorLuz([
    luzMayorEsPeor(asistencia.faltas, U.faltas),
    luzMayorEsPeor(asistencia.tardanzas, U.tardanzas),
  ]);
  const totalAsist = asistencia.presentes + asistencia.faltas + asistencia.sinDato;
  const hayEsperados = asistencia.esperados != null;

  // ── Tendencias de 14 días ──
  const movPorDia = new Map<string, number>();
  for (const m of movs) movPorDia.set(m.fecha, (movPorDia.get(m.fecha) ?? 0) + 1);
  const repPorDia = new Map<string, number>();
  for (const r of reportes) repPorDia.set(r.fecha, (repPorDia.get(r.fecha) ?? 0) + 1);
  const incPorDia = new Map<string, number>();
  for (const i of incidencias) incPorDia.set(i.fecha, (incPorDia.get(i.fecha) ?? 0) + 1);
  const serie = (m: Map<string, number>) => dias.map((fecha) => ({ fecha, valor: m.get(fecha) ?? 0 }));

  // ── Pagos y metas (sólo admin) ──
  const luzPagos = !pagos ? 'verde' : pagos.vencidos > 0 ? 'rojo' : pagos.proximos > 0 ? 'ambar' : 'verde';
  const metasTotal = metas ? metas.cumplidas + metas.noCumplidas : 0;
  const metasPct = metas && metasTotal > 0 ? Math.round((metas.cumplidas / metasTotal) * 100) : null;
  const luzMetas = metasPct == null ? 'verde' : luzMenorEsPeor(metasPct, U.metas);

  const saludo = `${saludoPeru(ahora)}${primerNombre ? `, ${primerNombre}` : ''}`;
  const sede = sesion?.usuario.sede ?? '';
  const nombreSede = sedesTodas.find((s) => s.cod === sede)?.nombre ?? sede;
  const subtituloBanda = !esAdmin && nombreSede ? `${fechaLargaPeru(ahora)} · Sede ${nombreSede}` : fechaLargaPeru(ahora);

  return (
    <div>
      <BandaModulo titulo={saludo} subtitulo={subtituloBanda} icono={LayoutDashboard} />

      {/* ── Semáforos del día: lo que hay que mirar primero. Cada tarjeta lleva al lugar donde se resuelve. ── */}
      <section aria-label="Semáforos del día" className="relative z-10 -mt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TarjetaLuz
            titulo="Prendas atrasadas"
            icono={Shirt}
            href="/pipeline"
            luz={luzPrendas}
            valor={<CountUp value={prendasRojas + prendasAmbar} />}
            detalle={
              prendasRojas + prendasAmbar === 0
                ? `Las ${enPipeline} prendas en proceso van al día`
                : `${prendasRojas} con ${U.atraso.rojo}+ días sin moverse · ${prendasAmbar} con ${U.atraso.ambar}+ días`
            }
          />
          <TarjetaLuz
            titulo="Reportes por evaluar"
            icono={ClipboardCheck}
            href="/evaluar-reportes"
            luz={luzMayorEsPeor(porEvaluar, U.evaluar)}
            valor={<CountUp value={porEvaluar} delayMs={60} />}
            detalle={`${enviadosHoy} enviado(s) hoy${faltanPorCubrir > 0 ? ` · faltan ${faltanPorCubrir} turno(s) por cubrir` : ''}`}
          />
          <TarjetaLuz
            titulo="Incidencias hoy"
            icono={AlertTriangle}
            href="/incidencias"
            luz={luzMayorEsPeor(incidenciasHoy.length, U.incidencias)}
            valor={<CountUp value={incidenciasHoy.length} delayMs={120} />}
            detalle={`${incidencias.length} en los últimos 14 días`}
          />
          <TarjetaLuz
            titulo="Asistencia de hoy"
            icono={UserCheck}
            href="/asistencias"
            luz={luzAsistencia}
            valor={
              <>
                <CountUp value={asistencia.presentes} delayMs={180} />
                <span className="ml-1.5 text-lg font-medium opacity-75">presentes</span>
              </>
            }
            detalle={
              hayEsperados
                ? `de ${asistencia.esperados} que debían venir · ${asistencia.tardanzas} con tardanza · ${asistencia.faltas} faltan`
                : `${asistencia.tardanzas} con tardanza · ${asistencia.faltas} falta(s)`
            }
          />
          {esAdmin && (
            <TarjetaLuz
              titulo="Pagos por cerrar"
              icono={Wallet}
              href="/pagos"
              luz={pagos ? luzPagos : 'verde'}
              valor={pagos ? <CountUp value={pagos.porCerrar} delayMs={240} /> : '—'}
              detalle={
                !pagos
                  ? 'No se pudo leer. Intenta recargar.'
                  : pagos.porCerrar === 0
                    ? 'Nada por cerrar esta semana'
                    : `${pagos.vencidos} con período vencido · ${pagos.proximos} esta semana`
              }
            />
          )}
          {esAdmin && (
            <TarjetaLuz
              titulo="Metas semanales"
              icono={Target}
              href="/personal"
              luz={luzMetas}
              valor={metasPct == null ? '—' : `${metasPct}%`}
              detalle={
                metasPct == null
                  ? 'Aún no hay metas cargadas en «Ventas y metas»'
                  : `${metas!.cumplidas} de ${metasTotal} semanas cumplieron la meta`
              }
            />
          )}
        </div>
      </section>

      {/* ── Pipeline: barras por etapa, con las prendas atrasadas marcadas en ámbar y rojo ── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2.5">
            Pipeline de lavandería
            <span className="rounded-r-pastilla bg-navy/5 px-2.5 py-0.5 tabular-nums text-dato font-semibold text-navy">
              {enPipeline} en proceso
            </span>
            <PuntoLuz luz={luzPrendas} />
          </CardTitle>
          <Link href="/pipeline" className="text-apoyo font-medium text-navy transition-colors duration-150 hover:text-gold">
            Abrir tablero →
          </Link>
        </CardHeader>
        <CardContent className="pt-1">
          {enPipeline === 0 ? (
            <EmptyState icon={Shirt} titulo="Sin prendas en el pipeline" compacto>
              Cuando el taller registre prendas verás aquí el flujo en vivo, etapa por etapa.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[680px]">
                <div className="flex items-stretch">
                  {ETAPAS_PIPELINE.map((e) => {
                    const d = atraso.get(e) ?? { total: 0, ambar: 0, rojo: 0 };
                    const alto = d.total === 0 ? 0 : Math.max(10, Math.round((d.total / maxEtapa) * 80));
                    const seg = (n: number) => (d.total ? (n / d.total) * 100 : 0);
                    return (
                      <Link
                        key={e}
                        href="/pipeline"
                        title={`${ETAPA_LABEL[e]}: ${d.total} prenda(s), ${d.ambar} en atención, ${d.rojo} atrasada(s)`}
                        aria-label={`${ETAPA_LABEL[e]}: ${d.total} prenda(s), ${d.rojo} atrasada(s)`}
                        className="anillo flex-1 rounded-t-lg px-1 pt-2 text-center transition-colors duration-150 hover:bg-navy/[0.04]"
                      >
                        <div className={cn('tabular-nums text-lg font-semibold', d.total === 0 ? 'text-muted/60' : 'text-navy')}>
                          {d.total}
                        </div>
                        <div className="mt-1.5 flex h-[80px] items-end justify-center">
                          {d.total > 0 && (
                            <div className="flex w-6 flex-col-reverse overflow-hidden rounded-t-[4px]" style={{ height: alto }}>
                              <div className="bg-navy" style={{ height: `${seg(d.total - d.ambar - d.rojo)}%` }} />
                              <div className="bg-aviso" style={{ height: `${seg(d.ambar)}%` }} />
                              <div className="bg-error" style={{ height: `${seg(d.rojo)}%` }} />
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
                <div className="h-0.5 rounded-r-pastilla bg-line/70" />
                <div className="flex" aria-hidden="true">
                  {ETAPAS_PIPELINE.map((e) => (
                    <div key={e} className="flex-1 px-0.5 pb-1 pt-2 text-center text-rotulo font-medium uppercase leading-tight text-muted">
                      {ETAPA_LABEL[e]}
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-micro text-muted">
                <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-navy" />Al día</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-aviso" />{U.atraso.ambar}+ días sin moverse</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-error" />{U.atraso.rojo}+ días sin moverse</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Tendencias de 14 días ── */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <Titulo icon={TrendingUp}>Prendas movidas por día</Titulo>
          </CardHeader>
          <CardContent>
            <Tendencia datos={serie(movPorDia)} etiquetaSerie="Prendas que cambiaron de etapa" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Titulo icon={ClipboardCheck}>Reportes enviados por día</Titulo>
          </CardHeader>
          <CardContent>
            <Tendencia datos={serie(repPorDia)} etiquetaSerie="Reportes de turno enviados" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Titulo icon={AlertTriangle}>Incidencias por día</Titulo>
          </CardHeader>
          <CardContent>
            <Tendencia datos={serie(incPorDia)} etiquetaSerie="Incidencias registradas" />
          </CardContent>
        </Card>
      </div>

      {/* ── Cobertura de turnos por tienda ── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden />
            Reportes de hoy por tienda
          </CardTitle>
          {faltanPorCubrir > 0 && <Badge tone="red">{faltanPorCubrir} por cubrir</Badge>}
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
                  <TH className="text-center">Por evaluar</TH>
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
                    <TD className="text-center">
                      <Link href="/evaluar-reportes" className="tabular-nums font-semibold text-navy hover:text-gold">
                        {c.porEvaluar}
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Asistencia de hoy + ranking ── */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Titulo icon={UserCheck}>Asistencia de hoy</Titulo>
            <PuntoLuz luz={luzAsistencia} />
          </CardHeader>
          <CardContent>
            {totalAsist === 0 ? (
              <EmptyState icon={UserCheck} titulo="Aún no hay asistencia registrada hoy" compacto>
                Aparece cuando el huellero o el encargado registran la entrada.
              </EmptyState>
            ) : (
              <>
                <div
                  className="flex h-3 overflow-hidden rounded-r-pastilla bg-paper"
                  role="img"
                  aria-label={`${asistencia.presentes} presentes, ${asistencia.faltas} faltas, ${asistencia.sinDato} sin dato`}
                >
                  <div className="bg-exito" style={{ width: `${(asistencia.presentes / totalAsist) * 100}%` }} />
                  <div className="bg-error" style={{ width: `${(asistencia.faltas / totalAsist) * 100}%` }} />
                  <div className="bg-line" style={{ width: `${(asistencia.sinDato / totalAsist) * 100}%` }} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-apoyo sm:grid-cols-4">
                  <div><dt className="text-muted">Presentes</dt><dd className="tabular-nums text-lg font-semibold text-exito-deep">{asistencia.presentes}</dd></div>
                  <div><dt className="text-muted">Tardanzas</dt><dd className="tabular-nums text-lg font-semibold text-aviso-deep">{asistencia.tardanzas}</dd></div>
                  <div><dt className="text-muted">{hayEsperados ? 'Faltan' : 'Faltas'}</dt><dd className="tabular-nums text-lg font-semibold text-error-deep">{asistencia.faltas}</dd></div>
                  <div><dt className="text-muted">Sin dato</dt><dd className="tabular-nums text-lg font-semibold text-muted">{asistencia.sinDato}</dd></div>
                </dl>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Titulo icon={Trophy}>Top operarios hoy</Titulo>
            <Link href="/pipeline" className="text-apoyo font-medium text-navy transition-colors duration-150 hover:text-gold">
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
                  <div key={r.nombre}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="w-6 shrink-0 tabular-nums text-micro text-muted">#{i + 1}</span>
                        <span className="truncate text-cuerpo text-ink">{r.nombre}</span>
                      </span>
                      <span className={cn('tabular-nums text-dato font-bold', i === 0 ? 'text-gold-deep' : 'text-navy')}>{r.total}</span>
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

      {/* ── Actividad reciente: sólo los últimos movimientos (consulta con límite) ── */}
      <Card className="mt-6">
        <CardHeader>
          <Titulo icon={Activity}>Actividad reciente</Titulo>
        </CardHeader>
        <CardContent className="px-0 pb-1">
          {actividad.length === 0 ? (
            <EmptyState icon={Activity} titulo="Aún no hay movimientos registrados" compacto>
              Los reportes, incidencias y avances de prendas aparecerán aquí.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line/70">
              {actividad.map((ev, i) => (
                <li key={i}>
                  <Link href={ev.href} className="flex items-center gap-3 px-5 py-3 outline-none transition-colors duration-150 hover:bg-navy/[0.03] focus-visible:bg-navy/[0.05]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-cuerpo text-ink">{ev.titulo}</span>
                      {ev.detalle && <span className="block truncate text-apoyo text-muted">{ev.detalle}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-micro text-muted">{tiempoRelativo(ev.ts, ahora)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
