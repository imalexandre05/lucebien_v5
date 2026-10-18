import { redirect } from 'next/navigation';
import { puede, type MatrizPermisos } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { PageHeader } from '../../components/shell/page-header';
import { listarCapacitaciones, listarItems, notaAprobatoria } from '../../lib/capacitacion-repo';
import { listarEmpleados } from '../../lib/reportes-repo';
import { CapacitacionCliente } from './cliente';

// Mismo permiso que la entrada del menú ('evaluaciones'), validado en el servidor: antes sólo se ocultaba
// el enlace. Dentro, la base decide qué ve cada quien (RLS de la 0131): el administrador todo; el
// capacitador, las que dicta; el nuevo, la suya; el encargado de tienda, la de su sede (0142).
export default async function CapacitacionPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'evaluaciones', 'ver', sesion.usuario.rolCod)) redirect('/reportes/nuevo');
  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';
  const [capacitaciones, items, minimo, empleados] = await Promise.all([
    listarCapacitaciones(),
    listarItems(),
    notaAprobatoria(),
    esAdmin ? listarEmpleados() : Promise.resolve([]),
  ]);
  return (
    <div>
      <PageHeader
        title="Capacitación"
        subtitle={`${capacitaciones.filter((c) => c.estado === 'en_curso').length} en curso`}
      />
      {esAdmin && (
        <p className="mb-3 text-cuerpo">
          <a href="/capacitacion/examenes" className="font-medium text-gold-deep underline">Banco de preguntas y habilidades de los exámenes →</a>
        </p>
      )}
      <CapacitacionCliente
        capacitaciones={capacitaciones}
        items={items}
        notaAprobatoria={minimo}
        empleados={empleados}
        esAdmin={esAdmin}
        yoId={sesion.usuario.id}
      />
    </div>
  );
}
