import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarCandidatos } from '../../../lib/candidatos-repo';
import { listarSedes } from '../../../lib/sedes-repo';
import { leerConfigMap } from '../../../lib/config-repo';
import { hoyPeru } from '../../../lib/fechas';
import { PageHeader } from '../../../components/shell/page-header';
import { CandidatosCliente } from './cliente';

// Ingreso de personal (ticket 14): entrevista → prueba de 3 días → alta. Solo admin/dueño: son
// datos personales de gente que todavía no es colaboradora.
export const dynamic = 'force-dynamic';

export default async function CandidatosPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const [candidatos, sedes, cfg] = await Promise.all([
    listarCandidatos(),
    listarSedes().catch(() => []),
    leerConfigMap().catch(() => ({}) as Record<string, string>),
  ]);
  const dias = Number(cfg['personal_prueba_dias']);
  return (
    <div>
      <PageHeader title="Candidatos" subtitle="Entrevista, prueba y alta de personal nuevo" />
      <CandidatosCliente
        candidatos={candidatos}
        sedes={sedes.map((s) => ({ cod: s.cod, nombre: s.nombre }))}
        diasPrueba={Number.isInteger(dias) && dias >= 1 ? dias : 3}
        hoy={hoyPeru()}
      />
    </div>
  );
}
