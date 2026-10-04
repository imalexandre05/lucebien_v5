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
  // Habilita instrumentation.ts (polyfill de WebSocket para supabase-js en Node < 22).
  experimental: {
    instrumentationHook: true,
    // Subida de documentos del personal (accionSubirDocumento recibe el archivo como FormData).
    // Next corta en 1 MB por defecto, antes de llegar a la validación propia. El máximo real es
    // 10 MB (TAMANO_MAXIMO_BYTES en lib/documentos-repo.ts y file_size_limit del bucket
    // empleado-documentos, 0105); se suma 1 MB de margen para el sobre multipart.
    serverActions: {
      bodySizeLimit: '11mb',
    },
  },
};

export default nextConfig;
