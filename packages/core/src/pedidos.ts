import { z } from 'zod';

// Pedido comercial (Fase 8 — modelo multi-línea): UN pedido por visita, con el tipo a nivel de
// LÍNEA (una visita puede llevar alquiler + venta + cortesías a la vez) y el tipo de cabecera
// DERIVADO ('mixto' si las líneas activas cubren más de un tipo). Un servicio (o un alquiler
// devuelto) genera una PASADA en el pipeline interno (E5) — ahí se unen lo comercial y lo interno.
export type TipoLinea = 'alquiler' | 'venta' | 'servicio' | 'confeccion';
export const TIPOS_LINEA: TipoLinea[] = ['alquiler', 'venta', 'servicio', 'confeccion'];

// El tipo de cabecera es el de línea + 'mixto' (derivado, nunca se escribe a mano).
export type TipoPedido = TipoLinea | 'mixto';
export const TIPOS_PEDIDO: TipoPedido[] = ['alquiler', 'venta', 'servicio', 'confeccion', 'mixto'];

export type EstadoPedido = 'abierto' | 'entregado' | 'devuelto' | 'cerrado' | 'cancelado';
export const ESTADOS_PEDIDO: EstadoPedido[] = ['abierto', 'entregado', 'devuelto', 'cerrado', 'cancelado'];

export type EstadoItemPedido = 'activo' | 'devuelto' | 'cancelado';
export const ESTADOS_ITEM_PEDIDO: EstadoItemPedido[] = ['activo', 'devuelto', 'cancelado'];

export type EstadoPago = 'pendiente' | 'parcial' | 'completo';
export type CobroTipo = 'adelanto' | 'saldo' | 'completo';

export type TipoGarantia = 'efectivo' | 'documento' | 'ninguna';
export const TIPOS_GARANTIA: TipoGarantia[] = ['efectivo', 'documento', 'ninguna'];

export type EstadoGarantia = 'retenida' | 'devuelta' | 'ejecutada';
export const ESTADOS_GARANTIA: EstadoGarantia[] = ['retenida', 'devuelta', 'ejecutada'];

// Etapas de confección a medida — decisión E4 (2026-05-30): corte → armado → ajuste → entrega.
export type EtapaConfeccion = 'corte' | 'armado' | 'ajuste' | 'entrega';
export const ETAPAS_CONFECCION: EtapaConfeccion[] = ['corte', 'armado', 'ajuste', 'entrega'];

// ── Línea de pedido (pedido_items, Fase 8) ──────────────────────────────────────────────────
export interface LineaPedido {
  id: string;
  activoId: string | null;
  activoCodigo?: string | null; // denormalizado por el repo para no requerir un segundo fetch
  tipo: TipoLinea;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  precioLista: number;
  esCortesia: boolean;
  estado: EstadoItemPedido;
  notas: string;
  orden: number;
  devueltoAt: string | null;
  subtotal: number;
  tela: string | null;
  fechaPrueba: string | null;
  fechaSegundaPrueba: string | null;
  etapaConfeccion: EtapaConfeccion | null;
}

// Entrada para crear una línea (pedido_crear) — sin id/estado/subtotal, los fija el servidor.
export interface LineaPedidoInput {
  tipo: TipoLinea;
  activoId?: string;
  descripcion?: string;
  cantidad?: number;
  precioUnitario: number;
  precioLista?: number;
  esCortesia?: boolean;
  notas?: string;
  tela?: string;
  fechaPrueba?: string;
  fechaSegundaPrueba?: string;
  etapaConfeccion?: EtapaConfeccion;
}

export const lineaPedidoInputSchema = z.object({
  tipo: z.enum(['alquiler', 'venta', 'servicio', 'confeccion']),
  activoId: z.string().optional().default(''),
  descripcion: z.string().default(''),
  cantidad: z.coerce.number().int().positive().default(1),
  precioUnitario: z.coerce.number().nonnegative(),
  precioLista: z.coerce.number().nonnegative().optional(),
  esCortesia: z.boolean().default(false),
  notas: z.string().default(''),
  tela: z.string().optional().default(''),
  fechaPrueba: z.string().optional().default(''),
  fechaSegundaPrueba: z.string().optional().default(''),
  etapaConfeccion: z.enum(['corte', 'armado', 'ajuste', 'entrega']).optional(),
});

// ── Garantía (pedido_garantias, Fase 8) — siempre existe una, incluso 'ninguna' ─────────────
export interface Garantia {
  id: string;
  tipo: TipoGarantia;
  monto: number | null;
  metodo: string | null;
  documentoTipo: string | null;
  documentoNum: string | null;
  estado: EstadoGarantia;
  resueltaAt: string | null;
}

export interface GarantiaInput {
  tipo: TipoGarantia;
  monto?: number;
  metodo?: string;
  documentoTipo?: string;
  documentoNum?: string;
}

