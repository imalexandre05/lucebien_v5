/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@scilb/core', '@scilb/adapter-lucebien'],
  // Permite compilar mientras el servidor de desarrollo corre bajo PM2.
  //
  // Sin esto, `next build` muere con EPERM al abrir `.next/trace`: el proceso `erp-dev` tiene ese
  // directorio tomado, y en Windows eso es un candado de verdad, no una advertencia. La salida es
  // construir en otro lado — NEXT_DIST_DIR=.next-build — sin tener que apagar el dev server para
  // comprobar que una pantalla nueva compila.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // instrumentation.ts (polyfill de WebSocket para supabase-js en Node < 22) ya no necesita
  // `experimental.instrumentationHook`: en Next 15 está habilitado por defecto.
};

export default nextConfig;
