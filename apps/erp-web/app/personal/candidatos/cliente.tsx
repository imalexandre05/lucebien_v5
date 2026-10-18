'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { puedeCerrarPrueba, finDePrueba, type EstadoCandidato, type ResultadoPrueba } from '@scilb/core';
import type { Candidato } from '../../../lib/candidatos-repo';
import {
  accionCerrarPrueba, accionCrearCandidato, accionDescartar, accionEntrevistar,
  accionIniciarPrueba, accionReactivar, accionRepetirPrueba,
} from './actions';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { Button, buttonVariants } from '../../../components/ui/button';
import { OpcionBotones, type Opcion } from '../../../components/ui/opcion-botones';
import { Aviso, campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

const ETAPAS: { estado: EstadoCandidato; titulo: string }[] = [
  { estado: 'por_entrevistar', titulo: 'Por entrevistar' },
  { estado: 'entrevistado', titulo: 'Entrevistados' },
  { estado: 'en_prueba', titulo: 'En prueba' },
  { estado: 'prueba_cerrada', titulo: 'Prueba terminada' },
  { estado: 'contratado', titulo: 'Contratados' },
  { estado: 'descartado', titulo: 'Descartados' },
];
const OPC_RESULTADO: Opcion<ResultadoPrueba>[] = [
  { value: 'bueno', label: 'Bueno' },
  { value: 'regular', label: 'Regular' },
  { value: 'malo', label: 'Malo' },
];
const TONO: Record<ResultadoPrueba, 'navy' | 'gray'> = { bueno: 'navy', regular: 'gray', malo: 'gray' };
const fecha = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

type Dialogo =
  | { tipo: 'nuevo' }
  | { tipo: 'entrevista' | 'prueba' | 'cierre' | 'descarte'; c: Candidato };

export function CandidatosCliente({
  candidatos, sedes, diasPrueba, hoy,
}: { candidatos: Candidato[]; sedes: { cod: string; nombre: string }[]; diasPrueba: number; hoy: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [dlg, setDlg] = useState<Dialogo | null>(null);
  const [f, setF] = useState({ nombre: '', dni: '', telefono: '', sedeCod: '', texto: '', fecha: hoy, resultado: 'bueno' as ResultadoPrueba });

  function abrir(d: Dialogo) {
    setF({ nombre: '', dni: '', telefono: '', sedeCod: '', texto: '', fecha: hoy, resultado: 'bueno' });
    setError('');
    setDlg(d);
  }

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>, cerrar = true) {
    setError('');
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? 'Error');
      if (cerrar) setDlg(null);
      router.refresh();
    });
  }

  function accion(c: Candidato) {
    const btn = (label: string, onClick: () => void, primario = true) => (
      <button type="button" onClick={onClick} disabled={pending} className={buttonVariants({ variant: primario ? 'primary' : 'outline' })}>{label}</button>
    );
    switch (c.estado) {
      case 'por_entrevistar': return btn('Registrar entrevista', () => abrir({ tipo: 'entrevista', c }));
      case 'entrevistado': return btn('Iniciar prueba', () => abrir({ tipo: 'prueba', c }));
      case 'en_prueba':
        return c.pruebaHasta && puedeCerrarPrueba(hoy, c.pruebaHasta)
          ? btn('Cerrar prueba', () => abrir({ tipo: 'cierre', c }))
          : <span className="text-apoyo text-muted">La prueba termina el {fecha(c.pruebaHasta)}</span>;
      case 'prueba_cerrada':
        return (
          <div className="flex flex-wrap gap-2">
            <Link href={`/personal/nuevo?candidato=${c.id}`} className={buttonVariants({ variant: 'primary' })}>Pasar a alta</Link>
            {btn('Repetir prueba', () => ejecutar(() => accionRepetirPrueba(c.id), false), false)}
          </div>
        );
      case 'descartado': return btn('Reactivar', () => ejecutar(() => accionReactivar(c.id), false), false);
      default: return c.empleadoId ? <Link href={`/personal/${c.empleadoId}`} className={buttonVariants({ variant: 'outline' })}>Ver ficha</Link> : null;
    }
  }

  const campo = (label: string, valor: string, set: (v: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="mb-1 block text-rotulo uppercase text-muted">{label}</label>
      <input value={valor} onChange={(e) => set(e.target.value)} className={cn(campoCls, 'w-full')} {...props} />
    </div>
  );

  const tituloDlg = !dlg ? '' : dlg.tipo === 'nuevo' ? 'Nuevo candidato'
    : dlg.tipo === 'entrevista' ? `Entrevista de ${dlg.c.nombre}`
    : dlg.tipo === 'prueba' ? `Prueba de ${dlg.c.nombre}`
    : dlg.tipo === 'cierre' ? `Resultado de la prueba de ${dlg.c.nombre}` : `Descartar a ${dlg.c.nombre}`;

  function confirmar() {
    if (!dlg) return;
    if (dlg.tipo === 'nuevo') return ejecutar(() => accionCrearCandidato({ nombre: f.nombre, dni: f.dni, telefono: f.telefono, rolCod: '', sedeCod: f.sedeCod }));
    if (dlg.tipo === 'entrevista') return ejecutar(() => accionEntrevistar(dlg.c.id, f.texto));
    if (dlg.tipo === 'prueba') return ejecutar(() => accionIniciarPrueba(dlg.c.id, f.fecha));
    if (dlg.tipo === 'cierre') return ejecutar(() => accionCerrarPrueba(dlg.c.id, f.resultado, f.texto));
    return ejecutar(() => accionDescartar(dlg.c.id, f.texto));
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3.5">
          <p className="text-cuerpo text-muted">
            {candidatos.length === 0 ? 'Aún no hay candidatos.' : `${candidatos.length} candidato(s).`} Cada persona avanza paso a paso: entrevista, prueba de {diasPrueba} días y alta.
          </p>
          <button type="button" onClick={() => abrir({ tipo: 'nuevo' })} className={buttonVariants({ variant: 'primary' })}>
            <UserPlus className="h-4 w-4" strokeWidth={2} /> Nuevo candidato
          </button>
        </CardContent>
      </Card>

      {error && !dlg && <Aviso tono="error">{error}</Aviso>}

      {ETAPAS.map(({ estado, titulo }) => {
        const lista = candidatos.filter((c) => c.estado === estado);
        if (lista.length === 0) return null;
        return (
          <section key={estado} className="space-y-2">
            <h2 className="font-display text-seccion text-navy">{titulo} <span className="tabular-nums text-muted">({lista.length})</span></h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {lista.map((c) => (
                <Card key={c.id}>
                  <CardContent className="space-y-2 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-navy">{c.nombre}</p>
                      {c.resultado && <Badge tone={TONO[c.resultado]}>{OPC_RESULTADO.find((o) => o.value === c.resultado)?.label}</Badge>}
                    </div>
                    <p className="text-apoyo text-muted">
                      {[c.telefono, c.dni && `DNI ${c.dni}`].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                    </p>
                    {c.entrevistaObs && <p className="text-apoyo text-muted">Entrevista ({fecha(c.entrevistaFecha)}): {c.entrevistaObs}</p>}
                    {c.pruebaDesde && <p className="tabular-nums text-apoyo text-muted">Prueba: {fecha(c.pruebaDesde)} – {fecha(c.pruebaHasta)}</p>}
                    {c.resultadoObs && <p className="text-apoyo text-muted">{c.resultadoObs}</p>}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {accion(c)}
                      {c.estado !== 'contratado' && c.estado !== 'descartado' && (
                        <button type="button" onClick={() => abrir({ tipo: 'descarte', c })} className="text-apoyo text-muted underline-offset-2 hover:underline">Descartar</button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      <Modal open={dlg !== null} onClose={() => !pending && setDlg(null)} size="sm" title={tituloDlg}>
        <ModalBody className="space-y-3">
          {dlg?.tipo === 'nuevo' && (
            <>
              {campo('Nombre *', f.nombre, (v) => setF((x) => ({ ...x, nombre: v })), { placeholder: 'Nombre y apellidos' })}
              {campo('DNI', f.dni, (v) => setF((x) => ({ ...x, dni: v })), { inputMode: 'numeric', maxLength: 8 })}
              {campo('Teléfono', f.telefono, (v) => setF((x) => ({ ...x, telefono: v })), { inputMode: 'tel' })}
              <div>
                <label className="mb-1 block text-rotulo uppercase text-muted">Sede a la que postula</label>
                <select value={f.sedeCod} onChange={(e) => setF((x) => ({ ...x, sedeCod: e.target.value }))} className={cn(campoCls, 'w-full')}>
                  <option value="">Sin definir</option>
                  {sedes.map((s) => <option key={s.cod} value={s.cod}>{s.nombre}</option>)}
                </select>
              </div>
            </>
          )}
          {dlg?.tipo === 'entrevista' && campo('¿Qué se observó?', f.texto, (v) => setF((x) => ({ ...x, texto: v })), { placeholder: 'Opcional' })}
          {dlg?.tipo === 'prueba' && (
            <>
              {campo('Primer día de la prueba', f.fecha, (v) => setF((x) => ({ ...x, fecha: v })), { type: 'date' })}
              <p className="text-apoyo text-muted">Dura {diasPrueba} días: terminaría el {f.fecha ? fecha(finDePrueba(f.fecha, diasPrueba)) : '—'}.</p>
            </>
          )}
          {dlg?.tipo === 'cierre' && (
            <>
              <OpcionBotones opciones={OPC_RESULTADO} value={f.resultado} onChange={(resultado) => setF((x) => ({ ...x, resultado }))} ariaLabel="Resultado de la prueba" />
              {f.resultado === 'malo' && <p className="text-apoyo text-muted">Un resultado «malo» no impide el alta: decide el administrador.</p>}
              {campo('Observación', f.texto, (v) => setF((x) => ({ ...x, texto: v })), { placeholder: 'Opcional' })}
            </>
          )}
          {dlg?.tipo === 'descarte' && campo('Motivo', f.texto, (v) => setF((x) => ({ ...x, texto: v })), { placeholder: 'Opcional' })}
          {error && <Aviso tono="error">{error}</Aviso>}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setDlg(null)} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>Cancelar</button>
          <Button type="button" onClick={confirmar} pending={pending}>{pending ? 'Guardando…' : 'Guardar'}</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
