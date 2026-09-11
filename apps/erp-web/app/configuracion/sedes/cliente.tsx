'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Building2 } from 'lucide-react';
import type { SedePerfil } from '@scilb/core';
import type { Sede, SedeInput } from '../../../lib/sedes-repo';
import { accionCrearSede, accionEditarSede } from './actions';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { Button, buttonVariants } from '../../../components/ui/button';
import { OpcionBotones, type Opcion } from '../../../components/ui/opcion-botones';
import { Aviso, campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

const fieldCls = campoCls;

const VACIA: SedeInput = { cod: '', nombre: '', direccion: '', perfil: 'pos' };

const OPC_PERFIL: Opcion<SedePerfil>[] = [
  { value: 'pos', label: 'Punto de venta' },
  { value: 'almacen', label: 'Almacén' },
];
const PERFIL_LABEL: Record<SedePerfil, string> = { pos: 'Punto de venta', almacen: 'Almacén' };

export function SedesCliente({ sedes }: { sedes: Sede[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'nueva' | 'editar' | null>(null);
  const [form, setForm] = useState<SedeInput>(VACIA);

  function abrir(modo: 'nueva' | 'editar', s?: Sede) {
    setForm(s ? { cod: s.cod, nombre: s.nombre, direccion: s.direccion, perfil: s.perfil } : VACIA);
    setError('');
    setModal(modo);
  }

  function guardar() {
    setError('');
    startTransition(async () => {
      const r =
        modal === 'nueva'
          ? await accionCrearSede(form)
          : await accionEditarSede(form.cod, { nombre: form.nombre, direccion: form.direccion, perfil: form.perfil });
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setModal(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3.5">
          <p className="text-cuerpo text-muted">
            {sedes.length} sede(s). El código va en pickers y reportes; el nombre, en el login.
          </p>
          <div className="flex items-center gap-2">
            <Link href="/configuracion/actividades" className={cn(buttonVariants({ variant: 'outline' }), 'text-apoyo')}>
              Actividades
            </Link>
            <button type="button" onClick={() => abrir('nueva')} className={buttonVariants({ variant: 'primary' })}>
              <Plus className="h-4 w-4" strokeWidth={2} /> Nueva sede
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Código</TH>
                <TH>Nombre</TH>
                <TH>Dirección</TH>
                <TH>Ámbito</TH>
                <TH className="pr-5 text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {sedes.map((s) => (
                <TR key={s.cod}>
                  <TD className="pl-5">
                    <span className="inline-block rounded-r-pastilla bg-navy px-2.5 py-1 tabular-nums text-dato font-semibold text-paper">
                      {s.cod}
                    </span>
                  </TD>
                  <TD className="font-medium text-navy">{s.nombre}</TD>
                  <TD className="text-cuerpo text-muted">{s.direccion || '—'}</TD>
                  <TD>
                    <Badge tone={s.perfil === 'almacen' ? 'gray' : 'navy'}>{PERFIL_LABEL[s.perfil]}</Badge>
                  </TD>
                  <TD className="pr-5 text-right">
                    <button
                      type="button"
                      onClick={() => abrir('editar', s)}
                      className="inline-flex items-center gap-1 rounded-r-pastilla border border-line px-2 py-1 text-apoyo text-navy transition-colors duration-150 hover:border-gold active:scale-[0.97]"
                    >
                      <Pencil className="h-3 w-3" strokeWidth={2} /> Editar
                    </button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Modal
        open={modal !== null}
        onClose={() => !pending && setModal(null)}
        size="sm"
        title={modal === 'nueva' ? 'Nueva sede' : `Editar sede ${form.cod}`}
        icon={<Building2 className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.75} aria-hidden />}
      >
        <ModalBody className="space-y-3">
          {modal === 'nueva' && (
            <div>
              <label htmlFor="sede-cod" className="mb-1 block text-rotulo uppercase text-muted">
                Código (2-3 letras) *
              </label>
              <input
                id="sede-cod"
                value={form.cod}
                onChange={(e) => setForm((f) => ({ ...f, cod: e.target.value.toUpperCase() }))}
                placeholder="HY"
                maxLength={3}
                className={cn(fieldCls, 'w-28 text-center tabular-nums uppercase tracking-[0.2em]')}
              />
            </div>
          )}
          <div>
            <label htmlFor="sede-nombre" className="mb-1 block text-rotulo uppercase text-muted">
              Nombre *
            </label>
            <input
              id="sede-nombre"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Huancayo Centro"
              className={cn(fieldCls, 'w-full')}
            />
          </div>
          <div>
            <label htmlFor="sede-dir" className="mb-1 block text-rotulo uppercase text-muted">
              Dirección
            </label>
            <input
              id="sede-dir"
              value={form.direccion}
              onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
              placeholder="Calle Real 000"
              className={cn(fieldCls, 'w-full')}
            />
          </div>
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Perfil</label>
            <OpcionBotones
              opciones={OPC_PERFIL}
              value={form.perfil}
              onChange={(perfil) => setForm((f) => ({ ...f, perfil }))}
              ariaLabel="Perfil de la sede"
            />
            <p className="mt-1.5 text-apoyo leading-relaxed text-muted">
              {form.perfil === 'almacen'
                ? 'Almacén: pipeline de lavandería y solicitudes, sin mostrador (como Almacén Central).'
                : 'Punto de venta: pedidos y caja, sin pipeline propio.'}
            </p>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setModal(null)} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
            Cancelar
          </button>
          <Button type="button" onClick={guardar} pending={pending}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
