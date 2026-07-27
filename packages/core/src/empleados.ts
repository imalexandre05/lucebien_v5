// Saneo de empleado (portado del ERP viejo). Nunca exponer credenciales; ocultar PII a no-admin.
const CAMPOS_SECRETOS = ['cod_hash', 'password_hash', 'cod_plain', 'pass_plain'] as const;
const CAMPOS_PII = [
  'dni',
  'telefono',
  'direccion',
  'fecha_nacimiento',
  'contacto_emergencia',
  'tel_emergencia',
  'salario_base',
] as const;

export function sanitizeEmpleado<T extends Record<string, unknown>>(
  emp: T,
  esAdmin: boolean,
): Partial<T> {
  const out: Record<string, unknown> = { ...emp };
  for (const c of CAMPOS_SECRETOS) delete out[c];
  if (!esAdmin) for (const c of CAMPOS_PII) delete out[c];
  return out as Partial<T>;
}

// Iniciales para el avatar (Fase 1: reutilizado por la UI de /empleados y por crearEmpleado()
// server-side, antes solo vivía duplicado e inline en cliente.tsx).
export function generarIniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return (partes.map((p) => p[0]).slice(0, 2).join('') || '·').toUpperCase();
}

// Elige un código de login de 4 dígitos libre (Fase 1: crearEmpleado()). Pura: recibe los códigos
// ya ocupados (la consulta a `empleados.cod` la hace el repo) y un generador aleatorio inyectable
// para que el test sea determinístico. 10 000 códigos posibles (0000-9999); con 18 empleados hoy
// el choque es rarísimo, pero igual reintenta hasta encontrar uno libre.
export function elegirCodigoLibre(ocupados: Iterable<string>, aleatorio: () => number = Math.random): string {
  const usados = new Set(ocupados);
  if (usados.size >= 10000) throw new Error('No quedan códigos de 4 dígitos disponibles');
  let intento: string;
  do {
    intento = String(Math.floor(aleatorio() * 10000)).padStart(4, '0');
  } while (usados.has(intento));
  return intento;
}
