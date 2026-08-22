import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import { obtenerLiquidacion } from '../../../../../lib/sueldos-repo';
import { fechaHoraCorta } from '../../../../../lib/fechas';
import { Table, TBody, TD, TH, THead, TR } from '../../../../../components/ui/table';
import { ImprimirResumen } from './imprimir';

// PEND-09. Vista de SOLO LECTURA del resultado del motor: no recalcula ni una linea. La hoja
// RESUMEN del Excel calculaba su propio total y daba un numero distinto al de la otra hoja; ese
// error no se repite. Todo lo que se ve aca sale de las lineas guardadas de la liquidacion.

const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Mismos grupos y mismas etiquetas que Desglose() en ../../cliente.tsx: las dos pantallas leen
// la misma columna `grupo` de sueldo_liquidacion_lineas y tienen que decir lo mismo.
const GRUPOS = ['ingreso', 'descuento', 'ajuste', 'final'] as const;
const GRUPO_LABEL: Record<string, string> = {
  ingreso: 'Ingresos',
  descuento: 'Descuentos',
  ajuste: 'Ajustes',
  final: 'Total',
};

export default async function ComprobanteLiquidacionPage({ params }: { params: { id: string } }) {
  const liq = await obtenerLiquidacion(params.id);
  if (!liq) notFound();

  // Las lineas solo se escriben al cerrar (comentario de LineaGuardada en sueldos-repo.ts): un
  // borrador todavia no tiene nada guardado para mostrar sin inventarlo.
  const sinCerrar = liq.lineas.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <ImprimirResumen />
      <article className="rounded-lg border border-line bg-white p-10 shadow-card print:border-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-navy pb-4">
          <div>
            <div className="text-3xl font-semibold text-navy">LuceBien</div>
            <div className="mt-1 tabular-nums text-[10px] tracking-brand text-gold">
              RESUMEN DE LIQUIDACION · SCI-LB
            </div>
            <div className="mt-2 text-xs text-muted">Confecciones Aliaga E.I.R.L. · Huancayo, Peru</div>
          </div>
          {/* Fecha del periodo y estado de la liquidacion, con tabular-nums */}
          <div className="text-right">
            <div className="tabular-nums text-sm font-semibold text-navy">
              {liq.periodoDesde} → {liq.periodoHasta}
            </div>
            <div className="mt-1 text-xs text-muted">N.º {liq.id.slice(0, 8)} · estado {liq.estado}</div>
            {liq.cerradaEn && (
              <div className="tabular-nums text-xs text-muted">Cerrada el {fechaHoraCorta(liq.cerradaEn)}</div>
            )}
          </div>
        </header>

        {/* 1. Persona y periodo */}
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Colaborador</dt>
            <dd className="text-navy">{liq.empleadoNombre ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Periodo</dt>
            <dd className="tabular-nums text-navy">
              {liq.periodoDesde} → {liq.periodoHasta}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Días del periodo</dt>
            <dd className="tabular-nums text-navy">{liq.resultado.periodo.dias}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Motor</dt>
            <dd className="tabular-nums text-navy">{liq.motorVersion}</dd>
          </div>
        </dl>

        {/* 2. El desglose completo, agrupado ingreso / descuento / ajuste / final, igual que
               en la pantalla: concepto, de donde sale, regla, monto */}
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Desglose</h2>
          <div className="mt-2 border-t border-line">
            {sinCerrar ? (
              <p className="py-6 text-center text-sm text-muted">
                Esta liquidación todavía es un borrador: el desglose se guarda recién al cerrarla.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Concepto</TH>
                    <TH>De dónde sale</TH>
                    <TH>Regla</TH>
                    <TH className="text-right">Monto</TH>
                  </TR>
                </THead>
                <TBody>
                  {GRUPOS.map((g) => {
                    const delGrupo = liq.lineas.filter((l) => l.grupo === g);
                    if (delGrupo.length === 0) return null;
                    return (
                      <Fragment key={g}>
                        <TR>
                          <TD colSpan={4} className="bg-paper text-xs font-medium uppercase tracking-wide text-muted">
                            {GRUPO_LABEL[g] ?? g}
                          </TD>
                        </TR>
                        {delGrupo.map((l, i) => (
                          <TR key={`${g}-${i}`} className={g === 'final' ? 'font-medium text-navy' : undefined}>
                            <TD>{l.concepto}</TD>
                            <TD className="text-sm text-muted">{l.detalle}</TD>
                            <TD className="text-xs text-muted">{l.regla}</TD>
                            <TD className="text-right tabular-nums">{soles(l.monto)}</TD>
                          </TR>
                        ))}
                      </Fragment>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </div>
        </section>

        {/* 3. El total, destacado */}
        <div className="mt-6 rounded-lg border border-gold/30 bg-gold/10 p-5 text-center">
          <div className="text-xs uppercase tracking-wide text-muted">Total de la liquidación</div>
          <div className="tabular-nums text-3xl font-bold text-navy">{soles(liq.total)}</div>
          {(liq.ingresos != null || liq.descuentos != null) && (
            <div className="mt-1 text-xs text-muted">
              {liq.ingresos != null && <span>ingresos {soles(liq.ingresos)}</span>}
              {liq.ingresos != null && liq.descuentos != null && <span> · </span>}
              {liq.descuentos != null && <span>descuentos {soles(liq.descuentos)}</span>}
            </div>
          )}
        </div>

        {/* 4. Observaciones y pendientes de regularizar, si los hay */}
        {/* El panel de "pendientes de regularizar" (paso 14 del flujo, F5) todavía no existe: no
            hay tabla que lo respalde, asi que no se inventa acá. Sólo se muestran las
            advertencias que el motor ya dejó guardadas en el snapshot congelado. */}
        {liq.resultado.advertencias.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Observaciones</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
              {liq.resultado.advertencias.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>
        )}

        {liq.anuladaMotivo && (
          <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
            Anulada{liq.anuladaEn ? ` el ${fechaHoraCorta(liq.anuladaEn)}` : ''}: {liq.anuladaMotivo}
          </p>
        )}
      </article>
    </div>
  );
}
