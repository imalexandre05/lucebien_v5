import Link from 'next/link';
import { Settings2 } from 'lucide-react';
import type { ParametrosSueldo } from '@scilb/core';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { buttonVariants } from '../../../components/ui/button';
import { resumenHorarioSemana } from '../../../lib/asistencia-revisar-texto';
import type { AcuerdoSueldo } from '../../../lib/sueldos-repo';

// «Su configuración»: lo que se aplica a esta persona en este contrato, en una tarjeta corta del
// Resumen (decisión del dueño n.º 5, 18-oct-2026). Sólo lee: «Cambiar» abre la pestaña Contrato.
// Las cifras son los parámetros EFECTIVOS (lo de /configuracion con lo del contrato encima), no
// números escritos aquí.

const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 4 });

export function SuConfiguracion({
  acuerdo,
  parametros,
  hrefCambiar,
}: {
  acuerdo: AcuerdoSueldo | null;
  parametros: ParametrosSueldo | null;
  hrefCambiar: string;
}) {
  const cambiar = (
    <Link href={hrefCambiar} className={buttonVariants({ variant: 'outline' })}>
      Cambiar
    </Link>
  );

  if (!acuerdo || !parametros) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Su configuración</CardTitle>
          {cambiar}
        </CardHeader>
        <CardContent>
          <p className="text-cuerpo text-muted">Todavía no tiene un contrato. Se pacta en la pestaña Contrato.</p>
        </CardContent>
      </Card>
    );
  }

  const filas: [string, string][] = [
    [
      acuerdo.tarifaHora != null ? 'Tarifa por hora' : 'Sueldo fijo',
      acuerdo.tarifaHora != null ? soles(acuerdo.tarifaHora) : soles(acuerdo.sueldoPactado),
    ],
    ['Horario de la semana', resumenHorarioSemana(acuerdo.turnos)],
    ['Tolerancia de tardanza', `${num(parametros.toleranciaMinutos)} min`],
    ['Tardanzas libres', num(parametros.tardanzasLibres)],
    ['Descuento por tardanza', `${soles(parametros.penalidadTardanza)} cada una`],
    ['Hora extra', `se paga ×${num(parametros.factorHoraFueraContrato)}`],
    ['Meta semanal', parametros.metaSemanal != null ? soles(parametros.metaSemanal) : 'se calcula con las horas'],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="gap-2">
          <Settings2 className="h-4 w-4 text-gold-deep" aria-hidden />
          Su configuración
        </CardTitle>
        {cambiar}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {filas.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line/50 pb-1.5">
              <dt className="text-apoyo text-muted">{k}</dt>
              <dd className="text-right text-cuerpo font-medium tabular-nums text-navy">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-micro text-muted">
          Contrato del {acuerdo.fechaInicio} al {acuerdo.fechaFin}.
        </p>
      </CardContent>
    </Card>
  );
}
