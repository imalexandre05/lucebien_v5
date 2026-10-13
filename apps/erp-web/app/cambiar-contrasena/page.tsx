import { redirect } from 'next/navigation';
import { Card, CardContent } from '../../components/ui/card';
import { getServerClient } from '../../lib/supabase/server';
import { reglasAccesoVigentes } from '../../lib/auth';
import { FormularioCambio } from './formulario';

// Cambio de contraseña (spec permisos/2026-10-06-login-usuario-contrasena §7). El middleware trae
// aquí a quien tiene la marca debe_cambiar_contrasena; también se llega desde la llave del topbar.
export default async function CambiarContrasenaPage() {
  const {
    data: { user },
  } = await getServerClient().auth.getUser();
  if (!user) redirect('/login');

  const obligatorio = (user.app_metadata as { debe_cambiar_contrasena?: unknown }).debe_cambiar_contrasena === true;
  const { contrasenaMin } = await reglasAccesoVigentes();

  return (
    <div className="mx-auto w-full max-w-sm py-8">
      <h1 className="text-seccion font-semibold text-navy">
        {obligatorio ? 'Crea tu contraseña' : 'Cambiar mi contraseña'}
      </h1>
      <p className="mb-6 mt-2 text-cuerpo text-muted">
        {obligatorio
          ? 'Antes de seguir, cambia la contraseña con la que entraste por una que sólo tú conozcas. La usarás desde ahora para entrar.'
          : 'Escribe tu contraseña actual y la nueva.'}
      </p>
      <Card>
        <CardContent className="pt-6">
          <FormularioCambio minimo={contrasenaMin} />
        </CardContent>
      </Card>
    </div>
  );
}
