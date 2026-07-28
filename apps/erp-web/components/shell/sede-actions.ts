'use server';

import { getSesion, fijarSedeActiva } from '../../lib/auth';
import { sedesPermitidas } from '@scilb/core';
import { listarSedes } from '../../lib/sedes-repo';

// Cambio de sede desde el topbar (Fase 2): la única otra pantalla, aparte del login, donde se
// elige sede — el resto del sistema toma sesion.usuario.sede tal cual. No es un campo de
// seguridad (RLS filtra por auth.uid() → empleado_tiendas, nunca por esta cookie), pero igual se
// valida contra las sedes reales del empleado para que el popover no pueda usarse para "fingir"
// estar en una sede a la que no tiene acceso — admin/dueño sí pueden elegir cualquiera.
export async function cambiarSedeAction(sede: string): Promise<{ ok: boolean }> {
  if (!sede) return { ok: false };
  const sesion = await getSesion();
  if (!sesion) return { ok: false };

  const permitidas = sedesPermitidas(sesion.usuario);
  if (permitidas !== null && !permitidas.includes(sede)) return { ok: false };
  if (permitidas === null) {
    const todas = await listarSedes().catch(() => []);
    if (!todas.some((s) => s.cod === sede)) return { ok: false };
  }

  fijarSedeActiva(sede);
  return { ok: true };
}
