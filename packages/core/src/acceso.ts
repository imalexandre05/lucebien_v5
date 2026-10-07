// Acceso al ERP: reglas de contraseña, límite de intentos y contraseña temporal.
// Spec: docs/superpowers/specs/permisos/2026-10-06-login-usuario-contrasena-design.md
//
// Lógica pura: la hora (`ahora`) y la fuente aleatoria las pasa quien llama (no-negociable 4 — el
// core nunca llama new Date()). La persistencia (tabla login_intentos, Supabase Auth) vive en
// apps/erp-web/lib/auth.ts.

export type ReglasAcceso = {
  /** Largo mínimo de una contraseña nueva. */
  contrasenaMin: number;
  /** Fallos seguidos que disparan el bloqueo. */
  intentosMax: number;
  /** Minutos que dura el bloqueo. */
  bloqueoMin: number;
};

// DEFAULTS PROVISIONALES (no-negociable 5): ninguno lo confirmó el dueño. Son editables en
// /configuracion → «Acceso» (claves acceso_*, sembradas en 0123_login_seguro.sql) y están
// anotados en docs/pendientes-negocio.md.
export const REGLAS_ACCESO_DEFAULT: ReglasAcceso = { contrasenaMin: 8, intentosMax: 5, bloqueoMin: 15 };

// bcrypt (el hash de Supabase Auth) ignora todo lo que pase de 72 BYTES: dos contraseñas que sólo
// difieren después de ese punto serían la misma. Se corta antes para que nadie se lleve la sorpresa.
export const CONTRASENA_MAX = 72;

const RANGOS = {
  contrasenaMin: { clave: 'acceso_contrasena_min', min: 6, max: CONTRASENA_MAX },
  intentosMax: { clave: 'acceso_intentos_max', min: 3, max: 20 },
  bloqueoMin: { clave: 'acceso_bloqueo_min', min: 1, max: 1440 },
} as const;

/** Lee las reglas desde las filas de `config` (clave → valor). Un valor ilegible o fuera de rango
 *  cae al default: un error de tipeo en /configuracion nunca debe dejar a todos sin entrar. */
export function leerReglasAcceso(config: Record<string, string | null | undefined>): ReglasAcceso {
  const r = { ...REGLAS_ACCESO_DEFAULT };
  for (const campo of Object.keys(RANGOS) as (keyof ReglasAcceso)[]) {
    const { clave, min, max } = RANGOS[campo];
    const crudo = config[clave];
    if (crudo == null || String(crudo).trim() === '') continue;
    const n = Number(crudo);
    if (Number.isInteger(n) && n >= min && n <= max) r[campo] = n;
  }
  return r;
}

// ── Reglas de contraseña (§4) ───────────────────────────────────────────────────────────────

export type ContextoContrasena = {
  minimo: number;
  /** Código de 4 dígitos de la persona: no puede ir dentro de la contraseña. */
  cod?: string | null;
  /** Nombre de la persona (su usuario de login). */
  nombre?: string | null;
  /** Contraseña actual, si se conoce: la nueva tiene que ser distinta. */
  actual?: string | null;
};

const compactar = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** Devuelve los problemas de una contraseña nueva, cada uno redactado como instrucción. Vacío = válida. */
export function validarContrasenaNueva(nueva: string, ctx: ContextoContrasena): string[] {
  const errores: string[] = [];
  if (nueva.length < ctx.minimo) errores.push(`Usa al menos ${ctx.minimo} caracteres.`);
  // bcrypt cuenta BYTES, no caracteres: la ñ y las vocales con tilde ocupan 2 en UTF-8.
  if (new TextEncoder().encode(nueva).length > CONTRASENA_MAX) {
    errores.push(`Usa como máximo ${CONTRASENA_MAX} caracteres (la ñ y las letras con tilde cuentan doble).`);
  }
  if (ctx.cod && nueva.includes(ctx.cod)) errores.push('No uses tu código de 4 dígitos dentro de la contraseña.');
  if (ctx.nombre && compactar(ctx.nombre) !== '' && compactar(nueva) === compactar(ctx.nombre)) {
    errores.push('No uses tu nombre como contraseña.');
  }
  if (nueva.length > 1 && new Set(nueva).size === 1) {
    errores.push('No repitas el mismo carácter: mezcla letras y números.');
  }
  if (ctx.actual && nueva === ctx.actual) errores.push('La nueva contraseña tiene que ser distinta de la actual.');
  return errores;
}

// ── Límite de intentos (§5) ─────────────────────────────────────────────────────────────────

export type EstadoIntentos = {
  fallidos: number;
  /** ISO 8601, o null si no hay bloqueo. */
  bloqueadoHasta: string | null;
};

export function estadoBloqueo(estado: EstadoIntentos, ahora: Date): { bloqueado: boolean; minutosRestantes: number } {
  const hasta = estado.bloqueadoHasta ? Date.parse(estado.bloqueadoHasta) : NaN;
  if (!Number.isFinite(hasta)) return { bloqueado: false, minutosRestantes: 0 };
  const ms = hasta - ahora.getTime();
  if (ms <= 0) return { bloqueado: false, minutosRestantes: 0 };
  return { bloqueado: true, minutosRestantes: Math.ceil(ms / 60_000) };
}

/** Suma un fallo. Al llegar a `intentosMax` bloquea por `bloqueoMin` minutos y deja el contador en
 *  cero; un bloqueo ya vencido no arrastra los fallos anteriores. */
export function registrarFallo(estado: EstadoIntentos, ahora: Date, reglas: ReglasAcceso): EstadoIntentos {
  const vencido = estado.bloqueadoHasta !== null && !estadoBloqueo(estado, ahora).bloqueado;
  const previos = vencido ? 0 : estado.fallidos;
  const fallidos = previos + 1;
  if (fallidos >= reglas.intentosMax) {
    return { fallidos: 0, bloqueadoHasta: new Date(ahora.getTime() + reglas.bloqueoMin * 60_000).toISOString() };
  }
  return { fallidos, bloqueadoHasta: vencido ? null : estado.bloqueadoHasta };
}

// ── Contraseña temporal (§6) ────────────────────────────────────────────────────────────────

// Sin 0/o, 1/l/i: se dicta y se copia de un papel. 31 símbolos × 8 posiciones ≈ 40 bits.
export const ALFABETO_TEMPORAL = 'abcdefghjkmnpqrstuvwxyz23456789';

/** `xxxx-xxxx`. `aleatorio(n)` devuelve n bytes criptográficamente aleatorios (en el servidor,
 *  crypto.getRandomValues). Los bytes que darían sesgo de módulo se descartan. */
export function generarContrasenaTemporal(aleatorio: (n: number) => Uint8Array): string {
  const largo = ALFABETO_TEMPORAL.length;
  const tope = 256 - (256 % largo);
  const out: string[] = [];
  while (out.length < 8) {
    for (const b of aleatorio(8 - out.length)) {
      if (b < tope && out.length < 8) out.push(ALFABETO_TEMPORAL[b % largo]);
    }
  }
  return `${out.slice(0, 4).join('')}-${out.slice(4).join('')}`;
}
