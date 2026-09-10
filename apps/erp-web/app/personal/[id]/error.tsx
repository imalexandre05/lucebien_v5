'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';

// Error de UNA sección, no de todo el módulo.
//
// Vive dentro del layout de la persona, así que la cabecera, el período y las pestañas siguen en
// pantalla: si falla Pagos, se puede pasar a Asistencias sin volver a empezar. Un error que se
// lleva puesta la navegación obliga a rehacer el camino entero para probar otra cosa.
export default function ErrorSeccion({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="animate-scale-in border-error-line">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertTriangle className="h-9 w-9 text-error" strokeWidth={1.25} aria-hidden />
        <p className="text-sm font-semibold text-navy">Esta sección no cargó</p>
        <p className="max-w-sm text-xs leading-relaxed text-muted">
          El resto del módulo sigue disponible: puedes cambiar de sección o de persona desde arriba
          sin perder el período que elegiste.
        </p>
        {error?.message && (
          <details className="w-full max-w-sm text-left">
            <summary className="cursor-pointer text-xs text-muted transition-colors duration-150 hover:text-navy">
              Detalle técnico
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-r-chico bg-paper px-3 py-2 tabular-nums text-[11px] leading-relaxed text-ink">
              {error.message}
            </pre>
          </details>
        )}
        <Button onClick={reset} className="mt-1">
          Reintentar
        </Button>
      </CardContent>
    </Card>
  );
}
