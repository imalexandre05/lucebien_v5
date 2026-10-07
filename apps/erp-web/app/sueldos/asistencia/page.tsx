import { CalendarCheck, Lock } from 'lucide-react';
import { getSesion } from '../../../lib/auth';
import { listarAcuerdos } from '../../../lib/sueldos-repo';
import { listarAsistenciasPeriodo } from '../../../lib/asistencias-repo';
import { leerConfigMap } from '../../../lib/config-repo';
import { leerVistaRango } from '../../../lib/periodo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { SelectorRango } from '../../../components/ui/selector-rango';
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

export default async function AsistenciaSueldosPage(
  props: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
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

  const pedido = Array.isArray(searchParams.acuerdo) ? searchParams.acuerdo[0] : searchParams.acuerdo;
  const elegido = acuerdos.find((a) => a.id === pedido) ?? acuerdos[0];
  // Sin vista en la URL se ve el contrato entero, como siempre: es el grano en el que se declara.
  // Con día, semana o mes, la tabla se acota a los días del contrato que caen en ese rango
  // (spec asistencias/2026-10-03-filtros-rango-design.md).
  const vista = leerVistaRango(searchParams, null);
  const [filas, config] = await Promise.all([
    listarAsistenciasPeriodo(elegido.empleadoId, elegido.fechaInicio, elegido.fechaFin),
    leerConfigMap(),
  ]);

  // Regla A del marcaje astuto (SPEC-cambios-reglas-2026-08-17 C-05). Editable desde
  // /configuracion: el umbral depende de cómo trabaja cada equipo. `Number('')` es 0 y es finito,
  // así que una fila vacía marcaría cualquier exceso de un minuto — por eso se comprueba el vacío
  // antes de convertir, igual que hace la RPC con los parámetros del sueldo.
  const crudo = config.sueldo_margen_horas_dia_minutos;
  const margen = crudo == null || crudo.trim() === '' ? 120 : Number(crudo);

  return (
    <div>
      <PageHeader
        title="Declarar asistencia"
        subtitle="Qué pasó cada día del periodo. Un día sin declarar no es una falta: es un dato que falta, y frena la liquidación."
      />
      <SelectorRango porDefecto={null} sinRango="Contrato" className="mb-5" />
      <AsistenciaCliente
        acuerdos={acuerdos}
        acuerdo={elegido}
        filas={filas}
        margenMinutos={Number.isFinite(margen) ? margen : 120}
        rango={vista?.rango ?? null}
      />
    </div>
  );
}
