'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ClockAlert } from 'lucide-react';
import type { DiaPorRevisar } from '@scilb/core';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { Aviso, campoCls } from '../../../../components/ui/form';
import { cn } from '../../../../lib/cn';
import { fechaAmable, fraseDelPago, queOcurrio, type ParametrosFrase } from '../../../../lib/asistencia-revisar-texto';
import { accionDeclararDia, accionMarcarRevisados } from '../../../sueldos/asistencia/actions';

// La lista «Por revisar» de la ficha (decisión del dueño n.º 4, 18-oct-2026). Cada día con
// problema lleva sus botones de un clic; los días sin problema no salen: se dan por trabajados.
//
// Todo se escribe por `accionDeclararDia` (la misma puerta de siempre, que baja los sellos del
// huellero) o por `accionMarcarRevisados` (no cambia ningún dato). Al guardar, `router.refresh()`
// vuelve a leer la ficha y el día sale de la lista. Las acciones de /sueldos/asistencia sólo
// revalidan esa ruta, no esta: por eso el refresco va aquí.

export type DiaConPrevio = DiaPorRevisar & {
  /** Lo que el día ya tiene guardado, para completarlo sin pisarlo. */
  previo: { entrada: string | null; salida: string | null; tardanzaJustificada: boolean; motivo: string | null };
};

const MOTIVO_MIN = 3;
const MOTIVO_MAX = 300; // Default inventado (spec §8): 3 a 300 letras.

type Modo = null | 'horas' | 'hora' | 'falta_justificada' | 'tardanza_justificada';

const botonGrande = 'min-h-[44px] flex-1 sm:flex-none';

