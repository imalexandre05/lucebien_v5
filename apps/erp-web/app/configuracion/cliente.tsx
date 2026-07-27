'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, AlertCircle } from 'lucide-react';
import { accionGuardarConfig } from './actions';
import type { ConfigItem } from '../../lib/config-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/cn';

const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

function grupo(clave: string): string {
  if (clave.startsWith('pts_')) return 'Puntos del pipeline';
  if (clave.startsWith('peso_') || clave.startsWith('eval_')) return 'Evaluación mensual';
  return 'Otros';
}
function etiqueta(clave: string): string {
  return clave.replace(/^(pts_|peso_|eval_)/, '').replace(/_/g, ' ');
}

export function ConfigCliente({ items }: { items: ConfigItem[] }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.clave, i.valor])),
  );
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const grupos = useMemo(() => [...new Set(items.map((i) => grupo(i.clave)))], [items]);

  function guardar() {
    setError('');
    setOk(false);
    startTransition(async () => {
      const r = await accionGuardarConfig(items.map((i) => ({ clave: i.clave, valor: vals[i.clave] ?? i.valor })));
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setOk(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {grupos.map((g) => (
          <Card key={g}>
            <CardHeader>
              <CardTitle>{g}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-line/60 py-0">
              {items
                .filter((i) => grupo(i.clave) === g)
                .map((i) => (
                  <div key={i.clave} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm capitalize text-navy">{etiqueta(i.clave)}</div>
                      <div className="font-mono text-[10px] text-muted">{i.clave}</div>
                    </div>
                    <input
                      aria-label={etiqueta(i.clave)}
                      value={vals[i.clave] ?? ''}
                      onChange={(e) => setVals((p) => ({ ...p, [i.clave]: e.target.value }))}
                      className={cn(fieldCls, 'w-32 text-right')}
                    />
                  </div>
                ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {error && (
        <p className="flex animate-fade items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" strokeWidth={2} /> {error}
        </p>
      )}
      {ok && (
        <p className="flex animate-fade items-center gap-1.5 text-sm text-emerald-700">
          <Check className="h-4 w-4" strokeWidth={2.5} /> Cambios guardados.
        </p>
      )}

      <Button type="button" onClick={guardar} pending={pending}>
        {pending ? 'Guardando…' : 'Guardar cambios'}
      </Button>
    </div>
  );
}
