'use client';

import { useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check } from 'lucide-react';
import { diaSemanaISO, diasDelPeriodo, resumirHorario, soloHastaHoy } from '@scilb/core';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input, Label, Select } from '../../../components/ui/form';
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui/table';
import { DialogoConfirmar, useConfirmacion } from '../../../components/ui/confirmar';
import { hoyPeru } from '../../../lib/fechas';
import type { AsistenciaDia, CondicionDia } from '../../../lib/asistencias-repo';
import type { AcuerdoSueldo } from '../../../lib/sueldos-repo';
import { accionDeclararDia, accionDeclararVarios, type DiaForm } from './actions';

const DIAS_CORTO = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

const ETIQUETA: Record<CondicionDia, string> = {
  sin_dato: 'Pendiente de resolver',
  trabajado: 'Trabajó',
  falta: 'Faltó',
};

type Borrador = {
  condicion: CondicionDia;
  horaEntrada: string;
  horaSalida: string;
  tardanzaJustificada: boolean;
  faltaJustificada: boolean;
  motivo: string;
  /** El turno de la fila que ya existe. Se conserva para no crear una segunda fila del mismo día. */
  turno?: string;
  /** De dónde salió el dato: 'manual', 'reporte' y mañana 'huellero'. */
  fuente?: string;
  /**
   * La hora que se ve en el campo la propuso el sistema con el horario contratado, no salió de
   * una marca del huellero (migración 0097). Se muestra distinta para que quien declara sepa que
   * todavía no es un dato real — y al guardar, `declararDia()` la baja sola (asistencias-repo.ts).
   */
  entradaEstimada: boolean;
  salidaEstimada: boolean;
  sucio: boolean;
};

const vacio = (): Borrador => ({
  condicion: 'sin_dato',
  horaEntrada: '',
  horaSalida: '',
  tardanzaJustificada: false,
  faltaJustificada: false,
  motivo: '',
  entradaEstimada: false,
  salidaEstimada: false,
  sucio: false,
});

const deFila = (f: AsistenciaDia): Borrador => ({
  condicion: f.condicion,
  horaEntrada: f.horaEntrada ?? '',
  horaSalida: f.horaSalida ?? '',
  tardanzaJustificada: f.tardanzaJustificada,
  faltaJustificada: f.faltaJustificada,
  motivo: f.motivoJustificacion ?? '',
  turno: f.turno,
  fuente: f.fuente,
  entradaEstimada: f.entradaEstimada,
  salidaEstimada: f.salidaEstimada,
  sucio: false,
});

const hhmm = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const minutosDeHHMM = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Regla A del marcaje astuto (SPEC-cambios-reglas-2026-08-17 C-05).
 *
 * **No acusa a nadie y no descuenta nada.** Marca el día para que una persona lo mire. El caso que
 * busca es el de quien marca a las 9 de la mañana, se va, y vuelve a marcar a las 8 de la noche:
 * el sistema paga por horas, así que un día así cobra la jornada entera sin haberla trabajado.
 *
 * El margen es editable porque quedarse un rato de más es normal — con 60 minutos la señal sería
 * puro ruido y se aprendería a ignorarla, que es exactamente lo que hace inútil a una alerta.
 */
function excedeMargen(horasDeclaradas: number, horasContratadas: number, margenMinutos: number): boolean {
  if (horasContratadas <= 0 || horasDeclaradas <= 0) return false;
  return (horasDeclaradas - horasContratadas) * 60 > margenMinutos;
}

