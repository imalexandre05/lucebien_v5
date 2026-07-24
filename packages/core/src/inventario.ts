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
  // Atributos libres clave-valor (tela, forro, cuello, ancho, ...): no hay un esquema fijo por
  // tipo de prenda (regla de negocio no confirmada) — el admin agrega lo que corresponda.
  atributos: Record<string, string>;
  // Preparación para el futuro catálogo público de LB-Web (otro repo): qué activos se muestran
  // y con qué descripción — no se construye la integración aquí, solo los campos.
  publicable: boolean;
  descripcionPublica: string;
  // Trazabilidad (Fase 8): si el activo tiene una prenda_pasada activa (etapa != 'enviado') vía
  // el vínculo prenda_pasada.activo_id, esto refleja dónde está de verdad ahora mismo — el
  // estado comercial (arriba) es el "de reposo"; mientras está en pipeline, prevalece esto.
  enPipeline: { pasadaId: string; etapa: string } | null;
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
  atributos: z.record(z.string()).default({}),
  publicable: z.boolean().default(false),
  descripcionPublica: z.string().default(''),
});
export type ActivoInput = z.infer<typeof activoSchema>;

export interface InventarioRepo {
  listar(): Promise<ActivoInventario[]>;
  crear(input: ActivoInput): Promise<ActivoInventario>;
  editar(id: string, input: ActivoInput): Promise<ActivoInventario>;
  eliminar(id: string): Promise<void>;
}
