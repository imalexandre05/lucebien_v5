import { z } from 'zod';

// Pedido comercial: alquiler, venta, servicio o confección a medida. Un servicio (o un alquiler
// devuelto) genera una PASADA en el pipeline interno (E5) — ahí se unen lo comercial y lo interno.
export type TipoPedido = 'alquiler' | 'venta' | 'servicio' | 'confeccion';
export const TIPOS_PEDIDO: TipoPedido[] = ['alquiler', 'venta', 'servicio', 'confeccion'];

export type EstadoPedido = 'abierto' | 'entregado' | 'devuelto' | 'cerrado' | 'cancelado';
export const ESTADOS_PEDIDO: EstadoPedido[] = ['abierto', 'entregado', 'devuelto', 'cerrado', 'cancelado'];

// Etapas de confección a medida — decisión E4 (2026-05-30): corte → armado → ajuste → entrega.
// Default basado en esa decisión; confirmar con el usuario si sigue vigente antes de tratarlas
// como definitivas (no es una fórmula/precio, así que el riesgo de "inventar regla" es bajo, pero
// queda anotado).
export type EtapaConfeccion = 'corte' | 'armado' | 'ajuste' | 'entrega';
export const ETAPAS_CONFECCION: EtapaConfeccion[] = ['corte', 'armado', 'ajuste', 'entrega'];

export interface Pedido {
  id: string;
  clienteId: string;
  clienteNombre?: string;
  tipo: TipoPedido;
  sedeCod: string;
  estado: EstadoPedido;
  fecha: string; // YYYY-MM-DD
  fechaDevolucion?: string | null; // alquiler
  fechaEntrega?: string | null; // venta / confección
  notas: string; // notas de ajuste, para comunicación con el equipo
  garantiaMonto: number; // depósito reembolsable (alquiler); el cobro real se registra en Caja
  tela: string | null; // confección
  fechaPrueba?: string | null; // confección
  fechaSegundaPrueba?: string | null; // confección
  etapaConfeccion?: EtapaConfeccion | null;
  detalle: string; // resumen (código del activo o descripción del servicio)
  total: number;
  createdAt: string;
}

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
export const generaPasada = (tipo: TipoPedido): boolean => tipo === 'servicio';

// Al devolver un alquiler, el/los activo(s) vuelven a ensuciarse: reingresan al pipeline de
// lavandería (recepción) para procesarse antes de volver a estar disponibles.
export const requiereProcesoAlDevolver = (tipo: TipoPedido): boolean => tipo === 'alquiler';

export interface PedidoRepo {
  listar(): Promise<Pedido[]>;
  porCliente(clienteId: string): Promise<Pedido[]>;
  obtener(id: string): Promise<Pedido | null>;
  crear(input: PedidoInput): Promise<Pedido>;
  cambiarEstado(id: string, estado: EstadoPedido): Promise<void>;
  actualizarEtapaConfeccion(id: string, etapa: EtapaConfeccion): Promise<void>;
}
