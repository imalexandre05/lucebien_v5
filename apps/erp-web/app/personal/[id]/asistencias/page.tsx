import { notFound, redirect } from 'next/navigation';
import { CalendarCheck, Lock } from 'lucide-react';
import { diasDelPeriodo, diasPorRevisar, resumirHorario, diaSemanaISO } from '@scilb/core';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { obtenerColaborador } from '../../../../lib/colaboradores-repo';
import { listarAcuerdos } from '../../../../lib/sueldos-repo';
import { listarAsistenciasPeriodo } from '../../../../lib/asistencias-repo';
import { leerConfigMap } from '../../../../lib/config-repo';
import { parametrosEfectivos } from '../../../../lib/contrato-efectivo';
import { hoyPeru } from '../../../../lib/fechas';
import { fechaAmable } from '../../../../lib/asistencia-revisar-texto';
import { leerPeriodo, rangoCorto } from '../../../../lib/periodo';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Aviso } from '../../../../components/ui/form';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';
import { AsistenciaCliente } from '../../../sueldos/asistencia/cliente';
import { PorRevisar, type DiaConPrevio } from './por-revisar';
import { CalendarioPeriodo, type EstadoDia } from './calendario-periodo';

// Asistencia de la ficha (decisión del dueño n.º 5 y n.º 4, 18-oct-2026; spec sueldos/2026-10-18-
// ficha-unica-asistencia-por-revisar-design.md).
//
// EL RANGO ES EL PERÍODO DE LA BARRA, recortado al contrato: la parte del período que cae dentro
// del contrato. Antes era el contrato entero. El horario pactado sigue saliendo del contrato (sin
// él no se puede medir la tardanza), así que lo que queda fuera de contrato no se declara: se avisa.
//
// ARRIBA va «Por revisar» (sólo los días con problema; los completos se dan por trabajados), luego
// el calendario del período y, plegado, el editor completo de /sueldos/asistencia — que sabe cosas
// que costó aprender (un día sin declarar no es una falta, el margen del marcaje astuto C-05, el
// turno de la fila que ya existe) — para los casos raros, como un día partido en varios tramos.
export const dynamic = 'force-dynamic';

