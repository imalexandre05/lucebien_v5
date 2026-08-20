import { redirect } from 'next/navigation';
import { puede, type MatrizPermisos } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { tieneReauth } from '../../lib/reauth';
import { leerPeriodo } from '../../lib/periodo';
import { MODULOS_DEL_MODULO } from '../../lib/colaboradores-secciones';
import { listarColaboradores, estadoDelPeriodo } from '../../lib/colaboradores-repo';
import { PageHeader } from '../../components/shell/page-header';
import { ReauthGate } from '../../components/ui/reauth-gate';
import { ListaColaboradores } from './cliente';

// El módulo único que pidió reemplazar ocho entradas sueltas del menú (Evaluaciones, Pagos,
// Asistencias, Valores, Contratos, Declarar asistencia, Liquidaciones, Adelantos).
//
// EL CAMBIO DE FONDO NO ES VISUAL. El ERP estaba organizado por TABLA y quien administra piensa
// por PERSONA: "¿qué pasa con Mary este mes?". Antes esa pregunta se contestaba abriendo cinco
// pantallas y filtrando en cada una. Acá se contesta en una.
//
// GATE. No se inventa un permiso nuevo: alcanza con poder ver cualquiera de los módulos que el
// menú ya mostraba por separado, y cada sección de adentro conserva el suyo (ver
// lib/colaboradores-secciones.ts). Reautenticación como en /evaluaciones y /pagos: acá se cruza
// nota, asistencia y sueldo de terceros, que es lo más sensible del sistema.
export default async function ColaboradoresPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  const visibles = MODULOS_DEL_MODULO.filter((m) =>
    puede(matriz, sesion.usuario.rol, m, 'ver', sesion.usuario.rolCod),
  );
  if (!visibles.length) redirect('/reportes/nuevo');

  if (!(await tieneReauth(sesion.usuario.id))) {
    return (
      <div>
        <PageHeader title="Colaboradores" subtitle="Verificación requerida" />
        <ReauthGate mensaje="Este módulo cruza asistencia, evaluación y sueldo de todo el equipo." />
      </div>
    );
  }

  const periodo = leerPeriodo(searchParams);
  const colaboradores = await listarColaboradores();
  const estado = await estadoDelPeriodo(
    colaboradores.map((c) => c.id),
    periodo,
  );

  return (
    <div>
      <PageHeader
        title="Colaboradores"
        subtitle={`${colaboradores.length} activos · elegí a quién mirar y en qué período`}
      />
      <ListaColaboradores
        colaboradores={colaboradores}
        estado={Object.fromEntries(estado)}
        periodo={periodo}
        modulosVisibles={visibles}
      />
    </div>
  );
}
