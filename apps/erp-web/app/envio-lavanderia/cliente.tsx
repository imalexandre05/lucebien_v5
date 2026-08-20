'use client';

import { useState, useTransition } from 'react';
import { Plus, Minus, X, Send, Shirt, Package, Check, AlertTriangle } from 'lucide-react';
import { accionEnviarLavanderia, accionValidarRetorno } from './actions';
import type { ListaLavanderia, ItemEnvio } from '../../lib/lavanderia-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge, type Tone } from '../../components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { EmptyState } from '../../components/ui/empty-state';
import { PersonaPicker } from '../../components/ui/persona-picker';
import { cn } from '../../lib/cn';

// Mismo vocabulario que /pipeline/registrar (no inventar valores nuevos).
const TIPOS = ['Terno completo', 'Saco', 'Pantalón', 'Camisa', 'Chaleco', 'Corbata', 'Otros'];
const COLORES = [
  'Negro', 'Azul noche', 'Azul Barcelona', 'Azul eléctrico', 'Azul acero', 'Azul presidente',
  'Verde petróleo', 'Celeste', 'Celeste bb', 'Plomo', 'Plomo rata', 'Beige', 'Camello',
  'Vino', 'Blanco', 'Gris', 'Otros',
];
const TALLAS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '4', '6', '8', '10', '12', '14', '16'];

type Persona = { id: string; nombre: string; rol?: string; sedeCod?: string | null };

const ACCESORIOS: { key: keyof Generales; label: string }[] = [
  { key: 'camisas', label: 'Camisas' },
  { key: 'corbatas', label: 'Corbatas' },
  { key: 'michis', label: 'Michis' },
  { key: 'corbatones', label: 'Corbatones' },
  { key: 'portaTernos', label: 'Porta-ternos' },
  { key: 'zapatos', label: 'Zapatos' },
];

type Generales = { camisas: number; corbatas: number; michis: number; corbatones: number; portaTernos: number; zapatos: number };
const GENERALES_VACIO: Generales = { camisas: 0, corbatas: 0, michis: 0, corbatones: 0, portaTernos: 0, zapatos: 0 };

const ESTADO_TONE: Record<string, Tone> = {
  'En proceso': 'amber',
  Validado: 'green',
  'Devuelto-Observado': 'red',
};

