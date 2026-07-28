// Inventario comercial: el ACTIVO (maestro alquilable/vendible), su codificación TN-042 y el
// modelo de precio por uso. La FÓRMULA de descuento (E3) NO se hardcodea: es configurable.
import { z } from 'zod';

// Fase 7: ciclo completo del activo. 'en_lavanderia' (nombre viejo, solo lavado) se reemplaza por
// 'en_pipeline' (más general: el pipeline no es solo lavado — codificación, compostura, etc.). La
// migración 0055 hace el backfill de las filas existentes; ver docs/pendientes-negocio.md.
export type EstadoActivo =
  | 'disponible'
  | 'alquilado'
  | 'vendido'
  | 'en_pipeline'
  | 'codificando'
  | 'en_compostura'
  | 'en_almacen'
  | 'baja';
export const ESTADOS_ACTIVO: EstadoActivo[] = [
  'disponible',
  'alquilado',
  'vendido',
  'en_pipeline',
  'codificando',
  'en_compostura',
  'en_almacen',
  'baja',
];

// Fase 7 — despiece saco/pantalón. Modelo por auto-referencia (activo_padre_id), NO tabla de
// composición: un terno 'unica' se convierte en 'completo' con dos hijos 'saco'/'pantalon' que
// apuntan a él. 'unica' sigue siendo el default para el 99% de las prendas que nunca se despiezan.
export type PiezaActivo = 'unica' | 'completo' | 'saco' | 'pantalon';
export const PIEZAS_ACTIVO: PiezaActivo[] = ['unica', 'completo', 'saco', 'pantalon'];

export interface ActivoInventario {
  id: string;
  codigo: string; // TN-042 (o ATN-042/BTN-042 para piezas despiezadas)
  tipo: string; // TN, CM, ... (o el prefijo del catálogo producto_tipos)
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
  // producto_tipos.atributos_sugeridos (Fase 7) solo SUGIERE claves por tipo, no las fuerza.
  atributos: Record<string, string>;
  // Preparación para el futuro catálogo público de LB-Web (otro repo): qué activos se muestran
  // y con qué descripción — no se construye la integración aquí, solo los campos.
  publicable: boolean;
  descripcionPublica: string;
  // Trazabilidad (Fase 8): si el activo tiene una prenda_pasada activa (etapa != 'enviado') vía
  // el vínculo prenda_pasada.activo_id, esto refleja dónde está de verdad ahora mismo — el
  // estado comercial (arriba) es el "de reposo"; mientras está en pipeline, prevalece esto.
  enPipeline: { pasadaId: string; etapa: string } | null;
  // Fase 7 — despiece: 'unica' en el 99% de los casos. 'completo' = padre ya despiezado (se
  // conserva como unidad rentable/vendible del set completo); 'saco'/'pantalon' = piezas hijas.
  pieza: PiezaActivo;
  activoPadreId: string | null;
}

// Codificación [TIPO]-[NNN] global; la sede es campo aparte, NO va en el código. El tope subió de
// 3 a 4 letras (Fase 7): el despiece antepone A/B al tipo del padre (ST-501 → AST-501/BST-501), y
// un tipo base de 3 letras (ej. ATNC) ya no cabía en {2,3}.
export const formatCodigo = (tipo: string, n: number): string =>
  `${tipo.toUpperCase()}-${String(n).padStart(3, '0')}`;

export function parseCodigo(codigo: string): { tipo: string; n: number } | null {
  const m = /^([A-Z]{2,4})-(\d{3,})$/.exec(codigo.trim().toUpperCase());
  return m ? { tipo: m[1], n: Number(m[2]) } : null;
}

// ── Despiece saco/pantalón (Fase 7) ─────────────────────────────────────────────────────────
// Familia de un activo: {self} ∪ {padre} ∪ {hijos directos}. A PROPÓSITO no incluye al hermano:
// alquilar el saco bloquea el terno completo (el padre) pero el pantalón (hermano) sigue
// alquilable — esa asimetría es el corazón del requisito de despiece. La vista SQL
// v_activo_disponible (migración 0055) implementa la misma regla del lado de la base para el
// selector de activos; esta función es la versión pura/testeable de la misma idea.
export interface NodoFamilia {
  id: string;
  activoPadreId: string | null;
}

export function familiaDeActivo<T extends NodoFamilia>(activos: T[], id: string): T[] {
  const self = activos.find((a) => a.id === id);
  if (!self) return [];
  const resultado = new Map<string, T>();
  resultado.set(self.id, self);
  if (self.activoPadreId) {
    const padre = activos.find((a) => a.id === self.activoPadreId);
    if (padre) resultado.set(padre.id, padre);
  }
  for (const a of activos) {
    if (a.activoPadreId === id) resultado.set(a.id, a);
  }
  return [...resultado.values()];
}

// Un activo está bloqueado si ÉL MISMO no (eso ya lo dice su propio estado), sino su padre o
// alguno de sus hijos directos está en un estado que lo saca de circulación — nunca por el
// estado de un hermano. Devuelve el activo bloqueante (para mostrar "ocupado por AST-501") o null.
export function activoBloqueadoPor<T extends NodoFamilia & { id: string; codigo: string; estado: string }>(
  activos: T[],
  id: string,
  estadosQueBloquean: string[] = ['alquilado', 'vendido'],
): T | null {
  const familia = familiaDeActivo(activos, id);
  return familia.find((a) => a.id !== id && estadosQueBloquean.includes(a.estado)) ?? null;
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
  codigo: z.string().regex(/^[A-Z]{2,4}-\d{3,}$/, 'Formato TN-042'),
  tipo: z.string().min(1),
  talla: z.string().default(''),
  color: z.string().default(''),
  sedeCod: z.string().min(1),
  estado: z.enum(ESTADOS_ACTIVO as [EstadoActivo, ...EstadoActivo[]]).default('disponible'),
  precioBase: z.number().nonnegative().default(0),
  precioAlquiler: z.number().nonnegative().default(0),
  precioVenta: z.number().nonnegative().default(0),
  usosAcumulados: z.number().int().nonnegative().default(0),
  atributos: z.record(z.string()).default({}),
  publicable: z.boolean().default(false),
  descripcionPublica: z.string().default(''),
  // Fase 7: editable a mano por si hay que corregir datos, pero el flujo normal es que lo fije
  // el RPC inventario_despiece — por eso no exige un activo_padre_id acá (ese no se edita a mano).
  pieza: z.enum(PIEZAS_ACTIVO as [PiezaActivo, ...PiezaActivo[]]).default('unica'),
});
export type ActivoInput = z.infer<typeof activoSchema>;

export interface InventarioRepo {
  listar(): Promise<ActivoInventario[]>;
  crear(input: ActivoInput): Promise<ActivoInventario>;
  editar(id: string, input: ActivoInput): Promise<ActivoInventario>;
  eliminar(id: string): Promise<void>;
}
