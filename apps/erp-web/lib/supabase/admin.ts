import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ⚠️ Cliente con SERVICE_ROLE: BYPASEA la RLS (acceso total a la BD).
// SOLO server-side y SOLO para operaciones administrativas legítimas:
//   - provisionar los empleados como usuarios de Supabase Auth (Fase 1)
//   - jobs / ETL / migraciones
// NUNCA importar desde un módulo 'use client': filtraría el secreto al navegador.
// (Como SUPABASE_SERVICE_ROLE_KEY no es NEXT_PUBLIC_, ni siquiera existe en el
//  bundle del cliente; este módulo lanzaría error si se usara ahí.)
let _admin: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY no configurado. Pegalo en apps/erp-web/.env.local (Supabase dashboard → Settings → API).'
    );
  }
  if (!_admin) {
    _admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

// ¿Está configurado el service_role? Los repos lo usan para decidir si pueden
// hacer operaciones admin o si caen a un fallback.
export const adminConfigurado = (): boolean => Boolean(url && serviceKey);
