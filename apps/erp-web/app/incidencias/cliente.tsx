'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { accionCrearIncidencia, accionEliminarIncidencia } from './actions';
import type { Incidencia, TipoIncidencia } from '../../lib/incidencias-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/cn';

type Emp = { id: string; nombre: string };

const NIVEL_TONE: Record<string, Tone> = { Alto: 'amber', Medio: 'gold', Bajo: 'gray' };
const NIVELES = ['Alto', 'Medio', 'Bajo'];
const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

export function IncidenciasCliente({
  incidencias,
  tipos,
  empleados,
  esAdmin,
}: {
  incidencias: Incidencia[];
  tipos: TipoIncidencia[];
  empleados: Emp[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState('');
  const [nivel, setNivel] = useState('Medio');
  const [puntos, setPuntos] = useState(2);
  const [responsable, setResponsable] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const tiposPorCat = useMemo(() => {
    const m = new Map<string, TipoIncidencia[]>();
    for (const t of tipos) {
      const k = t.categoria ?? 'Otros';
      (m.get(k) ?? m.set(k, []).get(k)!).push(t);
    }
    return [...m.entries()];
  }, [tipos]);

  function elegirTipo(nombreTipo: string) {
    setTipo(nombreTipo);
    const t = tipos.find((x) => x.tipo === nombreTipo);
    if (t) {
      setNivel(t.nivelDefault);
      setPuntos(t.puntosDefault);
    }
  }

  function registrar() {
    setError('');
    startTransition(async () => {
      const r = await accionCrearIncidencia({
        tipo,
        nivel,
        descripcion,
        responsableId: responsable || null,
        puntosPenalidad: puntos,
      });
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setAbierto(false);
      setTipo('');
      setDescripcion('');
      setResponsable('');
      router.refresh();
    });
  }

  function eliminar(id: string) {
    if (!confirm('¿Eliminar esta incidencia?')) return;
    startTransition(async () => {
      const r = await accionEliminarIncidencia(id);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setAbierto((v) => !v)} className={buttonVariants({ variant: abierto ? 'outline' : 'primary' })}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          {abierto ? 'Cerrar' : 'Nueva incidencia'}
        </button>
      </div>

      {abierto && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar incidencia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tipo</label>
                <select value={tipo} onChange={(e) => elegirTipo(e.target.value)} className={cn(fieldCls, 'w-full')}>
                  <option value="">Elige un tipo…</option>
                  {tiposPorCat.map(([cat, lista]) => (
                    <optgroup key={cat} label={cat}>
                      {lista.map((t) => (
                        <option key={t.id} value={t.tipo}>
                          {t.tipo}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Responsable</label>
                <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={cn(fieldCls, 'w-full')}>
                  <option value="">— sin asignar —</option>
                  {empleados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Nivel</label>
                <select value={nivel} onChange={(e) => setNivel(e.target.value)} className={cn(fieldCls, 'w-full')}>
                  {NIVELES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Puntos de penalidad</label>
                <input type="number" step="0.5" value={puntos} onChange={(e) => setPuntos(Number(e.target.value))} className={cn(fieldCls, 'w-full')} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Descripción</label>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué pasó…" className={cn(fieldCls, 'w-full')} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={registrar}
              disabled={pending || !tipo}
              className={cn(buttonVariants({ variant: 'primary' }), pending && 'opacity-60')}
            >
              {pending ? 'Registrando…' : 'Registrar incidencia'}
            </button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Fecha</TH>
                <TH>Sede</TH>
                <TH>Tipo</TH>
                <TH>Nivel</TH>
                <TH>Responsable</TH>
                <TH className="text-right">Puntos</TH>
                {esAdmin && <TH className="pr-5" />}
              </TR>
            </THead>
            <TBody>
              {incidencias.map((i) => (
                <TR key={i.id}>
                  <TD className="pl-5 font-mono text-xs">{i.fecha}</TD>
                  <TD className="font-mono">{i.sedeCod}</TD>
                  <TD>
                    <div className="text-navy">{i.tipo}</div>
                    {i.descripcion && <div className="text-xs text-muted">{i.descripcion}</div>}
                  </TD>
                  <TD>
                    <Badge tone={NIVEL_TONE[i.nivel] ?? 'gray'}>{i.nivel}</Badge>
                  </TD>
                  <TD>{i.responsableNombre ?? '—'}</TD>
                  <TD className="text-right font-mono tabular-nums">{i.puntosPenalidad || '—'}</TD>
                  {esAdmin && (
                    <TD className="pr-5 text-right">
                      <button type="button" onClick={() => eliminar(i.id)} className="text-muted hover:text-red-600" aria-label="Eliminar">
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </TD>
                  )}
                </TR>
              ))}
              {incidencias.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={esAdmin ? 7 : 6}>
                    Sin incidencias registradas.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
