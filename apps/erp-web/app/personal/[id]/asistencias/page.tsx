import { notFound, redirect } from 'next/navigation';
import { CalendarCheck, Lock } from 'lucide-react';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { obtenerColaborador } from '../../../../lib/colaboradores-repo';
import { listarAcuerdos } from '../../../../lib/sueldos-repo';
import { listarAsistenciasPeriodo } from '../../../../lib/asistencias-repo';
import { leerConfigMap } from '../../../../lib/config-repo';
import { leerPeriodo } from '../../../../lib/periodo';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';
import { AsistenciaCliente } from '../../../sueldos/asistencia/cliente';

// Declarar qué pasó cada día. Es el paso que traba más períodos: `sueldo_entrada` corta la
// liquidación nombrando cada fecha que quedó en 'sin_dato' (0073_sueldos_rpc.sql:128-145).
//
// SE REUSA EL CLIENTE DE /sueldos/asistencia, no se reescribe. Esa pantalla sabe cosas que costó
// aprender: que un día sin declarar no es una falta, el margen de horas del marcaje astuto (C-05),
// el turno de la fila que ya existe para no crear una segunda. Copiarla acá sería tener dos
// verdades sobre la misma regla, y la que se olvide de actualizar va a pagar mal.
//
// EL GRANO ES EL CONTRATO, NO EL PERÍODO DE LA BARRA. Y no es un descuido: la asistencia se declara
// sobre el período de un contrato porque es el contrato el que dice qué horario se pactó, y sin eso
// la tardanza no se puede medir. Cuando el contrato y el período elegido no coinciden, se avisa.
export const dynamic = 'force-dynamic';

export default async function AsistenciasColaboradorPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.includes('asistencias')) redirect(`/personal/${params.id}`);

  const esAdmin = acceso.sesion.usuario.rol === 'admin' || acceso.sesion.usuario.rol === 'dueno';
  const persona = await obtenerColaborador(params.id);
  if (!persona) notFound();

  if (!esAdmin) {
    return (
      <div className="space-y-3">
        <SeccionHeader seccion="asistencias" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta sección es del administrador">
            Declarar qué pasó cada día cambia lo que se le paga a una persona. Hoy sólo lo hace el
            administrador o el dueño.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const periodo = leerPeriodo(searchParams);
  const acuerdos = (await listarAcuerdos(persona.id)).filter((a) => a.estado !== 'liquidado');

  if (acuerdos.length === 0) {
    return (
      <div className="space-y-3">
        <SeccionHeader seccion="asistencias" />
        <Card>
          <EmptyState icon={CalendarCheck} titulo={`${persona.nombre} no tiene ningún contrato abierto`}>
            La asistencia se declara sobre el período de un contrato, porque de ahí sale el horario
            pactado contra el que se mide la tardanza. Primero hay que pactar uno en Contrato.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const pedido = Array.isArray(searchParams?.acuerdo) ? searchParams?.acuerdo[0] : searchParams?.acuerdo;
  // Sin un contrato pedido a mano, gana el que se solapa con el período de la barra: es el que la
  // persona estaba mirando. Si ninguno se solapa, el más reciente.
  const elegido =
    acuerdos.find((a) => a.id === pedido) ??
    acuerdos.find((a) => a.fechaInicio <= periodo.hasta && (a.fechaFin ?? '9999-12-31') >= periodo.desde) ??
    acuerdos[0];

  const [filas, config] = await Promise.all([
    listarAsistenciasPeriodo(elegido.empleadoId, elegido.fechaInicio, elegido.fechaFin),
    leerConfigMap(),
  ]);

  // Regla A del marcaje astuto (C-05), editable desde /configuracion. `Number('')` es 0 y es
  // finito, así que la fila vacía se comprueba antes de convertir: si no, cualquier exceso de un
  // minuto quedaría marcado.
  const crudo = config.sueldo_margen_horas_dia_minutos;
  const margen = crudo == null || crudo.trim() === '' ? 120 : Number(crudo);

  const desalineado = elegido.fechaInicio > periodo.desde || (elegido.fechaFin ?? '9999-12-31') < periodo.hasta;

  return (
    <div className="space-y-3">
      <SeccionHeader
        seccion="asistencias"
        nota={
          desalineado
            ? `Se declara sobre el contrato del ${elegido.fechaInicio} al ${elegido.fechaFin ?? 'sin fin'}, que no coincide con el período elegido arriba. El horario pactado sale del contrato, así que ése es el rango que manda acá.`
            : undefined
        }
      />
      <AsistenciaCliente
        acuerdos={acuerdos}
        acuerdo={elegido}
        filas={filas}
        margenMinutos={Number.isFinite(margen) ? margen : 120}
      />
    </div>
  );
}
