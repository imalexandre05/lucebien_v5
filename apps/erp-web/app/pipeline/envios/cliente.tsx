'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Eye, Truck, ArrowLeft } from 'lucide-react';
import type { FiltrosEnvios } from '@scilb/core';
import type { PrendaEnviada } from '../../../lib/envios-repo';
import { calificarPrenda } from '../actions';
import { useOperador } from '../operador';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';
import { BarraFiltros } from '../../../components/ui/barra-filtros';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Aviso, campoCls } from '../../../components/ui/form';
import { OpcionBotones } from '../../../components/ui/opcion-botones';
import { cn } from '../../../lib/cn';

// El día en hora Perú (no-negociable 4). Un `slice(0, 10)` del timestamptz daba el día en UTC: un
// envío de las 20:00 del 30-sep salía como 1-oct, y contradecía el filtro de fechas de al lado.
const diaPeru = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' });
const fecha = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? '—' : diaPeru.format(t);
};

const RUTA = '/pipeline/envios';

// URL de la pantalla con los filtros actuales más `cambios` (null borra la clave).
function urlCon(f: FiltrosEnvios, cambios: Partial<Record<'sede' | 'desde' | 'hasta' | 'pag', string | null>>) {
  const base: Record<string, string | null> = {
    sede: f.sede,
    desde: f.desde,
    hasta: f.hasta,
    pag: f.pagina > 1 ? String(f.pagina) : null,
  };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...cambios })) if (v) qs.set(k, v);
  const q = qs.toString();
  return q ? `${RUTA}?${q}` : RUTA;
}

