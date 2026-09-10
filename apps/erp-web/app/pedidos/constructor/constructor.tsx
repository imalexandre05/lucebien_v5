'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X } from 'lucide-react';
import { TIPOS_LINEA, type EtapaConfeccion, type PedidoCrearInput, type TipoLinea, type ActivoInventario } from '@scilb/core';
import { ClientePanel, type ClienteSel, type ClienteOpcion } from './cliente-panel';
import { LineasPanel } from './lineas-panel';
import { FechasPanel } from './fechas-panel';
import { GarantiaPanel, GARANTIA_VACIA, type GarantiaSel } from './garantia-panel';
import { Ticket } from './ticket';
import { accionCrearPedidoConstructor } from '../actions';
import { accionAbrirCaja } from '../../caja/actions';
import { Card, CardContent } from '../../../components/ui/card';
import { campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

export type LineaLocal = {
  key: string;
  tipo: TipoLinea;
  activoId?: string;
  activoCodigo?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  precioLista?: number;
  esCortesia: boolean;
  notas?: string;
  tela?: string;
  fechaPrueba?: string;
  fechaSegundaPrueba?: string;
  etapaConfeccion?: EtapaConfeccion;
};

const hoy = () => new Date().toISOString().slice(0, 10);

const fieldCls = cn(campoCls, 'w-full py-2');

// Constructor de pedidos (Fase 9): una sola pantalla, sin modal, teclado-first. Orquesta el estado
// del pedido en construcción y lo entrega COMPLETO a pedido_crear (una transacción — Fase 8): el
// cliente (nuevo o existente, con sus ediciones), las N líneas, garantía y el cobro inicial.
//
// Atajos globales (documento completo, no por campo): `/` cliente · `F2`/`Ctrl+K` activo ·
// `Alt+1..4` tipo de la próxima línea · `Ctrl+Enter` registrar. `/` se ignora si el foco ya está
// en un campo de texto (para no interceptar una barra escrita a mano, ej. en Notas).
export function PedidosConstructor({
  clientes,
  activos,
  sedeActual,
  cajaAbierta,
  autoFocusCliente,
  metodosPago,
  docGarantia,
  fechasRapidas,
}: {
  clientes: ClienteOpcion[];
  activos: ActivoInventario[];
  sedeActual: string;
  cajaAbierta: boolean;
  // `/caja` enlaza aquí con `?nuevo=1` (Fase 10, punto 1) para enfocar el buscador de cliente
  // apenas se monta la página, sin tener que hacer clic primero.
  autoFocusCliente?: boolean;
  metodosPago?: { value: string; label: string }[];
  docGarantia?: { value: string; label: string }[];
  fechasRapidas?: { entrega: { dias: number; label: string }[]; devolucion: { dias: number; label: string }[] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [abriendoCaja, setAbriendoCaja] = useState(false);

  const clienteInputRef = useRef<HTMLInputElement>(null);
  const activoInputRef = useRef<HTMLInputElement>(null);
  const montoInputRef = useRef<HTMLInputElement>(null);

  const [cliente, setCliente] = useState<ClienteSel | null>(null);
  const [tipoLinea, setTipoLinea] = useState<TipoLinea>('alquiler');
  const [items, setItems] = useState<LineaLocal[]>([]);
  const [fechaEntrega, setFechaEntrega] = useState(hoy());
  const [fechaDevolucion, setFechaDevolucion] = useState(hoy());
  const [garantia, setGarantia] = useState<GarantiaSel>(GARANTIA_VACIA);
  const [notas, setNotas] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [recibido, setRecibido] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sinCaja, setSinCaja] = useState(!cajaAbierta);
  const [exito, setExito] = useState<{ codigo: string; id: string; tieneAlquiler: boolean } | null>(null);

  function addItem(l: LineaLocal) {
    setItems((xs) => [...xs, l]);
    setExito(null);
  }
  function removeItem(key: string) {
    setItems((xs) => xs.filter((x) => x.key !== key));
  }
  function updateItem(key: string, patch: Partial<LineaLocal>) {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function limpiar() {
    setCliente(null);
    setItems([]);
    setFechaEntrega(hoy());
    setFechaDevolucion(hoy());
    setGarantia(GARANTIA_VACIA);
    setNotas('');
    setRecibido(0);
    setMetodo('efectivo');
  }

  const registrar = useCallback(() => {
    setError(null);
    if (!cliente || !cliente.nombre.trim()) {
      setError('Elige o crea un cliente antes de registrar.');
      clienteInputRef.current?.focus();
      return;
    }
    if (items.length === 0) {
      setError('Agrega al menos una línea al pedido.');
      activoInputRef.current?.focus();
      return;
    }
    if (garantia.tipo === 'documento' && (!garantia.documentoTipo || !garantia.documentoNum.trim())) {
      setError('Completa el tipo y número de documento de la garantía.');
      return;
    }

    const input: PedidoCrearInput = {
      cliente: {
        id: cliente.id,
        nombre: cliente.nombre.trim(),
        dni: cliente.dni || undefined,
        telefono: cliente.telefono || undefined,
      },
      sedeCod: sedeActual,
      items: items.map((i) => ({
        tipo: i.tipo,
        activoId: i.activoId,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        precioLista: i.precioLista,
        esCortesia: i.esCortesia,
        notas: i.notas,
        tela: i.tela,
        fechaPrueba: i.fechaPrueba,
        fechaSegundaPrueba: i.fechaSegundaPrueba,
        etapaConfeccion: i.etapaConfeccion,
      })),
      garantia:
        garantia.tipo === 'efectivo'
          ? { tipo: 'efectivo', monto: garantia.monto, metodo: 'efectivo' }
          : garantia.tipo === 'documento'
            ? { tipo: 'documento', documentoTipo: garantia.documentoTipo, documentoNum: garantia.documentoNum }
            : { tipo: 'ninguna' },
      pagos: recibido > 0 ? [{ monto: recibido, metodo }] : [],
      fecha: hoy(),
      fechaEntrega: fechaEntrega || undefined,
      fechaDevolucion: fechaDevolucion || undefined,
      notas,
    };

    startTransition(async () => {
      const r = await accionCrearPedidoConstructor(input);
      if (!r.ok) {
        setError(r.error ?? 'Error al crear el pedido');
        if (r.codigo === 'SIN_CAJA') setSinCaja(true);
        return;
      }
      setSinCaja(false);
      setExito({ codigo: r.pedido.codigo, id: r.pedido.id, tieneAlquiler: r.pedido.items.some((i) => i.tipo === 'alquiler') });
      limpiar();
      router.refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, items, garantia, recibido, metodo, fechaEntrega, fechaDevolucion, notas, sedeActual, router]);

  const abrirCajaInline = useCallback(
    (montoApertura: number) => {
      setAbriendoCaja(true);
      startTransition(async () => {
        const r = await accionAbrirCaja(sedeActual, montoApertura);
        setAbriendoCaja(false);
        if (!r.ok) {
          setError(r.error ?? 'Error al abrir caja');
          return;
        }
        setSinCaja(false);
        setError(null);
        router.refresh();
      });
    },
    [sedeActual],
  );

  // Foco inicial al llegar desde `/caja` (`?nuevo=1`) — mismo gesto que el atajo `/`, pero
  // disparado al montar en vez de por teclado.
  useEffect(() => {
    if (autoFocusCliente) clienteInputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const enEditable = tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(target?.isContentEditable);

      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        registrar();
        return;
      }
      if (e.key === 'F2' || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        activoInputRef.current?.focus();
        return;
      }
      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        setTipoLinea(TIPOS_LINEA[Number(e.key) - 1]);
        return;
      }
      if (e.key === '/' && !enEditable) {
        e.preventDefault();
        clienteInputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [registrar]);

  const disabledMotivo = !cliente ? 'Elige o crea un cliente' : items.length === 0 ? 'Agrega al menos una línea' : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {exito && (
          <div className="flex items-center justify-between gap-3 rounded-r-chico border border-exito-line bg-exito-soft px-4 py-3 text-sm text-exito-deep" data-testid="exito-banner">
            <span>
              Pedido <span className="tabular-nums font-semibold">{exito.codigo}</span> registrado.
            </span>
            <div className="flex items-center gap-3">
              <Link href={`/pedidos/${exito.id}`} className="font-medium underline-offset-2 hover:underline">
                Ver pedido
              </Link>
              {exito.tieneAlquiler && (
                <Link href={`/pedidos/${exito.id}/contrato`} className="font-medium underline-offset-2 hover:underline">
                  Contrato
                </Link>
              )}
              <button type="button" onClick={() => setExito(null)} aria-label="Cerrar" className="text-exito-deep/70 hover:text-exito-deep">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        )}

        <Card>
          <CardContent className="space-y-4 pt-4">
            <section>
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">① Cliente</h2>
              <ClientePanel clientes={clientes} value={cliente} onChange={setCliente} inputRef={clienteInputRef} />
            </section>

            <section className="border-t border-line/60 pt-4">
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">② Líneas</h2>
              <LineasPanel
                activos={activos}
                tipoActivo={tipoLinea}
                onTipoActivoChange={setTipoLinea}
                items={items}
                onAdd={addItem}
                onRemove={removeItem}
                onUpdate={updateItem}
                activoInputRef={activoInputRef}
              />
            </section>

            <section className="border-t border-line/60 pt-4">
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">③ Fechas</h2>
              <FechasPanel
                hoy={hoy()}
                fechaEntrega={fechaEntrega}
                onFechaEntregaChange={setFechaEntrega}
                fechaDevolucion={fechaDevolucion}
                onFechaDevolucionChange={setFechaDevolucion}
                offsetsEntrega={fechasRapidas?.entrega}
                offsetsDevolucion={fechasRapidas?.devolucion}
              />
            </section>

            <section className="border-t border-line/60 pt-4">
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">④ Garantía</h2>
              <GarantiaPanel value={garantia} onChange={setGarantia} docOpciones={docGarantia} />
            </section>

            <section className="border-t border-line/60 pt-4">
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">⑤ Notas</h2>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Detalles del pedido para el equipo…"
                rows={2}
                className={fieldCls}
              />
            </section>
          </CardContent>
        </Card>
      </div>

      <div>
        <Ticket
          items={items}
          metodo={metodo}
          onMetodoChange={setMetodo}
          metodosPago={metodosPago}
          recibido={recibido}
          onRecibidoChange={setRecibido}
          onRegistrar={registrar}
          registrando={pending}
          disabledMotivo={disabledMotivo}
          error={error}
          sinCaja={sinCaja}
          onAbrirCaja={abrirCajaInline}
          abriendoCaja={abriendoCaja}
          sede={sedeActual}
          montoInputRef={montoInputRef}
        />
      </div>
    </div>
  );
}
