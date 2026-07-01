// Edge Function: auto-cierre-reportes  (desplegada en Supabase scilb, verify_jwt = true)
//
// Auto-cierre de reportes FR-01 + notificación por email (best-effort). Llama la función SQL
// idempotente `reportes_auto_cierre` (la misma que corre pg_cron 0022) y, si hay RESEND_API_KEY
// + ADMIN_EMAIL configurados como secrets de la función, envía un resumen por email. Sin esas
// variables el email se omite silenciosamente (el cierre de reportes igual ocurre vía pg_cron).
//
// El camino confiable de creación de registros es pg_cron → reportes_auto_cierre (migración 0022).
// Esta función es el disparador HTTP manual + capa de email; es idempotente, así que invocarla
// no duplica reportes ya cerrados.
//
// Para activar el email: en el dashboard de Supabase → Edge Functions → auto-cierre-reportes →
// Secrets, definir RESEND_API_KEY y ADMIN_EMAIL (o adaptar a otro proveedor SMTP).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let turnos = ['M', 'T', 'C'];
  try {
    const b = await req.json();
    if (Array.isArray(b?.turnos) && b.turnos.length) turnos = b.turnos;
  } catch (_) {
    /* sin body → todos los turnos */
  }

  const { data, error } = await supabase.rpc('reportes_auto_cierre', { p_turnos: turnos });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cerrados = (data ?? []) as { id: string; sede: string; turno: string; no_evaluable: boolean }[];

  let email = 'skipped';
  const key = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('ADMIN_EMAIL');
  if (key && to && cerrados.length) {
    const lineas = cerrados
      .map((c) => `• ${c.id} ${c.no_evaluable ? '(no evaluable)' : '(auto-enviado)'}`)
      .join('\n');
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'SCI-LB <onboarding@resend.dev>',
          to: [to],
          subject: `Auto-cierre FR-01 — ${cerrados.length} reporte(s)`,
          text: `Reportes cerrados automáticamente al pasar el deadline:\n\n${lineas}`,
        }),
      });
      email = r.ok ? 'sent' : `error ${r.status}`;
    } catch (_) {
      email = 'error';
    }
  }

  return new Response(JSON.stringify({ ok: true, cerrados, email }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
