import Link from 'next/link';
import { History } from 'lucide-react';
import { puede, type MatrizPermisos } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { sesionAbierta, movimientosSesion, cobrosPendientes, resumenMovimientos } from '../../lib/caja-repo';
import { PageHeader } from '../../components/shell/page-header';
import { buttonVariants } from '../../components/ui/button';
import { CajaCliente } from './cliente';

// Cajero como permiso configurable (Fase 9): 'pos_cobro' — quien lo tiene puede abrir/cerrar
// caja, cobrar, registrar egresos y garantías; sin él, la caja se ve en modo solo-lectura
// (movimientos, cobros pendientes) según el módulo 'caja' de siempre.
export default async function CajaPage() {
  const sesion = await getSesion();
  const sede = sesion?.usuario.sede ?? '';
  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  const puedeCobrar = sesion ? puede(matriz, sesion.usuario.rol, 'pos_cobro', 'ver', sesion.usuario.rolCod) : false;
  const [ses, pendientes] = await Promise.all([sesionAbierta(sede), cobrosPendientes()]);
  const movimientos = ses ? await movimientosSesion(ses.id) : [];
  const resumen = ses ? resumenMovimientos(ses, movimientos) : null;

  return (
    <div>
      <PageHeader
        title="Caja"
        subtitle={`Sede ${sede || '—'} · cobros y arqueo diario`}
        action={
          <Link href="/caja/historial" className={buttonVariants({ variant: 'outline' })}>
            <History className="h-4 w-4" strokeWidth={1.75} /> Historial
          </Link>
        }
      />
      <CajaCliente sede={sede} sesion={ses} movimientos={movimientos} resumen={resumen} pendientes={pendientes} puedeCobrar={puedeCobrar} />
    </div>
  );
}
