import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import {
  obtenerLiquidacion,
  resumenDeLiquidacionCerrada,
  listarPagosLiquidacion,
  LiquidacionPagosNoMigradoError,
  type PagoLiquidacion,
} from '../../../../../lib/sueldos-repo';
import { fechaHoraCorta } from '../../../../../lib/fechas';
import { Table, TBody, TD, TH, THead, TR } from '../../../../../components/ui/table';
import { ImprimirResumen } from './imprimir';
import { ResumenLiquidacionVista } from '../../../../../components/liquidacion/resumen-liquidacion';

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
  // F3 (validador de flujo 23-ago-2026): el grupo trae tardanzas, reportes y bonos además del
  // total — "Total" a secas prometía una sola cifra donde hay varias líneas.
  final: 'Cierre y total',
};

export default async function ComprobanteLiquidacionPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const liq = await obtenerLiquidacion(params.id);
  if (!liq) notFound();

  // Las lineas solo se escriben al cerrar (comentario de LineaGuardada en sueldos-repo.ts): un
  // borrador todavia no tiene nada guardado para mostrar sin inventarlo.
  const sinCerrar = liq.lineas.length === 0;
  // Vista tipo hoja RESUMEN del Excel (tablero#9): sólo de liquidaciones cerradas.
  const resumen = liq.estado === 'cerrada' ? await resumenDeLiquidacionCerrada(liq.id) : null;

  // Pagos registrados (F1, validador de flujo 23-ago-2026): el papel mostraba el total pero no si
  // ya se había pagado. Se agrega en silencio — un borrador no tiene pagos que mostrar todavía, y
  // si la migración 0080 no está aplicada en esta base, el resto del comprobante se sigue
  // imprimiendo igual (mismo criterio de degradación de sueldos-repo.ts y de la pestaña
  // Liquidación y pago).
  let pagos: PagoLiquidacion[] | null = null;
  if (!sinCerrar) {
    try {
      pagos = await listarPagosLiquidacion(liq.id);
    } catch (e) {
      if (!(e instanceof LiquidacionPagosNoMigradoError)) throw e;
      pagos = null;
    }
  }
  // Aritmética de sólo pantalla, igual que la pestaña Liquidación y pago
  // (app/personal/[id]/pago/cliente.tsx): suma de lo NO anulado contra el total ya congelado.
  const pagado = pagos ? Math.round(pagos.filter((p) => !p.anulado).reduce((s, p) => s + p.monto, 0) * 100) / 100 : 0;
  const saldo = pagos ? Number((liq.total - pagado).toFixed(2)) : 0;
  // total <= 0 (descuentos >= ingresos) nunca fue "pagado" — un saldo ahí no es una deuda real.
  const sinMontoAPagar = liq.total <= 0;
  // Pago por horas: sin la columna de reglas (códigos internos), con palabras simples.
  const porHoras = liq.resultado.modo === 'horas';

  return (
    <div className="mx-auto max-w-3xl">
      <ImprimirResumen />
      <article className="rounded-r-medio border border-line bg-white p-10 shadow-card print:border-0 print:shadow-elev-0">
        <header className="flex items-start justify-between border-b-2 border-navy pb-4">
          <div>
            <div className="text-3xl font-semibold text-navy">LuceBien</div>
            <div className="mt-1 tabular-nums text-[10px] tracking-brand text-gold">
              RESUMEN DE LIQUIDACION · SCI-LB
            </div>
            <div className="mt-2 text-apoyo text-muted">Confecciones Aliaga E.I.R.L. · Huancayo, Peru</div>
          </div>
          {/* Fecha del periodo y estado de la liquidacion, con tabular-nums */}
          <div className="text-right">
            <div className="tabular-nums text-dato font-semibold text-navy">
              {liq.periodoDesde} → {liq.periodoHasta}
            </div>
            <div className="mt-1 text-apoyo text-muted">N.º {liq.id.slice(0, 8)} · estado {liq.estado}</div>
            {liq.cerradaEn && (
              <div className="tabular-nums text-dato text-muted">Cerrada el {fechaHoraCorta(liq.cerradaEn)}</div>
            )}
          </div>
        </header>

        {/* 1. Persona y periodo */}
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-cuerpo sm:grid-cols-4">
          <div>
            <dt className="text-rotulo uppercase text-muted">Colaborador</dt>
            <dd className="text-navy">{liq.empleadoNombre ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-rotulo uppercase text-muted">Periodo</dt>
            <dd className="tabular-nums text-navy">
              {liq.periodoDesde} → {liq.periodoHasta}
            </dd>
          </div>
          <div>
            <dt className="text-rotulo uppercase text-muted">Días del periodo</dt>
            <dd className="tabular-nums text-navy">{liq.resultado.periodo.dias}</dd>
          </div>
          <div>
            <dt className="text-rotulo uppercase text-muted">Motor</dt>
            <dd className="tabular-nums text-navy">{liq.motorVersion}</dd>
          </div>
        </dl>

        {resumen && (
          <section className="mt-8">
            <h2 className="mb-2 text-rotulo font-semibold uppercase text-muted">Resumen de liquidación</h2>
            <ResumenLiquidacionVista r={resumen.resumen} pagoDisponible={resumen.pagoDisponible} horas={resumen.horas} />
          </section>
        )}

        {/* 2. El desglose completo, agrupado ingreso / descuento / ajuste / final, igual que
               en la pantalla: concepto, de donde sale, regla, monto */}
        <section className="mt-8">
          <h2 className="text-rotulo font-semibold uppercase text-muted">Desglose</h2>
          <div className="mt-2 border-t border-line">
            {sinCerrar ? (
              <p className="py-6 text-center text-cuerpo text-muted">
                Esta liquidación todavía es un borrador: el desglose se guarda recién al cerrarla.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Concepto</TH>
                    <TH>De dónde sale</TH>
                    {!porHoras && <TH>Regla</TH>}
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
                          <TD colSpan={porHoras ? 3 : 4} className="bg-paper text-rotulo font-medium uppercase text-muted">
                            {GRUPO_LABEL[g] ?? g}
                          </TD>
                        </TR>
                        {delGrupo.map((l, i) => (
                          <TR key={`${g}-${i}`} className={g === 'final' ? 'font-medium text-navy' : undefined}>
                            <TD>{l.concepto}</TD>
                            <TD className="text-cuerpo text-muted">{l.detalle}</TD>
                            {!porHoras && <TD className="text-apoyo text-muted">{l.regla}</TD>}
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
        <div className="mt-6 rounded-r-chico border border-gold/30 bg-gold/10 p-5 text-center">
          <div className="text-rotulo uppercase text-muted">Total de la liquidación</div>
          <div className="tabular-nums text-3xl font-bold text-navy">{soles(liq.total)}</div>
          {(liq.ingresos != null || liq.descuentos != null) && (
            <div className="mt-1 text-apoyo text-muted">
              {liq.ingresos != null && <span>ingresos {soles(liq.ingresos)}</span>}
              {liq.ingresos != null && liq.descuentos != null && <span> · </span>}
              {liq.descuentos != null && <span>descuentos {soles(liq.descuentos)}</span>}
            </div>
          )}
        </div>

        {/* 3.5 Pagos registrados (F1, validador de flujo 23-ago-2026): el papel tiene que decir
            si esto está pagado, no sólo cuánto había que pagar. Se omite en silencio si la 0080
            no está aplicada (pagos === null); nunca se muestra si es un borrador (sinCerrar). */}
        {!sinCerrar && pagos != null && (
          <section className="mt-8">
            <h2 className="text-rotulo font-semibold uppercase text-muted">Pagos registrados</h2>
            <div className="mt-2 border-t border-line">
              {pagos.length === 0 ? (
                <p className="py-4 text-cuerpo text-muted">Sin pagos registrados todavía.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Fecha</TH>
                      <TH>Método</TH>
                      <TH className="text-right">Monto</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pagos.map((p) => (
                      <TR key={p.id} className={p.anulado ? 'text-muted' : undefined}>
                        <TD className="tabular-nums">{p.fecha}</TD>
                        <TD>
                          {p.metodo}
                          {p.anulado && (
                            <span className="ml-2 text-apoyo">anulado: {p.anuladoMotivo ?? '—'}</span>
                          )}
                        </TD>
                        <TD className={p.anulado ? 'text-right tabular-nums line-through' : 'text-right tabular-nums'}>
                          {soles(p.monto)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </div>
            <div className="mt-3 flex justify-end gap-8 border-t border-line pt-3 text-cuerpo">
              <div className="text-right">
                <div className="text-rotulo uppercase text-muted">Pagado</div>
                <div className="tabular-nums font-medium text-navy">{soles(pagado)}</div>
              </div>
              <div className="text-right">
                <div className="text-rotulo uppercase text-muted">Saldo</div>
                <div className="tabular-nums font-medium text-navy">{sinMontoAPagar ? '—' : soles(saldo)}</div>
              </div>
            </div>
          </section>
        )}

        {/* 4. Observaciones y pendientes de regularizar, si los hay */}
        {/* El panel de "pendientes de regularizar" (paso 14 del flujo, F5) todavía no existe: no
            hay tabla que lo respalde, asi que no se inventa acá. Sólo se muestran las
            advertencias que el motor ya dejó guardadas en el snapshot congelado. */}
        {liq.resultado.advertencias.length > 0 && (
          <section className="mt-8">
            <h2 className="text-rotulo font-semibold uppercase text-muted">Observaciones</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-cuerpo text-ink">
              {liq.resultado.advertencias.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>
        )}

        {liq.anuladaMotivo && (
          <p className="mt-6 border-t border-line pt-4 text-cuerpo text-muted">
            Anulada{liq.anuladaEn ? ` el ${fechaHoraCorta(liq.anuladaEn)}` : ''}: {liq.anuladaMotivo}
          </p>
        )}
      </article>
    </div>
  );
}
