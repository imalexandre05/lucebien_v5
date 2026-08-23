'use client';

import { useMemo, useState } from 'react';
import { History, Search, Eye } from 'lucide-react';
import { TABLAS_AUDITADAS, TABLA_LABEL, camposCambiados, type AuditLogFila, type OperacionAudit } from '../../../lib/auditoria-tipos';
import { fechaHoraCorta } from '../../../lib/fechas';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge, type Tone } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';
import { Modal, ModalBody } from '../../../components/ui/modal';
import { OpcionBotones, type Opcion } from '../../../components/ui/opcion-botones';
import { StatBox } from '../../../components/ui/stat-box';
import { campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

const fieldCls = campoCls;

const OPC_TABLA: Opcion[] = [{ value: '', label: 'Todas' }, ...TABLAS_AUDITADAS.map((t) => ({ value: t, label: TABLA_LABEL[t] }))];
const OPC_OPERACION: Opcion[] = [
  { value: '', label: 'Todas' },
  { value: 'INSERT', label: 'Creado' },
  { value: 'UPDATE', label: 'Editado' },
  { value: 'DELETE', label: 'Eliminado' },
];

const OPERACION_TONE: Record<OperacionAudit, Tone> = { INSERT: 'green', UPDATE: 'gold', DELETE: 'red' };
const OPERACION_LABEL: Record<OperacionAudit, string> = { INSERT: 'Creado', UPDATE: 'Editado', DELETE: 'Eliminado' };

function valorLegible(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function AuditoriaCliente({ filasIniciales }: { filasIniciales: AuditLogFila[] }) {
  const [fTabla, setFTabla] = useState('');
  const [fOperacion, setFOperacion] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [fActor, setFActor] = useState('');
  const [detalle, setDetalle] = useState<AuditLogFila | null>(null);

  const filtradas = useMemo(() => {
    return filasIniciales.filter((f) => {
      if (fTabla && f.tabla !== fTabla) return false;
      if (fOperacion && f.operacion !== fOperacion) return false;
      if (fDesde && f.at.slice(0, 10) < fDesde) return false;
      if (fHasta && f.at.slice(0, 10) > fHasta) return false;
      if (fActor && !(f.actorNombre ?? '').toLowerCase().includes(fActor.toLowerCase())) return false;
      return true;
    });
  }, [filasIniciales, fTabla, fOperacion, fDesde, fHasta, fActor]);

  const kpis = useMemo(
    () => ({
      total: filtradas.length,
      creados: filtradas.filter((f) => f.operacion === 'INSERT').length,
      editados: filtradas.filter((f) => f.operacion === 'UPDATE').length,
      eliminados: filtradas.filter((f) => f.operacion === 'DELETE').length,
    }),
    [filtradas],
  );

  const cambios = detalle ? camposCambiados(detalle.antes, detalle.despues) : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox index={0} label="Mostrando" valor={kpis.total} tone="navy" />
        <StatBox index={1} label="Creados" valor={kpis.creados} tone="exito" />
        <StatBox index={2} label="Editados" valor={kpis.editados} tone="gold" />
        <StatBox index={3} label="Eliminados" valor={kpis.eliminados} tone="error" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">Tabla</div>
            <OpcionBotones opciones={OPC_TABLA} value={fTabla} onChange={setFTabla} ariaLabel="Tabla" />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">Operación</div>
            <OpcionBotones opciones={OPC_OPERACION} value={fOperacion} onChange={setFOperacion} ariaLabel="Operación" />
          </div>
          <div>
            <label htmlFor="aud-desde" className="mb-1 block text-[10px] uppercase tracking-wide text-muted">
              Desde
            </label>
            <input id="aud-desde" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label htmlFor="aud-hasta" className="mb-1 block text-[10px] uppercase tracking-wide text-muted">
              Hasta
            </label>
            <input id="aud-hasta" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} className={fieldCls} />
          </div>
          <div className="relative">
            <label htmlFor="aud-actor" className="mb-1 block text-[10px] uppercase tracking-wide text-muted">
              Actor
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
              <input
                id="aud-actor"
                value={fActor}
                onChange={(e) => setFActor(e.target.value)}
                placeholder="Buscar nombre…"
                className={cn(fieldCls, 'w-40 pl-8')}
              />
            </div>
          </div>
          {(fTabla || fOperacion || fDesde || fHasta || fActor) && (
            <button
              type="button"
              onClick={() => {
                setFTabla('');
                setFOperacion('');
                setFDesde('');
                setFHasta('');
                setFActor('');
              }}
              className="text-xs text-muted underline hover:text-navy"
            >
              Limpiar filtros
            </button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {filtradas.length === 0 ? (
            <EmptyState icon={History} titulo="Sin movimientos con estos filtros">
              {filasIniciales.length === 0
                ? 'Todavía no se registró ningún cambio en pedidos, caja, empleados, pagos o evaluaciones.'
                : 'Ajusta o limpia los filtros para ver más resultados.'}
            </EmptyState>
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH className="pl-5">Fecha</TH>
                    <TH>Tabla</TH>
                    <TH>Operación</TH>
                    <TH>Actor</TH>
                    <TH>Fila</TH>
                    <TH className="pr-5 text-right">Detalle</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtradas.map((f) => (
                    <TR key={f.id}>
                      <TD className="pl-5 text-xs text-muted">{fechaHoraCorta(f.at)}</TD>
                      <TD className="text-sm text-navy">{TABLA_LABEL[f.tabla as keyof typeof TABLA_LABEL] ?? f.tabla}</TD>
                      <TD>
                        <Badge tone={OPERACION_TONE[f.operacion]}>{OPERACION_LABEL[f.operacion]}</Badge>
                      </TD>
                      <TD className="text-sm text-navy">{f.actorNombre ?? <span className="text-muted">Sistema</span>}</TD>
                      <TD className="tabular-nums text-[11px] text-muted" title={f.filaId}>
                        {f.filaId.slice(0, 8)}
                      </TD>
                      <TD className="pr-5 text-right">
                        <button
                          type="button"
                          onClick={() => setDetalle(f)}
                          className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-navy transition-colors duration-150 hover:border-gold active:scale-[0.97]"
                        >
                          <Eye className="h-3 w-3" strokeWidth={2} /> Ver
                        </button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {filasIniciales.length >= 200 && (
                <p className="px-5 py-3 text-[11px] text-muted">Mostrando los {filasIniciales.length} movimientos más recientes.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Modal
        open={detalle !== null}
        onClose={() => setDetalle(null)}
        size="lg"
        title={detalle ? `${TABLA_LABEL[detalle.tabla as keyof typeof TABLA_LABEL] ?? detalle.tabla} · ${OPERACION_LABEL[detalle.operacion]}` : ''}
        subtitle={detalle ? fechaHoraCorta(detalle.at) : ''}
      >
        <ModalBody className="space-y-3">
          {detalle && (
            <>
              <p className="text-xs text-muted">
                Actor: <span className="font-medium text-navy">{detalle.actorNombre ?? 'Sistema (sin usuario en sesión, p. ej. una acción administrativa por API)'}</span>
                {' · '}
                Fila: <span className="tabular-nums">{detalle.filaId}</span>
              </p>

              {detalle.operacion === 'UPDATE' ? (
                cambios.length === 0 ? (
                  <p className="text-sm text-muted">No se detectaron campos con valores distintos.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-line">
                    <Table>
                      <THead>
                        <TR>
                          <TH className="pl-3">Campo</TH>
                          <TH>Antes</TH>
                          <TH>Después</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {cambios.map((c) => (
                          <TR key={c.campo}>
                            <TD className="pl-3 tabular-nums text-xs text-navy">{c.campo}</TD>
                            <TD className="max-w-[220px] truncate text-xs text-error-deep" title={valorLegible(c.antes)}>
                              {valorLegible(c.antes)}
                            </TD>
                            <TD className="max-w-[220px] truncate text-xs text-exito-deep" title={valorLegible(c.despues)}>
                              {valorLegible(c.despues)}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                )
              ) : (
                <div className="max-h-80 overflow-auto rounded-md border border-line bg-paper/40 p-3">
                  <table className="w-full text-xs">
                    <tbody>
                      {Object.entries(detalle.operacion === 'DELETE' ? detalle.antes ?? {} : detalle.despues ?? {}).map(([k, v]) => (
                        <tr key={k} className="border-b border-line/50 last:border-0">
                          <td className="py-1 pr-3 align-top tabular-nums text-navy">{k}</td>
                          <td className="py-1 align-top text-muted">{valorLegible(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </ModalBody>
      </Modal>
    </div>
  );
}