export const garantiaInputSchema = z
  .object({
    tipo: z.enum(['efectivo', 'documento', 'ninguna']),
    monto: z.coerce.number().nonnegative().optional(),
    metodo: z.string().optional(),
    documentoTipo: z.string().optional(),
    documentoNum: z.string().optional(),
  })
  .refine((g) => g.tipo !== 'documento' || (g.documentoTipo && g.documentoNum), {
    message: 'La garantía por documento necesita tipo y número de documento',
  });

export interface PagoInput {
  monto: number;
  metodo: string;
  descripcion?: string;
}

export const pagoInputSchema = z.object({
  monto: z.coerce.number().positive(),
  metodo: z.string().min(1),
  descripcion: z.string().optional(),
});

// ── Pedido (cabecera) ────────────────────────────────────────────────────────────────────
export interface Pedido {
  id: string;
  numero: number;
  codigo: string; // LB-00043
  clienteId: string;
  clienteNombre?: string;
  tipo: TipoPedido; // derivado — nunca se escribe a mano
  sedeCod: string;
  estado: EstadoPedido;
  fecha: string; // YYYY-MM-DD
  fechaDevolucion?: string | null; // alquiler
  fechaEntrega?: string | null; // venta / confección
  notas: string;
  total: number; // Σ subtotales de líneas no canceladas (trigger)
  cobrado: number; // Σ neto de caja_movimientos categoría 'cobro' (trigger)
  saldo: number; // total − cobrado (generada)
  estadoPago: EstadoPago; // derivado de total/cobrado (generada)
  creadoPorId: string | null;
  creadoPorCod: string | null;
  createdAt: string;
  items: LineaPedido[];
  garantia: Garantia | null;
  // Compat con las pantallas de la Fase 7/9 que todavía muestran "una línea": resumen legible
  // (la primera línea, o "N ítems" si hay más de una) — no reemplaza a `items`.
  detalle: string;
}

// Entrada para pedido_crear — mapea 1:1 a los parámetros del RPC (0061).
export interface PedidoCrearInput {
  cliente: { id?: string; nombre: string; dni?: string; telefono?: string; medidas?: Record<string, unknown> };
  sedeCod: string;
  items: LineaPedidoInput[];
  garantia?: GarantiaInput;
  pagos?: PagoInput[];
  fecha?: string;
  fechaDevolucion?: string;
  fechaEntrega?: string;
  notas?: string;
  forzar?: boolean;
}

export const pedidoCrearSchema = z.object({
  cliente: z.object({
    id: z.string().optional(),
    nombre: z.string().min(1, 'Nombre del cliente requerido'),
    dni: z.string().optional(),
    telefono: z.string().optional(),
    medidas: z.record(z.unknown()).optional(),
  }),
  sedeCod: z.string().min(1, 'Sede requerida'),
  items: z.array(lineaPedidoInputSchema).min(1, 'Agrega al menos un ítem'),
  garantia: garantiaInputSchema.optional(),
  pagos: z.array(pagoInputSchema).optional().default([]),
  fecha: z.string().optional(),
  fechaDevolucion: z.string().optional(),
  fechaEntrega: z.string().optional(),
  notas: z.string().default(''),
  forzar: z.boolean().default(false),
});
export type PedidoCrearInputParsed = z.infer<typeof pedidoCrearSchema>;

// Compat retro — flujo actual del modal de un solo ítem (app/pedidos/cliente.tsx, ajuste mínimo
// de la Fase 8; el constructor multi-línea real es la Fase 9). El adapter vive en actions.ts.
export const pedidoSchema = z.object({
  clienteId: z.string().min(1, 'Cliente requerido'),
  tipo: z.enum(['alquiler', 'venta', 'servicio', 'confeccion']),
  sedeCod: z.string().min(1, 'Sede requerida'),
  activoId: z.string().optional().default(''),
  descripcion: z.string().default(''),
  fecha: z.string().min(1, 'Fecha requerida'),
  fechaDevolucion: z.string().optional().default(''),
  fechaEntrega: z.string().optional().default(''),
  notas: z.string().default(''),
  garantiaMonto: z.coerce.number().nonnegative().default(0),
  tela: z.string().default(''),
  fechaPrueba: z.string().optional().default(''),
  fechaSegundaPrueba: z.string().optional().default(''),
  total: z.coerce.number().nonnegative().default(0),
});
export type PedidoInput = z.infer<typeof pedidoSchema>;

// Un servicio (o devolución) entra al pipeline; una venta/alquiler nuevo no (el activo sale).
export const generaPasada = (tipo: TipoLinea): boolean => tipo === 'servicio';

// Al devolver un alquiler, el/los activo(s) vuelven a ensuciarse: reingresan al pipeline.
export const requiereProcesoAlDevolver = (tipo: TipoLinea): boolean => tipo === 'alquiler';

// ── Lógica pura (con test) — replica exactamente lo que hacen los triggers/RPC (0059/0061), así
// la UI puede previsualizar total/tipo/clasificación del cobro sin ir a la BD. ──────────────────

