import { notFound, redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import type { MatrizPermisos } from '@scilb/core';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { listarEmpleadosAdmin } from '../../../../lib/empleados-repo';
import { listarSedes } from '../../../../lib/sedes-repo';
import { listarRoles } from '../../../../lib/roles-repo';
import { leerMatrizPermisos } from '../../../../lib/permisos-repo';
import { listarAcuerdos } from '../../../../lib/sueldos-repo';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';
import { DatosCliente } from './cliente';

// La ficha administrativa de la persona: identidad, rol, sede, contacto y acceso. Vivía sola en
// /empleados (la lista de las 18 personas + un modal de edición por fila); acá es la PRIMERA
// pestaña del expediente porque es lo primero que hace falta saber de alguien antes de mirar su
// período — y porque es el mismo permiso ('empleados') que ya tenía esa pantalla suelta.
//
// NO SE REESCRIBE EL FORMULARIO. CamposPerfil, ContactoCampos, OperaCajaToggle y ContrasenaForm
// se exportan desde app/empleados/cliente.tsx y se montan acá para UNA persona en vez de para las
// 18 — mismos campos, mismas acciones (accionEditarEmpleado, accionEstablecerContrasena,
// accionEstadoEmpleado), un solo lugar que los define.
//
// SUELDO ÚNICO (R3/T7). El campo editable de salario salió de la ficha: manda solo el contrato
// (spec 2026-08-23-personal-fusion-design.md §2.5). Acá se carga el acuerdo VIGENTE de la persona
// para mostrarlo en solo lectura — `listarAcuerdos()` ya ordena por `fecha_inicio` descendente, así
// que el primero que cumpla `estado === 'vigente'` es, a la vez, el más reciente (el criterio que
// pide la spec cuando hay más de uno).
export const dynamic = 'force-dynamic';

export default async function DatosColaboradorPage({ params }: { params: { id: string } }) {
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.includes('datos')) redirect(`/personal/${params.id}`);

  // Re-chequeo explícito, igual que contrato/movimientos con 'sueldos' — acá 'empleados' hoy no
  // tiene fila configurable en /configuracion/permisos (ver el comentario en
  // lib/colaboradores-secciones.ts), así que puede() sólo deja pasar a admin/dueño por mecanismo:
  // en la práctica esto nunca dispara para quien ya superó el filtro de arriba. Queda como
  // cinturón y tirantes, no como el gate real.
  const esAdmin = acceso.sesion.usuario.rol === 'admin' || acceso.sesion.usuario.rol === 'dueno';
  if (!esAdmin) {
    return (
      <div className="space-y-3">
        <SeccionHeader seccion="datos" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta sección es del administrador">
            El acceso, el contacto y el sueldo de una persona sólo los ve el administrador o el
            dueño.
          </EmptyState>
        </Card>
      </div>
    );
  }

  // lib/empleados-repo.ts sólo expone la lista completa (listarEmpleadosAdmin) — no hay un fetch
  // por id, y con 18 personas no vale la pena una RPC nueva sólo para esto: se filtra acá.
  const [empleados, sedes, rolesDerivados, matrizPermisos, acuerdos] = await Promise.all([
    listarEmpleadosAdmin(),
    listarSedes().catch(() => []),
    // roles derivados (migración 0050): si aún no se aplicó, el picker sólo muestra los 7 base.
    listarRoles().catch(() => []),
    leerMatrizPermisos().catch((): MatrizPermisos => ({})),
    // Igual de defensivo que sedes/roles: el trabajo PRINCIPAL de esta pantalla es identidad y
    // acceso, no sueldos — un tropiezo en sueldo_acuerdos no debería tumbar la ficha entera.
    listarAcuerdos(params.id).catch(() => []),
  ]);
  const persona = empleados.find((e) => e.id === params.id);
  if (!persona) notFound();

  const vigente = acuerdos.find((a) => a.estado === 'vigente') ?? null;
  const sueldoVigente = vigente ? vigente.sueldoPactado : null;

  return (
    <div className="space-y-3">
      <SeccionHeader seccion="datos" />
      <DatosCliente
        emp={persona}
        sedes={sedes}
        rolesDerivados={rolesDerivados}
        matrizPermisos={matrizPermisos}
        sueldoVigente={sueldoVigente}
      />
    </div>
  );
}
