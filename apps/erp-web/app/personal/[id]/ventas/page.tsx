import { notFound, redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { resolverParametros, tramosSemanales } from '@scilb/core';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { obtenerColaborador } from '../../../../lib/colaboradores-repo';
import { pagosDeLaPersona } from '../../../../lib/pagos-ficha';
import { leerPeriodo, rangoCorto } from '../../../../lib/periodo';
import {
  calcularPreview,
  estadoFechaMovimiento,
  listarVentas,
  obtenerAcuerdo,
} from '../../../../lib/sueldos-repo';
import { listarVentasSemana } from '../../../../lib/ventas-semana-repo';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';
import { VentasSemanaCliente, type FilaSemana } from './cliente';

// Ventas y metas por semana (decisión del dueño n.º 8, migración 0166). Puente temporal hasta
// conectar el punto de venta: en vez de boleta por boleta, una fila por semana del período.
//
// LAS SEMANAS SON LAS DEL MOTOR (`tramosSemanales`), recortadas al contrato de la persona: así lo
// que se carga acá cae en la misma semana que el cálculo del pago.
// LA META Y EL TOTAL ESTIMADO SALEN DE UN CÁLCULO DE PRUEBA (`calcularPreview`, no escribe nada).
// Si ese cálculo no se puede hacer todavía (por ejemplo, días sin declarar), la pantalla se queda
// sin metas ni total, pero igual deja cargar las semanas.
export const dynamic = 'force-dynamic';

export default async function VentasColaboradorPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.includes('ventas')) redirect(`/personal/${params.id}`);

  const esAdmin = acceso.sesion.usuario.rol === 'admin' || acceso.sesion.usuario.rol === 'dueno';
  const persona = await obtenerColaborador(params.id);
  if (!persona) notFound();

  if (!esAdmin) {
    return (
      <div className="space-y-3">
        <SeccionHeader seccion="ventas" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta sección es del administrador">
            Lo vendido cada semana cambia lo que cobra una persona. Solo el administrador o el dueño
            lo cargan.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const periodo = leerPeriodo(searchParams);
  const { acuerdoId } = await pagosDeLaPersona(persona.id);
  const acuerdo = acuerdoId ? await obtenerAcuerdo(acuerdoId) : null;

  if (!acuerdo) {
    return (
      <div className="space-y-3">
        <SeccionHeader seccion="ventas" />
        <Card>
          <EmptyState icon={Lock} titulo="Todavía no tiene un contrato">
            Cuando tenga uno vigente, aquí podrás cargar lo que vendió cada semana.
          </EmptyState>
        </Card>
      </div>
    );
  }

  // El período elegido, recortado al contrato.
  const desde = periodo.desde > acuerdo.fechaInicio ? periodo.desde : acuerdo.fechaInicio;
  const hasta = periodo.hasta < acuerdo.fechaFin ? periodo.hasta : acuerdo.fechaFin;
  if (desde > hasta) {
    return (
      <div className="space-y-3">
        <SeccionHeader seccion="ventas" />
        <Card>
          <EmptyState icon={Lock} titulo="Ese período no cae en su contrato">
            Elige arriba un período dentro del contrato de {persona.nombre}.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const tramos = tramosSemanales(desde, hasta);
  const [cargadas, sueltas, estados, preview] = await Promise.all([
    listarVentasSemana(persona.id, desde, hasta),
    listarVentas({ empleadoId: persona.id, desde, hasta }),
    Promise.all(tramos.map((t) => estadoFechaMovimiento(persona.id, t.desde).catch(() => null))),
    calcularPreview(acuerdo.id, desde, hasta).catch(() => null),
  ]);

  const parametros = preview ? resolverParametros(preview.entrada.parametros) : null;
  const filas: FilaSemana[] = tramos.map((t, i) => {
    const carga = cargadas.find((c) => c.desde >= t.desde && c.desde <= t.hasta) ?? null;
    return {
      desde: t.desde,
      hasta: t.hasta,
      cerrada: estados[i]?.estado === 'cerrado',
      meta: preview?.liquidacion.ventas.semanas.find((s) => s.desde === t.desde)?.meta ?? null,
      carga: carga
        ? {
            totalBoletasMayores: carga.totalBoletasMayores,
            metaCumplida: carga.metaCumplida,
            montoVendido: carga.montoVendido,
          }
        : null,
      boletasSueltas: sueltas.filter((v) => v.fecha >= t.desde && v.fecha <= t.hasta).length,
    };
  });

  const linea = (regla: string) =>
    preview?.liquidacion.lineas.find((l) => l.regla === regla)?.monto ?? null;

  return (
    <div className="space-y-3">
      <SeccionHeader
        seccion="ventas"
        nota={`Se muestran las semanas de ${rangoCorto(desde, hasta)}. Lo que ves a la derecha es una referencia: el pago lo calcula al cerrar.`}
      />
      <VentasSemanaCliente
        key={`${desde}|${hasta}`}
        empleadoId={persona.id}
        filas={filas}
        pctComision={parametros?.pctComision ?? null}
        bonoMetaSemanal={parametros?.bonoMetaSemanal ?? null}
        primeraComision={linea('RN-13')}
        segundaComision={linea('RN-12')}
      />
    </div>
  );
}
