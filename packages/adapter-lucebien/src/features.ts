// Feature flags. Todos OFF por defecto en Fase 1 (sistema nuevo = demo hasta el cutover).
export const features = {
  INVENTARIO_V2: false,
  CLIENTES_V2: false,
  AUTH_V2: true, // W13: login real Supabase Auth (cod+sede) activado

  CRM_V2: false,
  PEDIDOS_ALQUILER_V2: false,
  PEDIDOS_VENTA_V2: false,
  SERVICIOS_V2: false,
  CONTRATOS_PDF_V2: false,
} as const;

export type Feature = keyof typeof features;
export const isOn = (f: Feature): boolean => features[f];
