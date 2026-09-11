'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Package, PackageCheck, Plus, Send, Trash2 } from 'lucide-react';
import type { EnvioAccesorios } from '../../../lib/accesorios-repo';
import { crearRemesaAccesorios, confirmarRemesaAccesorios } from './actions';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Aviso, campoCls } from '../../../components/ui/form';
import { EmptyState } from '../../../components/ui/empty-state';
import { cn } from '../../../lib/cn';

const fieldCls = campoCls;

const fecha = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

type Fila = { tipo: string; cantidad: number };

export function AccesoriosCliente({
  envios,
  tipos,
  tiendas,
  miSede,
}: {
  envios: EnvioAccesorios[];
  tipos: string[];
  tiendas: string[];
  miSede: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sede, setSede] = useState(tiendas[0] ?? 'LB');
  const [obs, setObs] = useState('');
  const [filas, setFilas] = useState<Fila[]>([{ tipo: '', cantidad: 1 }]);
  const [error, setError] = useState<string | null>(null);

  function enviar() {
    startTransition(async () => {
      const err = await crearRemesaAccesorios({ sedeDestinoCod: sede, obs, items: filas });
      setError(err);
      if (!err) {
        setFilas([{ tipo: '', cantidad: 1 }]);
        setObs('');
        router.refresh();
      }
    });
  }

  function confirmar(id: string) {
    startTransition(async () => {
      await confirmarRemesaAccesorios(id);
      router.refresh();
    });
  }

  const pendientes = envios.filter((e) => !e.validadoTienda);
  const validados = envios.filter((e) => e.validadoTienda).slice(0, 20);

  return (
    <div className="space-y-5">
      <Link
        href="/pipeline"
        className="inline-flex items-center gap-1.5 text-cuerpo text-muted transition-colors duration-150 hover:text-navy"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Volver al kanban
      </Link>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
        {/* ── Nueva remesa ── */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <Package className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden />
              Nueva remesa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-cuerpo text-navy">
              <span className="w-24 shrink-0 text-apoyo font-medium text-muted">Sede destino</span>
              <select value={sede} onChange={(e) => setSede(e.target.value)} className={cn(fieldCls, 'flex-1')}>
                {tiendas.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>

            <datalist id="tipos-accesorio">
              {tipos.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>

            <div className="space-y-2">
              {filas.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={f.tipo}
                    onChange={(e) => setFilas((p) => p.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))}
                    placeholder="Accesorio (ej. Corbata)"
                    list="tipos-accesorio"
                    className={cn(fieldCls, 'flex-1')}
                  />
                  <input
                    type="number"
                    min={1}
                    value={f.cantidad}
                    onChange={(e) =>
                      setFilas((p) => p.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) } : x)))
                    }
                    className={cn(fieldCls, 'w-20')}
                    aria-label="Cantidad"
                  />
                  <button
                    type="button"
                    onClick={() => setFilas((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
                    className="text-muted transition-colors hover:text-error"
                    aria-label="Quitar fila"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFilas((p) => [...p, { tipo: '', cantidad: 1 }])}
                className="inline-flex items-center gap-1 rounded-r-pastilla border border-line px-2.5 py-1.5 text-apoyo text-navy transition-colors hover:border-gold"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Agregar accesorio
              </button>
            </div>

            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observación (opcional)" className={cn(fieldCls, 'w-full')} />

            {error && <Aviso tono="error" className="text-cuerpo">{error}</Aviso>}

            <Button type="button" onClick={enviar} pending={pending} className="w-full justify-center py-2.5">
              {!pending && <Send className="h-4 w-4" strokeWidth={2} />}
              {pending ? 'Enviando…' : 'Registrar envío'}
            </Button>
          </CardContent>
        </Card>

        {/* ── Remesas ── */}
        <div className="space-y-4 xl:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>
                Por validar en tienda{' '}
                <span className="ml-1 rounded-r-pastilla bg-navy/5 px-2 py-0.5 tabular-nums text-dato text-navy">
                  {pendientes.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0 pb-0">
              {pendientes.length === 0 ? (
                <EmptyState icon={PackageCheck} titulo="Sin remesas pendientes" compacto>
                  Cuando una tienda envíe accesorios a granel, la remesa aparece acá esperando que
                  el almacén la reciba.
                </EmptyState>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH className="pl-5">Fecha</TH>
                      <TH>Destino</TH>
                      <TH>Contenido</TH>
                      <TH className="pr-5 text-right">Validación</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pendientes.map((e) => (
                      <TR key={e.id}>
                        <TD className="pl-5 tabular-nums text-dato text-muted">{fecha(e.fecha)}</TD>
                        <TD>
                          <span className="tabular-nums text-dato font-semibold text-navy">{e.sedeDestinoCod}</span>
                          {e.sedeDestinoCod === miSede && (
                            <Badge tone="gold" className="ml-1.5">
                              tu sede
                            </Badge>
                          )}
                        </TD>
                        <TD className="text-cuerpo text-ink">
                          {e.items.map((i) => `${i.cantidad}× ${i.tipo}`).join(' · ') || '—'}
                          {Boolean(e.obs) && <span className="block text-apoyo text-muted">{e.obs}</span>}
                        </TD>
                        <TD className="pr-5 text-right">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => confirmar(e.id)}
                            className="inline-flex items-center gap-1 rounded-r-pastilla bg-exito px-2.5 py-1.5 text-apoyo font-semibold text-white transition hover:bg-exito-deep active:scale-[.97]"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={3} /> Confirmar recibido
                          </button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {validados.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Validadas recientemente</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto px-0 pb-0">
                <Table>
                  <THead>
                    <TR>
                      <TH className="pl-5">Enviada</TH>
                      <TH>Destino</TH>
                      <TH>Contenido</TH>
                      <TH className="pr-5">Validada</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {validados.map((e) => (
                      <TR key={e.id}>
                        <TD className="pl-5 tabular-nums text-dato text-muted">{fecha(e.fecha)}</TD>
                        <TD className="tabular-nums text-dato text-navy">{e.sedeDestinoCod}</TD>
                        <TD className="text-cuerpo text-ink">{e.items.map((i) => `${i.cantidad}× ${i.tipo}`).join(' · ')}</TD>
                        <TD className="pr-5 tabular-nums text-dato text-exito-deep">{fecha(e.fechaValidado)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
