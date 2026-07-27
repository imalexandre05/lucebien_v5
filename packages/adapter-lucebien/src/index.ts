// @scilb/adapter-lucebien — config específica de LuceBien (theme, features, reglas).
// Importa del core; nunca al revés.
// permisos-config.ts se borró en Fase 1 (código muerto: placeholder que nadie importaba, y
// contradecía los seeds reales de la migración 0045 — la matriz vive en la tabla
// `permisos_modulos`, leída por lib/permisos-repo.ts).
export * from './theme';
export * from './features';
export * from './catalogos';
