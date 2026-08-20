'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, PackagePlus } from 'lucide-react';
import { registrarPrenda } from '../actions';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/cn';

// Mismos vocabularios que usa el tablero (no inventar valores nuevos).
const TIPOS = ['Terno completo', 'Saco', 'Pantalón', 'Camisa', 'Chaleco', 'Corbata', 'Otros'];
const COLORES = [
  'Negro', 'Azul noche', 'Azul Barcelona', 'Azul eléctrico', 'Azul acero', 'Azul presidente',
  'Verde petróleo', 'Celeste', 'Celeste bb', 'Plomo', 'Plomo rata', 'Beige', 'Camello',
  'Vino', 'Blanco', 'Gris', 'Otros',
];
const TALLAS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '4', '6', '8', '10', '12', '14', '16'];
const LAVADOS = ['normal', 'seco', 'especializado'];

const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy placeholder:text-muted focus:border-navy focus:outline-none';

export function RegistrarForm({ sedes }: { sedes: string[] }) {
  const [pending, startTransition] = useTransition();
  const codigoRef = useRef<HTMLInputElement>(null);
  const [codigo, setCodigo] = useState('');
  const [tipo, setTipo] = useState('Terno completo');
  const [color, setColor] = useState('Negro');
  const [talla, setTalla] = useState('');
  const [sede, setSede] = useState(sedes[0] ?? 'LB');
  const [lavado, setLavado] = useState('normal');
  const [compostura, setCompostura] = useState(false);
  const [obs, setObs] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [registradas, setRegistradas] = useState<string[]>([]);

  function submit() {
    startTransition(async () => {
      const err = await registrarPrenda({
        codigo,
        tipo,
        color,
        talla,
        sedeOrigenCod: sede,
        tipoLavado: lavado,
        necesitaCompostura: compostura,
        obs,
      });
      setError(err);
      if (!err) {
        setRegistradas((p) => [codigo.trim().toUpperCase(), ...p].slice(0, 12));
        // Ráfaga: se limpia lo propio de la prenda, se conserva sede/lavado del lote.
        setCodigo('');
        setTalla('');
        setObs('');
        setCompostura(false);
        codigoRef.current?.focus();
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/pipeline"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors duration-150 hover:text-navy"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Volver al kanban
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <PackagePlus className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden />
            Nueva prenda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
              <span className="text-xs font-medium text-muted">Código *</span>
              <input
                ref={codigoRef}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="TN-042"
                autoFocus
                className={cn(fieldCls, 'font-mono uppercase')}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Tipo *</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={fieldCls}>
                {TIPOS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Color</span>
              <select value={color} onChange={(e) => setColor(e.target.value)} className={fieldCls}>
                {COLORES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Talla</span>
              <select value={talla} onChange={(e) => setTalla(e.target.value)} className={fieldCls}>
                <option value="">—</option>
                {TALLAS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Sede origen *</span>
              <select value={sede} onChange={(e) => setSede(e.target.value)} className={fieldCls}>
                {sedes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Tipo de lavado</span>
              <select value={lavado} onChange={(e) => setLavado(e.target.value)} className={fieldCls}>
                {LAVADOS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="col-span-2 flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-muted">Observación</span>
              <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" className={fieldCls} />
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-sm text-navy">
              <input
                type="checkbox"
                checked={compostura}
                onChange={(e) => setCompostura(e.target.checked)}
                className="h-4 w-4 accent-[#2e3e6e]"
              />
              Necesita compostura
            </label>

            {error && (
              <p className="col-span-2 rounded-md bg-error-soft px-3 py-2 text-sm text-error-deep sm:col-span-3">{error}</p>
            )}

            <div className="col-span-2 sm:col-span-3">
              <Button
                type="submit"
                disabled={!codigo.trim()}
                pending={pending}
                className="w-full justify-center py-2.5"
              >
                {!pending && <PackagePlus className="h-4 w-4" strokeWidth={2} />}
                {pending ? 'Registrando…' : 'Registrar y seguir'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {registradas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2">
          <span className="text-xs text-muted">Registradas en esta sesión:</span>
          {registradas.map((c, i) => (
            <span
              key={`${c}-${i}`}
              className="inline-flex items-center gap-1 rounded bg-exito-soft px-1.5 py-0.5 font-mono text-[11px] font-medium text-exito-deep"
            >
              <Check className="h-2.5 w-2.5" strokeWidth={3} /> {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
