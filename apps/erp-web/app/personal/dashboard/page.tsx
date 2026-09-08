import { redirect } from 'next/navigation';
import { calcularCiclo, notaDesdePuntos, BANDA_LABEL, ROL_LABEL, type BandaEval, type Rol } from '@scilb/core';
import { getSesion } from '../../../lib/auth';
import { listarColaboradores } from '../../../lib/colaboradores-repo';
import { componentesEvaluacion, leerEscalaPuntos } from '../../../lib/evaluaciones-repo';
import { hoyPeru } from '../../../lib/fechas';
import { tieneReauth } from '../../../lib/reauth';
import { PageHeader } from '../../../components/shell/page-header';
import { ReauthGate } from '../../../components/ui/reauth-gate';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge, type Tone } from '../../../components/ui/badge';

// F-2 de la hoja de ruta del 25-ago (docs/superpowers/specs/2026-08-25-reunion-admin-hoja-de-ruta.md):
// spec completa en docs/superpowers/specs/evaluaciones/2026-09-08-dashboard-personal-design.md.
//
// Contesta una pregunta distinta de /personal (que ya muestra la nota y un hilo de pendientes por
// persona): de dónde sale esa nota y quién flaquea en qué, para poder comparar al equipo. Sólo
// lectura — ningún botón, ninguna escritura.

const BANDA_TONE: Record<BandaEval, Tone> = {
  riesgo: 'red',
  en_desarrollo: 'amber',
  ideal: 'green',
  sobresaliente: 'gold',
};

type Fila = {
  id: string;
  nombre: string;
  rol: string;
  sedeCod: string | null;
  pipeline: number;
  actividades: number;
  ventas: number;
  extras: number;
  descuento: number;
  nota: number | null;
  banda: BandaEval | null;
  sinActividad: boolean;
  error: boolean;
};

export default async function DashboardPersonalPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/personal');

  if (!(await tieneReauth(sesion.usuario.id))) {
    return (
      <div>
        <PageHeader title="Dashboard de personal" subtitle="Verificación requerida" />
        <ReauthGate mensaje="Este dashboard cruza la nota y el desglose de puntos de todo el equipo." />
      </div>
    );
  }

  const hoy = hoyPeru();
  const [colaboradores, escala] = await Promise.all([listarColaboradores(false), leerEscalaPuntos()]);

  const filas: Fila[] = await Promise.all(
    colaboradores.map(async (c): Promise<Fila> => {
      const ciclo = calcularCiclo(c.fechaIngreso, hoy);
      try {
        const comp = await componentesEvaluacion(c.id, ciclo.desde, ciclo.hasta);
        const puntosTotal = comp.puntosTotal ?? 0;
        const pipeline = comp.puntosPipeline ?? 0;
        const actividades = comp.puntosActividades ?? 0;
        const ventas = comp.puntosVentas ?? 0;
        const extras = comp.extrasPuntos ?? 0;
        const descuento = comp.descuento ?? 0;
        const sinActividad = pipeline === 0 && actividades === 0 && ventas === 0 && extras === 0 && descuento === 0;
        const { nota, banda } = notaDesdePuntos(puntosTotal, escala);
        return {
          id: c.id,
          nombre: c.nombre,
          rol: c.rol,
          sedeCod: c.sedeCod,
          pipeline,
          actividades,
          ventas,
          extras,
          descuento,
          nota,
          banda,
          sinActividad,
          error: false,
        };
      } catch {
        // notaDesdePuntos lanza si la escala de config está rota (packages/core/src/
        // evaluaciones.ts) — un dato de config inválido no debe esconder la nota de las demás 17.
        return {
          id: c.id,
          nombre: c.nombre,
          rol: c.rol,
          sedeCod: c.sedeCod,
          pipeline: 0,
          actividades: 0,
          ventas: 0,
          extras: 0,
          descuento: 0,
          nota: null,
          banda: null,
          sinActividad: false,
          error: true,
        };
      }
    }),
  );

  // Peor primero: es la pregunta operativa real (spec §3) — a quién mirar hoy.
  filas.sort((a, b) => (a.nota ?? -Infinity) - (b.nota ?? -Infinity));

  return (
    <div>
      <PageHeader
        title="Dashboard de personal"
        subtitle={`${filas.length} activos · de dónde sale la nota de cada uno, y quién flaquea en qué`}
      />

      <Table>
        <THead>
          <TR>
            <TH className="pl-5">Persona</TH>
            <TH className="text-right">Pipeline</TH>
            <TH className="text-right">Actividades</TH>
            <TH className="text-right">Ventas</TH>
            <TH className="text-right">Extras</TH>
            <TH className="text-right">Descuento</TH>
            <TH className="pr-5 text-right">Nota</TH>
          </TR>
        </THead>
        <TBody>
          {filas.map((f) => (
            <TR key={f.id}>
              <TD className="pl-5">
                <div className="font-medium text-ink">{f.nombre}</div>
                <div className="text-xs text-muted">
                  {ROL_LABEL[f.rol as Rol] ?? f.rol}
                  {f.sedeCod ? ` · ${f.sedeCod}` : ''}
                </div>
              </TD>
              <TD className="text-right tabular-nums">{f.pipeline.toFixed(1)}</TD>
              <TD className="text-right tabular-nums">{f.actividades.toFixed(1)}</TD>
              <TD className="text-right tabular-nums">{f.ventas.toFixed(1)}</TD>
              <TD className="text-right tabular-nums">{f.extras.toFixed(1)}</TD>
              <TD className="text-right tabular-nums">{f.descuento ? `−${f.descuento.toFixed(1)}` : '0.0'}</TD>
              <TD className="pr-5 text-right">
                {f.error ? (
                  <Badge tone="gray">No se pudo calcular</Badge>
                ) : f.sinActividad ? (
                  <span className="text-xs text-muted">Sin actividad este período</span>
                ) : (
                  <Badge tone={BANDA_TONE[f.banda as BandaEval]}>
                    {f.nota!.toFixed(2)} · {BANDA_LABEL[f.banda as BandaEval]}
                  </Badge>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <p className="mt-4 text-xs text-muted">
        La escala de puntos sigue con los valores de ejemplo del administrador, sin calibrar contra
        la operación real (ver docs/pendientes-negocio.md) — la nota de acá no es todavía un juicio
        sobre nadie, es el desglose de dónde viene.
      </p>
    </div>
  );
}
