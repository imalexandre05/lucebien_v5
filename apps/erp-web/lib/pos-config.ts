import { leerConfigMap } from './config-repo';

// Configuración del POS (Fase 10 del plan): métodos de pago, documentos de garantía y fechas
// rápidas dejan de ser constantes hardcodeadas en el cliente para leerse de `config` — mismo
// mecanismo de catálogo tipado que usa el resto de /configuracion (ver config-catalogo.ts), pero
// estos 3 valores son LISTAS (no un único número/texto), así que se guardan como texto con un
// formato simple (`valor:Etiqueta` separado por comas, o JSON para las fechas) y se parsean acá,
// del lado servidor, defensivamente: cualquier valor guardado a mano que no parsee cae al default
// sin tumbar la página (mismo criterio que el resto del sistema — nunca un 500 por un dato mal
// escrito en config).

export type ParPago = { value: string; label: string };

// Mismos 3 métodos que ya usaba /caja antes de esta fase (components/ui/metodo-pago-botones.tsx) —
// quedan como default hasta que el admin los edite desde /configuracion.
export const METODOS_PAGO_DEFAULT: ParPago[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'yape', label: 'Yape' },
  { value: 'transferencia', label: 'Transferencia' },
];

// Mismos 4 tipos de documento que ya usaba el constructor de pedidos (garantia-panel.tsx).
export const DOC_GARANTIA_DEFAULT: ParPago[] = [
  { value: 'dni', label: 'DNI' },
  { value: 'carnet', label: 'Carnet ext.' },
  { value: 'licencia', label: 'Licencia' },
  { value: 'otro', label: 'Otro' },
];

export type FechaOffset = { dias: number; label: string };
export type FechasRapidas = { entrega: FechaOffset[]; devolucion: FechaOffset[] };

// Mismos offsets que ya usaba fechas-panel.tsx (spec literal del layout de la Fase 9).
export const FECHAS_RAPIDAS_DEFAULT: FechasRapidas = {
  entrega: [
    { dias: 0, label: 'Hoy' },
    { dias: 1, label: 'Mañana' },
    { dias: 3, label: '+3' },
    { dias: 7, label: '+7' },
  ],
  devolucion: [
    { dias: 1, label: '+1' },
    { dias: 2, label: '+2' },
    { dias: 3, label: '+3' },
  ],
};

// Serializa a "value:Etiqueta,value2:Etiqueta2" — el mismo formato que espera parsearPares().
export function serializarPares(pares: ParPago[]): string {
  return pares.map((p) => `${p.value}:${p.label}`).join(',');
}

export function parsearPares(raw: string | undefined, fallback: ParPago[]): ParPago[] {
  const s = (raw ?? '').trim();
  if (!s) return fallback;
  const pares = s
    .split(',')
    .map((tok) => {
      const [value, ...rest] = tok.split(':');
      const v = value?.trim();
      const label = rest.join(':').trim();
      if (!v) return null;
      return { value: v, label: label || v };
    })
    .filter((p): p is ParPago => p !== null);
  return pares.length > 0 ? pares : fallback;
}

export function serializarFechasRapidas(f: FechasRapidas): string {
  return JSON.stringify(f);
}

export function parsearFechasRapidas(raw: string | undefined, fallback: FechasRapidas): FechasRapidas {
  const s = (raw ?? '').trim();
  if (!s) return fallback;
  try {
    const j = JSON.parse(s) as Partial<FechasRapidas>;
    const entrega = Array.isArray(j.entrega) ? j.entrega.filter(esOffsetValido) : fallback.entrega;
    const devolucion = Array.isArray(j.devolucion) ? j.devolucion.filter(esOffsetValido) : fallback.devolucion;
    return {
      entrega: entrega.length > 0 ? entrega : fallback.entrega,
      devolucion: devolucion.length > 0 ? devolucion : fallback.devolucion,
    };
  } catch {
    return fallback;
  }
}

function esOffsetValido(x: unknown): x is FechaOffset {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as FechaOffset).dias === 'number' &&
    typeof (x as FechaOffset).label === 'string' &&
    (x as FechaOffset).label.length > 0
  );
}

export type PosConfig = {
  metodosPago: ParPago[];
  docGarantia: ParPago[];
  fechasRapidas: FechasRapidas;
};

// Un solo round-trip a `config` para las 3 listas — las pantallas de /caja y /pedidos llaman esto
// una vez por render server-side y reparten el resultado a los componentes cliente vía props.
export async function leerPosConfig(): Promise<PosConfig> {
  const map = await leerConfigMap();
  return {
    metodosPago: parsearPares(map.pos_metodos_pago, METODOS_PAGO_DEFAULT),
    docGarantia: parsearPares(map.pos_doc_garantia, DOC_GARANTIA_DEFAULT),
    fechasRapidas: parsearFechasRapidas(map.pos_fechas_rapidas, FECHAS_RAPIDAS_DEFAULT),
  };
}
