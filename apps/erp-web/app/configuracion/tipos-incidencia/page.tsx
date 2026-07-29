import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarTiposIncidenciaAdmin } from '../../../lib/incidencias-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { TiposIncidenciaCliente } from './cliente';

// Catálogo de tipos de incidencia (Fase 13 tarea 2): la tabla incidencia_tipos existe desde la
// migración 0024 con RLS de escritura para admin/dueño, pero hasta ahora no había ninguna UI para
// crearlos o editarlos — solo se leían (ver listarTiposIncidencia() en incidencias-repo.ts, usado
// por el selector del formulario de /incidencias). Mismo patrón que /configuracion/tipos-producto
// (Fase 7): solo admin/dueño, catálogo editable con activar/desactivar en vez de borrado forzoso.
export default async function TiposIncidenciaPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const tipos = await listarTiposIncidenciaAdmin();

  return (
    <div>
      <PageHeader title="Tipos de incidencia" subtitle="Catálogo de tipos, categoría, gravedad y puntos de penalidad por defecto" />
      <TiposIncidenciaCliente tipos={tipos} />
    </div>
  );
}