export function AsistenciaCliente({
  acuerdos,
  acuerdo,
  filas,
  margenMinutos,
  rango = null,
}: {
  acuerdos: AcuerdoSueldo[];
  acuerdo: AcuerdoSueldo;
  filas: AsistenciaDia[];
  margenMinutos: number;
  /**
   * Acota la tabla a los días del contrato dentro de este rango (vista día/semana/mes). `null`:
   * el contrato entero. Los contadores y el aviso siguen siendo del contrato entero: lo que frena
   * la liquidación es el período completo, y achicar la vista no puede esconderlo.
   */
  rango?: { desde: string; hasta: string } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const conf = useConfirmacion();

  // El calendario del periodo, con lo que dice el contrato de cada día. Sale de las mismas
  // funciones del core que va a usar la liquidación: si la pantalla dijera que el lunes son 11 h
  // y el motor calculara 10, el administrador declararía sobre un horario que no es el que paga.
  const calendario = useMemo(() => {
    let porDia: ReturnType<typeof resumirHorario>;
    try {
      porDia = resumirHorario(acuerdo.turnos);
    } catch {
      porDia = new Map();
    }
    return diasDelPeriodo(acuerdo.fechaInicio, acuerdo.fechaFin).map((fecha) => {
      const iso = diaSemanaISO(fecha);
      const contrato = porDia.get(iso);
      const delDia = filas.filter((f) => f.fecha === fecha);
      // Se edita la fila de día completo si existe; si no, la primera que haya. Un día puede tener
      // más de una fila (el envío de un reporte crea la del turno M), y crear otra más no rompe
      // nada, pero deja al administrador editando una y mirando otra.
      const fila = delDia.find((f) => f.turno === 'C') ?? delDia[0] ?? null;
      return {
        fecha,
        iso,
        horasContratadas: contrato?.horas ?? 0,
        entradaContrato: contrato ? hhmm(contrato.inicioMin) : null,
        fila,
        otras: delDia.length > 1 ? delDia.length - 1 : 0,
      };
    });
  }, [acuerdo, filas]);

  const [borradores, setBorradores] = useState<Record<string, Borrador>>(() =>
    Object.fromEntries(calendario.map((d) => [d.fecha, d.fila ? deFila(d.fila) : vacio()])),
  );

  const contratados = calendario.filter((d) => d.horasContratadas > 0);
  const sinDeclarar = contratados.filter((d) => (borradores[d.fecha]?.condicion ?? 'sin_dato') === 'sin_dato');

  // Lo que se ve y lo que actúa el botón «Declarar … como trabajados». Con la vista acotada son
  // sólo los días visibles: declarar algo que no está en pantalla sería pagar a ciegas.
  const visibles = rango ? calendario.filter((d) => d.fecha >= rango.desde && d.fecha <= rango.hasta) : calendario;
  const sinDeclararVisibles = rango
    ? sinDeclarar.filter((d) => d.fecha >= rango.desde && d.fecha <= rango.hasta)
    : sinDeclarar;
  // La acción masiva sólo cubre los días visibles Y hasta hoy (hora Perú): una falta futura declarada
  // de antemano como trabajada se pagaría, y el huellero ya no pisa lo declarado. Los futuros se
  // declaran uno a uno.
  const sinDeclararHastaHoy = soloHastaHoy(sinDeclararVisibles, hoyPeru());

  // Un cambio sin guardar en un día que la vista dejó afuera no se ve, y no está en la base:
  // esconderlo sin avisar haría creer que se guardó.
  const suciosFuera = rango
    ? calendario.filter((d) => borradores[d.fecha]?.sucio && (d.fecha < rango.desde || d.fecha > rango.hasta))
    : [];

  const set = (fecha: string, cambio: Partial<Borrador>) =>
    setBorradores((v) => ({ ...v, [fecha]: { ...v[fecha], ...cambio, sucio: true } }));

  const aForm = (fecha: string): DiaForm => {
    const b = borradores[fecha];
    return {
      empleadoId: acuerdo.empleadoId,
      fecha,
      turno: b.turno,
      condicion: b.condicion,
      horaEntrada: b.condicion === 'trabajado' ? b.horaEntrada || null : null,
      horaSalida: b.condicion === 'trabajado' ? b.horaSalida || null : null,
      tardanzaJustificada: b.tardanzaJustificada,
      faltaJustificada: b.faltaJustificada,
      motivoJustificacion: b.motivo || null,
    };
  };

  const guardar = (fecha: string) => {
    setError(null);
    empezar(async () => {
      const r = await accionDeclararDia(aForm(fecha));
      if (r.ok) {
        setBorradores((v) => ({ ...v, [fecha]: { ...v[fecha], sucio: false } }));
        router.refresh();
      } else setError(r.error ?? 'No se pudo guardar.');
    });
  };

  /**
   * Declara de una vez todos los días contratados que siguen sin declarar, con el horario del
   * contrato. Lo confirma una persona y queda en la auditoría: el sistema no infiere nada solo.
   */
  const declararTodosTrabajados = () => {
    const cuantos = sinDeclararHastaHoy.length;
    // La confirmación más consecuente del sistema: declara N días como trabajados y eso se paga.
    // El confirm nativo la escribía con saltos de línea y en el tono del navegador; acá el título
    // dice cuántos días son y el detalle dice qué hay que hacer después, que es lo que de verdad
    // se olvida.
    conf.pedir({
      titulo: `¿Declarar ${cuantos} día(s) como trabajados?`,
      detalle:
        'Se usan las horas del contrato. Los días que la persona faltó hay que corregirlos después, uno por uno, y cada cambio queda registrado con tu nombre.',
      confirmarLabel: 'Declarar',
      tono: 'aviso',
      alConfirmar: () => hacerDeclararTodos(),
    });
  };

  const hacerDeclararTodos = () => {
    setError(null);
    empezar(async () => {
      const dias: DiaForm[] = sinDeclararHastaHoy.map((d) => {
        const b = borradores[d.fecha];
        const salida = hhmm(
          // Última salida del día = entrada del contrato + horas contratadas. Con el horario
          // contiguo de LuceBien (09:00–13:00 + 13:00–20:00) da exactamente las 20:00.
          (resumirHorario(acuerdo.turnos).get(d.iso)?.inicioMin ?? 0) + d.horasContratadas * 60,
        );
        return {
          empleadoId: acuerdo.empleadoId,
          fecha: d.fecha,
          turno: b?.turno,
          condicion: 'trabajado',
          horaEntrada: d.entradaContrato,
          horaSalida: salida,
          tardanzaJustificada: false,
          faltaJustificada: false,
          motivoJustificacion: null,
        };
      });
      const r = await accionDeclararVarios(dias);
      if (!r.ok) setError(r.error ?? 'No se pudieron declarar todos.');
      else conf.cerrar();
      router.refresh();
    });
  };

  return (
    <>
      <DialogoConfirmar {...conf.props} pending={pendiente} error={error ?? undefined} />
      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="min-w-[18rem] flex-1">
            <Label htmlFor="acuerdo">Contrato</Label>
            <Select
              id="acuerdo"
              value={acuerdo.id}
              onChange={(e) => {
                // F7 (validador de flujo 23-ago-2026): antes esto siempre mandaba a la ruta
                // suelta /sueldos/asistencia, así que elegir otro contrato desde
                // /personal/[id]/asistencias sacaba a la persona de su propia ficha. Con
                // usePathname() se queda donde está montado, y se preservan los demás parámetros
                // de la URL (el período de la barra) en vez de perderlos.
                const destino = e.target.value;
                const irA = () => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('acuerdo', destino);
                  router.push(`${pathname}?${params.toString()}`);
                };
                // Al cambiar de contrato el cliente se remonta (key en la page) y los días
                // editados sin guardar se pierden: se avisa antes, no después.
                const sinGuardar = Object.values(borradores).filter((b) => b.sucio).length;
                if (sinGuardar === 0) return irA();
                conf.pedir({
                  titulo: `Tienes ${sinGuardar} día(s) sin guardar`,
                  detalle: 'Si cambias de contrato se pierden.',
                  confirmarLabel: 'Cambiar de contrato',
                  tono: 'aviso',
                  alConfirmar: () => {
                    conf.cerrar();
                    irA();
                  },
                });
              }}
            >
              {acuerdos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.empleadoNombre ?? 'Sin nombre'} · {a.fechaInicio} → {a.fechaFin} ({a.estado})
                </option>
              ))}
            </Select>
          </div>
          <div className="text-cuerpo">
            <p className="text-apoyo text-muted">Días contratados</p>
            <p className="tabular-nums text-navy">{contratados.length}</p>
          </div>
          <div className="text-cuerpo">
            <p className="text-apoyo text-muted">Sin declarar</p>
            <p className="tabular-nums text-navy">
              {sinDeclarar.length === 0 ? (
                <Badge tone="green">ninguno</Badge>
              ) : (
                <Badge tone="amber">{sinDeclarar.length}</Badge>
              )}
            </p>
          </div>
          {sinDeclararHastaHoy.length > 0 && acuerdo.turnos.length > 0 && (
            <Button variant="outline" onClick={declararTodosTrabajados} pending={pendiente}>
              Declarar los {sinDeclararHastaHoy.length} días hasta hoy{rango ? ' de la vista' : ''}
            </Button>
          )}
        </CardContent>
      </Card>

      {sinDeclarar.length > 0 && (
        <p className="mb-4 flex gap-2 rounded-r-chico bg-aviso/10 px-3 py-2 text-cuerpo text-aviso-deep">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Quedan {sinDeclarar.length} día(s) contratados sin declarar. La liquidación no se va a
            poder calcular hasta que cada uno diga si se trabajó o se faltó — un día sin dato no es
            una falta, y darlo por falta costaría dos días de sueldo.
          </span>
        </p>
      )}

      {suciosFuera.length > 0 && (
        <p className="mb-4 flex gap-2 rounded-r-chico bg-aviso/10 px-3 py-2 text-cuerpo text-aviso-deep">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Hay {suciosFuera.length} día(s) con cambios sin guardar fuera de esta vista (
            <span className="tabular-nums">{suciosFuera.map((d) => d.fecha).join(', ')}</span>). Esos
            cambios todavía no están en la base: vuelve a «Contrato» para verlos y guardarlos.
          </span>
        </p>
      )}

      {error && <p className="mb-4 rounded-r-chico bg-error/10 px-3 py-2 text-cuerpo text-error-deep">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{acuerdo.empleadoNombre ?? 'Sin nombre'}</CardTitle>
          <span className="text-cuerpo text-muted tabular-nums">
            {acuerdo.fechaInicio} → {acuerdo.fechaFin}
            {rango && ` · viendo ${visibles.length} día(s)`}
          </span>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH>Día</TH>
                <TH>Contrato</TH>
                <TH>Condición</TH>
                <TH>Entrada</TH>
                <TH>Salida</TH>
                <TH>Justificación</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rango && visibles.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={7}>
                    El rango elegido no toca este contrato, que va del {acuerdo.fechaInicio} al{' '}
                    {acuerdo.fechaFin}.
                  </TD>
                </TR>
              )}
              {visibles.map((d) => {
                const b = borradores[d.fecha] ?? vacio();
                const contratado = d.horasContratadas > 0;
                const horasDeclaradas =
                  b.condicion === 'trabajado' && b.horaEntrada && b.horaSalida
                    ? (minutosDeHHMM(b.horaSalida) - minutosDeHHMM(b.horaEntrada)) / 60
                    : 0;
                const paraRevisar = excedeMargen(horasDeclaradas, d.horasContratadas, margenMinutos);
                return (
                  <TR key={d.fecha} className={contratado ? undefined : 'opacity-60'}>
                    <TD className="whitespace-nowrap">
                      <span className="font-medium text-navy">{d.fecha}</span>
                      <span className="ml-2 text-apoyo text-muted">{DIAS_CORTO[d.iso - 1]}</span>
                      {b.fuente && b.fuente !== 'manual' && (
                        <Badge tone="navy" className="ml-2">
                          {b.fuente}
                        </Badge>
                      )}
                      {d.otras > 0 && (
                        <span className="ml-2 text-apoyo text-muted">+{d.otras} fila(s) del mismo día</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-cuerpo text-muted">
                      {contratado ? `${d.entradaContrato} · ${d.horasContratadas} h` : 'fuera de contrato'}
                      {paraRevisar && (
                        <Badge tone="amber" className="ml-2">
                          revisar: {(horasDeclaradas - d.horasContratadas).toFixed(1)} h de más
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <Select
                        value={b.condicion}
                        onChange={(e) => set(d.fecha, { condicion: e.target.value as CondicionDia })}
                        aria-label={`Condición del ${d.fecha}`}
                        className="w-36"
                      >
                        {(['sin_dato', 'trabajado', 'falta'] as CondicionDia[]).map((c) => (
                          <option key={c} value={c}>
                            {ETIQUETA[c]}
                          </option>
                        ))}
                      </Select>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="time"
                          className="w-28"
                          value={b.horaEntrada}
                          disabled={b.condicion !== 'trabajado'}
                          onChange={(e) =>
                            set(d.fecha, { horaEntrada: e.target.value, entradaEstimada: false })
                          }
                          aria-label={`Entrada del ${d.fecha}`}
                        />
                        {Boolean(b.entradaEstimada) && (
                          <span title="El sistema propuso esta hora con el horario contratado: no hubo marca de entrada. Se guarda como real en cuanto la corrijas.">
                            <Badge tone="info" className="normal-case">
                              estimado
                            </Badge>
                          </span>
                        )}
                      </div>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="time"
                          className="w-28"
                          value={b.horaSalida}
                          disabled={b.condicion !== 'trabajado'}
                          onChange={(e) =>
                            set(d.fecha, { horaSalida: e.target.value, salidaEstimada: false })
                          }
                          aria-label={`Salida del ${d.fecha}`}
                        />
                        {Boolean(b.salidaEstimada) && (
                          <span title="El sistema propuso esta hora con el horario contratado: no hubo marca de salida. Se guarda como real en cuanto la corrijas.">
                            <Badge tone="info" className="normal-case">
                              estimado
                            </Badge>
                          </span>
                        )}
                      </div>
                    </TD>
                    <TD>
                      <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-1.5 text-apoyo">
                          <input
                            type="checkbox"
                            checked={b.condicion === 'falta' ? b.faltaJustificada : b.tardanzaJustificada}
                            onChange={(e) =>
                              set(
                                d.fecha,
                                b.condicion === 'falta'
                                  ? { faltaJustificada: e.target.checked }
                                  : { tardanzaJustificada: e.target.checked },
                              )
                            }
                          />
                          {b.condicion === 'falta' ? 'Falta justificada' : 'Tardanza justificada'}
                        </label>
                        <Input
                          className="w-52"
                          placeholder="Motivo…"
                          value={b.motivo}
                          onChange={(e) => set(d.fecha, { motivo: e.target.value })}
                          aria-label={`Motivo del ${d.fecha}`}
                        />
                      </div>
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant={b.sucio ? 'primary' : 'ghost'}
                        onClick={() => guardar(d.fecha)}
                        pending={pendiente}
                        disabled={!b.sucio}
                        aria-label={`Guardar el ${d.fecha}`}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <p className="mt-4 text-apoyo text-muted">
        Las tardanzas no se marcan acá: las calcula la liquidación comparando la hora de entrada
        contra el horario del contrato, con la tolerancia vigente. Lo que se declara acá es qué pasó
        ese día.
      </p>
    </>
  );
}
