// Configuración de PM2 para la PC del almacén.
//
// Se usa con `pm2 start ecosystem.config.js` desde esta misma carpeta. El README explica el
// arranque automático de Windows, que es lo que hace que la PC se pueda apagar sola sin que nadie
// tenga que acordarse de levantar el colector.
//
// Este archivo se lee como CommonJS aunque el paquete sea de tipo module: por eso la extensión
// .cjs no hace falta, PM2 lo evalúa él mismo.
module.exports = {
  apps: [
    {
      name: 'colector-huellero',
      script: './colector.js',
      cwd: __dirname,
      // Un solo proceso. Dos leerían el mismo rango y se pisarían: la RPC no duplicaría nada,
      // pero el log quedaría ilegible y el equipo atendería el doble de consultas.
      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      // El proceso corre siempre: si se cae, PM2 lo levanta. La espera creciente evita que un
      // error de configuración lo reinicie en bucle cerrado durante horas.
      exp_backoff_restart_delay: 5000,
      max_restarts: 50,
      min_uptime: '60s',
      watch: false,

      // El colector es liviano; si pasa de esto es que algo se está acumulando en memoria.
      max_memory_restart: '200M',

      out_file: './logs/colector.log',
      error_file: './logs/colector-error.log',
      merge_logs: true,
      // La marca de tiempo de PM2 en hora local de la PC, que es hora Perú. El colector además
      // escribe la suya en cada línea.
      time: true,
    },
  ],
};