export function EnvioLavanderiaCliente({
  sede,
  empleados,
  listasIniciales,
}: {
  sede: string;
  empleados: Persona[];
  listasIniciales: ListaLavanderia[];
}) {
  const [tipo, setTipo] = useState<'LAV' | 'REF'>('LAV');
  const [items, setItems] = useState<ItemEnvio[]>([]);
  const [codigo, setCodigo] = useState('');
  const [itemTipo, setItemTipo] = useState(TIPOS[0]);
  const [itemColor, setItemColor] = useState(COLORES[0]);
  const [itemTalla, setItemTalla] = useState('');
  const [directoCompostura, setDirectoCompostura] = useState(false);
  const [generales, setGenerales] = useState<Generales>(GENERALES_VACIO);
  const [respInv, setRespInv] = useState<string[]>([]);
  const [respTraslado, setRespTraslado] = useState<string[]>([]);
  const [listas, setListas] = useState(listasIniciales);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [pending, startTransition] = useTransition();

  const nombrePorId = (id: string) => empleados.find((e) => e.id === id)?.nombre ?? '';

  function agregarItem() {
    if (!codigo.trim()) return;
    setItems((p) => [
      ...p,
      {
        cod: codigo.trim().toUpperCase(),
        tipo: itemTipo,
        color: itemColor,
        talla: itemTalla,
        obs: '',
        motivo: '',
        destino: directoCompostura || tipo === 'REF' ? 'compostura' : 'recepcion',
      },
    ]);
    setCodigo('');
    setItemTalla('');
    setDirectoCompostura(false);
  }
  function quitarItem(i: number) {
    setItems((p) => p.filter((_, j) => j !== i));
  }
  function cambiarGeneral(key: keyof Generales, delta: number) {
    setGenerales((p) => ({ ...p, [key]: Math.max(0, p[key] + delta) }));
  }

  const totalGenerales = Object.values(generales).reduce((s, v) => s + v, 0);
  const puedeEnviar = (items.length > 0 || (tipo === 'LAV' && totalGenerales > 0)) && !pending;

  function enviar() {
    setError('');
    setOk('');
    startTransition(async () => {
      const r = await accionEnviarLavanderia({
        sede,
        tipo,
        respInv: nombrePorId(respInv[0] ?? ''),
        respTraslado: nombrePorId(respTraslado[0] ?? ''),
        generales: tipo === 'LAV' ? generales : GENERALES_VACIO,
        items,
      });
      if (!r.ok) {
        setError(r.error ?? 'No se pudo enviar la lista');
        return;
      }
      setOk(`Lista ${r.id} enviada — ${items.length} prenda(s), ${totalGenerales} accesorio(s).`);
      setItems([]);
      setGenerales(GENERALES_VACIO);
    });
  }

  function validar(listaId: string, itemsEstado: { id: string; estado: 'bien' | 'problema' }[]) {
    startTransition(async () => {
      const r = await accionValidarRetorno({ id: listaId, items: itemsEstado, obsRetorno: '' });
      if (r.ok) {
        setListas((p) =>
          p.map((l) =>
            l.id === listaId
              ? {
                  ...l,
                  estado: itemsEstado.some((i) => i.estado === 'problema') ? 'Devuelto-Observado' : 'Validado',
                  validadoTienda: true,
                }
              : l,
          ),
        );
      }
    });
  }

  const fieldCls =
    'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy placeholder:text-muted focus:border-navy focus:outline-none';

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <Shirt className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Nuevo envío
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tipo de envío — botones, no select (patrón del proyecto) */}
          <div className="inline-flex rounded-lg border border-line p-1">
            {(['LAV', 'REF'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={cn(
                  'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors duration-150',
                  tipo === t ? 'bg-navy text-paper' : 'text-muted hover:bg-paper',
                )}
              >
                {t === 'LAV' ? 'Envío general' : 'Envío de refacción'}
              </button>
            ))}
          </div>
          {tipo === 'REF' && (
            <p className="text-xs text-muted">
              Refacción: solo prendas codificadas, van directo a Compostura — sin accesorios a granel.
            </p>
          )}

          {/* Prendas codificadas — ráfaga, mismo patrón que /pipeline/registrar */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Prendas codificadas</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && agregarItem()}
                placeholder="TN-042"
                autoFocus
                className={cn(fieldCls, 'col-span-2 font-mono uppercase sm:col-span-1')}
              />
              <select value={itemTipo} onChange={(e) => setItemTipo(e.target.value)} className={fieldCls}>
                {TIPOS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <select value={itemColor} onChange={(e) => setItemColor(e.target.value)} className={fieldCls}>
                {COLORES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select value={itemTalla} onChange={(e) => setItemTalla(e.target.value)} className={fieldCls}>
                <option value="">Talla —</option>
                {TALLAS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            {tipo === 'LAV' && (
              <label className="mt-2 flex items-center gap-2 text-sm text-navy">
                <input
                  type="checkbox"
                  checked={directoCompostura}
                  onChange={(e) => setDirectoCompostura(e.target.checked)}
                  className="h-4 w-4 accent-[#2e3e6e]"
                />
                Enviar directo a Compostura (revisión rápida: prenda con daño visible)
              </label>
            )}
            <Button type="button" onClick={agregarItem} disabled={!codigo.trim()} className="mt-2">
              <Plus className="h-4 w-4" strokeWidth={2} /> Agregar prenda
            </Button>

            {items.length > 0 && (
              <ul className="mt-3 divide-y divide-line rounded-md border border-line">
                {items.map((it, i) => (
                  <li key={`${it.cod}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="font-mono font-medium text-navy">{it.cod}</span>
                    <span className="text-muted">{it.tipo} · {it.color}{it.talla ? ` · ${it.talla}` : ''}</span>
                    {it.destino === 'compostura' && <Badge tone="red">Compostura</Badge>}
                    <button
                      type="button"
                      onClick={() => quitarItem(i)}
                      className="ml-auto text-muted transition-colors hover:text-error"
                      aria-label="Quitar"
                    >
                      <X className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Accesorios a granel — solo envío general */}
          {tipo === 'LAV' && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Accesorios a granel</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ACCESORIOS.map((a) => (
                  <div key={a.key} className="flex items-center justify-between rounded-md border border-line px-3 py-2">
                    <span className="text-sm text-navy">{a.label}</span>
                    <div className="inline-flex items-center gap-0.5 rounded-md border border-line">
                      <button
                        type="button"
                        onClick={() => cambiarGeneral(a.key, -1)}
                        aria-label={`Menos ${a.label}`}
                        className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-paper active:scale-[0.97]"
                      >
                        <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <span className="w-6 text-center font-mono text-sm font-semibold tabular-nums">{generales[a.key]}</span>
                      <button
                        type="button"
                        onClick={() => cambiarGeneral(a.key, 1)}
                        aria-label={`Más ${a.label}`}
                        className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-paper active:scale-[0.97]"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Responsables — mismo pseudo-FK por nombre que el resto del sistema (CLAUDE.md) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Responsable de inventario</div>
              <PersonaPicker empleados={empleados} selected={respInv} onChange={setRespInv} single placeholder="Buscar…" />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Responsable de traslado</div>
              <PersonaPicker empleados={empleados} selected={respTraslado} onChange={setRespTraslado} single placeholder="Buscar…" />
            </div>
          </div>

          {error && <p className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-deep">{error}</p>}
          {ok && <p className="rounded-md bg-exito-soft px-3 py-2 text-sm text-exito-deep">{ok}</p>}

          <Button type="button" onClick={enviar} disabled={!puedeEnviar} pending={pending} className="w-full justify-center py-2.5">
            {!pending && <Send className="h-4 w-4" strokeWidth={2} />}
            {pending ? 'Enviando…' : `Enviar lista${items.length ? ` (${items.length} prenda(s))` : ''}`}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <Package className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Historial de envíos
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {listas.length === 0 ? (
            <EmptyState icon={Package} titulo="Sin envíos todavía">
              Cuando envíes una lista a lavandería, aparecerá acá.
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Lista</TH>
                  <TH>Tipo</TH>
                  <TH>Fecha</TH>
                  <TH className="text-right">Ítems</TH>
                  <TH>Estado</TH>
                  <TH className="pr-5" />
                </TR>
              </THead>
              <TBody>
                {listas.map((l) => (
                  <TR key={l.id}>
                    <TD className="pl-5 font-mono text-xs">{l.id.slice(0, 8)}</TD>
                    <TD>{l.tipo === 'LAV' ? 'General' : 'Refacción'}</TD>
                    <TD className="font-mono text-xs text-muted">{l.fecha.slice(0, 10)}</TD>
                    <TD className="text-right font-mono tabular-nums">{l.items.length}</TD>
                    <TD>
                      <Badge tone={ESTADO_TONE[l.estado] ?? 'gray'}>{l.estado}</Badge>
                    </TD>
                    <TD className="pr-5 text-right">
                      {l.estado === 'En proceso' && (
                        <Button
                          type="button"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          disabled={pending}
                          onClick={() => validar(l.id, l.items.map((i) => ({ id: i.id, estado: 'bien' as const })))}
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={2} /> Validar retorno (todo bien)
                        </Button>
                      )}
                      {l.estado === 'Devuelto-Observado' && (
                        <span className="inline-flex items-center gap-1 text-xs text-error-deep">
                          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} /> Con observación
                        </span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
