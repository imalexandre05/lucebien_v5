import Link from 'next/link';
import { CalendarClock, History } from 'lucide-react';
import { pedidosRepo } from '../../lib/pedidos-repo';
import { clientesRepo } from '../../lib/clientes-repo';
import { inventarioRepo } from '../../lib/inventario-repo';
import { sesionAbierta, movimientosSesion, resumenMovimientos } from '../../lib/caja-repo';
import { leerPosConfig } from '../../lib/pos-config';
import { getSesion } from '../../lib/auth';
import { hoyPeru } from '../../lib/fechas';
import { PageHeader } from '../../components/shell/page-header';
import { buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/cn';
import { PedidosConstructor } from './constructor/constructor';
import { PedidosPendientes } from './pendientes';

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

// /pedidos (Fase 9): el CONSTRUCTOR — una sola pantalla para armar cliente + líneas + fechas +
// garantía + cobro, con el ticket sticky al costado y el panel de pendientes debajo, sin modal ni
// rutas nuevas para el flujo principal. Sede (Fase 2, "el dispositivo manda"): sesion.usuario.sede,
// no hay ningún selector de sede en esta pantalla.
//
// `?nuevo=1` (Fase 10, punto 1): lo manda el botón "+ Nuevo pedido" de /caja — enfoca el buscador
// de cliente apenas se monta, para no obligar a un clic extra al llegar desde ahí.
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: { nuevo?: string };
}) {
  const sesion = await getSesion();
  const sede = sesion?.usuario.sede ?? '';
  const autoFocusCliente = searchParams.nuevo === '1';

  const [pedidos, clientes, activos, ses, posConfig] = await Promise.all([
    pedidosRepo.listar(),
    clientesRepo.listar(),
    inventarioRepo.listar(),
    sesionAbierta(sede),
    leerPosConfig(),
  ]);
  const movimientos = ses ? await movimientosSesion(ses.id) : [];
  const resumen = ses ? resumenMovimientos(ses, movimientos) : null;

  const devolucionesPendientes = pedidos.filter(
    (p) => p.items.some((i) => i.tipo === 'alquiler' && i.estado === 'activo') && !['cerrado', 'devuelto', 'cancelado'].includes(p.estado),
  ).length;

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle={`Sede ${sede || '—'} · alquiler · venta · servicios · confección`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-r-pastilla px-3 py-1.5 text-xs font-medium',
                ses ? 'bg-exito/10 text-exito-deep' : 'bg-error/15 text-error-deep',
              )}
              data-testid="chip-caja"
            >
              <span className={cn('h-1.5 w-1.5 rounded-r-pastilla', ses ? 'bg-exito' : 'bg-error')} />
              {ses ? `Caja abierta ${soles(resumen?.efectivoEsperado ?? 0)}` : 'Caja cerrada'}
            </span>
            <Link href="/pedidos/devoluciones" className={buttonVariants({ variant: 'outline' })}>
              <CalendarClock className="h-4 w-4" strokeWidth={2} />
              Devoluciones {devolucionesPendientes > 0 && `(${devolucionesPendientes})`}
            </Link>
            <Link href="/pedidos/historial" className={buttonVariants({ variant: 'outline' })}>
              <History className="h-4 w-4" strokeWidth={2} />
              Historial
            </Link>
          </div>
        }
      />

      <PedidosConstructor
        clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre, dni: c.dni, telefono: c.telefono }))}
        activos={activos}
        sedeActual={sede}
        cajaAbierta={Boolean(ses)}
        autoFocusCliente={autoFocusCliente}
        metodosPago={posConfig.metodosPago}
        docGarantia={posConfig.docGarantia}
        fechasRapidas={posConfig.fechasRapidas}
      />

      <PedidosPendientes pedidos={pedidos} hoy={hoyPeru()} metodosPago={posConfig.metodosPago} />
    </div>
  );
}
