import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getServerClient } from './supabase/server';
import { getAdminClient } from './supabase/admin';
import { verificarContrasenaConLimite } from './auth';

// Reautenticación por contraseña (Fase 1): /pagos, /evaluaciones y /mi-desempeno muestran datos
// confidenciales (salarios, evaluaciones, desempeño) en una PC que varios empleados comparten.
// Entrar ya requiere sesión; esto pide la contraseña OTRA VEZ antes de mostrar esas pantallas,
// sin abrir una sesión nueva — solo confirma "sigues siendo tú" y marca una cookie corta.
const REAUTH_COOKIE = 'sci_reauth';
const REAUTH_MINUTOS = 15;

function secreto(): string {
  // Reutiliza el service_role key como llave de firma: ya es un secreto server-only (nunca llega
  // al bundle del cliente) y evita depender de una env var nueva solo para esto.
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY (requerido para firmar la reautenticación)');
  return s;
}

function firmar(payload: string): string {
  return createHmac('sha256', secreto()).update(payload).digest('hex');
}

function generarToken(userId: string): string {
  const exp = Date.now() + REAUTH_MINUTOS * 60_000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${firmar(payload)}`;
}

function tokenValido(token: string, userId: string): boolean {
  const partes = token.split('.');
  if (partes.length !== 3) return false;
  const [uid, expStr, firma] = partes;
  if (uid !== userId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const esperada = firmar(`${uid}.${expStr}`);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ¿La cookie de reauth es válida para ESTE usuario y no venció? httpOnly → nunca la toca JS del
// navegador; firmada con HMAC → editarla a mano (devtools) no produce un token válido.
export async function tieneReauth(userId: string): Promise<boolean> {
  const token = (await cookies()).get(REAUTH_COOKIE)?.value;
  if (!token) return false;
  try {
    return tokenValido(token, userId);
  } catch {
    return false;
  }
}

async function marcarReauth(userId: string): Promise<void> {
  (await cookies()).set(REAUTH_COOKIE, generarToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: REAUTH_MINUTOS * 60,
    secure: process.env.NODE_ENV === 'production',
  });
}

// Valida la contraseña contra el usuario YA EN SESIÓN (nunca cambia de identidad ni abre sesión
// para otro empleado). Reusa el mismo email interno {cod}@lucebien.local que loginConUsuario.
export async function verificarPasswordSesion(password: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión requerida' };

  const { data: emp } = await getAdminClient().from('empleados').select('cod').eq('id', user.id).maybeSingle();
  if (!emp) return { ok: false, error: 'No se pudo verificar tu usuario' };

  // Mismo contador que el login (spec permisos/2026-10-06-login-usuario-contrasena §5): sin él, en
  // la PC compartida se podía adivinar la contraseña de quien dejó la sesión abierta probando aquí
  // sin límite, incluso con la cuenta ya bloqueada.
  const res = await verificarContrasenaConLimite({ id: user.id, cod: (emp as { cod: string }).cod }, password);
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.motivo === 'bloqueado'
          ? `Demasiados intentos fallidos. Espera ${res.minutos} min o pide al administrador una contraseña temporal.`
          : 'Contraseña incorrecta. Escribe la misma con la que entraste.',
    };
  }

  await marcarReauth(user.id);
  return { ok: true };
}
