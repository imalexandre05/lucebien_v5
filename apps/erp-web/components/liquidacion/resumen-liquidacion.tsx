import type { ReactNode } from 'react';
import type { ResumenLiquidacion } from '@scilb/core';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/badge';
import { Cifra } from '../ui/cifra';

// Hoja RESUMEN del Excel, dentro del sistema. Sólo MUESTRA: todo viene de resumenLiquidacion()
// (core), que reagrupa las líneas congeladas. Lo que el sistema no tiene se dice «No configurado».
// Se lee en una columna en celular y se imprime sin bordes ni sombras.

const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Fila({ etiqueta, children, fuerte }: { etiqueta: string; children: ReactNode; fuerte?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2', fuerte && 'font-semibold text-navy')}>
      <dt className="text-cuerpo text-muted">{etiqueta}</dt>
      <dd className="text-right tabular-nums text-cuerpo text-ink">{children}</dd>
    </div>
  );
}

const NoConfigurado = () => <span className="text-apoyo italic text-muted">No configurado</span>;

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-r-chico border border-line bg-white p-4 print:border-0 print:p-0">
      <h3 className="text-rotulo font-display font-semibold uppercase text-muted">{titulo}</h3>
      <dl className="mt-1 divide-y divide-line">{children}</dl>
    </section>
  );
}

export function ResumenLiquidacionVista({ r, pagoDisponible = true }: { r: ResumenLiquidacion; pagoDisponible?: boolean }) {
  return (
    <div className="space-y-4">
      {/* Lo que la persona más busca: cuánto es y si ya está pagado. */}
      <div className="rounded-r-chico border border-gold/30 bg-gold/10 p-5 text-center">
        <div className="text-rotulo uppercase text-muted">Restante por cobrar</div>
        {pagoDisponible ? (
          <>
            <Cifra size="xl">{soles(r.restante)}</Cifra>
            <div className="mt-2">
              <Badge tone={r.cancelado ? 'green' : 'amber'}>{r.cancelado ? 'Cancelado' : 'Pendiente de pago'}</Badge>
            </div>
          </>
        ) : (
          <p className="mt-1 text-cuerpo text-muted">Estado de pago no disponible por ahora. Vuelve a intentar en unos minutos.</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Bloque titulo="Ventas">
          <Fila etiqueta="Total de ventas acordado">{soles(r.ventasAcordado)}</Fila>
          <Fila etiqueta="Mínimo de ventas para continuar">
            {r.minimoVentas == null ? <NoConfigurado /> : soles(r.minimoVentas)}
          </Fila>
          <Fila etiqueta="Total de ventas logrado">{soles(r.ventasLogrado)}</Fila>
          <Fila etiqueta="¿Continúa?">
            {r.continua == null ? <NoConfigurado /> : r.continua ? 'Sí' : 'No'}
          </Fila>
        </Bloque>

        <Bloque titulo="Sueldo y horas">
          <Fila etiqueta="Sueldo">{soles(r.sueldo)}</Fila>
          <Fila etiqueta="Horas extras (+/−)">{soles(r.horasExtras)}</Fila>
        </Bloque>

        <Bloque titulo="Beneficios">
          <Fila etiqueta="1.ª comisión">{soles(r.comision1)}</Fila>
          <Fila etiqueta="2.ª comisión (metas semanales)">{soles(r.comision2)}</Fila>
          <Fila etiqueta="Adicional por capacitación">{soles(r.capacitacion)}</Fila>
          <Fila etiqueta="Pasajes (llegar temprano)">{soles(r.pasajes)}</Fila>
          <Fila etiqueta="Otros (bonos, almuerzos)">{soles(r.otrosBeneficios)}</Fila>
          <Fila etiqueta="Total beneficios" fuerte>
            {soles(r.totalBeneficios)}
          </Fila>
        </Bloque>

        <Bloque titulo="Descuentos">
          <Fila etiqueta="Penalidad por tardanzas">{soles(r.penalidadTardanzas)}</Fila>
          <Fila etiqueta="Penalidad de faltas">{soles(r.penalidadFaltas)}</Fila>
          <Fila etiqueta="Reportes">{soles(r.penalidadReportes)}</Fila>
          {r.otrosDescuentos > 0 && <Fila etiqueta="Otros descuentos">{soles(r.otrosDescuentos)}</Fila>}
          <Fila etiqueta="Total descuentos" fuerte>
            {soles(r.totalDescuentos)}
          </Fila>
        </Bloque>
      </div>

      <Bloque titulo="Pago">
        <Fila etiqueta="Total final por pagar" fuerte>
          {soles(r.totalFinalPorPagar)}
        </Fila>
        <Fila etiqueta="Total de adelantos">{soles(r.adelantos)}</Fila>
        <Fila etiqueta="Abonos recibidos">{soles(r.abonos)}</Fila>
        <Fila etiqueta="Restante" fuerte>
          {soles(r.restante)}
        </Fila>
        <Fila etiqueta="¿Cancelado?">{r.cancelado ? 'Sí' : 'No'}</Fila>
        <Fila etiqueta="Suma de almuerzos">{soles(r.almuerzos)}</Fila>
        <Fila etiqueta="Total invertido ADM">{soles(r.totalInvertido)}</Fila>
      </Bloque>
    </div>
  );
}
