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
