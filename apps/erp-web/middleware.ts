import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { features, isOn } from '@scilb/adapter-lucebien';

const DEVICE_COOKIE = 'sci_device';
const UN_ANIO = 60 * 60 * 24 * 365;

// Refresca la sesión de Supabase en cada request (patrón @supabase/ssr). Con AUTH_V2 exige
// sesión (sin usuario → /login). Con DEVICE_GATE, además, solo deja pasar EQUIPOS AUTORIZADOS:
// un token de dispositivo (cookie httpOnly `sci_device`) debe estar 'aprobado'. El token se
// asigna SIEMPRE (barato, sin BD) para poder pre-aprobar equipos antes de activar el flag; la
// verificación contra la BD solo corre con el flag ON y es FAIL-OPEN (un fallo nunca brickea).
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  const enLogin = path.startsWith('/login');

  // Token de dispositivo estable (siempre, independiente del flag).
  let deviceId = req.cookies.get(DEVICE_COOKIE)?.value ?? '';
  let nuevoToken = false;
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    nuevoToken = true;
  }
  const conToken = (r: NextResponse) => {
    if (nuevoToken) {
      r.cookies.set(DEVICE_COOKIE, deviceId, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: UN_ANIO,
        secure: process.env.NODE_ENV === 'production',
      });
    }
    return r;
  };

  const redir = (pathname: string) => {
    const url = req.nextUrl.clone();
    url.pathname = pathname;
    return conToken(NextResponse.redirect(url));
  };

  // Suspensión: el token sigue vivo, la persona ya no.
  //
  // Banear a alguien en Supabase Auth le impide volver a entrar, pero no invalida el token que su
  // navegador ya tenía. Sin esta comprobación, quien fue suspendido seguía navegando hasta que ese
  // token expirara — y las páginas que sí miran la sesión lo mandaban a /login, donde la regla de
  // abajo lo devolvía al inicio por tener usuario: un rebote infinito en vez de una explicación.
  //
  // Es una consulta más por request, por clave primaria. Se paga a propósito: es la diferencia
  // entre que una baja sea efectiva ahora o dentro de una hora.
  if (features.AUTH_V2 && user) {
    const { data: emp } = await supabase.from('empleados').select('activo').eq('id', user.id).maybeSingle();
    if (emp && (emp as { activo: boolean }).activo === false) {
      await supabase.auth.signOut();
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'suspendido');
      return conToken(NextResponse.redirect(url));
    }
  }

  if (features.AUTH_V2 && !user && !enLogin) return redir('/login');
  if (features.AUTH_V2 && user && enLogin) return redir('/');

  // Device-gate: solo para usuarios autenticados, fuera de /login y /dispositivo, y no en assets.
  const enDispositivo = path === '/dispositivo';
  const esAsset = /\.[a-z0-9]+$/i.test(path);
  if (isOn('DEVICE_GATE') && user && !enLogin && !enDispositivo && !esAsset) {
    try {
      const { data: estado } = await supabase.rpc('dispositivo_estado', { p_device_id: deviceId });
      if (estado !== 'aprobado') {
        // Autoaprobación silenciosa: si quien entra es admin/dueño, dispositivo_autoaprobar (0036)
        // valida app_es_admin() adentro y aprueba el equipo actual sin pasar por /dispositivo. En
        // 'setup' (bootstrap: aún no hay NINGÚN equipo aprobado) el intento es best-effort — nunca
        // bloquea aunque falle, para no romper el bootstrap del primer admin (o de un no-admin
        // antes de que exista el primer equipo aprobado). Fuera de 'setup', un no-admin sí recibe
        // el error de la RPC y sigue el flujo normal (solicitar acceso → admin aprueba).
        const { error: autoErr } = await supabase.rpc('dispositivo_autoaprobar', { p_device_id: deviceId });
        if (autoErr && estado !== 'setup') return redir('/dispositivo');
      }
    } catch {
      // Fail-open: nunca brickear el arranque por un fallo de red/BD.
    }
  }

  return conToken(res);
}

export const config = {
  // `assets` (Fase 3, logo real): estaba fuera de esta lista y el gate de AUTH_V2 redirigía
  // cualquier request no autenticado a /login — incluida la petición interna que hace el
  // optimizador de next/image al leer el PNG. Efecto: el logo salía roto para cualquiera que
  // todavía no tuviera sesión, justo el caso que más importa (la propia página de login).
  matcher: ['/((?!_next/static|_next/image|assets|favicon.ico).*)'],
};
