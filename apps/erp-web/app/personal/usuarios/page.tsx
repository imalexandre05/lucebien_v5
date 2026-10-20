import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarEmpleadosAdmin, listarCodigosEmpleados } from '../../../lib/empleados-repo';
import { listarSedes } from '../../../lib/sedes-repo';
import { listarRoles } from '../../../lib/roles-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { opcionesRol } from '../../empleados/cliente';
import { UsuariosCliente, type FilaUsuario } from './cliente';

// Gestión rápida de usuarios: una tabla para cambiar código, contraseña, estado, sede y rol por
// lote. Solo administrador (spec empleados/2026-10-20-usuarios-gestion-rapida-design.md).
export default async function UsuariosPage() {
  const sesion = await getSesion();
  if (!(sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno')) redirect('/');

  const [personas, codigos, sedes, roles] = await Promise.all([
    listarEmpleadosAdmin(),
    listarCodigosEmpleados(),
    listarSedes(),
    listarRoles(),
  ]);
  const filas: FilaUsuario[] = personas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    cod: codigos[p.id] ?? '',
    sedeCod: p.sedeCod ?? '',
    rolValor: p.rolCod ?? p.rol,
    activo: p.activo,
  }));
  return (
    <div>
      <PageHeader
        title="Usuarios"
        subtitle="Cambia varios datos a la vez y pulsa «Guardar todo». Las contraseñas temporales se muestran una sola vez."
      />
      <UsuariosCliente
        filas={filas}
        sedes={sedes.map((s) => ({ cod: s.cod, nombre: s.nombre }))}
        roles={opcionesRol(roles).map((o) => ({ valor: o.valor, label: o.label, rolBase: o.rolBase, rolCod: o.rolCod }))}
      />
    </div>
  );
}
