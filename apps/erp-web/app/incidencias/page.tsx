import { redirect } from 'next/navigation';
import { puede, type MatrizPermisos } from '@scilb/core';
import { listarIncidencias, listarTiposIncidencia } from '../../lib/incidencias-repo';
import { listarEmpleados } from '../../lib/reportes-repo';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { PageHeader } from '../../components/shell/page-header';
import { IncidenciasCliente } from './cliente';

// Módulo solo-admin (Fase 7 del plan): los operativos ENVÍAN incidencias desde su propio reporte
// de turno, pero no navegan el listado completo (no ven quién reportó a quién).
export default async function IncidenciasPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'incidencias', 'ver', sesion.usuario.rolCod)) redirect('/reportes/nuevo');

  const [incidencias, tipos, empleados] = await Promise.all([
    listarIncidencias(),
    listarTiposIncidencia(),
    listarEmpleados(),
  ]);
  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';

  return (
    <div>
      <PageHeader title="Incidencias" subtitle={`${incidencias.length} registradas`} />
      <IncidenciasCliente incidencias={incidencias} tipos={tipos} empleados={empleados} esAdmin={esAdmin} />
    </div>
  );
}
