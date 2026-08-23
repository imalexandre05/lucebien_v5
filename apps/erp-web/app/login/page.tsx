import { cookies } from 'next/headers';
import { isOn } from '@scilb/adapter-lucebien';
import { iniciarSesion } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Input, Label } from '../../components/ui/form';
import { LogoMark } from '../../components/brand/logo';
import { listarSedesPublico } from '../../lib/sedes-repo';
import { sedeDispositivoPublico } from '../../lib/dispositivos-repo';
import { SedeBotones } from './sede-botones';
import { BotonIngresar } from './boton';

const DEVICE_COOKIE = 'sci_device';

// Primera impresión (§4B): entrada escalonada crest → wordmark → tarjeta → pie,
// código estilo "cerradura" (mono, centrado, tracking ancho). Con LOGIN_V2 apagado (default)
// se mantiene el login híbrido cod+sede; encendido, pide usuario+contraseña — ver
// C:\Users\ASUS\.claude\plans\glittery-plotting-shannon.md. Las sedes salen de la BD: crear una
// sede nueva en Configuración la habilita aquí sin tocar código (solo aplica al modo cod+sede).
//
// "El dispositivo manda" (Fase 2): el admin asigna una sede a cada equipo desde /dispositivos
// (dispositivos_autorizados.sede_cod). Este equipo se identifica por la cookie `sci_device` (la
// pone el middleware, siempre, incluso sin sesión) y login la resuelve ANTES de pintar para
// pre-marcar el botón correspondiente — en los dos modos de login, no solo en cod+sede.
export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const loginV2 = isOn('LOGIN_V2');
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
              <p role="alert" className="mb-4 animate-rise rounded-md bg-aviso/15 px-3 py-2 text-xs text-aviso-deep">
                {searchParams.error === 'credenciales'
                  ? loginV2
                    ? 'Usuario o contraseña incorrectos.'
                    : 'Código o sede incorrectos.'
                  : loginV2
                    ? 'Datos inválidos. Revisa el usuario y la contraseña.'
                    : 'Datos inválidos. Revisa la sede y el código (4 dígitos).'}
              </p>
            )}
            {loginV2 ? (
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
            ) : (
              <form action={iniciarSesion} className="space-y-4">
                <SedeBotones sedes={SEDES} defaultSede={defaultSede} />
                <div>
                  <Label htmlFor="login-cod">Código</Label>
                  <Input
                    id="login-cod"
                    name="cod"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    placeholder="····"
                    autoComplete="off"
                    className="py-2.5 text-center tabular-nums text-lg tracking-[0.5em] placeholder:tracking-[0.3em]"
                    aria-describedby="login-ayuda"
                    required
                    autoFocus
                  />
                </div>
                <BotonIngresar />
              </form>
            )}
          </CardContent>
        </Card>
        <p
          id="login-ayuda"
          className="mt-4 animate-rise text-center text-[11px] text-muted [animation-delay:270ms]"
        >
          {loginV2 ? 'Ingresa con tu usuario y contraseña' : 'Ingresa con tu código de 4 dígitos y tu sede'}
        </p>
      </div>
    </div>
  );
}
