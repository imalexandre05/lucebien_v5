'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Temporada } from '@scilb/core';
import { accionEliminarTemporada, accionGuardarTemporada } from './actions';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Aviso, campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

type Form = { id?: string; nombre: string; desde: string; hasta: string; pago: string; metaSemanal: string; metaHora: string };
const VACIO: Form = { nombre: '', desde: '', hasta: '', pago: '', metaSemanal: '', metaHora: '' };

const aNum = (v: string): number | null => (v.trim() === '' ? null : Number(v));
const soles = (v: number | null) => (v === null ? 'Normal' : `S/ ${v.toFixed(2)}`);
const fecha = (iso: string) => iso.split('-').reverse().join('/');

export function TemporadasCliente({ temporadas }: { temporadas: Temporada[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Form>(VACIO);

  function abrir(t?: Temporada) {
    setForm(
      t
        ? {
            id: t.id,
            nombre: t.nombre,
            desde: t.desde,
            hasta: t.hasta,
            pago: t.pagoPorHora?.toString() ?? '',
            metaSemanal: t.metaSemanal?.toString() ?? '',
            metaHora: t.metaPorHora?.toString() ?? '',
          }
        : VACIO,
    );
    setError('');
    setAbierto(true);
  }

  function guardar() {
    setError('');
    startTransition(async () => {
      const r = await accionGuardarTemporada({
        id: form.id,
        nombre: form.nombre,
        desde: form.desde,
        hasta: form.hasta,
        pagoPorHora: aNum(form.pago),
        metaSemanal: aNum(form.metaSemanal),
        metaPorHora: aNum(form.metaHora),
      });
      if (!r.ok) return setError(r.error ?? 'Error');
      setAbierto(false);
      router.refresh();
    });
  }

  function eliminar(t: Temporada) {
    if (!t.id || !window.confirm(`¿Eliminar la temporada «${t.nombre}»? Las fechas volverán a usar los valores normales.`)) return;
    startTransition(async () => {
      const r = await accionEliminarTemporada(t.id as string);
      if (!r.ok) setError(r.error ?? 'Error');
      router.refresh();
    });
  }

  const campo = (id: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`t-${id}`} className="mb-1 block text-rotulo uppercase text-muted">{label}</label>
      <input
        id={`t-${id}`}
        value={form[id] ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
        className={cn(campoCls, 'w-full')}
        {...props}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3.5">
          <p className="text-cuerpo text-muted">
            {temporadas.length === 0
              ? 'Todavía no hay temporadas: se usan los valores normales todo el año.'
              : `${temporadas.length} temporada(s). Fuera de ellas se usan los valores normales.`}
          </p>
          <button type="button" onClick={() => abrir()} className={buttonVariants({ variant: 'primary' })}>
            <Plus className="h-4 w-4" strokeWidth={2} /> Nueva temporada
          </button>
        </CardContent>
      </Card>

      {error && !abierto && <Aviso tono="error">{error}</Aviso>}

      {temporadas.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto px-0 pb-0">
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Temporada</TH>
                  <TH>Fechas</TH>
                  <TH className="text-right">Pago por hora</TH>
                  <TH className="text-right">Meta semanal</TH>
                  <TH className="text-right">Meta por hora</TH>
                  <TH className="pr-5 text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {temporadas.map((t) => (
                  <TR key={t.id}>
                    <TD className="pl-5 font-medium text-navy">{t.nombre}</TD>
                    <TD className="tabular-nums text-cuerpo text-muted">{fecha(t.desde)} – {fecha(t.hasta)}</TD>
                    <TD className="text-right tabular-nums">{soles(t.pagoPorHora)}</TD>
                    <TD className="text-right tabular-nums">{soles(t.metaSemanal)}</TD>
                    <TD className="text-right tabular-nums">{soles(t.metaPorHora)}</TD>
                    <TD className="pr-5 text-right">
                      <div className="inline-flex gap-1.5">
                        <button type="button" onClick={() => abrir(t)} className="inline-flex items-center gap-1 rounded-r-pastilla border border-line px-2 py-1 text-apoyo text-navy hover:border-gold">
                          <Pencil className="h-3 w-3" strokeWidth={2} /> Editar
                        </button>
                        <button type="button" onClick={() => eliminar(t)} disabled={pending} className="inline-flex items-center gap-1 rounded-r-pastilla border border-line px-2 py-1 text-apoyo text-muted hover:border-gold">
                          <Trash2 className="h-3 w-3" strokeWidth={2} /> Quitar
                        </button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Modal
        open={abierto}
        onClose={() => !pending && setAbierto(false)}
        size="sm"
        title={form.id ? 'Editar temporada' : 'Nueva temporada'}
        icon={<CalendarRange className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.75} aria-hidden />}
      >
        <ModalBody className="space-y-3">
          {campo('nombre', 'Nombre *', { placeholder: 'Ej: Fiestas patrias' })}
          <div className="grid grid-cols-2 gap-3">
            {campo('desde', 'Desde *', { type: 'date' })}
            {campo('hasta', 'Hasta *', { type: 'date' })}
          </div>
          <p className="text-apoyo leading-relaxed text-muted">
            Deja vacío lo que no cambie: ese valor seguirá siendo el normal en estas fechas.
          </p>
          {campo('pago', 'Pago por hora (S/)', { type: 'number', min: 0, step: '0.1' })}
          {campo('metaSemanal', 'Meta semanal de ventas (S/)', { type: 'number', min: 0, step: '50' })}
          {campo('metaHora', 'Meta de ventas por hora (S/)', { type: 'number', min: 0, step: '1' })}
          <p className="text-apoyo leading-relaxed text-muted">
            La meta que ya está pactada en el contrato de una persona no cambia con la temporada.
            Si pones meta semanal, manda sobre la meta por hora.
          </p>
          {error && <Aviso tono="error">{error}</Aviso>}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setAbierto(false)} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>Cancelar</button>
          <Button type="button" onClick={guardar} pending={pending}>{pending ? 'Guardando…' : 'Guardar'}</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
