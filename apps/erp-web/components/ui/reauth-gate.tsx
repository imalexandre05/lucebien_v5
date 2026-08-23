'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { accionReautenticar } from './reauth-actions';
import { Card, CardContent } from './card';
import { Button } from './button';

// Reautenticación por contraseña (Fase 1): /pagos, /evaluaciones y /mi-desempeno lo montan en
// vez de su contenido cuando lib/reauth.ts (tieneReauth) dice que no hay verificación vigente
// (o venció, 15 min). NO abre una sesión nueva — solo confirma la contraseña del usuario actual
// y marca una cookie corta; router.refresh() vuelve a pedir la página al servidor, que esta vez
// pasa el gate y muestra el contenido real.
export function ReauthGate({ mensaje }: { mensaje?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function confirmar() {
    setError('');
    if (!password) {
      setError('Ingresa tu contraseña');
      return;
    }
    startTransition(async () => {
      const r = await accionReautenticar(password);
      if (!r.ok) {
        setError(r.error ?? 'Contraseña incorrecta');
        return;
      }
      setPassword('');
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-sm py-16">
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy/5 text-navy">
            <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-navy">Confirma que eres tú</h2>
            <p className="mt-1 text-sm text-muted">
              {mensaje ?? 'Esta sección muestra información confidencial.'} Esta PC puede ser
              compartida — ingresa tu contraseña para continuar.
            </p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmar()}
            placeholder="Tu contraseña"
            autoFocus
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-center text-sm text-navy outline-none transition-colors focus:border-gold"
          />
          {error && <p className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-deep">{error}</p>}
          <Button type="button" onClick={confirmar} pending={pending} className="w-full">
            {pending ? 'Verificando…' : 'Continuar'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
