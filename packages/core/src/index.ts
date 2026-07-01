// @scilb/core — lógica de negocio genérica del oficio (sin nada específico de LuceBien).
// El core NO importa del adapter. El adapter SÍ importa del core.
// Imports sin extensión: los consume Next vía transpilePackages (webpack no resuelve './x.js').
export * from './pipeline';
export * from './permisos';
export * from './puntos';
export * from './empleados';
export * from './inventario';
export * from './clientes';
export * from './auth';
export * from './pedidos';
export * from './reportes';
export * from './evaluaciones';
