import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarSedes } from '../../../lib/sedes-repo';
import { listarConfig } from '../../../lib/config-repo';
import { listarHorasLimite } from '../../../lib/hora-limite-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { HoraLimiteCliente } from './cliente';

// Hora límite del reporte por sede y turno. A esa hora el reporte se envía solo. Solo admin.
export default async function HoraLimitePage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const [sedes, horas, config] = await Promise.all([listarSedes(), listarHorasLimite(), listarConfig()]);
  const valor = (clave: string, def: string) => config.find((c) => c.clave === clave)?.valor ?? def;
  const globales = { M: valor('turno_m_cierre', '15:00'), T: valor('turno_t_cierre', '23:00'), C: valor('turno_c_cierre', '23:00') };
  return (
    <div>
      <PageHeader
        title="Hora límite de los reportes"
        subtitle="A esta hora el reporte se envía solo, con lo que se haya marcado. Vacío = la hora general."
      />
      <HoraLimiteCliente sedes={sedes.filter((s) => s.perfil === 'pos').map((s) => ({ cod: s.cod, nombre: s.nombre }))} horas={horas} globales={globales} />
    </div>
  );
}
