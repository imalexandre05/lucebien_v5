// operador-activo.ts — estado del «operador activo» del tablero en un equipo compartido
// (spec codigo-personal §5). Funciones puras: el reloj entra por parámetro (`ahora`, en ms) para
// que se puedan probar sin tocar Date, y el estado vive sólo en memoria de la pestaña (nunca en
// localStorage: el token no debe sobrevivir a la pestaña).

// Default de pantalla: 5 minutos, como pidió el dueño (migración 0145). La base devuelve la ventana
// vigente en `ventana_min` al validar el código, y ésa manda cuando existe.
export const MINUTOS_OPERADOR_DEFECTO = 5;

export type OperadorActivo = {
  token: string;
  nombre: string;
  ventanaMs: number;
  ultimaActividad: number;
};

export function nuevoOperador(
  p: { token: string; nombre: string; ventanaMin?: number | null },
  ahora: number,
): OperadorActivo {
  const min = p.ventanaMin && p.ventanaMin > 0 ? p.ventanaMin : MINUTOS_OPERADOR_DEFECTO;
  return { token: p.token, nombre: p.nombre, ventanaMs: min * 60_000, ultimaActividad: ahora };
}

// El operador sigue vigente mientras no pasen `ventanaMs` desde su última actividad.
export function operadorVigente(op: OperadorActivo | null, ahora: number): OperadorActivo | null {
  if (!op) return null;
  return ahora - op.ultimaActividad >= op.ventanaMs ? null : op;
}

// Cada acción exitosa renueva la ventana (la base hace lo mismo con `tocar_operador`).
export function registrarActividad(op: OperadorActivo, ahora: number): OperadorActivo {
  return { ...op, ultimaActividad: ahora };
}

// «cambiar»: la persona siguiente teclea su código; no queda nadie operando.
export function cambiarOperador(): null {
  return null;
}

// Milisegundos que faltan para que expire (0 si ya expiró). Sirve para programar el aviso del chip.
export function msParaExpirar(op: OperadorActivo | null, ahora: number): number {
  if (!op) return 0;
  return Math.max(0, op.ultimaActividad + op.ventanaMs - ahora);
}

// «4:12» para el chip. Redondea hacia arriba el segundo en curso para no mostrar 0:00 mientras
// todavía queda un instante de ventana.
export function formatoCuentaRegresiva(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
