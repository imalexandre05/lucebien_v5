'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '../../components/ui/button';
import { Aviso, Input, Label } from '../../components/ui/form';
import { accionCambiarContrasena, type EstadoCambio } from './actions';

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} className="w-full py-2.5">
      {pending ? 'Guardando…' : 'Guardar mi contraseña'}
    </Button>
  );
}

export function FormularioCambio({ minimo }: { minimo: number }) {
  const [estado, accion] = useFormState<EstadoCambio, FormData>(accionCambiarContrasena, { errores: [] });
  return (
    <form action={accion} className="space-y-4">
      {estado.errores.length > 0 && (
        <Aviso tono="error">
          <ul className="space-y-1">
            {estado.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Aviso>
      )}
      <div>
        <Label htmlFor="cc-actual">Contraseña actual</Label>
        <Input id="cc-actual" name="actual" type="password" autoComplete="current-password" required autoFocus />
      </div>
      <div>
        <Label htmlFor="cc-nueva">Contraseña nueva</Label>
        <Input
          id="cc-nueva"
          name="nueva"
          type="password"
          autoComplete="new-password"
          minLength={minimo}
          maxLength={72}
          aria-describedby="cc-ayuda"
          required
        />
        <p id="cc-ayuda" className="mt-1 text-micro text-muted">
          Al menos {minimo} caracteres. Una frase que recuerdes sirve («mi terno azul 2026»). No uses tu nombre
          ni tu código de 4 dígitos.
        </p>
      </div>
      <div>
        <Label htmlFor="cc-repetir">Repite la contraseña nueva</Label>
        <Input id="cc-repetir" name="repetir" type="password" autoComplete="new-password" required />
      </div>
      <Guardar />
    </form>
  );
}
