import { redirect } from 'next/navigation';
import { categoriasMaterial, unidadesMaterial } from '@scilb/adapter-lucebien';
import { stockBajo } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { listarMateriales } from '../../lib/materiales-repo';
import { listarSedes } from '../../lib/sedes-repo';
import { PageHeader } from '../../components/shell/page-header';
import { MaterialesCliente } from './cliente';

export const dynamic = 'force-dynamic';

export default async function MaterialesPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const [materiales, sedes] = await Promise.all([listarMateriales(), listarSedes()]);
  const bajos = materiales.filter(stockBajo).length;

  return (
    <div>
      <PageHeader
        title="Materiales"
        subtitle={`${materiales.length} insumos${bajos ? ` · ${bajos} bajo mínimo` : ''}`}
      />
      <MaterialesCliente
        materiales={materiales}
        sedes={sedes.map((s) => s.cod)}
        miSede={sesion.usuario.sede}
        categorias={[...categoriasMaterial]}
        unidades={[...unidadesMaterial]}
      />
    </div>
  );
}
