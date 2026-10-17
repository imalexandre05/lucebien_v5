import { Lock } from 'lucide-react';
import { getSesion } from '../../../lib/auth';
import { listarEmpleados } from '../../../lib/reportes-repo';
import { escalasSalariales } from '../../../lib/config-repo';
import { listarTemporadas } from '../../../lib/temporadas-repo';
import { listarAcuerdos, parametrosVigentes } from '../../../lib/sueldos-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { EmptyState } from '../../../components/ui/empty-state';
import { Card } from '../../../components/ui/card';
import { AcuerdosCliente } from './cliente';

/**
 * Contratos de sueldo — paso 5 de docs/superpowers/specs/sueldos/SPEC-esquema-sueldos.md §9.
 *
 * Es la primera pantalla del sistema de sueldos, y sin ella no hay nada que liquidar: el horario
 * contratado (`sueldo_acuerdo_turnos`) es el bloqueante B-01 de la spec. De acá salen las horas
 * contratadas, el valor de la hora y la base de la tardanza.
 *
 * SÓLO ADMINISTRADOR, y por dos caminos. La RLS ya deja que cada persona lea su propio acuerdo
 * (`sueldo_acuerdos_select`), pero **qué le mostramos de su propio contrato es una decisión de
 * negocio que todavía no está tomada**, así que la pantalla no la adivina: se cierra entera y la
 * vista personal se diseña aparte. Cerrar de más se corrige; mostrar de más, no.
 */
export const dynamic = 'force-dynamic';

export default async function AcuerdosPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';

  if (!esAdmin) {
    return (
      <div>
        <PageHeader title="Contratos" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta pantalla es del administrador">
            Los contratos de sueldo los administra el dueño o el administrador. Si necesitás
            consultar el tuyo, pedíselo.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const [acuerdos, empleados, valoresVigentes, escalas, temporadas] = await Promise.all([
    listarAcuerdos(),
    listarEmpleados(),
    parametrosVigentes(),
    escalasSalariales(),
    listarTemporadas().catch(() => []),
  ]);

  const vigentes = acuerdos.filter((a) => a.estado === 'vigente').length;
  const sinHorario = acuerdos.filter((a) => a.turnos.length === 0).length;

  const subtitulo = [
    `${acuerdos.length} contrato${acuerdos.length === 1 ? '' : 's'}`,
    `${vigentes} vigente${vigentes === 1 ? '' : 's'}`,
    sinHorario > 0 ? `${sinHorario} sin horario` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <PageHeader title="Contratos" subtitle={subtitulo} />
      <AcuerdosCliente acuerdos={acuerdos} empleados={empleados} valoresVigentes={valoresVigentes} escalas={escalas} temporadas={temporadas} />
    </div>
  );
}
