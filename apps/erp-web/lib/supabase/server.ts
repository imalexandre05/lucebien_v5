import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente Supabase POR-REQUEST: anon key + sesión del usuario guardada en cookies.
// RESPETA la RLS — auth.uid() es el empleado logueado, así las políticas por
// sede/rol se evalúan de verdad. Es el camino de datos normal de la app.
//
// Usar SOLO en server: Server Components, Server Actions y Route Handlers.
// NO es singleton: se crea uno por cada request (lee las cookies de ese request).
//
// Reemplaza al viejo lib/supabase.ts (singleton con service_role, que bypaseaba
// la RLS — hallazgo H1 del plan de migración).
export function getServerClient() {
  // Next 15: cookies() es async. Se resuelve de forma perezosa dentro de los callbacks (que
  // @supabase/ssr admite async) para que getServerClient() siga siendo síncrono y no cambie
  // sus ~220 llamadores.
  return createServerClient(url, anonKey, {
    cookies: {
      async getAll() {
        return (await cookies()).getAll();
      },
      async setAll(cookiesToSet) {
        try {
          const cookieStore = await cookies();
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Invocado desde un Server Component (cookies de solo-lectura).
          // El middleware refresca la sesión, así que se puede ignorar.
        }
      },
    },
  });
}
