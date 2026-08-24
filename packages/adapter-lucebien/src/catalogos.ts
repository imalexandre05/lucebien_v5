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

// ── Prendas: tipo, color y talla ────────────────────────────────────────────────────────────
//
// Los tres vivían escritos DOS VECES, iguales, en `app/pipeline/registrar/form.tsx` y en
// `app/envio-lavanderia/cliente.tsx`. Dos copias de la misma lista se separan solas la primera vez
// que alguien agrega un color en una pantalla y se olvida de la otra — y entonces la misma prenda
// se llama distinto según por dónde entró.
//
// El sistema comercial del otro programador va a manejar sus propios atributos; cuando eso se
// conecte, este archivo es el único lugar donde hay que mirar.

/**
 * Prendas codificadas: las que llevan etiqueta y se siguen una por una.
 *
 * Camisa y corbata NO están, y no es un olvido: se cuentan a granel, con las demás piezas
 * sueltas (decisión de Alexander, 21-ago-2026). La lista es la del sistema viejo, que es la que
 * el equipo ya usa.
 *
 * `Otros` obliga a describir cuál es: sin eso, una prenda que nadie puede nombrar entra al
 * pipeline con la palabra «Otros» y ahí se pierde.
 */
export const tiposPrenda = [
  'Terno completo',
  'Saco',
  'Pantalón',
  'Chaleco',
  'Blazer',
  'Falda',
  'Otros',
] as const;

// Agrupados por familia: lo difícil no es elegir el color, es acordarse de si se llama «Azul
// Barcelona» o «Azul presidente».
export const familiasColorPrenda = [
  { nombre: 'Azules', colores: ['Azul noche', 'Azul Barcelona', 'Azul eléctrico', 'Azul acero', 'Azul presidente', 'Celeste', 'Celeste bb'] },
  { nombre: 'Neutros', colores: ['Negro', 'Plomo', 'Plomo rata', 'Gris', 'Blanco'] },
  { nombre: 'Cálidos', colores: ['Beige', 'Camello', 'Vino'] },
  { nombre: 'Otros', colores: ['Verde petróleo', 'Otros'] },
] as const;

export const coloresPrenda = familiasColorPrenda.flatMap((f) => f.colores);

/**
 * El punto de color que la pantalla dibuja al lado del nombre.
 *
 * NO SON TOKENS DEL SISTEMA DE DISEÑO, y por eso no salen de `tailwind.config.ts`: son el color
 * real de una tela. El sistema de diseño (docs/sistema-de-diseno.md §2) ya deja anotada esa
 * excepción — los colores de tela se quedan como están.
 *
 * Son una aproximación para reconocer, no una carta de color: quien elige tiene la prenda en la
 * mano. El punto existe porque «Azul acero» y «Azul presidente» leídos en una lista no se
 * distinguen, y vistos sí.
 *
 * `Otros` no tiene color propio: la pantalla lo dibuja aparte.
 */
export const hexColorPrenda: Record<string, string> = {
  'Azul noche': '#1b2440',
  'Azul Barcelona': '#1d3f8f',
  'Azul eléctrico': '#1f5fd0',
  'Azul acero': '#4a6484',
  'Azul presidente': '#2b3a67',
  Celeste: '#7fc4e8',
  'Celeste bb': '#c3e2f4',
  Negro: '#141414',
  Plomo: '#8a8f98',
  'Plomo rata': '#5c5f66',
  Gris: '#b7bac0',
  Blanco: '#ffffff',
  Beige: '#d9c9a8',
  Camello: '#b98b52',
  Vino: '#6e1b2b',
  'Verde petróleo': '#14524f',
};

/**
 * Tallas separadas en adulto y niño, que es como se piensan al recibir la prenda.
 *
 * Son las mismas del sistema viejo. Lo único que se agregó es el corte entre las dos escalas: una
 * fila de dieciocho tallas mezcladas obliga a leerla entera para encontrar la que se busca.
 *
 * El 26 quedó en adulto —es medida de pantalón— y se mueve si resulta que no lo es.
 */
export const tallasPrendaAdulto = ['XS', 'S', 'M', 'L', 'XL', '2XL', '4XL', '26'] as const;
export const tallasPrendaNino = ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18'] as const;
export const tallasPrenda = [...tallasPrendaAdulto, ...tallasPrendaNino];

export const tiposLavado = ['normal', 'seco', 'especializado'] as const;

export type TipoPrenda = (typeof tiposPrenda)[number];
export type TallaPrenda = (typeof tallasPrenda)[number];
export type TipoLavado = (typeof tiposLavado)[number];
