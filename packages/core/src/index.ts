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
export * from './acceso';
export * from './pedidos';
export * from './reportes';
export * from './evaluaciones';
export * from './crm';
export * from './caja';
export * from './compras';
export * from './estadisticas';
export * from './trazabilidad';
export * from './solicitudes';
export * from './valores360';
export * from './competencias';
export * from './pagos';
export * from './sueldos';
export * from './contrato-parametros';
export * from './semanas-meta';
export * from './rangos-fecha';
export * from './envios';
