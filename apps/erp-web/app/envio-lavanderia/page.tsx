import { redirect } from 'next/navigation';
import { getSesion } from '../../lib/auth';
import { listarEmpleados } from '../../lib/reportes-repo';
import { listarListasLavanderia } from '../../lib/lavanderia-repo';
import { PageHeader } from '../../components/shell/page-header';
import { equipoCompartido } from '../../lib/pipeline-operador';
import { EnvioLavanderiaCliente } from './cliente';

// Módulo "Envío a Lavandería" (puerto de routes/lavanderia.js del sistema viejo): lo usan las
// tiendas para mandar ternos sucios (revisados uno por uno) y lotes de accesorios a granel al
// pipeline de lavado (Fase 11 no cubierta del plan de 13 fases — schema ya existía en 0005/0006,
// solo faltaban RPC y UI). Visible solo en sedes de perfil 'pos' — filtrado en el sidebar.
export default async function EnvioLavanderiaPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const [empleados, listas, compartido] = await Promise.all([
    listarEmpleados(),
    listarListasLavanderia(),
    equipoCompartido(),
  ]);

  return (
    <div>
      <PageHeader
        title="Envío a Lavandería"
        subtitle="Manda ternos sucios y accesorios al pipeline de lavado — solo tienda"
      />
      <EnvioLavanderiaCliente sede={sesion.usuario.sede} empleados={empleados} listasIniciales={listas} compartido={compartido} />
    </div>
  );
}
