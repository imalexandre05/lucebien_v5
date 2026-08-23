import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { accesoColaboradores } from '../../../lib/colaboradores-acceso';
import { tieneReauth } from '../../../lib/reauth';
import { listarColaboradores, obtenerColaborador } from '../../../lib/colaboradores-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { ReauthGate } from '../../../components/ui/reauth-gate';
import { BarraPeriodo } from '../../../components/colaboradores/barra-periodo';
import { CabeceraColaborador } from './cabecera';
import { NavSecciones } from './nav';

// El armazón que comparten todas las secciones de una persona: quién es, qué período se está
// mirando y a qué sección ir. Lo de abajo cambia; esto no.
//
// EL PERÍODO NO SE LEE ACÁ. Un layout de App Router no recibe searchParams —sólo params— así que
// BarraPeriodo lo lee del navegador con useSearchParams y reescribe la URL. Cada página sí lo lee
// del servidor, que es donde se necesita para consultar. Esa división evita el error de tener el
// período en dos lugares que se desincronizan.

export default async function ColaboradorLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.length) redirect('/reportes/nuevo');

  if (!(await tieneReauth(acceso.sesion.usuario.id))) {
    return (
      <div>
        <PageHeader title="Colaborador" subtitle="Verificación requerida" />
        <ReauthGate mensaje="Acá se ve la asistencia, la evaluación y el sueldo de una persona." />
      </div>
    );
  }

  const [persona, activos] = await Promise.all([obtenerColaborador(params.id), listarColaboradores()]);
  if (!persona) notFound();

  // Una persona dada de baja no está en la lista de activos, y su legajo se tiene que poder abrir
  // igual: el período que se está revisando puede ser anterior a la baja. Se agrega al selector
  // para que no quede seleccionado un valor que no existe entre las opciones.
  const personas = activos.some((p) => p.id === persona.id) ? activos : [persona, ...activos];

  return (
    <div className="space-y-4">
      <CabeceraColaborador persona={persona} personas={personas} />
      <BarraPeriodo fechaIngreso={persona.fechaIngreso} />
      <NavSecciones empleadoId={persona.id} visibles={acceso.secciones} />
      <div>{children}</div>
    </div>
  );
}
