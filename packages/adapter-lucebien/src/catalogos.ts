// Catálogos específicos de LuceBien (config del adapter, no lógica genérica del core).
// La UI de S16 los consume para poblar selects/datalists; editables aquí sin tocar el core.
// ⚠️ Valores base sugeridos — confirmar/afinar con el responsable del proyecto.

// Categorías de material / insumo que maneja el taller y lavandería.
export const categoriasMaterial = [
  'Telas',
  'Forros',
  'Hilos',
  'Avíos',        // botones, cierres, ganchos, hombreras…
  'Entretelas',
  'Insumos de lavandería',
  'Empaque',
  'Otros',
] as const;

// Unidades de medida para el stock.
export const unidadesMaterial = ['unidad', 'm', 'cm', 'kg', 'g', 'rollo', 'cono', 'litro', 'par', 'juego'] as const;

// Rubros de proveedor.
export const categoriasProveedor = [
  'Telas y forros',
  'Avíos y mercería',
  'Insumos de lavandería',
  'Servicios',
  'Empaque y etiquetas',
  'Otros',
] as const;

export type CategoriaMaterial = (typeof categoriasMaterial)[number];
export type UnidadMaterial = (typeof unidadesMaterial)[number];
export type CategoriaProveedor = (typeof categoriasProveedor)[number];
