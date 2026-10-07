'use client';

import { useState, useTransition } from 'react';
import { KeyRound } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input, Label, Aviso } from '../../components/ui/form';
import type { ResultadoPin } from '../../lib/pipeline-repo';
import { guardarPin } from './actions';

// PIN personal (spec codigo-personal §0 E-1): con él cada persona se identifica en la PC compartida
// del almacén (usuario + PIN). Se define aquí, en la sesión propia y tras la reautenticación de esta
// pantalla. Para cambiarlo hay que dar el actual; si se olvida, el administrador lo borra.
export function PinPersonal({ tienePin }: { tienePin: boolean }) {
  const [actual, setActual] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [repite, setRepite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  const guardar = () =>
    start(async () => {
      setError(null);
      setOk(false);
      if (nuevo !== repite) {
        setError('Los dos PIN nuevos no coinciden.');
        return;
      }
      try {
        const r = await guardarPin(nuevo, tienePin ? actual : null);
        if (r.ok) {
          setActual('');
          setNuevo('');
          setRepite('');
          setOk(true);
          return;
        }
        setError(mensaje(r));
      } catch {
        setError('No se pudo guardar el PIN. Inténtalo de nuevo.');
      }
    });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted" strokeWidth={2} /> PIN personal
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-apoyo text-muted">
          En la computadora compartida del almacén, cada movimiento se atribuye a quien teclea su usuario y su PIN.
          {tienePin ? ' Ya tienes un PIN; aquí puedes cambiarlo.' : ' Aún no tienes PIN: defínelo para poder operar.'}{' '}
          No lo compartas: lo que se haga con él suma o resta a tu nombre.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) guardar();
          }}
          className="grid max-w-md gap-3"
        >
          {tienePin && (
            <div>
              <Label htmlFor="pin-actual">PIN actual</Label>
              <Input
                id="pin-actual"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={12}
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                className="tabular-nums"
              />
            </div>
          )}
          <div>
            <Label htmlFor="pin-nuevo">PIN nuevo</Label>
            <Input
              id="pin-nuevo"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={12}
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="pin-repite">Repite el PIN nuevo</Label>
            <Input
              id="pin-repite"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={12}
              value={repite}
              onChange={(e) => setRepite(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <p className="text-micro text-muted">
            Sólo números, al menos 6. No sirven los repetidos (111111), las secuencias (123456) ni tu usuario.
          </p>
          {error && <Aviso tono="error">{error}</Aviso>}
          {ok && <Aviso tono="exito">PIN guardado.</Aviso>}
          <div>
            <Button type="submit" pending={pending} disabled={!nuevo || !repite || (tienePin && !actual)}>
              {tienePin ? 'Cambiar PIN' : 'Definir PIN'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function mensaje(r: Extract<ResultadoPin, { ok: false }>): string {
  switch (r.motivo) {
    case 'pin_corto':
      return `El PIN debe tener sólo números y al menos ${r.largoMin ?? 6} dígitos.`;
    case 'pin_trivial':
      return 'Ese PIN es demasiado fácil de adivinar (repetido, secuencia o igual a tu usuario). Elige otro.';
    case 'pin_actual_incorrecto':
      return typeof r.intentosRestantes === 'number'
        ? `El PIN actual no es correcto. ${r.intentosRestantes === 1 ? 'Queda 1 intento' : `Quedan ${r.intentosRestantes} intentos`}.`
        : 'El PIN actual no es correcto.';
    case 'cuenta_compartida':
      return 'Esta es la cuenta de un equipo compartido: no tiene PIN propio. Define tu PIN desde tu propia sesión.';
    case 'sin_permiso':
      return 'Tu cuenta no puede definir un PIN. Habla con el administrador.';
    default:
      if (r.bloqueadoMin) {
        return `Demasiados intentos. Espera ${r.bloqueadoMin} ${r.bloqueadoMin === 1 ? 'minuto' : 'minutos'}.`;
      }
      return 'No se pudo guardar el PIN.';
  }
}
