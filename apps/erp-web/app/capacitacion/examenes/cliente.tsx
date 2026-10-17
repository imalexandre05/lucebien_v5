'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Habilidad, Pregunta, TipoExamen } from '../../../lib/capacitacion-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Aviso, campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';
import { accionGuardarHabilidad, accionGuardarPregunta } from '../examen-actions';

const TIPOS: { v: TipoExamen; l: string }[] = [
  { v: 'software', l: 'Software' },
  { v: 'escrito', l: 'Escrito (conocimientos)' },
];

export function BancoCliente({ preguntas, habilidades }: { preguntas: Pregunta[]; habilidades: Habilidad[] }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pendiente, start] = useTransition();
  const [tipo, setTipo] = useState<TipoExamen>('escrito');
  const [tema, setTema] = useState('');
  const [enunciado, setEnunciado] = useState('');
  const [opciones, setOpciones] = useState('');
  const [correcta, setCorrecta] = useState(1);
  const [nuevaHab, setNuevaHab] = useState('');

  const lista = opciones.split('\n').map((o) => o.trim()).filter(Boolean);

  function ejecutar(f: () => Promise<{ ok: boolean; error?: string }>, despues?: () => void) {
    setError('');
    start(async () => {
      const r = await f();
      if (!r.ok) setError(r.error ?? 'No se pudo guardar');
      else { despues?.(); router.refresh(); }
    });
  }

  return (
    <div className="space-y-4">
      {error && <Aviso tono="error">{error}</Aviso>}

      <Card>
        <CardHeader><CardTitle>Agregar pregunta</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-cuerpo text-navy">Tipo de examen
              <select className={cn(campoCls, 'mt-1 w-full')} value={tipo} onChange={(e) => setTipo(e.target.value as TipoExamen)}>
                {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </label>
            <label className="block text-cuerpo text-navy">Tema (medidas, cuadernillos, confección…)
              <input className={cn(campoCls, 'mt-1 w-full')} value={tema} onChange={(e) => setTema(e.target.value)} />
            </label>
          </div>
          <label className="block text-cuerpo text-navy">Pregunta
            <textarea className={cn(campoCls, 'mt-1 w-full')} rows={2} value={enunciado} onChange={(e) => setEnunciado(e.target.value)} />
          </label>
          <label className="block text-cuerpo text-navy">Opciones (una por línea, de 2 a 6)
            <textarea className={cn(campoCls, 'mt-1 w-full')} rows={4} value={opciones} onChange={(e) => setOpciones(e.target.value)} />
          </label>
          <label className="block text-cuerpo text-navy">Opción correcta
            <select className={cn(campoCls, 'mt-1 w-full sm:w-64')} value={correcta} onChange={(e) => setCorrecta(Number(e.target.value))}>
              {lista.map((o, i) => <option key={i} value={i + 1}>{i + 1}. {o}</option>)}
            </select>
          </label>
          <Button
            disabled={pendiente || !enunciado.trim() || lista.length < 2 || correcta > lista.length}
            onClick={() => ejecutar(
              () => accionGuardarPregunta({ id: null, tipo, tema, enunciado, opciones: lista, correcta: correcta - 1, activa: true }),
              () => { setEnunciado(''); setOpciones(''); setCorrecta(1); },
            )}
          >
            Guardar pregunta
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Banco de preguntas</CardTitle></CardHeader>
        <CardContent>
          {preguntas.length === 0 ? (
            <p className="text-cuerpo text-muted">Todavía no hay preguntas. Agrega la primera arriba: sin preguntas nadie puede rendir el examen.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {preguntas.map((p) => (
                <li key={p.id} className={cn('flex items-start justify-between gap-3 py-2 text-cuerpo text-navy', !p.activa && 'opacity-60')}>
                  <div>
                    <div className="text-apoyo text-muted">{p.tipo === 'software' ? 'Software' : 'Escrito'}{p.tema ? ` · ${p.tema}` : ''}</div>
                    <div>{p.enunciado}</div>
                    <div className="text-apoyo text-muted">Correcta: {p.opciones[p.correcta]}</div>
                  </div>
                  <Button variant="ghost" disabled={pendiente}
                    onClick={() => ejecutar(() => accionGuardarPregunta({ ...p, activa: !p.activa }))}>
                    {p.activa ? 'Desactivar' : 'Activar'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Habilidades del examen presencial</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y divide-line/60">
            {habilidades.map((h) => (
              <li key={h.id} className={cn('flex items-center justify-between py-2 text-cuerpo text-navy', !h.activo && 'opacity-60')}>
                <span>{h.nombre}</span>
                <Button variant="ghost" disabled={pendiente}
                  onClick={() => ejecutar(() => accionGuardarHabilidad(h.id, h.nombre, h.orden, !h.activo))}>
                  {h.activo ? 'Desactivar' : 'Activar'}
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <input className={cn(campoCls, 'w-64')} placeholder="Nueva habilidad (ej. Planchado)" value={nuevaHab} onChange={(e) => setNuevaHab(e.target.value)} />
            <Button variant="outline" disabled={pendiente || !nuevaHab.trim()}
              onClick={() => ejecutar(() => accionGuardarHabilidad(null, nuevaHab, habilidades.length + 1, true), () => setNuevaHab(''))}>
              Agregar habilidad
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
