import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { puede, type MatrizPermisos } from '@scilb/core';
import { listarSolicitudes, SolicitudesNoMigradoError } from '../../lib/solicitudes-repo';
import {
  listarColoresSolicitud,
  listarArticulosSolicitud,
  listarTiposPrendaSolicitud,
} from '../../lib/solicitud-catalogos-repo';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { directorio } from '../../lib/directorio';
import { PageHeader } from '../../components/shell/page-header';
import { Card, CardContent } from '../../components/ui/card';
import { SolicitudesCliente } from './cliente';

// Gate server-side (patrón Fase 1): antes de tocar la BD, valida permiso 'solicitudes'.'ver'.
export default async function SolicitudesPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'solicitudes', 'ver', sesion.usuario.rolCod)) redirect('/reportes/nuevo');

  // Degradación elegante (instrucción explícita de la Fase 11): si la migración 0056 no está
  // aplicada todavía, avisar con claridad en vez de un 500 — nada de intentar adivinar por el
  // código de error de PostgREST sin haberlo probado en vivo (lección de la Fase 7).
  let solicitudes;
  try {
    solicitudes = await listarSolicitudes();
  } catch (e) {
    if (e instanceof SolicitudesNoMigradoError) {
      return (
        <div>
          <PageHeader title="Solicitudes" subtitle="Tienda → almacén" />
          <Card>
            <CardContent className="flex items-start gap-3 py-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-aviso" strokeWidth={1.75} />
              <div>
                <p className="text-sm font-semibold text-navy">Falta aplicar la migración 0056</p>
                <p className="mt-1 text-sm text-muted">
                  Este módulo todavía no tiene sus tablas en la base de datos. Aplica{' '}
                  <code className="rounded bg-navy/5 px-1.5 py-0.5 font-mono text-xs">
                    packages/db/migrations/0056_solicitudes.sql
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

  const [colores, articulos, tiposPrenda, dir] = await Promise.all([
    listarColoresSolicitud(),
    listarArticulosSolicitud(),
    listarTiposPrendaSolicitud(),
    directorio(),
  ]);

  return (
    <div>
      <PageHeader title="Solicitudes" subtitle={`${solicitudes.length} · tienda → almacén`} />
      <SolicitudesCliente
        solicitudesIniciales={solicitudes}
        colores={colores}
        articulos={articulos}
        tiposPrenda={tiposPrenda}
        empleados={dir.map((d) => ({ id: d.id, nombre: d.nombre, sedeCod: d.sedeCod }))}
        rol={sesion.usuario.rol}
        sedeActual={sesion.usuario.sede}
      />
    </div>
  );
}
