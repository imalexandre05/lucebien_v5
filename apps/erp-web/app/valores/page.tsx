import { redirect } from 'next/navigation';
import { puede, type MatrizPermisos } from '@scilb/core';
import { companerosParaEvaluar, miResumenValores, seguimientoValores } from '../../lib/valores-repo';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { tieneReauth } from '../../lib/reauth';
import { mesPeru } from '../../lib/fechas';
import { PageHeader } from '../../components/shell/page-header';
import { ValoresCliente } from './cliente';

// Fase 12 tarea 1: Valores 360° — peer review de 6 valores, TODO el equipo evalúa a TODO el
// equipo (a diferencia de /evaluaciones y /pagos, que son solo admin/encargado). Por eso el gate
// es solo el permiso 'valores' (sembrado para los 7 roles en la migración 0057) — SIN reauth: dar
// tu opinión sobre un compañero, o ver tu propio resumen, no es tan sensible como ver salarios.
//
// "Seguimiento" (abajo, solo esAdmin) SÍ agrega señales de desempeño de todo el equipo — ese panel
// específico pide reauth (mismo criterio que /evaluaciones), sin bloquear el resto de la pantalla.
export default async function ValoresPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'valores', 'ver', sesion.usuario.rolCod)) redirect('/reportes/nuevo');

  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';
  const mes = mesPeru();

  const [companeros, miResumen] = await Promise.all([
    companerosParaEvaluar(sesion.usuario.id, mes),
    miResumenValores(sesion.usuario.id, mes),
  ]);

  let seguimiento: Awaited<ReturnType<typeof seguimientoValores>> | null = null;
  let seguimientoBloqueado = false;
  if (esAdmin) {
    if (await tieneReauth(sesion.usuario.id)) {
      seguimiento = await seguimientoValores(mes);
    } else {
      seguimientoBloqueado = true;
    }
  }

  return (
    <div>
      <PageHeader title="Valores 360°" subtitle={`${mes} · evaluación entre compañeros`} />
      <ValoresCliente
        mes={mes}
        companeros={companeros}
        miResumen={miResumen}
        esAdmin={esAdmin}
        seguimiento={seguimiento}
        seguimientoBloqueado={seguimientoBloqueado}
      />
    </div>
  );
}
