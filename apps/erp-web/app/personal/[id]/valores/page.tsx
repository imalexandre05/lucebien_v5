import { notFound, redirect } from 'next/navigation';
import { HeartHandshake, Lock } from 'lucide-react';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { obtenerColaborador } from '../../../../lib/colaboradores-repo';
import { miResumenValores, ValoresNoMigradoError } from '../../../../lib/valores-repo';
import { leerPeriodo } from '../../../../lib/periodo';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { ResultadoValores } from '../../../../components/valores/resultado-valores';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';

// Lo que el equipo puntuó de esta persona, en promedio.
//
// AISLAMIENTO 3, Y ACÁ SE VE POR QUÉ IMPORTA. Esta pantalla muestra el promedio y la nota /20, y
// NUNCA quién puso qué: sólo el administrador puede leer esas filas (0116), y aun él las ve
// promediadas acá. Si alguien supiera quién lo puntuó bajo, el peer review dejaría de
// decir la verdad en una semana.
//
// No se muestra quién todavía no evaluó: eso es seguimiento del cumplimiento del equipo, vive en
// /valores y es otra pregunta.
export const dynamic = 'force-dynamic';

export default async function ValoresColaboradorPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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

      <ResultadoValores resumen={resumen} mes={mes} titulo="Promedio recibido" />
    </div>
  );
}
