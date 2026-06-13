// Inventario comercial: el ACTIVO (maestro alquilable/vendible), su codificación TN-042 y el
// modelo de precio por uso. La FÓRMULA de descuento (E3) NO se hardcodea: es configurable.
import { z } from 'zod';

export type EstadoActivo = 'disponible' | 'alquilado' | 'en_lavanderia' | 'baja';
export const ESTADOS_ACTIVO: EstadoActivo[] = ['disponible', 'alquilado', 'en_lavanderia', 'baja'];

export interface ActivoInventario {
  id: string;
  codigo: string; // TN-042
  tipo: string; // TN, CM, ...
  talla: string;
  color: string;
  sedeCod: string;
  estado: EstadoActivo;
  precioBase: number;
  precioAlquiler: number;
  precioVenta: number;
  usosAcumulados: number;
}

// Codificación [TIPO]-[NNN] global; la sede es campo aparte, NO va en el código.
export const formatCodigo = (tipo: string, n: number): string =>
  `${tipo.toUpperCase()}-${String(n).padStart(3, '0')}`;

export function parseCodigo(codigo: string): { tipo: string; n: number } | null {
  const m = /^([A-Z]{2,3})-(\d{3,})$/.exec(codigo.trim().toUpperCase());
  return m ? { tipo: m[1], n: Number(m[2]) } : null;
}

// Precio por uso (E3) — CONFIGURABLE. Escalones de descuento + piso. Sin números hardcodeados:
// los valores los provee config/adapter cuando Alexander confirme la regla.
export interface ReglaPrecioUso {
  escalones: { desdeUsos: number; descuentoPct: number }[]; // aplica el mayor desdeUsos <= usos
  pisoPct: number; // mínimo como fracción del precioBase (ej. 0.5 = no baja de 50%)
}

export function precioPorUso(precioBase: number, usos: number, regla: ReglaPrecioUso): number {
  const aplica = regla.escalones
    .filter((e) => usos >= e.desdeUsos)
    .sort((a, b) => b.desdeUsos - a.desdeUsos)[0];
  const precio = precioBase * (1 - (aplica?.descuentoPct ?? 0));
  return Math.max(precio, precioBase * regla.pisoPct);
}

export const activoSchema = z.object({
  codigo: z.string().regex(/^[A-Z]{2,3}-\d{3,}$/, 'Formato TN-042'),
  tipo: z.string().min(1),
  talla: z.string().default(''),
  color: z.string().default(''),
  sedeCod: z.string().min(1),
  estado: z.enum(['disponible', 'alquilado', 'en_lavanderia', 'baja']).default('disponible'),
  precioBase: z.number().nonnegative().default(0),
  precioAlquiler: z.number().nonnegative().default(0),
  precioVenta: z.number().nonnegative().default(0),
  usosAcumulados: z.number().int().nonnegative().default(0),
});
export type ActivoInput = z.infer<typeof activoSchema>;

export interface InventarioRepo {
  listar(): Promise<ActivoInventario[]>;
  crear(input: ActivoInput): Promise<ActivoInventario>;
  eliminar(id: string): Promise<void>;
}
