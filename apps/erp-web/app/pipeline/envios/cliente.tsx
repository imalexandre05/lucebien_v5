'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Eye, Truck, ArrowLeft } from 'lucide-react';
import type { PrendaEnviada } from '../../../lib/envios-repo';
import { calificarPrenda } from '../actions';
import { useOperador } from '../operador';
import { Aviso } from '../../../components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';
import { cn } from '../../../lib/cn';

const fecha = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

export function EnviosCliente({
  prendas,
  miSede,
  compartido = false,
}: {
  prendas: PrendaEnviada[];
  miSede: string;
  compartido?: boolean;
}) {
  const { conOperador, operadorRechazado, chip, dialogo } = useOperador(compartido);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [destinoObs, setDestinoObs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const enCamino = prendas.filter((p) => p.etapa === 'enviado');
  const recibidas = prendas.filter((p) => p.etapa === 'recibido').slice(0, 20);

  // Agrupadas por sede destino; la sede activa primero (es la que debe confirmar).
  const porSede = useMemo(() => {
    const m = new Map<string, PrendaEnviada[]>();
    for (const p of enCamino) {
      const arr = m.get(p.sedeDestinoCod) ?? [];
      arr.push(p);
      m.set(p.sedeDestinoCod, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) =>
      a === miSede ? -1 : b === miSede ? 1 : a.localeCompare(b),
    );
  }, [enCamino, miSede]);

  function calificar(p: PrendaEnviada, aceptada: boolean) {
    conOperador((token) =>
      startTransition(async () => {
        setError(null);
        try {
          await calificarPrenda(p.id, aceptada, aceptada ? '' : destinoObs[p.id] || 'recepcion', token);
        } catch (e) {
          const msg = e instanceof Error ? e.message : '';
          if (msg.startsWith('CODIGO:')) {
            operadorRechazado();
            setError('Operador vencido. Ingresa tu código de nuevo.');
          } else {
            setError('No se pudo calificar la prenda. Actualiza la lista e inténtalo de nuevo.');
          }
        }
        router.refresh();
      }),
    );
  }

  return (
    <div className="space-y-5">
      {chip}
      {dialogo}
      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex items-center gap-2">
        <Link
          href="/pipeline"
          className="inline-flex items-center gap-1.5 text-cuerpo text-muted transition-colors duration-150 hover:text-navy"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Volver al kanban
        </Link>
        <span className="ml-auto rounded-r-pastilla bg-navy/5 px-2.5 py-1 tabular-nums text-dato font-medium text-navy">
          {enCamino.length} por confirmar
        </span>
      </div>

      {porSede.length === 0 ? (
        <Card>
          <CardContent className="pb-0">
            <EmptyState icon={Truck} titulo="Sin envíos en camino">
              Cuando el almacén despache prendas listas, la tienda las confirma aquí.
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        porSede.map(([sede, items]) => (
          <Card key={sede}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5">
                <Truck className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden />
                Hacia {sede}
                <span className="rounded-r-pastilla bg-navy/5 px-2 py-0.5 tabular-nums text-dato text-navy">
                  {items.length}
                </span>
                {sede === miSede && <Badge tone="gold">tu sede</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0 pb-0">
              <Table>
                <THead>
                  <TR>
                    <TH className="pl-5">Código</TH>
                    <TH>Prenda</TH>
                    <TH>Origen</TH>
                    <TH>Enviada</TH>
                    <TH className="pr-5 text-right">Confirmación en tienda</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((p) => (
                    <TR key={p.id}>
                      <TD className="pl-5 tabular-nums text-dato font-semibold text-navy">{p.codigo}</TD>
                      <TD className="text-cuerpo text-ink">
                        {[p.tipo, p.color, p.talla ? `T.${p.talla}` : ''].filter(Boolean).join(' · ') || '—'}
                      </TD>
                      <TD className="tabular-nums text-dato text-muted">{p.sedeOrigenCod}</TD>
                      <TD className="tabular-nums text-dato text-muted">{fecha(p.fechaEnvio)}</TD>
                      <TD className="pr-5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => calificar(p, true)}
                            className="inline-flex items-center gap-1 rounded-r-pastilla bg-exito px-2.5 py-1.5 text-apoyo font-semibold text-white transition hover:bg-exito-deep active:scale-[.97]"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={3} /> Aceptar
                          </button>
                          <select
                            value={destinoObs[p.id] ?? 'recepcion'}
                            onChange={(e) => setDestinoObs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            aria-label={`Observar ${p.codigo}: devolver a`}
                            className="rounded-r-pastilla border border-line bg-white px-1.5 py-1 text-apoyo text-navy"
                          >
                            <option value="recepcion">Recepción</option>
                            <option value="planchado">Planchado</option>
                            <option value="control_calidad">Control calidad</option>
                          </select>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => calificar(p, false)}
                            className="inline-flex items-center gap-1 rounded-r-pastilla border border-aviso-line bg-aviso-soft px-2 py-1.5 text-apoyo font-medium text-aviso-deep transition hover:bg-aviso-soft active:scale-[.97]"
                          >
                            <Eye className="h-3.5 w-3.5" strokeWidth={2.5} /> Observar
                          </button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}

      {recibidas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recibidas recientemente</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 pb-0">
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Código</TH>
                  <TH>Prenda</TH>
                  <TH>Destino</TH>
                  <TH className="pr-5">Recibida</TH>
                </TR>
              </THead>
              <TBody>
                {recibidas.map((p) => (
                  <TR key={p.id}>
                    <TD className="pl-5 tabular-nums text-dato text-navy">{p.codigo}</TD>
                    <TD className="text-cuerpo text-ink">
                      {[p.tipo, p.color].filter(Boolean).join(' · ') || '—'}
                    </TD>
                    <TD className="tabular-nums text-dato text-muted">{p.sedeDestinoCod}</TD>
                    <TD className={cn('pr-5 tabular-nums text-dato text-muted')}>{fecha(p.fechaActualizado)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
