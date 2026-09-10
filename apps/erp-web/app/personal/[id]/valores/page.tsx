import { notFound, redirect } from 'next/navigation';
import { HeartHandshake, Lock } from 'lucide-react';
import { VALORES } from '@scilb/core';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { obtenerColaborador } from '../../../../lib/colaboradores-repo';
import { miResumenValores, ValoresNoMigradoError } from '../../../../lib/valores-repo';
import { leerPeriodo } from '../../../../lib/periodo';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { EmptyState } from '../../../../components/ui/empty-state';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';

// Lo que el equipo puntuó de esta persona, en promedio.
//
// AISLAMIENTO 3, Y ACÁ SE VE POR QUÉ IMPORTA. Esta pantalla muestra el promedio y la nota /20, y
// NUNCA quién puso qué. La consulta de valores-repo trae el evaluador para poder promediar y no lo
// devuelve; acá tampoco se pide. Si alguien supiera quién lo puntuó bajo, el peer review dejaría de
// decir la verdad en una semana.
//
// No se muestra quién todavía no evaluó: eso es seguimiento del cumplimiento del equipo, vive en
// /valores y es otra pregunta.
export const dynamic = 'force-dynamic';

export default async function ValoresColaboradorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.includes('valores')) redirect(`/personal/${params.id}`);

  const esAdmin = acceso.sesion.usuario.rol === 'admin' || acceso.sesion.usuario.rol === 'dueno';
  const persona = await obtenerColaborador(params.id);
  if (!persona) notFound();

  // El puntaje que recibió otra persona es tan sensible como su nota. El permiso de sección ya lo
  // cubre; la comprobación explícita es la segunda capa, por si mañana alguien afloja la matriz.
  if (!esAdmin && acceso.sesion.usuario.id !== persona.id) {
    return (
      <div className="space-y-3">
        <SeccionHeader seccion="valores" />
        <Card>
          <EmptyState icon={Lock} titulo="Esto es de cada persona">
            El puntaje que recibe alguien en Valores 360° lo ve esa persona en Mi desempeño, y el
            administrador. Nadie más.
          </EmptyState>
        </Card>
      </div>
    );
  }

  // El peer review se guarda por MES ('YYYY-MM'), no por rango libre: el mes del período elegido es
  // la traducción honesta. Cuando el período cruza dos meses, manda el del cierre.
  const periodo = leerPeriodo(searchParams);
  const mes = periodo.hasta.slice(0, 7);

  let resumen;
  try {
    resumen = await miResumenValores(persona.id, mes);
  } catch (e) {
    if (e instanceof ValoresNoMigradoError) {
      return (
        <div className="space-y-3">
          <SeccionHeader seccion="valores" />
          <Card>
            <EmptyState icon={HeartHandshake} titulo="Falta aplicar la migración 0057">
              Valores 360° todavía no tiene sus tablas en esta base. El resto del módulo funciona
              igual.
            </EmptyState>
          </Card>
        </div>
      );
    }
    throw e;
  }

  const cruzaMeses = periodo.desde.slice(0, 7) !== mes;

  return (
    <div className="space-y-3">
      <SeccionHeader
        seccion="valores"
        nota={
          cruzaMeses
            ? `El peer review se guarda por mes, así que se muestra ${mes}, el mes en que cierra el período elegido.`
            : 'Se muestra el promedio recibido por valor. Quién puntuó qué no se guarda a la vista de nadie: sin anonimato el peer review deja de decir la verdad.'
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Promedio recibido · {mes}</CardTitle>
          <Badge tone={resumen.recibidas ? 'navy' : 'gray'}>
            {resumen.recibidas} {resumen.recibidas === 1 ? 'evaluación' : 'evaluaciones'}
          </Badge>
        </CardHeader>
        {resumen.recibidas === 0 || !resumen.promedios ? (
          <EmptyState icon={HeartHandshake} titulo="Todavía nadie la puntuó este mes" compacto>
            El equipo se evalúa entre sí desde Valores 360°. Hasta que haya al menos una evaluación,
            este componente de la nota queda sin dato.
          </EmptyState>
        ) : (
          <CardContent>
            <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {VALORES.map(({ key, label }) => {
                const v = resumen.promedios?.[key];
                const pct = v == null ? 0 : Math.max(0, Math.min(100, (v / 5) * 100));
                return (
                  <div key={key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-ink">{label}</span>
                      <span className="tabular-nums text-xs font-semibold text-navy">
                        {v == null ? '—' : `${v.toFixed(2)} / 5`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-r-pastilla bg-line/60">
                      <div
                        className="h-full origin-left animate-draw-x rounded-r-pastilla bg-navy motion-reduce:animate-none"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 flex items-baseline justify-between border-t border-line/60 pt-3">
              <span className="text-xs text-muted">
                Nota de Valores 360°, la que entra a la evaluación mensual
              </span>
              <span className="tabular-nums text-xl font-bold text-navy">
                {resumen.nota20 == null ? '—' : resumen.nota20.toFixed(2)}
                <span className="ml-0.5 text-xs font-normal text-muted">/20</span>
              </span>
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