export default async function AsistenciasColaboradorPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.includes('asistencias')) redirect(`/personal/${params.id}`);

  const esAdmin = acceso.sesion.usuario.rol === 'admin' || acceso.sesion.usuario.rol === 'dueno';
  const persona = await obtenerColaborador(params.id);
  if (!persona) notFound();

  if (!esAdmin) {
    return (
      <div className="space-y-3">
        <SeccionHeader seccion="asistencias" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta sección es del administrador">
            Declarar qué pasó cada día cambia lo que se le paga a una persona. Hoy sólo lo hace el
            administrador o el dueño.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const periodo = leerPeriodo(searchParams);
  const todosLosAcuerdos = await listarAcuerdos(persona.id);
  const acuerdos = todosLosAcuerdos.filter((a) => a.estado !== 'liquidado');

  if (acuerdos.length === 0) {
    return (
      <div className="space-y-3">
        <SeccionHeader seccion="asistencias" />
        <Card>
          <EmptyState icon={CalendarCheck} titulo={`${persona.nombre} no tiene ningún contrato abierto`}>
            La asistencia se declara sobre el período de un contrato, porque de ahí sale el horario
            pactado contra el que se mide la tardanza. Primero hay que pactar uno en Contrato.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const pedido = Array.isArray(searchParams?.acuerdo) ? searchParams?.acuerdo[0] : searchParams?.acuerdo;
  // Sin un contrato pedido a mano, gana el que se solapa con el período de la barra: es el que la
  // persona estaba mirando. Si ninguno se solapa, el más reciente.
  const elegido =
    acuerdos.find((a) => a.id === pedido) ??
    acuerdos.find((a) => a.fechaInicio <= periodo.hasta && (a.fechaFin ?? '9999-12-31') >= periodo.desde) ??
    acuerdos[0];

  // Intersección del período con el contrato elegido.
  const finContrato = elegido.fechaFin ?? '9999-12-31';
  const desde = periodo.desde > elegido.fechaInicio ? periodo.desde : elegido.fechaInicio;
  const hasta = periodo.hasta < finContrato ? periodo.hasta : finContrato;
  const hayRango = desde <= hasta;

  // Los días del período que NINGÚN contrato cubre (liquidados incluidos): de ahí sale la frase «no tiene contrato».
  const sinContrato = rangosSinContrato(periodo, todosLosAcuerdos);

  const [filasContrato, config, efectivos] = await Promise.all([
    listarAsistenciasPeriodo(elegido.empleadoId, elegido.fechaInicio, elegido.fechaFin),
    leerConfigMap(),
    parametrosEfectivos(elegido),
  ]);

  // Regla A del marcaje astuto (C-05), editable desde /configuracion. `Number('')` es 0 y es
  // finito, así que la fila vacía se comprueba antes de convertir: si no, cualquier exceso de un
  // minuto quedaría marcado.
  const crudo = config.sueldo_margen_horas_dia_minutos;
  const margen = crudo == null || crudo.trim() === '' ? 120 : Number(crudo);

  const hoy = hoyPeru();
  const filas = filasEnRango(filasContrato, desde, hasta);
  const horario = elegido.turnos.map((t) => ({ diaSemana: t.diaSemana, horaInicio: t.horaInicio, horaFin: t.horaFin }));
  const porRevisar = hayRango
    ? diasPorRevisar({ desde, hasta, hoy, horario, filas, toleranciaMinutos: efectivos.toleranciaMinutos })
    : [];

  const conPrevio: DiaConPrevio[] = porRevisar.map((d) => {
    const delDia = filas.filter((f) => f.fecha === d.fecha);
    const f = delDia.find((x) => x.horaEntrada || x.horaSalida) ?? delDia[0];
    return {
      ...d,
      previo: {
        entrada: f?.horaEntrada ?? null,
        salida: f?.horaSalida ?? null,
        tardanzaJustificada: delDia.some((x) => x.tardanzaJustificada),
        motivo: delDia.find((x) => x.tardanzaJustificada)?.motivoJustificacion ?? null,
      },
    };
  });

  const calendario = hayRango ? armarCalendario({ desde, hasta, hoy, horario, filas, revisar: new Set(porRevisar.map((d) => d.fecha)) }) : [];

  return (
    <div className="space-y-4">
      <SeccionHeader
        seccion="asistencias"
        nota={`Se muestra el período elegido arriba (${rangoCorto(periodo.desde, periodo.hasta)}), dentro del contrato.`}
      />

      {sinContrato.length > 0 && (
        <Aviso tono="info">
          {sinContrato.map((r) => (r.desde === r.hasta ? `El ${fechaAmable(r.desde)}` : `Del ${fechaAmable(r.desde)} al ${fechaAmable(r.hasta)}`)).join(' · ')}{' '}
          no tiene contrato, por eso no se pide asistencia.
        </Aviso>
      )}

      {!hayRango ? (
        <Card>
          <EmptyState icon={CalendarCheck} titulo="Este período no cae dentro de ningún contrato abierto">
            El contrato va del {elegido.fechaInicio} al {elegido.fechaFin ?? 'sin fin'}. Elige otro período arriba para
            declarar la asistencia.
          </EmptyState>
        </Card>
      ) : (
        <>
          <PorRevisar empleadoId={persona.id} dias={conPrevio} parametros={efectivos} />

          <Card>
            <CardHeader>
              <CardTitle>Día por día</CardTitle>
              <span className="text-apoyo tabular-nums text-muted">{rangoCorto(desde, hasta)}</span>
            </CardHeader>
            <CardContent>
              <CalendarioPeriodo dias={calendario} />
            </CardContent>
          </Card>

          <details id="editor-asistencia" className="group rounded-r-medio border border-line bg-white">
            <summary className="cursor-pointer select-none px-5 py-3 text-cuerpo font-medium text-navy marker:content-none">
              Ver y editar todos los días
            </summary>
            <div className="border-t border-line p-3 sm:p-4">
              <p className="mb-3 text-apoyo leading-relaxed text-muted">
                Para los casos raros, como un día partido en varios tramos. Lo de arriba resuelve casi todo.
              </p>
              <AsistenciaCliente
                // key: los borradores de cada día salen de un useState sembrado con el calendario del
                // contrato. Cambiar sólo `?acuerdo=` no remonta el cliente, y quedarían los días del
                // contrato anterior. Con la key, se remonta. El período también: cambia el rango.
                key={`${elegido.id}:${desde}:${hasta}`}
                acuerdos={acuerdos}
                acuerdo={elegido}
                filas={filasContrato}
                margenMinutos={Number.isFinite(margen) ? margen : 120}
                rango={{ desde, hasta }}
              />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

type FilaDia = Awaited<ReturnType<typeof listarAsistenciasPeriodo>>[number];

function filasEnRango(filas: FilaDia[], desde: string, hasta: string): FilaDia[] {
  return filas.filter((f) => f.fecha >= desde && f.fecha <= hasta);
}

/** Rangos seguidos de días del período que ningún contrato cubre. */
function rangosSinContrato(
  periodo: { desde: string; hasta: string },
  acuerdos: { fechaInicio: string; fechaFin: string | null }[],
): { desde: string; hasta: string }[] {
  const out: { desde: string; hasta: string }[] = [];
  for (const fecha of diasDelPeriodo(periodo.desde, periodo.hasta)) {
    const cubierto = acuerdos.some((a) => a.fechaInicio <= fecha && (a.fechaFin ?? '9999-12-31') >= fecha);
    if (cubierto) continue;
    const ultimo = out[out.length - 1];
    if (ultimo && diasDelPeriodo(ultimo.hasta, fecha).length === 2) ultimo.hasta = fecha;
    else out.push({ desde: fecha, hasta: fecha });
  }
  return out;
}

function armarCalendario(p: {
  desde: string;
  hasta: string;
  hoy: string;
  horario: { diaSemana: number; horaInicio: string; horaFin: string }[];
  filas: FilaDia[];
  revisar: Set<string>;
}): { fecha: string; estado: EstadoDia }[] {
  let porDia: ReturnType<typeof resumirHorario>;
  try {
    porDia = resumirHorario(p.horario);
  } catch {
    porDia = new Map();
  }
  return diasDelPeriodo(p.desde, p.hasta).map((fecha) => {
    const delDia = p.filas.filter((f) => f.fecha === fecha);
    let estado: EstadoDia;
    if (p.revisar.has(fecha)) estado = 'revisar';
    else if (delDia.some((f) => f.condicion === 'falta')) estado = 'falta';
    else if (delDia.some((f) => f.condicion === 'trabajado')) estado = 'trabajo';
    else estado = 'sin_horario';
    // Sin horario ese día y sin nada declarado: gris. (`porDia` evita pintar de dorado un domingo libre.)
    if (estado === 'revisar' && !porDia.has(diaSemanaISO(fecha)) && delDia.length === 0) estado = 'sin_horario';
    return { fecha, estado };
  });
}
