import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarSedes } from '../../../lib/sedes-repo';
import { listarRoles } from '../../../lib/roles-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { NuevaPersonaCliente } from './cliente';

// Alta de una persona (R2, spec docs/superpowers/specs/sueldos/2026-08-23-personal-fusion-design.md
// §2.4): paso 1 de la cadena datos → contrato → horario. Hasta esta pantalla, desde que
// /empleados quedó redirigiendo a /personal (R1), no existía ningún camino de UI para dar de alta
// a alguien nuevo — el modal «Nuevo colaborador» de app/empleados/cliente.tsx quedó como código
// muerto detrás de una pantalla que nunca se renderiza.
//
// GATE: el mismo que tenía /empleados antes de volverse redirect (admin/dueño — ver
// `git show e68d02b~1:apps/erp-web/app/empleados/page.tsx`), SIN reautenticación: esa pantalla
// nunca la exigió, y acá todavía no hay nota, asistencia ni sueldo de nadie que cruzar — sólo se
// crea un perfil.
export const dynamic = 'force-dynamic';

export default async function NuevaPersonaPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';

  if (!esAdmin) {
    return (
      <div>
        <PageHeader title="Nueva persona" subtitle="Alta de un colaborador" />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted">
            Solo los administradores pueden registrar personas nuevas.
          </CardContent>
        </Card>
      </div>
    );
  }

  const [sedes, rolesDerivados] = await Promise.all([
    listarSedes().catch(() => []),
    // roles derivados (migración 0050): si aún no se aplicó, el picker sólo muestra los 7 base.
    listarRoles().catch(() => []),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Nueva persona"
        subtitle="Paso 1 de 2 — datos. Al guardar, sigue el contrato y el horario."
      />
      <NuevaPersonaCliente sedes={sedes} rolesDerivados={rolesDerivados} />
    </div>
  );
}
