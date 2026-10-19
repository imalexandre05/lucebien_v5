import { redirect } from 'next/navigation';
import { leerFiltrosEnvios, sedesFiltroEnvios } from '@scilb/core';
import { listarEnviosEnCamino, listarEnviosRecibidos, TOPE_EN_CAMINO } from '../../../lib/envios-repo';
import { getSesion } from '../../../lib/auth';
import { listarSedes } from '../../../lib/sedes-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { equipoCompartido } from '../../../lib/pipeline-operador';
import { EnviosCliente } from './cliente';

// Envíos a tienda: la mitad del flujo que faltaba. El almacén despacha desde el kanban
// (prendas 'listo' → Enviar); aquí la TIENDA confirma lo que le llegó (aceptar/observar)
// y el almacén ve el historial. Espeja pipeline-envios del viejo.
//
// Filtros por URL (?sede, ?desde, ?hasta, ?pag): quien ve más de una sede elige tienda; el rango
// de fechas sólo filtra el historial, nunca lo pendiente. La restricción real es la RLS.
// Spec: docs/superpowers/specs/pipeline/2026-10-03-envios-filtro-tienda-design.md
export default async function EnviosPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const [sesion, sedes, compartido] = await Promise.all([
    getSesion(),
    listarSedes().catch(() => []),
    equipoCompartido(),
  ]);
  // Recepción en tienda (0181): el almacén solo despacha; esta pantalla no es suya.
  if (!sesion || sesion.usuario.rol === 'encargado_almacen' || sesion.usuario.rol === 'confeccionista') redirect('/pipeline');
  // Destinos posibles: las sedes que no son almacén, como en el kanban (pipeline/page.tsx).
  const destinos = sedes.filter((s) => s.perfil !== 'almacen').map((s) => s.cod);
  const opciones = sesion ? sedesFiltroEnvios(sesion.usuario, destinos) : [];
  const filtros = leerFiltrosEnvios(searchParams, opciones);

  const [enCamino, recibidas] = await Promise.all([
    listarEnviosEnCamino({ sede: filtros.sede }),
    listarEnviosRecibidos(filtros),
  ]);

  return (
    <div>
      <PageHeader
        title="Recepción en tienda"
        subtitle="Acepta lo que llegó del almacén o devuélvelo a cualquier etapa con una nota"
      />
      <EnviosCliente
        enCamino={enCamino.prendas}
        enCaminoTruncado={enCamino.truncado}
        topeEnCamino={TOPE_EN_CAMINO}
        recibidas={recibidas.prendas}
        hayMasRecibidas={recibidas.hayMas}
        miSede={sesion?.usuario.sede ?? ''}
        opcionesSede={
          opciones.length > 1
            ? opciones.map((cod) => ({ cod, nombre: sedes.find((s) => s.cod === cod)?.nombre || cod }))
            : []
        }
        filtros={filtros}
        compartido={compartido}
      />
    </div>
  );
}
