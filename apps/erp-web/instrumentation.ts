// Polyfill de WebSocket para Node < 22: supabase-js (Realtime) exige `WebSocket`
// global al construir el cliente. En el runtime Edge (middleware) ya existe;
// solo hace falta en el runtime Node (Server Components / Actions).
// Se ejecuta una vez al arrancar el servidor.
export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined'
  ) {
    const ws = await import('ws');
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = ws.default;
  }
}
