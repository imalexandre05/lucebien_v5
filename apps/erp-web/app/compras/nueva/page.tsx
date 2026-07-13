import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarProveedores } from '../../../lib/proveedores-repo';
import { listarMateriales } from '../../../lib/materiales-repo';
import { listarSedes } from '../../../lib/sedes-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { NuevaCompraForm } from './form';

export const dynamic = 'force-dynamic';

export default async function NuevaCompraPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const [proveedores, materiales, sedes] = await Promise.all([
    listarProveedores(true),
    listarMateriales(),
    listarSedes(),
  ]);

  return (
    <div>
      <PageHeader title="Nueva compra" subtitle="Registra la compra; el stock sube al marcarla como recibida" />
      <NuevaCompraForm
        proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre }))}
        materiales={materiales.map((m) => ({ id: m.id, nombre: m.nombre, sedeCod: m.sedeCod, unidad: m.unidad, costoPromedio: m.costoPromedio }))}
        sedes={sedes.map((s) => s.cod)}
        miSede={sesion.usuario.sede}
      />
    </div>
  );
}
