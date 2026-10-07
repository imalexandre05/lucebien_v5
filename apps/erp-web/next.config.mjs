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
    // 4 MB (TAMANO_MAXIMO_BYTES en lib/documentos-tamano.ts), porque Vercel corta el cuerpo de una
    // función en ~4,5 MB; se pone 5 MB para que Next deje pasar el archivo más el sobre multipart
    // y la validación propia dé un mensaje legible. Provisional hasta tener subida directa a
    // Storage con URL firmada (spec 2026-10-04-personal-ultimo-admin-alta-design.md, enmienda
    // del 06-oct-2026). El bucket (0105) sigue en 10 MB: es el techo de esa futura vía directa.
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
