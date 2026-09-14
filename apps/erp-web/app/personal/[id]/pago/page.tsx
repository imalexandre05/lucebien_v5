import { notFound, redirect } from 'next/navigation';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { obtenerColaborador } from '../../../../lib/colaboradores-repo';
import { listarPagos, empleadosParaPago } from '../../../../lib/pagos-repo';
import {
  leerMetodosPago,
  listarLiquidaciones,
  listarPagosLiquidacion,
  LiquidacionPagosNoMigradoError,
  type PagoLiquidacion,
} from '../../../../lib/sueldos-repo';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';
import { PagosCliente } from '../../../pagos/cliente';
import { LiquidacionPagoCliente } from './cliente';

// Liquidación y pago (spec §2.6/§2.7): la liquidación ES el pago. Esta pantalla muestra las
// liquidaciones de la persona con su total · pagado · saldo y el registro de abonos (migración
// 0080), y deja los pagos sueltos de antes —tabla `pagos`, sin relación con las liquidaciones—
// colapsados abajo, sólo de lectura: no se migran ni se borran (§2.7), sólo dejan de ser la
// herramienta activa.
export const dynamic = 'force-dynamic';

export default async function PagoColaboradorPage({ params }: { params: { id: string } }) {
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.includes('pago')) redirect(`/personal/${params.id}`);

  const persona = await obtenerColaborador(params.id);
  if (!persona) notFound();

  const [liquidaciones, metodos, todosPagosViejos, empleadosViejo] = await Promise.all([
    listarLiquidaciones({ empleadoId: persona.id }),
    leerMetodosPago(),
    listarPagos(),
    empleadosParaPago(),
  ]);

  const pagosViejos = todosPagosViejos.filter((p) => p.empleadoId === persona.id);
  const soloEsta = empleadosViejo.filter((e) => e.id === persona.id);

  // La 0080 puede no estar aplicada todavía en esta base (la controla la Tarea 10, en paralelo).
  // Si listar los pagos de alguna liquidación cerrada revienta por tabla/función inexistente, la
  // pantalla no se cae: sigue mostrando las liquidaciones (total sin pagado/saldo) y avisa, en
  // vez de un 500. Sin liquidaciones cerradas no hace falta ni probar: no hay nada que mostrar.
  const cerradas = liquidaciones.filter((l) => l.estado === 'cerrada');
  const pagosPorLiquidacion: Record<string, PagoLiquidacion[]> = {};
  let migrado = true;
  if (cerradas.length > 0) {
    try {
      const listas = await Promise.all(cerradas.map((l) => listarPagosLiquidacion(l.id)));
      cerradas.forEach((l, i) => {
        pagosPorLiquidacion[l.id] = listas[i];
      });
    } catch (e) {
      if (e instanceof LiquidacionPagosNoMigradoError) {
        migrado = false;
      } else {
        throw e;
      }
    }
  }

  return (
    <div className="space-y-4">
      <SeccionHeader seccion="pago" />

      <LiquidacionPagoCliente
        empleadoId={persona.id}
        liquidaciones={liquidaciones}
        pagosPorLiquidacion={pagosPorLiquidacion}
        metodos={metodos}
        migrado={migrado}
      />

      <details className="group rounded-r-medio border border-line bg-white">
        <summary className="cursor-pointer select-none px-5 py-3 text-cuerpo font-medium text-navy marker:content-none">
          Pagos registrados antes del sistema de liquidaciones
        </summary>
        <div className="border-t border-line px-5 py-4">
          <p className="mb-3 text-apoyo leading-relaxed text-muted">
            Quedan a la vista, sólo lectura: no se migran a una liquidación —nunca hubo relación
            entre esta tabla y el motor de sueldos— ni se borran.
          </p>
          <PagosCliente
            pagos={pagosViejos}
            empleados={
              soloEsta.length
                ? soloEsta
                : [{ id: persona.id, nombre: persona.nombre, salarioBase: persona.salarioBase, ultimaNota: null }]
            }
            esAdmin={false}
          />
        </div>
      </details>
    </div>
  );
}
