import { z } from 'zod';

// Pedido comercial: alquiler, venta o servicio. Un servicio (o un alquiler devuelto) genera una
// PASADA en el pipeline interno (E5) — ahí se unen lo comercial y lo interno.
export type TipoPedido = 'alquiler' | 'venta' | 'servicio';
export const TIPOS_PEDIDO: TipoPedido[] = ['alquiler', 'venta', 'servicio'];

export type EstadoPedido = 'abierto' | 'entregado' | 'devuelto' | 'cerrado' | 'cancelado';
export const ESTADOS_PEDIDO: EstadoPedido[] = ['abierto', 'entregado', 'devuelto', 'cerrado', 'cancelado'];

export interface Pedido {
  id: string;
  clienteId: string;
  clienteNombre?: string;
  tipo: TipoPedido;
  sedeCod: string;
  estado: EstadoPedido;
  fecha: string; // YYYY-MM-DD
  fechaDevolucion?: string | null;
  detalle: string; // resumen (código del activo o descripción del servicio)
  total: number;
  createdAt: string;
}

export const pedidoSchema = z.object({
  clienteId: z.string().min(1, 'Cliente requerido'),
  tipo: z.enum(['alquiler', 'venta', 'servicio']),
  sedeCod: z.string().min(1, 'Sede requerida'),
  activoId: z.string().optional().default(''),
  descripcion: z.string().default(''),
  fecha: z.string().min(1, 'Fecha requerida'),
  fechaDevolucion: z.string().optional().default(''),
  total: z.coerce.number().nonnegative().default(0),
});
export type PedidoInput = z.infer<typeof pedidoSchema>;

// Un servicio (o devolución) entra al pipeline; una venta/alquiler nuevo no (el activo sale).
export const generaPasada = (tipo: TipoPedido): boolean => tipo === 'servicio';

export interface PedidoRepo {
  listar(): Promise<Pedido[]>;
  porCliente(clienteId: string): Promise<Pedido[]>;
  obtener(id: string): Promise<Pedido | null>;
  crear(input: PedidoInput): Promise<Pedido>;
}
