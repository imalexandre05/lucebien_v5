'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

// Error boundary de ruta (§4D): claro, cerca del problema y con salida (reintentar).
// El mensaje técnico va colapsado para diagnóstico sin asustar al usuario.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg pt-10">
      <Card className="animate-scale-in overflow-hidden">
        <div aria-hidden className="h-0.5 bg-gradient-to-r from-gold via-gold/50 to-line" />
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertTriangle className="h-10 w-10 text-gold" strokeWidth={1.25} aria-hidden />
          <h1 className="text-2xl font-semibold text-navy">Algo salió mal</h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            No pudimos cargar esta pantalla. Puedes reintentar; si el problema continúa, avisa al
            administrador.
          </p>
          {error?.message && (
            <details className="mt-1 w-full max-w-sm text-left">
              <summary className="cursor-pointer text-xs text-muted transition-colors duration-150 hover:text-navy">
                Detalle técnico
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-md bg-paper px-3 py-2 font-mono text-[11px] leading-relaxed text-ink">
                {error.message}
              </pre>
            </details>
          )}
          <div className="mt-2 flex items-center gap-3">
            <Button onClick={reset}>Reintentar</Button>
            <a
              href="/"
              className="text-sm font-medium text-navy transition-colors duration-150 hover:text-gold"
            >
              Ir al dashboard
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