export function PorRevisar({
  empleadoId,
  dias,
  parametros,
}: {
  empleadoId: string;
  dias: DiaConPrevio[];
  parametros: ParametrosFrase;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // «Todo bien» sólo cierra lo informativo; nunca un día al que le falta un dato (spec §4 y §9).
  const cerrables = dias.filter(
    (d) => d.tipo === 'tardanza' || d.tipo === 'falta' || d.tipo === 'hora_estimada' || d.tipo === 'turno_sin_marcas' || d.tipo === 'pausa_trabajada',
  );

  if (dias.length === 0) {
    return (
      <Aviso tono="exito" titulo="Todo en orden: no hay días por revisar">
        Los días con las dos marcas y sin problema se dan por trabajados solos.
      </Aviso>
    );
  }

  const todoBien = () => {
    setError(null);
    empezar(async () => {
      const r = await accionMarcarRevisados(
        empleadoId,
        cerrables.map((d) => d.fecha),
      );
      if (!r.ok) setError(r.error ?? 'No se pudo marcar.');
      else router.refresh();
    });
  };

  return (
    <section
      aria-label="Días por revisar"
      className="rounded-r-medio border-2 border-gold bg-white p-3 shadow-elev-1 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-seccion font-semibold text-navy">
          <ClockAlert className="h-5 w-5 text-gold-deep" aria-hidden />
          Por revisar
          <Badge tone="gold" className="tabular-nums">
            {dias.length} {dias.length === 1 ? 'día por revisar' : 'días por revisar'}
          </Badge>
        </h3>
        {cerrables.length > 0 && (
          <Button variant="gold" className={botonGrande} onClick={todoBien} pending={pendiente}>
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Todo bien
          </Button>
        )}
      </div>
      <p className="mt-2 text-apoyo leading-relaxed text-muted">
        «Todo bien» da por vistos las tardanzas, las faltas y las horas que puso el sistema: el pago queda igual. No
        toca los días sin marca ni los de una sola marca, porque ahí falta un dato.
      </p>
      {error && (
        <Aviso tono="error" className="mt-3">
          {error}
        </Aviso>
      )}
      <ul className="mt-3 space-y-3">
        {dias.map((d) => (
          <TarjetaDia key={d.fecha} empleadoId={empleadoId} dia={d} parametros={parametros} alGuardar={() => router.refresh()} />
        ))}
      </ul>
    </section>
  );
}

function TarjetaDia({
  empleadoId,
  dia,
  parametros,
  alGuardar,
}: {
  empleadoId: string;
  dia: DiaConPrevio;
  parametros: ParametrosFrase;
  alGuardar: () => void;
}) {
  const [modo, setModo] = useState<Modo>(null);
  const [entrada, setEntrada] = useState(dia.previo.entrada ?? '');
  const [salida, setSalida] = useState(dia.previo.salida ?? '');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const base = {
    empleadoId,
    fecha: dia.fecha,
    tardanzaJustificada: false,
    faltaJustificada: false,
    motivoJustificacion: null as string | null,
  };

  const correr = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    empezar(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'No se pudo guardar.');
      else alGuardar();
    });
  };

  const motivoLimpio = motivo.trim();
  const motivoValido = motivoLimpio.length >= MOTIVO_MIN && motivoLimpio.length <= MOTIVO_MAX;
  const pedirMotivo = () => {
    if (!motivoValido) {
      setError(`Escribe el motivo, entre ${MOTIVO_MIN} y ${MOTIVO_MAX} letras.`);
      return false;
    }
    return true;
  };

  const guardarHoras = (e: string, s: string) => {
    if (!e || !s) return setError('Pon las dos horas.');
    if (s <= e) return setError('La salida tiene que ser después de la entrada.');
    correr(() =>
      accionDeclararDia({
        ...base,
        condicion: 'trabajado',
        horaEntrada: e,
        horaSalida: s,
        // Al corregir la hora real de un día ya justificado, la justificación sigue valiendo.
        tardanzaJustificada: dia.previo.tardanzaJustificada,
        motivoJustificacion: dia.previo.tardanzaJustificada ? dia.previo.motivo : null,
      }),
    );
  };

  const esFalta = () =>
    correr(async () => {
      const r = await accionDeclararDia({ ...base, condicion: 'falta', horaEntrada: null, horaSalida: null });
      // Quien dijo «es falta» ya decidió: no se le vuelve a preguntar por el mismo día.
      return r.ok ? accionMarcarRevisados(empleadoId, [dia.fecha]) : r;
    });

  const justificarFalta = () => {
    if (!pedirMotivo()) return;
    correr(() =>
      accionDeclararDia({
        ...base,
        condicion: 'falta',
        horaEntrada: null,
        horaSalida: null,
        faltaJustificada: true,
        motivoJustificacion: motivoLimpio,
      }),
    );
  };

  const justificarTardanza = () => {
    if (!pedirMotivo()) return;
    if (!dia.previo.entrada || !dia.previo.salida) return setError('Este día no tiene las dos horas guardadas.');
    correr(() =>
      accionDeclararDia({
        ...base,
        condicion: 'trabajado',
        horaEntrada: dia.previo.entrada,
        horaSalida: dia.previo.salida,
        tardanzaJustificada: true,
        motivoJustificacion: motivoLimpio,
      }),
    );
  };

  const estaBien = () => correr(() => accionMarcarRevisados(empleadoId, [dia.fecha]));

  const abrir = (m: Modo) => {
    setError(null);
    setModo(modo === m ? null : m);
  };

  const sinMarcaOUna = dia.tipo === 'sin_marca' || dia.tipo === 'una_marca' || dia.tipo === 'revisar';
  // Abre el editor completo plegado de abajo (días con varios tramos).
  const verEditor = () => {
    const ed = document.getElementById('editor-asistencia');
    if (ed instanceof HTMLDetailsElement) {
      ed.open = true;
      ed.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const faltaEntrada = dia.tipo === 'una_marca' && dia.falta === 'entrada';
  const tono =
    dia.tipo === 'falta' ? 'red' : dia.tipo === 'tardanza' || dia.tipo === 'pausa_trabajada' ? 'amber' : dia.tipo === 'hora_estimada' ? 'info' : 'gold';
  const etiqueta =
    dia.tipo === 'sin_marca'
      ? 'Sin marca'
      : dia.tipo === 'una_marca'
        ? 'Una sola marca'
        : dia.tipo === 'tardanza'
          ? 'Tardanza'
          : dia.tipo === 'falta'
            ? 'Falta'
            : dia.tipo === 'revisar'
              ? 'Hay que revisarlo'
              : dia.tipo === 'turno_sin_marcas'
                ? 'Turno sin marcas'
                : dia.tipo === 'pausa_trabajada'
                  ? 'Marcó de corrido'
                  : 'Hora del sistema';

  return (
    <li className="rounded-r-medio border border-line bg-paper/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sub font-semibold tabular-nums text-navy">{fechaAmable(dia.fecha)}</span>
        <Badge tone={tono}>{etiqueta}</Badge>
      </div>
      <p className="mt-1 text-cuerpo font-medium text-ink">{queOcurrio(dia, dia.previo)}</p>
      <p className="mt-0.5 text-apoyo leading-relaxed text-muted">{fraseDelPago(dia, parametros)}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {dia.tipo === 'sin_marca' && (
          <>
            <Button variant="primary" className={botonGrande} onClick={() => abrir('horas')} disabled={pendiente}>
              Poner hora de entrada y salida
            </Button>
            <Button variant="outline" className={botonGrande} onClick={esFalta} pending={pendiente}>
              Es falta
            </Button>
            <Button variant="outline" className={botonGrande} onClick={() => abrir('falta_justificada')} disabled={pendiente}>
              Justificar falta
            </Button>
          </>
        )}
        {dia.tipo === 'una_marca' && (
          <Button variant="primary" className={botonGrande} onClick={() => abrir('hora')} disabled={pendiente}>
            {faltaEntrada ? 'Poner hora de entrada' : 'Poner hora de salida'}
          </Button>
        )}
        {dia.tipo === 'tardanza' && (
          <>
            <Button variant="primary" className={botonGrande} onClick={() => abrir('tardanza_justificada')} disabled={pendiente}>
              Justificar tardanza
            </Button>
            <Button variant="outline" className={botonGrande} onClick={estaBien} pending={pendiente}>
              Está bien
            </Button>
          </>
        )}
        {dia.tipo === 'falta' && (
          <>
            <Button variant="primary" className={botonGrande} onClick={() => abrir('falta_justificada')} disabled={pendiente}>
              Justificar falta
            </Button>
            <Button variant="outline" className={botonGrande} onClick={estaBien} pending={pendiente}>
              Está bien
            </Button>
          </>
        )}
        {dia.tipo === 'revisar' && (
          <Button variant="primary" className={botonGrande} onClick={verEditor}>
            Ver y corregir
          </Button>
        )}
        {(dia.tipo === 'turno_sin_marcas' || dia.tipo === 'pausa_trabajada') && (
          <>
            <Button variant="primary" className={botonGrande} onClick={verEditor}>
              Corregir las horas
            </Button>
            <Button variant="outline" className={botonGrande} onClick={estaBien} pending={pendiente}>
              Está bien
            </Button>
          </>
        )}
        {dia.tipo === 'hora_estimada' && (
          <>
            <Button variant="primary" className={botonGrande} onClick={() => abrir('horas')} disabled={pendiente}>
              Poner la hora real
            </Button>
            <Button variant="outline" className={botonGrande} onClick={estaBien} pending={pendiente}>
              Está bien
            </Button>
          </>
        )}
      </div>

      {(modo === 'horas' || modo === 'hora') && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {(modo === 'horas' || faltaEntrada) && (
            <label className="text-apoyo text-muted">
              Entrada
              <input
                type="time"
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                className={cn(campoCls, 'mt-1 block min-h-[44px] tabular-nums')}
              />
            </label>
          )}
          {(modo === 'horas' || !faltaEntrada) && (
            <label className="text-apoyo text-muted">
              Salida
              <input
                type="time"
                value={salida}
                onChange={(e) => setSalida(e.target.value)}
                className={cn(campoCls, 'mt-1 block min-h-[44px] tabular-nums')}
              />
            </label>
          )}
          <Button variant="gold" className={botonGrande} onClick={() => guardarHoras(entrada, salida)} pending={pendiente}>
            Guardar
          </Button>
        </div>
      )}

      {(modo === 'falta_justificada' || modo === 'tardanza_justificada') && (
        <div className="mt-3 space-y-2">
          <label className="block text-apoyo text-muted">
            Motivo
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={MOTIVO_MAX}
              rows={2}
              placeholder="Por ejemplo: avisó con certificado médico"
              className={cn(campoCls, 'mt-1 block min-h-[44px] w-full')}
            />
          </label>
          <Button
            variant="gold"
            className={botonGrande}
            onClick={modo === 'falta_justificada' ? justificarFalta : justificarTardanza}
            pending={pendiente}
          >
            Guardar justificación
          </Button>
        </div>
      )}

      {error && (
        <Aviso tono="error" className="mt-3">
          {error}
        </Aviso>
      )}
      {sinMarcaOUna && !error && modo === null && (
        <p className="mt-2 text-micro text-muted">Hace falta un dato para poder pagar este día.</p>
      )}
    </li>
  );
}
