import { Lock } from 'lucide-react';
import { listarAsistencias } from '../../lib/asistencias-repo';
import { listarEmpleados } from '../../lib/reportes-repo';
import { getSesion } from '../../lib/auth';
import { PageHeader } from '../../components/shell/page-header';
import { Card } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { AsistenciasCliente } from './cliente';

/**
 * La lista de asistencias de todo el equipo. Es una pantalla del administrador.
 *
 * POR QUÉ TIENE CANDADO PROPIO. La RLS de `asistencias` ya aísla bien —quien no es administrador
 * sólo ve sus propias filas, comprobado contra la base— así que esta pantalla nunca filtró datos
 * de nadie. Lo que hacía era peor de explicar que de arreglar: a un colaborador que llegaba
 * escribiendo la dirección le mostraba una pantalla de administración con todos los contadores en
 * cero, sin decirle por qué. Parecía el sistema roto.
 *
 * El aislamiento sigue viviendo en la base; esto es la puerta, que también tiene que existir.
 */
export default async function AsistenciasPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';

  if (!esAdmin) {
    return (
      <div>
        <PageHeader title="Asistencias" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta pantalla es del administrador">
            Reúne la asistencia de todo el equipo, y de ahí sale lo que se le paga a cada persona.
            Tu propia asistencia la ves en tu ficha.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const [asistencias, empleados] = await Promise.all([listarAsistencias(), listarEmpleados()]);

  return (
    <div>
      <PageHeader title="Asistencias" subtitle={`${asistencias.length} registros`} />
      <AsistenciasCliente asistencias={asistencias} empleados={empleados} esAdmin={esAdmin} />
    </div>
  );
}
