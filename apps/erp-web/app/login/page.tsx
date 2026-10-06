import { cookies } from 'next/headers';
import { iniciarSesion } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Input, Label } from '../../components/ui/form';
import { LogoMark } from '../../components/brand/logo';
import { listarSedesPublico } from '../../lib/sedes-repo';
import { sedeDispositivoPublico } from '../../lib/dispositivos-repo';
import { SedeBotones } from './sede-botones';
import { BotonIngresar } from './boton';

const DEVICE_COOKIE = 'sci_device';

// Primera impresión (§4B): entrada escalonada crest → wordmark → tarjeta → pie. Pide usuario +
// contraseña; el modo cod+sede (código de 4 dígitos como contraseña) se eliminó el 6-oct-2026 —
// spec docs/superpowers/specs/permisos/2026-10-06-login-usuario-contrasena-design.md. Las sedes
// salen de la BD: crear una sede nueva en Configuración la habilita aquí sin tocar código.
//
// "El dispositivo manda" (Fase 2): el admin asigna una sede a cada equipo desde /dispositivos
// (dispositivos_autorizados.sede_cod). Este equipo se identifica por la cookie `sci_device` (la
// pone el middleware, siempre, incluso sin sesión) y login la resuelve ANTES de pintar para
// pre-marcar el botón correspondiente.
// Cada error dice qué hacer (principio de producto). Usuario inexistente y contraseña incorrecta
// dan el MISMO mensaje: no se revela qué nombres existen.
function mensajeError(error: string, min?: string): string {
  if (error === 'suspendido') return 'Tu acceso está suspendido. Habla con el administrador.';
  if (error === 'bloqueado') {
    const n = Number(min);
    const espera = Number.isFinite(n) && n > 0 ? `${n} min` : 'unos minutos';
    return `Demasiados intentos fallidos. Espera ${espera} y vuelve a intentar, o pide al administrador una contraseña temporal.`;
  }
  if (error === 'credenciales')
    return 'Usuario o contraseña incorrectos. Revisa que el nombre esté bien escrito y vuelve a intentar. Si olvidaste tu contraseña, pide al administrador una temporal.';
  return 'Escribe tu usuario (tu nombre) y tu contraseña.';
}

export default async function LoginPage({ searchParams }: { searchParams: { error?: string; min?: string } }) {
  const deviceId = cookies().get(DEVICE_COOKIE)?.value ?? '';
  const [SEDES, sedeDispositivo] = await Promise.all([listarSedesPublico(), sedeDispositivoPublico(deviceId)]);
  const defaultSede = SEDES.some((s) => s.cod === sedeDispositivo) ? (sedeDispositivo as string) : (SEDES[0]?.cod ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <LogoMark size="xl" className="animate-scale-in" />
          <div className="mt-4 animate-rise text-4xl font-semibold leading-none text-navy [animation-delay:90ms]">
            LuceBien
          </div>
          <div className="mt-2 animate-rise tabular-nums text-[10px] tracking-brand text-gold [animation-delay:150ms]">
            SCI · LB
          </div>
        </div>
        <Card className="animate-rise overflow-hidden [animation-delay:210ms]">
          {/* Filete de sastre: hairline dorada que firma la tarjeta. */}
          <div aria-hidden className="h-0.5 bg-gradient-to-r from-gold via-gold/50 to-line" />
          <CardContent className="pt-6">
            {searchParams.error && (
              <p role="alert" className="mb-4 animate-rise rounded-r-chico bg-aviso/15 px-3 py-2 text-apoyo text-aviso-deep">
                {mensajeError(searchParams.error, searchParams.min)}
              </p>
            )}
            <form action={iniciarSesion} className="space-y-4">
              <SedeBotones sedes={SEDES} defaultSede={defaultSede} />
              <div>
                <Label htmlFor="login-usuario">Usuario</Label>
                <Input
                  id="login-usuario"
                  name="usuario"
                  autoComplete="username"
                  placeholder="Tu nombre"
                  required
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="login-password">Contraseña</Label>
                <Input id="login-password" name="password" type="password" autoComplete="current-password" required />
              </div>
              <BotonIngresar />
            </form>
          </CardContent>
        </Card>
        <p
          id="login-ayuda"
          className="mt-4 animate-rise text-center text-micro text-muted [animation-delay:270ms]"
        >
          Ingresa con tu usuario y contraseña
        </p>
      </div>
    </div>
  );
}
