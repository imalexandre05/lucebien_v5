import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente Supabase para Client Components (sobre todo el Realtime del pipeline,
// que reemplaza al SSE del sistema viejo — Fase 3 del plan).
// anon key + sesión en cookies → RESPETA la RLS.
export function getBrowserClient() {
  return createBrowserClient(url, anonKey);
}
