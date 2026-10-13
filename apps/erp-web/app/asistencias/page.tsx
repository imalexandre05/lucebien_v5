import { Lock } from 'lucide-react';
import { listarAsistencias } from '../../lib/asistencias-repo';
import { listarEmpleados } from '../../lib/reportes-repo';
import { getSesion } from '../../lib/auth';
import { recortarRango } from '@scilb/core';
import { MAX_DIAS_RANGO, leerVistaRango } from '../../lib/periodo';
import { PageHeader } from '../../components/shell/page-header';
import { Card } from '../../components/ui/card';
import { Aviso } from '../../components/ui/form';
import { EmptyState } from '../../components/ui/empty-state';
import { SelectorRango } from '../../components/ui/selector-rango';
import { AsistenciasCliente } from './cliente';

export const dynamic = 'force-dynamic';

/**
 * La lista de asistencias de todo el equipo. Es una pantalla del administrador.
 *
 * POR QUÉ TIENE CANDADO PROPIO. La RLS de `asistencias` ya aísla bien —quien no es administrador
 * sólo ve sus propias filas, comprobado contra la base— así que esta pantalla nunca filtró datos
 * de nadie. Lo que hacía era peor de explicar que de arreglar: a un colaborador que llegaba
 * escribiendo la dirección le mostraba una pantalla de administración con todos los contadores en
 * cero, sin decirle por qué. Parecía el sistema roto.
 *
 * El aislamiento sigue viviendo en la base; esto es la puerta, que también tiene que existir.
 */
export default async function AsistenciasPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';

  if (!esAdmin) {
    return (
      <div>
        <PageHeader title="Asistencias" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta pantalla es del administrador">
            Reúne la asistencia de todo el equipo, y de ahí sale lo que se le paga a cada persona.
            Tu propia asistencia la ves en tu ficha.
          </EmptyState>
        </Card>
      </div>
    );
  }

  // Se mira por día, semana o mes (spec asistencias/2026-10-03-filtros-rango-design.md). Sin
  // nada en la URL, el mes en curso: es una elección de pantalla, no una regla de negocio.
  // Día, semana y mes nunca pasan de 31 días; el tope sólo muerde al rango personalizado.
  const { rango, recortado } = recortarRango(leerVistaRango(searchParams, 'mes')!.rango, MAX_DIAS_RANGO);
  const [asistencias, empleados] = await Promise.all([
    listarAsistencias(rango.desde, rango.hasta),
    listarEmpleados(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Asistencias" subtitle={`${asistencias.length} registros en el período`} />
      <SelectorRango porDefecto="mes" />
      {recortado && (
        <Aviso tono="aviso">
          El rango pedido pasa de {MAX_DIAS_RANGO} días. Se muestran los últimos {MAX_DIAS_RANGO}: del{' '}
          {rango.desde} al {rango.hasta}.
        </Aviso>
      )}
      <AsistenciasCliente asistencias={asistencias} empleados={empleados} esAdmin={esAdmin} />
    </div>
  );
}