export interface LineaParaTotal {
  cantidad: number;
  precioUnitario: number;
  esCortesia?: boolean;
  estado?: EstadoItemPedido;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// total = Σ(cantidad × precio_unitario) de las líneas NO canceladas, con la cortesía forzada a 0
// (misma normalización que hace pedido_crear del lado SQL — nunca confiar en que el llamador ya
// mandó precio_unitario=0 para una cortesía).
export function totalPedido(items: LineaParaTotal[]): number {
  return r2(
    items
      .filter((i) => i.estado !== 'cancelado')
      .reduce((s, i) => s + i.cantidad * (i.esCortesia ? 0 : i.precioUnitario), 0),
  );
}

// Tipo de cabecera derivado de las líneas no canceladas: el tipo único si todas coinciden, o
// 'mixto' si hay más de uno (mismo criterio que private.pedido_items_recalc(), 0059). Sin líneas
// activas, no hay un tipo "correcto" que derivar — se devuelve null y el llamador decide (el
// trigger SQL, en ese caso, conserva el tipo previo del pedido en vez de pisarlo).
export function tipoDominante(items: { tipo: TipoLinea; estado?: EstadoItemPedido }[]): TipoPedido | null {
  const activos = items.filter((i) => i.estado !== 'cancelado');
  const tipos = new Set(activos.map((i) => i.tipo));
  if (tipos.size === 0) return null;
  if (tipos.size === 1) return [...tipos][0];
  return 'mixto';
}

// Clasifica un cobro como adelanto/saldo/completo — mismo criterio que pedido_crear/pedido_cobrar
// (0061): si con este pago se cubre el total, es 'completo' cuando no había nada cobrado antes, o
// 'saldo' cuando se estaba pagando un remanente; si no cubre el total, siempre 'adelanto'
// (automático, nunca se pregunta — decisión del plan).
export function clasificarCobro(total: number, cobradoPrevio: number, monto: number): CobroTipo {
  const nuevoCobrado = r2(cobradoPrevio + monto);
  if (nuevoCobrado >= total) return cobradoPrevio <= 0 ? 'completo' : 'saldo';
  return 'adelanto';
}

// estado_pago derivado — mismo criterio que la columna generada `pedidos.estado_pago` (0059):
// un total <= 0 (ej. pedido 100% cortesía) siempre es 'completo', nunca "pendiente".
export function estadoPago(total: number, cobrado: number): EstadoPago {
  if (total <= 0) return 'completo';
  if (cobrado <= 0) return 'pendiente';
  if (cobrado >= total) return 'completo';
  return 'parcial';
}

// Total por TIPO DE LÍNEA a través de N pedidos (Fase 9, hallazgo de la F8): app/page.tsx y
// app/finanzas/page.tsx agrupaban los KPI comerciales por `pedido.tipo === 'venta' | 'alquiler'`
// — con el modelo multi-línea, un pedido 'mixto' (que la propia F9 hace posible en la práctica: un
// alquiler + una venta en la misma visita) no cae en NINGÚN grupo y desaparecía de las cifras. La
// fuente correcta es la LÍNEA (`pedido_items.tipo`), nunca la cabecera derivada. Reutiliza el
// `subtotal` ya calculado por línea (cortesía en 0, cantidad × precio) — mismo criterio de
// exclusión de canceladas que `totalPedido`.
export interface LineaParaTipo {
  tipo: TipoLinea;
  subtotal: number;
  estado?: EstadoItemPedido;
}

export function totalPorTipoLinea(items: LineaParaTipo[]): Record<TipoLinea, number> {
  const acc: Record<TipoLinea, number> = { alquiler: 0, venta: 0, servicio: 0, confeccion: 0 };
  for (const i of items) {
    if (i.estado === 'cancelado') continue;
    acc[i.tipo] = r2(acc[i.tipo] + i.subtotal);
  }
  return acc;
}

export interface PedidoRepo {
  listar(): Promise<Pedido[]>;
  porCliente(clienteId: string): Promise<Pedido[]>;
  obtener(id: string): Promise<Pedido | null>;
  crear(input: PedidoCrearInput): Promise<Pedido>;
  devolver(p: { pedidoId: string; itemIds?: string[]; cobroSaldo?: PagoInput; garantia?: { accion: 'devolver' | 'retener'; monto?: number; metodo?: string } }): Promise<void>;
  cobrar(p: { pedidoId: string; monto: number; metodo: string; descripcion?: string }): Promise<CobroTipo>;
  anular(pedidoId: string, motivo?: string): Promise<void>;
  actualizarEtapaConfeccion(itemId: string, etapa: EtapaConfeccion): Promise<void>;
  // Compat retro (app/pedidos/[id]/acciones.tsx): 'devuelto'/'cancelado' delegan en
  // devolver()/anular() (mueven dinero/inventario); 'entregado'/'cerrado' son solo una marca de
  // estado sin efecto de dinero/inventario y siguen como update directo.
  cambiarEstado(id: string, estado: EstadoPedido): Promise<void>;
}
