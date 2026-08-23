import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { puede, type MatrizPermisos } from '@scilb/core';
import { getSesion } from '../../../lib/auth';
import { leerMatrizPermisos } from '../../../lib/permisos-repo';
import { listarAuditoria, AuditoriaNoMigradoError } from '../../../lib/auditoria-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { AuditoriaCliente } from './cliente';

// Fase 13 tarea 4: puerto del middleware de auditoría del sistema viejo (server.js:22-79) como
// triggers de Postgres (migración 0058) + esta pantalla de solo-lectura. Sin fila propia en
// permisos_modulos (mismo criterio que /empleados, /configuracion, /dispositivos): puede() deja
// pasar a admin/dueño por mecanismo y a nadie más, sin necesidad de sembrar nada.
export default async function AuditoriaPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'auditoria', 'ver', sesion.usuario.rolCod)) redirect('/');

  // Degradación elegante (lección de la Fase 4/7, mismo patrón que /solicitudes y /valores):
  // audit_log es una tabla enteramente NUEVA — si la migración 0058 no aplicó, avisar con
  // claridad en vez de un 500.
  try {
    const filas = await listarAuditoria();
    return (
      <div>
        <PageHeader title="Auditoría" subtitle="Quién hizo qué, cuándo — pedidos, caja, empleados, pagos y evaluaciones" />
        <AuditoriaCliente filasIniciales={filas} />
      </div>
    );
  } catch (e) {
    if (e instanceof AuditoriaNoMigradoError) {
      return (
        <div>
          <PageHeader title="Auditoría" subtitle="Quién hizo qué, cuándo — pedidos, caja, empleados, pagos y evaluaciones" />
          <Card>
            <CardContent className="flex items-start gap-3 py-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-aviso" strokeWidth={1.75} />
              <div>
                <p className="text-sm font-semibold text-navy">Falta aplicar la migración 0058</p>
                <p className="mt-1 text-sm text-muted">
                  Este módulo todavía no tiene su tabla ni sus triggers en la base de datos. Aplica{' '}
                  <code className="rounded bg-navy/5 px-1.5 py-0.5 tabular-nums text-xs">
                    packages/db/migrations/0058_config_tipado_auditoria.sql
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
}
