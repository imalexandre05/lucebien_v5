'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { resumenChecklist, notaExamen, puedeCerrar, ESTADOS_ITEM, type EstadoItem } from '@scilb/core';
import type { Capacitacion, ItemChecklist } from '../../lib/capacitacion-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Aviso, campoCls } from '../../components/ui/form';
import { EmptyState } from '../../components/ui/empty-state';
import { cn } from '../../lib/cn';
import {
  accionCancelar, accionCerrar, accionExamen, accionGuardarItem, accionIniciar, accionMarcar,
} from './actions';

type Emp = { id: string; nombre: string };

const ETIQUETA: Record<EstadoItem, string> = { bueno: 'Bueno', regular: 'Regular', malo: 'Malo' };
const TONO: Record<EstadoItem, string> = {
  bueno: 'bg-exito-soft text-exito-deep border-exito-line',
  regular: 'bg-aviso-soft text-aviso-deep border-aviso-line',
  malo: 'bg-error-soft text-error-deep border-error-line',
};

export function CapacitacionCliente(props: {
  capacitaciones: Capacitacion[];
  items: ItemChecklist[];
  notaAprobatoria: number;
  empleados: Emp[];
  esAdmin: boolean;
  yoId: string;
}) {
  const { capacitaciones, items, notaAprobatoria, empleados, esAdmin, yoId } = props;
  const router = useRouter();
  const [error, setError] = useState('');
  const [pendiente, start] = useTransition();

  // Una acción: muestra el error tal cual lo dice la base (ya es un mensaje accionable) o refresca.
  function ejecutar(f: () => Promise<{ ok: boolean; error?: string }>) {
    setError('');
    start(async () => {
      const r = await f();
      if (!r.ok) setError(r.error ?? 'No se pudo completar la acción');
      else router.refresh();
    });
  }

  const activos = items.filter((i) => i.activo);
  const enCurso = capacitaciones.filter((c) => c.estado === 'en_curso');
  const cerradas = capacitaciones.filter((c) => c.estado !== 'en_curso');

  return (
    <div className="space-y-4">
      {error && <Aviso>{error}</Aviso>}
      {esAdmin && <AsignarForm empleados={empleados} disabled={pendiente} onAsignar={(n, c) => ejecutar(() => accionIniciar(n, c))} />}

      {enCurso.length === 0 && cerradas.length === 0 ? (
        <EmptyState icon={GraduationCap} titulo="Todavía no hay capacitaciones">
          {esAdmin ? 'Asigna un capacitador a la primera persona nueva arriba.' : 'Cuando te asignen una capacitación aparecerá aquí.'}
        </EmptyState>
      ) : null}

      {enCurso.map((c) => (
        <FichaCapacitacion
          key={c.id} cap={c} activos={activos} minimo={notaAprobatoria}
          puedeCalificar={esAdmin || c.capacitadorId === yoId} esAdmin={esAdmin} disabled={pendiente} ejecutar={ejecutar}
        />
      ))}

      {cerradas.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Historial</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-line/60">
              {cerradas.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-cuerpo text-navy">
                  <span>
                    <span className="font-medium">{c.nuevoNombre}</span> · capacitó {c.capacitadorNombre}
                  </span>
                  <span className="text-apoyo text-muted">
                    {c.estado === 'cancelada' ? 'Cancelada' : c.resultado === 'aprobada' ? 'Aprobada' : 'Por reforzar'}
                    {' · '}
                    {c.inicio}
                    {c.cierre ? ` → ${c.cierre}` : ''}
                    {c.estado === 'completada' && notaExamen(c.examenes) !== null && (
                      <span className="tabular-nums"> · nota {notaExamen(c.examenes)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {esAdmin && <EditorItems items={items} disabled={pendiente} ejecutar={ejecutar} />}
    </div>
  );
}

function AsignarForm({ empleados, disabled, onAsignar }: { empleados: Emp[]; disabled: boolean; onAsignar: (n: string, c: string) => void }) {
  const [nuevo, setNuevo] = useState('');
  const [cap, setCap] = useState('');
  return (
    <Card>
      <CardHeader><CardTitle>Asignar capacitación</CardTitle></CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-cuerpo text-navy">
            Persona nueva
            <select className={cn(campoCls, 'mt-1 w-full')} value={nuevo} onChange={(e) => setNuevo(e.target.value)}>
              <option value="">Elige…</option>
              {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
          <label className="block text-cuerpo text-navy">
            Quién la capacita
            <select className={cn(campoCls, 'mt-1 w-full')} value={cap} onChange={(e) => setCap(e.target.value)}>
              <option value="">Elige…</option>
              {empleados.filter((e) => e.id !== nuevo).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
          <Button disabled={disabled || !nuevo || !cap} onClick={() => { onAsignar(nuevo, cap); setNuevo(''); setCap(''); }}>
            Asignar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FichaCapacitacion({ cap, activos, minimo, puedeCalificar, esAdmin, disabled, ejecutar }: {
  cap: Capacitacion; activos: ItemChecklist[]; minimo: number; puedeCalificar: boolean; esAdmin: boolean;
  disabled: boolean; ejecutar: (f: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const avances = Object.fromEntries(cap.avances.map((a) => [a.itemId, a.estado])) as Record<string, EstadoItem>;
  const resumen = resumenChecklist(activos.map((i) => i.id), avances);
  const cierre = puedeCerrar(resumen, cap.examenes.length);
  const nota = notaExamen(cap.examenes);
  const [nombreEx, setNombreEx] = useState('');
  const [notaEx, setNotaEx] = useState('');
  const notaNum = Number(notaEx);
  const notaValida = notaEx.trim() !== '' && Number.isFinite(notaNum) && notaNum >= 0 && notaNum <= 20;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{cap.nuevoNombre}</CardTitle>
        <div className="text-apoyo text-muted">Lo capacita {cap.capacitadorNombre} · desde {cap.inicio}</div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-apoyo text-muted tabular-nums">
          {resumen.bueno} buenos · {resumen.regular} regulares · {resumen.malo} malos · {resumen.pendientes} pendientes
        </div>

        <ul className="divide-y divide-line/60">
          {activos.map((i) => {
            const actual = avances[i.id];
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-cuerpo text-navy">{i.nombre}</span>
                <span className="flex gap-1">
                  {ESTADOS_ITEM.map((e) => (
                    <button
                      key={e} type="button" disabled={!puedeCalificar || disabled}
                      aria-pressed={actual === e}
                      onClick={() => ejecutar(() => accionMarcar(cap.id, i.id, e, null))}
                      className={cn(
                        'min-h-[36px] rounded-r-pastilla border px-3 text-apoyo font-medium transition-colors disabled:cursor-not-allowed',
                        actual === e ? TONO[e] : 'border-line bg-white text-muted hover:border-navy/30',
                      )}
                    >
                      {ETIQUETA[e]}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>

        {cap.estado === 'en_curso' && (
          <div className="border-t border-line/60 pt-3">
            <a href={`/capacitacion/examen/${cap.id}`} className="text-cuerpo font-medium text-gold-deep underline">
              Exámenes de software, escritos y presencial →
            </a>
          </div>
        )}

        <div className="border-t border-line/60 pt-3">
          <div className="mb-2 text-rotulo uppercase text-muted">Examen (mínimo para aprobar: {minimo}/20)</div>
          {cap.examenes.length === 0 ? (
            <p className="text-apoyo text-muted">Aún no hay exámenes registrados.</p>
          ) : (
            <ul className="space-y-1 text-cuerpo text-navy">
              {cap.examenes.map((e) => (
                <li key={e.id} className="flex justify-between"><span>{e.nombre} · {e.fecha}</span><span className="tabular-nums font-semibold">{e.nota}/20</span></li>
              ))}
              <li className="text-apoyo text-muted">Nota vigente: <span className="tabular-nums font-semibold text-navy">{nota}</span> (cuenta el último examen)</li>
            </ul>
          )}
          {puedeCalificar && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <input className={cn(campoCls, 'w-48')} placeholder="Nombre (ej. Examen 1)" value={nombreEx} onChange={(e) => setNombreEx(e.target.value)} />
              <input className={cn(campoCls, 'w-24 text-right tabular-nums')} type="number" min={0} max={20} step={0.5} placeholder="Nota /20" value={notaEx} onChange={(e) => setNotaEx(e.target.value)} />
              <Button variant="outline" disabled={disabled || !notaValida} onClick={() => { ejecutar(() => accionExamen(cap.id, nombreEx, notaNum)); setNombreEx(''); setNotaEx(''); }}>
                Registrar examen
              </Button>
            </div>
          )}
        </div>

        {puedeCalificar && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
            <span className="text-apoyo text-muted">{cierre.ok ? 'Todo listo para cerrar.' : cierre.motivo}</span>
            <span className="flex gap-2">
              {esAdmin && <Button variant="ghost" disabled={disabled} onClick={() => ejecutar(() => accionCancelar(cap.id))}>Cancelar capacitación</Button>}
              <Button disabled={disabled || !cierre.ok} onClick={() => ejecutar(() => accionCerrar(cap.id))}>Cerrar capacitación</Button>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EditorItems({ items, disabled, ejecutar }: { items: ItemChecklist[]; disabled: boolean; ejecutar: (f: () => Promise<{ ok: boolean; error?: string }>) => void }) {
  const [nuevo, setNuevo] = useState('');
  return (
    <Card>
      <CardHeader><CardTitle>Ítems del checklist</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-apoyo text-muted">Lo que se revisa en cada capacitación. Desactivar un ítem lo quita de las capacitaciones nuevas y de las que siguen abiertas.</p>
        <ul className="divide-y divide-line/60">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 py-2">
              <span className={cn('text-cuerpo', i.activo ? 'text-navy' : 'text-muted line-through')}>{i.nombre}</span>
              <Button variant="ghost" size="normal" disabled={disabled} onClick={() => ejecutar(() => accionGuardarItem(i.id, i.nombre, i.orden, !i.activo))}>
                {i.activo ? 'Desactivar' : 'Activar'}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input className={cn(campoCls, 'flex-1')} placeholder="Nuevo ítem" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
          <Button variant="outline" disabled={disabled || !nuevo.trim()} onClick={() => { ejecutar(() => accionGuardarItem(null, nuevo, items.length + 1, true)); setNuevo(''); }}>
            Agregar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
