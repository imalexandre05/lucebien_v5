import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client: SupabaseClient | null = null;

// Cliente server-side con service_role: bypassa RLS y NUNCA se expone al navegador
// (solo se usa en Server Components / Server Actions). Devuelve null si falta config
// → los repos caen a datos en memoria (demo) hasta que se cargue la key.
export function getSupabase(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  if (!client) {
    client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

export const supabaseConfigurado = (): boolean => Boolean(url && serviceKey);