export function EnviosCliente({
  enCamino,
  enCaminoTruncado,
  topeEnCamino,
  recibidas,
  hayMasRecibidas,
  miSede,
  opcionesSede,
  filtros,
  compartido = false,
}: {
  enCamino: PrendaEnviada[];
  enCaminoTruncado: boolean;
  topeEnCamino: number;
  recibidas: PrendaEnviada[];
  hayMasRecibidas: boolean;
  miSede: string;
  /** Vacío si la persona ve una sola sede: entonces no hay selector. */
  opcionesSede: { cod: string; nombre: string }[];
  filtros: FiltrosEnvios;
  compartido?: boolean;
}) {
  const { conOperador, operadorRechazado, renovar, chip, dialogo } = useOperador(compartido);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [destinoObs, setDestinoObs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const hayFiltros = Boolean(filtros.sede || filtros.desde || filtros.hasta);

  // Cambiar un filtro vuelve a la primera página del historial.
  function elegirSede(sede: string) {
    router.push(urlCon(filtros, { sede: sede || null, pag: null }));
  }

  function aplicarFechas(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const val = (k: string) => String(d.get(k) ?? '') || null;
    router.push(urlCon(filtros, { desde: val('desde'), hasta: val('hasta'), pag: null }));
  }

  // Agrupadas por sede destino; la sede activa primero (es la que debe confirmar). Dentro de cada
  // grupo, la más antigua arriba: así llegan del repo.
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
          const r = await calificarPrenda(p.id, aceptada, aceptada ? '' : destinoObs[p.id] || 'recepcion', token);
          if (r) {
            operadorRechazado();
            setError('Operador vencido. Ingresa tu código de nuevo.');
          } else {
            renovar();
          }
        } catch {
          setError('No se pudo calificar la prenda. Actualiza la lista e inténtalo de nuevo.');
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

      <BarraFiltros
        onLimpiar={hayFiltros ? () => router.push(RUTA) : undefined}
      >
        {/* Tienda: un toque y filtra. Sólo aparece si la persona ve más de una sede. */}
        {opcionesSede.length > 0 && (
          <OpcionBotones
            ariaLabel="Tienda de destino"
            opciones={[{ value: '', label: 'Todas' }, ...opcionesSede.map((s) => ({ value: s.cod, label: s.nombre }))]}
            value={filtros.sede ?? ''}
            onChange={elegirSede}
          />
        )}
        {/* key: al navegar con otras fechas el formulario se rearma con los valores nuevos. */}
        <form
          key={urlCon(filtros, {})}
          onSubmit={aplicarFechas}
          className="flex flex-wrap items-center gap-2"
          aria-label="Filtrar el historial por fecha de envío"
        >
          <label className="flex items-center gap-1.5 text-apoyo text-muted">
            Enviado del
            <input type="date" name="desde" defaultValue={filtros.desde ?? ''} className={cn(campoCls, 'tabular-nums')} />
          </label>
          <label className="flex items-center gap-1.5 text-apoyo text-muted">
            al
            <input type="date" name="hasta" defaultValue={filtros.hasta ?? ''} className={cn(campoCls, 'tabular-nums')} />
          </label>
          <Button type="submit" variant="outline" className="px-3 py-1.5">
            Aplicar
          </Button>
        </form>
      </BarraFiltros>

      {enCaminoTruncado && (
        <Aviso tono="aviso" titulo="Hay más prendas en camino de las que se muestran">
          Se ven las {topeEnCamino} que llevan más tiempo esperando.
          {opcionesSede.length > 0 && !filtros.sede && ' Elige una tienda para ver todas las suyas.'}
        </Aviso>
      )}

      {porSede.length === 0 ? (
        <Card>
          <CardContent className="pb-0">
            <EmptyState icon={Truck} titulo="Sin envíos en camino">
              {filtros.sede
                ? `No hay prendas en camino hacia ${filtros.sede}.`
                : 'Cuando el almacén despache prendas listas, la tienda las confirma aquí.'}
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

      <Card>
        <CardHeader>
          <CardTitle>Recibidas</CardTitle>
          {(filtros.desde || filtros.hasta) && (
            <p className="text-apoyo text-muted">
              Enviadas {filtros.desde ? `del ${filtros.desde}` : 'hasta'} {filtros.hasta ? `${filtros.desde ? 'al ' : ''}${filtros.hasta}` : 'en adelante'}.
              Las fechas sólo filtran este historial; lo que está en camino se muestra siempre completo.
            </p>
          )}
        </CardHeader>
        {recibidas.length === 0 ? (
          <CardContent className="pb-0">
            <EmptyState icon={Truck} titulo="Sin recepciones">
              {filtros.pagina > 1 ? (
                <Link href={urlCon(filtros, { pag: null })} className={buttonVariants({ variant: 'outline' })}>
                  Volver a la primera página
                </Link>
              ) : hayFiltros ? (
                'No hay prendas recibidas para este filtro.'
              ) : (
                'Aquí aparece lo que la tienda ya confirmó.'
              )}
            </EmptyState>
          </CardContent>
        ) : (
          <CardContent className="overflow-x-auto px-0 pb-0">
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Código</TH>
                  <TH>Prenda</TH>
                  <TH>Destino</TH>
                  <TH>Enviada</TH>
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
                    <TD className="tabular-nums text-dato text-muted">{fecha(p.fechaEnvio)}</TD>
                    <TD className={cn('pr-5 tabular-nums text-dato text-muted')}>{fecha(p.fechaActualizado)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        )}
        {(filtros.pagina > 1 || hayMasRecibidas) && (
          <nav aria-label="Páginas del historial" className="flex items-center justify-between border-t border-line px-3 py-2">
            {filtros.pagina > 1 ? (
              <Link href={urlCon(filtros, { pag: filtros.pagina > 2 ? String(filtros.pagina - 1) : null })} className={buttonVariants({ variant: 'ghost' })}>
                ← Más recientes
              </Link>
            ) : (
              <span />
            )}
            <span className="tabular-nums text-apoyo text-muted">Página {filtros.pagina}</span>
            {hayMasRecibidas ? (
              <Link href={urlCon(filtros, { pag: String(filtros.pagina + 1) })} className={buttonVariants({ variant: 'ghost' })}>
                Anteriores →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </Card>
    </div>
  );
}
