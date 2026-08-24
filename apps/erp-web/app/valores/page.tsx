import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { puede, type MatrizPermisos } from '@scilb/core';
import {
  companerosParaEvaluar,
  miResumenValores,
  seguimientoValores,
  estadoVentanaValores,
  ValoresNoMigradoError,
} from '../../lib/valores-repo';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { tieneReauth } from '../../lib/reauth';
import { mesPeru } from '../../lib/fechas';
import { PageHeader } from '../../components/shell/page-header';
import { Card, CardContent } from '../../components/ui/card';
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

  // Degradación elegante (lección de la Fase 4/7, mismo patrón que /solicitudes): /valores es un
  // módulo enteramente nuevo — si la migración 0057 no corrió, avisar con claridad en vez de un 500.
  let companeros;
  let miResumen;
  try {
    [companeros, miResumen] = await Promise.all([
      companerosParaEvaluar(sesion.usuario.id, mes),
      miResumenValores(sesion.usuario.id, mes),
    ]);
  } catch (e) {
    if (e instanceof ValoresNoMigradoError) {
      return (
        <div>
          <PageHeader title="Valores 360°" subtitle="Evaluación entre compañeros" />
          <Card>
            <CardContent className="flex items-start gap-3 py-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-aviso" strokeWidth={1.75} />
              <div>
                <p className="text-sm font-semibold text-navy">Falta aplicar la migración 0057</p>
                <p className="mt-1 text-sm text-muted">
                  Este módulo todavía no tiene sus tablas en la base de datos. Aplica{' '}
                  <code className="rounded bg-navy/5 px-1.5 py-0.5 tabular-nums text-xs">
                    packages/db/migrations/0057_valores360_competencias_pagos.sql
                  </code>{' '}
                  contra el proyecto Supabase y recarga esta página.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    throw e;
  }

  let seguimiento: Awaited<ReturnType<typeof seguimientoValores>> | null = null;
  let seguimientoBloqueado = false;
  if (esAdmin) {
    if (await tieneReauth(sesion.usuario.id)) {
      seguimiento = await seguimientoValores(mes);
    } else {
      seguimientoBloqueado = true;
    }
  }

  // Fase 13 tarea 3: ventana de habilitación (config valores_habilitado/modo/dia_inicio/dia_fin,
  // migración 0058). Default = siempre abierta, así que esto no cambia nada hasta que el admin la
  // configure distinto desde /configuracion. Si 0058 no aplicó, leerConfigMap() no falla (select
  // genérico) y estadoVentanaValores() cae a los mismos defaults.
  const ventana = await estadoVentanaValores();

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
        avisoVentanaCerrada={ventana.abierto ? null : ventana.mensaje}
      />
    </div>
  );
}
