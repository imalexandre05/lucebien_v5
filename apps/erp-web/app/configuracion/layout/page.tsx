import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarSedes } from '../../../lib/sedes-repo';
import { listarLayoutZonas } from '../../../lib/reportes-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { LayoutEditor } from './editor';

// Editor de layout (el del jefe en el viejo): mover/crear zonas de limpieza con su peso,
// turno y forma, por sede. Guardado atómico (RPC). Solo admin.
export default async function LayoutEditorPage(props: { searchParams: Promise<{ sede?: string }> }) {
  const searchParams = await props.searchParams;
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const sedes = await listarSedes();
  const sede = searchParams.sede && sedes.some((s) => s.cod === searchParams.sede)
    ? searchParams.sede
    : sedes[0]?.cod ?? 'LB';
  const zonas = await listarLayoutZonas(sede);

  return (
    <div>
      <PageHeader
        title={`Layout — ${sedes.find((s) => s.cod === sede)?.nombre ?? sede}`}
        subtitle="Arrastra las zonas, ajusta pesos y guarda. Clic en una zona para editarla."
      />
      <LayoutEditor key={sede} sede={sede} sedes={sedes} zonasIniciales={zonas} />
    </div>
  );
}
