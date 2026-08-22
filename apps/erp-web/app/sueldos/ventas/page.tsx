import { Lock } from 'lucide-react';
import { getSesion } from '../../../lib/auth';
import { listarEmpleados } from '../../../lib/reportes-repo';
import { listarAcuerdos, listarVentas } from '../../../lib/sueldos-repo';
import { leerConfigMap } from '../../../lib/config-repo';
import { leerPeriodo } from '../../../lib/periodo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { VentasCliente } from './cliente';

/**
 * Ventas y metas — pantalla propia desde la Tarea 3 del rediseño de sueldos F1 (22-ago-2026).
 * Antes compartía pantalla con adelantos y descuentos en `/sueldos/movimientos`: son dos trabajos
 * distintos (los movimientos se registran de a uno; las ventas se transcriben desde tuxedo, el POS
 * de las tiendas sin integración, en tandas — lo que el administrador ya hacía hacia su Excel).
 *
 * Misma comprobación de sesión y permiso que `/sueldos/movimientos`, copiada literal: esta
 * pantalla también carga datos que alimentan el pago de una persona (la comisión mira estas
 * boletas), así que el aislamiento por rol es el mismo.
 */
export const dynamic = 'force-dynamic';

export default async function VentasPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string };
}) {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';

  if (!esAdmin) {
    return (
      <div>
        <PageHeader title="Ventas y metas" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta pantalla es del administrador">
            Una venta cargada acá alimenta la comisión de esa persona. Sólo el administrador o el
            dueño la cargan.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const periodo = leerPeriodo(searchParams);

  const [empleados, ventas, ventasSinAsignar, acuerdos, config] = await Promise.all([
    listarEmpleados(),
    listarVentas({ desde: periodo.desde, hasta: periodo.hasta }),
    // La cola es GLOBAL, no del periodo: una boleta sin vendedor de hace dos meses sigue sin
    // resolver aunque el admin esté mirando el mes en curso. El filtro ya existe en el repo — no
    // hace falta filtrar el arreglo de arriba a mano (y hacerlo a mano la escondería al cambiar de
    // periodo, justo lo que "nada se descarta en silencio" quiere evitar).
    listarVentas({ soloSinAsignar: true }),
    listarAcuerdos(),
    leerConfigMap(),
  ]);

  // Mínimo de boleta para comisionar (RN-13): configurable, con el mismo patrón de fallback que
  // usa /sueldos/asistencia para sus parámetros de config.
  const crudoMinimo = config.sueldo_monto_minimo_comision;
  const montoMinimoComision =
    crudoMinimo == null || crudoMinimo.trim() === '' ? 120 : Number(crudoMinimo);

  // La meta semanal del semáforo es de PRESENTACIÓN, no la que usa el motor para pagar: esa vive
  // pactada por persona en `sueldo_acuerdos.parametros.metaSemanal` (RN-10) y varía por tienda,
  // temporada, experiencia y turno — nunca es una sola cifra para toda la empresa. No existe hoy
  // ningún parámetro de configuración que sea "la meta semanal de la empresa", así que en vez de
  // inventar uno se SUMAN las metas YA PACTADAS de los contratos vigentes: es dato real que el
  // administrador ya cargó en Contratos, no un número nuevo. Los contratos sin meta pactada
  // (`metaSemanal: null`, "sugerila con las horas") no suman — reproducir esa fórmula acá
  // reimplementaría el motor, que es justo lo que la Tarea 2 evitó al reusar tramosSemanales().
  // El total que se ve es un PISO, no el total exacto si hay contratos sin meta pactada. Ver la
  // nota en docs/pendientes-negocio.md.
  const metaSemanalReferencia = acuerdos
    .filter((a) => a.estado === 'vigente')
    .reduce((s, a) => s + (a.parametros.metaSemanal ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Ventas y metas"
        subtitle={`${ventas.length} boleta(s) del periodo${ventasSinAsignar.length > 0 ? ` · ${ventasSinAsignar.length} sin vendedor` : ''}`}
      />
      <VentasCliente
        empleados={empleados}
        ventas={ventas}
        ventasSinAsignar={ventasSinAsignar}
        periodo={periodo}
        metaSemanal={metaSemanalReferencia}
        montoMinimoComision={Number.isFinite(montoMinimoComision) ? montoMinimoComision : 120}
      />
    </div>
  );
}
