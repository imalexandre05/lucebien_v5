import { listarEnviosAccesorios, tiposAccesorioUsados } from '../../../lib/accesorios-repo';
import { listarSedes } from '../../../lib/sedes-repo';
import { getSesion } from '../../../lib/auth';
import { equipoCompartido } from '../../../lib/pipeline-operador';
import { PageHeader } from '../../../components/shell/page-header';
import { AccesoriosCliente } from './cliente';

// Accesorios a granel: el almacén remite por cantidades y la tienda valida el envío completo.
export default async function AccesoriosPage() {
  const [envios, tipos, sedes, sesion, compartido] = await Promise.all([
    listarEnviosAccesorios(),
    tiposAccesorioUsados(),
    listarSedes().catch(() => []),
    getSesion(),
    equipoCompartido(),
  ]);
  const tiendas = sedes.filter((s) => s.perfil !== 'almacen').map((s) => s.cod);
  return (
    <div>
      <PageHeader
        title="Accesorios"
        subtitle="Remesas de accesorios del almacén a tienda; la tienda valida el envío completo"
      />
      <AccesoriosCliente
        envios={envios}
        tipos={tipos}
        tiendas={tiendas.length ? tiendas : ['LB', 'ST', 'TR']}
        miSede={sesion?.usuario.sede ?? ''}
        compartido={compartido}
      />
    </div>
  );
}
