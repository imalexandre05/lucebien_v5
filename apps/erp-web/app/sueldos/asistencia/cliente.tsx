'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check } from 'lucide-react';
import { diaSemanaISO, diasDelPeriodo, resumirHorario } from '@scilb/core';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input, Label, Select } from '../../../components/ui/form';
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui/table';
import type { AsistenciaDia, CondicionDia } from '../../../lib/asistencias-repo';
import type { AcuerdoSueldo } from '../../../lib/sueldos-repo';
import { accionDeclararDia, accionDeclararVarios, type DiaForm } from './actions';

const DIAS_CORTO = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

const ETIQUETA: Record<CondicionDia, string> = {
  sin_dato: 'Sin declarar',
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
  sucio: boolean;
};

const vacio = (): Borrador => ({
  condicion: 'sin_dato',
  horaEntrada: '',
  horaSalida: '',
  tardanzaJustificada: false,
  faltaJustificada: false,
  motivo: '',
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
  sucio: false,
});

const hhmm = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function AsistenciaCliente({
  acuerdos,
  acuerdo,
  filas,
}: {
  acuerdos: AcuerdoSueldo[];
  acuerdo: AcuerdoSueldo;
  filas: AsistenciaDia[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

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
    const cuantos = sinDeclarar.length;
    const ok = window.confirm(
      `Se van a declarar ${cuantos} día(s) como TRABAJADOS con el horario del contrato.\n\n` +
        'Los días que la persona faltó hay que corregirlos después, uno por uno. ' +
        'Cada cambio queda registrado con tu nombre.\n\n¿Seguir?',
    );
    if (!ok) return;

    setError(null);
    empezar(async () => {
      const dias: DiaForm[] = sinDeclarar.map((d) => {
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
      router.refresh();
    });
  };

  return (
    <>
      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="min-w-[18rem] flex-1">
            <Label htmlFor="acuerdo">Contrato</Label>
            <Select
              id="acuerdo"
              value={acuerdo.id}
              onChange={(e) => router.push(`/sueldos/asistencia?acuerdo=${e.target.value}`)}
            >
              {acuerdos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.empleadoNombre ?? 'Sin nombre'} · {a.fechaInicio} → {a.fechaFin} ({a.estado})
                </option>
              ))}
            </Select>
          </div>
          <div className="text-sm">
            <p className="text-xs text-muted">Días contratados</p>
            <p className="tabular-nums text-navy">{contratados.length}</p>
          </div>
          <div className="text-sm">
            <p className="text-xs text-muted">Sin declarar</p>
            <p className="tabular-nums text-navy">
              {sinDeclarar.length === 0 ? (
                <Badge tone="green">ninguno</Badge>
              ) : (
                <Badge tone="amber">{sinDeclarar.length}</Badge>
              )}
            </p>
          </div>
          {sinDeclarar.length > 0 && acuerdo.turnos.length > 0 && (
            <Button variant="outline" onClick={declararTodosTrabajados} pending={pendiente}>
              Declarar los {sinDeclarar.length} como trabajados
            </Button>
          )}
        </CardContent>
      </Card>

      {sinDeclarar.length > 0 && (
        <p className="mb-4 flex gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Quedan {sinDeclarar.length} día(s) contratados sin declarar. La liquidación no se va a
            poder calcular hasta que cada uno diga si se trabajó o se faltó — un día sin dato no es
            una falta, y darlo por falta costaría dos días de sueldo.
          </span>
        </p>
      )}

      {error && <p className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{acuerdo.empleadoNombre ?? 'Sin nombre'}</CardTitle>
          <span className="text-sm text-muted">
            {acuerdo.fechaInicio} → {acuerdo.fechaFin}
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
              {calendario.map((d) => {
                const b = borradores[d.fecha] ?? vacio();
                const contratado = d.horasContratadas > 0;
                return (
                  <TR key={d.fecha} className={contratado ? undefined : 'opacity-60'}>
                    <TD className="whitespace-nowrap">
                      <span className="font-medium text-navy">{d.fecha}</span>
                      <span className="ml-2 text-xs text-muted">{DIAS_CORTO[d.iso - 1]}</span>
                      {b.fuente && b.fuente !== 'manual' && (
                        <Badge tone="navy" className="ml-2">
                          {b.fuente}
                        </Badge>
                      )}
                      {d.otras > 0 && (
                        <span className="ml-2 text-xs text-muted">+{d.otras} fila(s) del mismo día</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-sm text-muted">
                      {contratado ? `${d.entradaContrato} · ${d.horasContratadas} h` : 'fuera de contrato'}
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
                      <Input
                        type="time"
                        className="w-28"
                        value={b.horaEntrada}
                        disabled={b.condicion !== 'trabajado'}
                        onChange={(e) => set(d.fecha, { horaEntrada: e.target.value })}
                        aria-label={`Entrada del ${d.fecha}`}
                      />
                    </TD>
                    <TD>
                      <Input
                        type="time"
                        className="w-28"
                        value={b.horaSalida}
                        disabled={b.condicion !== 'trabajado'}
                        onChange={(e) => set(d.fecha, { horaSalida: e.target.value })}
                        aria-label={`Salida del ${d.fecha}`}
                      />
                    </TD>
                    <TD>
                      <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-1.5 text-xs">
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

      <p className="mt-4 text-xs text-muted">
        Las tardanzas no se marcan acá: las calcula la liquidación comparando la hora de entrada
        contra el horario del contrato, con la tolerancia vigente. Lo que se declara acá es qué pasó
        ese día.
      </p>
    </>
  );
}
