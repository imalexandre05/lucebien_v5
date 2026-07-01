/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@scilb/core', '@scilb/adapter-lucebien'],
  // Habilita instrumentation.ts (polyfill de WebSocket para supabase-js en Node < 22).
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
