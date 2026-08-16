import { CalendarCheck, Lock } from 'lucide-react';
import { getSesion } from '../../../lib/auth';
import { listarAcuerdos } from '../../../lib/sueldos-repo';
import { listarAsistenciasPeriodo } from '../../../lib/asistencias-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { AsistenciaCliente } from './cliente';

/**
 * Declaración de asistencia — paso 6 de la spec de sueldos §9. Resuelve el bloqueante B-02.
 *
 * POR QUÉ ES UNA PANTALLA APARTE de `/asistencias`. Esa lista registros sueltos, uno por uno, y
 * sirve para consultar. Esta trabaja sobre **el periodo de un contrato completo** y muestra los
 * días que faltan declarar, que es lo único que impide liquidar: `sueldo_entrada` corta nombrando
 * las fechas que quedaron en `'sin_dato'`.
 *
 * Un día sin declarar no es una falta. Confundirlos cuesta dos días de sueldo por día, así que la
 * pantalla los muestra distinto y no elige por nadie.
 */
export const dynamic = 'force-dynamic';

export default async function AsistenciaSueldosPage({
  searchParams,
}: {
  searchParams: { acuerdo?: string };
}) {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';

  if (!esAdmin) {
    return (
      <div>
        <PageHeader title="Declarar asistencia" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta pantalla es del administrador">
            Declarar qué pasó cada día cambia lo que se le paga a una persona. Hoy sólo lo hace el
            administrador o el dueño.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const acuerdos = (await listarAcuerdos()).filter((a) => a.estado !== 'liquidado');

  if (acuerdos.length === 0) {
    return (
      <div>
        <PageHeader title="Declarar asistencia" />
        <Card>
          <EmptyState icon={CalendarCheck} titulo="No hay ningún contrato abierto">
            La asistencia se declara sobre el periodo de un contrato. Primero hay que pactar uno en
            Contratos.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const elegido = acuerdos.find((a) => a.id === searchParams.acuerdo) ?? acuerdos[0];
  const filas = await listarAsistenciasPeriodo(elegido.empleadoId, elegido.fechaInicio, elegido.fechaFin);

  return (
    <div>
      <PageHeader
        title="Declarar asistencia"
        subtitle="Qué pasó cada día del periodo. Un día sin declarar no es una falta: es un dato que falta, y frena la liquidación."
      />
      <AsistenciaCliente acuerdos={acuerdos} acuerdo={elegido} filas={filas} />
    </div>
  );
}
