'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Rol } from '@scilb/core';
import { accionGuardarUsuarios, type CambioUsuario, type ResultadoUsuario } from './actions';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { Aviso, campoCls } from '../../../components/ui/form';

export type FilaUsuario = { id: string; nombre: string; cod: string; sedeCod: string; rolValor: string; activo: boolean };
type OpcionRol = { valor: string; label: string; rolBase: Rol; rolCod: string | null };
type Edicion = { cod: string; sedeCod: string; rolValor: string; activo: boolean; restablecer: boolean };
const inicial = (f: FilaUsuario): Edicion => ({ cod: f.cod, sedeCod: f.sedeCod, rolValor: f.rolValor, activo: f.activo, restablecer: false });

export function UsuariosCliente({
  filas,
  sedes,
  roles,
}: {
  filas: FilaUsuario[];
  sedes: { cod: string; nombre: string }[];
  roles: OpcionRol[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const base = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas]);
  const [ed, setEd] = useState<Record<string, Edicion>>(() =>
    Object.fromEntries(filas.map((f) => [f.id, inicial(f)])),
  );
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState('');
  const [temporales, setTemporales] = useState<{ nombre: string; temporal: string }[] | null>(null);

  const visibles = filas.filter((f) => f.nombre.toLowerCase().includes(busca.trim().toLowerCase()));
  const edicionDe = (e: Record<string, Edicion>, id: string): Edicion => {
    const f = base.get(id);
    return e[id] ?? (f ? inicial(f) : { cod: '', sedeCod: '', rolValor: '', activo: true, restablecer: false });
  };
  const poner = (id: string, p: Partial<Edicion>) => setEd((e) => ({ ...e, [id]: { ...edicionDe(e, id), ...p } }));
  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todos = visibles.length > 0 && visibles.every((f) => sel.has(f.id));
  const marcarVisibles = () => setSel(todos ? new Set() : new Set(visibles.map((f) => f.id)));

  function paraSeleccion(p: Partial<Edicion>) {
    setEd((e) => {
      const n = { ...e };
      for (const id of sel) n[id] = { ...edicionDe(n, id), ...p };
      return n;
    });
  }

  const cambios = useMemo(() => {
    const out: CambioUsuario[] = [];
    for (const f of filas) {
      // Una persona que llegó después (otro admin la dio de alta y se refrescó) aún no tiene edición.
      const e = ed[f.id] ?? inicial(f);
      const c: CambioUsuario = { id: f.id };
      if (e.cod.trim() !== f.cod) c.cod = e.cod.trim();
      if (e.sedeCod !== f.sedeCod) c.sedeCod = e.sedeCod;
      if (e.rolValor !== f.rolValor) {
        const o = roles.find((r) => r.valor === e.rolValor);
        if (o) c.rol = { rolBase: o.rolBase, rolCod: o.rolCod };
      }
      if (e.activo !== f.activo) c.activo = e.activo;
      if (e.restablecer) c.restablecer = true;
      if (Object.keys(c).length > 1) out.push(c);
    }
    return out;
  }, [ed, filas, roles]);

  function guardar() {
    setAviso('');
    setErrores({});
    startTransition(async () => {
      const r = await accionGuardarUsuarios(cambios);
      if (!r.ok) {
        setAviso(r.error ?? 'No se pudo guardar');
        return;
      }
      const mal = r.resultados.filter((x: ResultadoUsuario) => !x.ok);
      setErrores(Object.fromEntries(mal.map((x) => [x.id, x.error ?? 'Error'])));
      const claves = r.resultados.filter((x) => x.ok && x.temporal).map((x) => ({ nombre: base.get(x.id)?.nombre ?? '', temporal: x.temporal as string }));
      if (claves.length) setTemporales(claves);
      setAviso(mal.length ? `${r.resultados.length - mal.length} guardados; ${mal.length} con error (míralos en rojo).` : 'Todo guardado.');
      // Las filas guardadas vuelven a quedar "sin cambios" tras refrescar; las que fallaron conservan lo escrito.
      setEd((e) => {
        const n = { ...e };
        for (const x of r.resultados) if (x.ok) n[x.id] = { ...n[x.id], restablecer: false };
        return n;
      });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${campoCls} max-w-xs`} placeholder="Buscar por nombre" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar por nombre" />
          <span className="text-apoyo text-muted tabular-nums">{sel.size} seleccionados</span>
          <Button variant="outline" disabled={sel.size === 0} onClick={() => paraSeleccion({ restablecer: true })}>Restablecer contraseña</Button>
          <Button variant="outline" disabled={sel.size === 0} onClick={() => paraSeleccion({ activo: false })}>Suspender</Button>
          <Button variant="outline" disabled={sel.size === 0} onClick={() => paraSeleccion({ activo: true })}>Activar</Button>
          <select className={`${campoCls} max-w-[11rem]`} disabled={sel.size === 0} value="" aria-label="Cambiar sede de los seleccionados" onChange={(e) => e.target.value && paraSeleccion({ sedeCod: e.target.value })}>
            <option value="">Sede de los elegidos…</option>
            {sedes.map((s) => <option key={s.cod} value={s.cod}>{s.nombre}</option>)}
          </select>
        </div>

        <Table>
          <THead>
            <TR>
              <TH><input type="checkbox" checked={todos} onChange={marcarVisibles} aria-label="Elegir todos" /></TH>
              <TH>Usuario</TH>
              <TH>Código</TH>
              <TH>Sede</TH>
              <TH>Rol</TH>
              <TH>Estado</TH>
              <TH>Contraseña</TH>
            </TR>
          </THead>
          <TBody>
            {visibles.map((f) => {
              const e = ed[f.id] ?? inicial(f);
              const cambiada = cambios.some((c) => c.id === f.id);
              return (
                <TR key={f.id}>
                  <TD><input type="checkbox" checked={sel.has(f.id)} onChange={() => alternar(f.id)} aria-label={`Elegir a ${f.nombre}`} /></TD>
                  <TD>
                    <div className="font-medium">{f.nombre}</div>
                    {cambiada && <Badge tone="amber">Sin guardar</Badge>}
                    {errores[f.id] && <div className="text-apoyo text-error">{errores[f.id]}</div>}
                  </TD>
                  <TD>
                    <input className={`${campoCls} w-24 tabular-nums`} inputMode="numeric" maxLength={4} value={e.cod} onChange={(ev) => poner(f.id, { cod: ev.target.value.replace(/\D/g, '') })} aria-label={`Código de ${f.nombre}`} />
                  </TD>
                  <TD>
                    <select className={campoCls} value={e.sedeCod} onChange={(ev) => poner(f.id, { sedeCod: ev.target.value })} aria-label={`Sede de ${f.nombre}`}>
                      {sedes.map((s) => <option key={s.cod} value={s.cod}>{s.nombre}</option>)}
                    </select>
                  </TD>
                  <TD>
                    <select className={campoCls} value={e.rolValor} onChange={(ev) => poner(f.id, { rolValor: ev.target.value })} aria-label={`Rol de ${f.nombre}`}>
                      {roles.map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
                    </select>
                  </TD>
                  <TD>
                    <label className="flex items-center gap-2 text-apoyo">
                      <input type="checkbox" checked={e.activo} onChange={(ev) => poner(f.id, { activo: ev.target.checked })} />
                      {e.activo ? 'Activo' : 'Suspendido'}
                    </label>
                  </TD>
                  <TD>
                    <label className="flex items-center gap-2 text-apoyo">
                      <input type="checkbox" checked={e.restablecer} onChange={(ev) => poner(f.id, { restablecer: ev.target.checked })} />
                      Restablecer
                    </label>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>

        {aviso && <Aviso tono={Object.keys(errores).length ? 'aviso' : 'exito'}>{aviso}</Aviso>}
        <div className="flex items-center gap-3">
          <Button onClick={guardar} disabled={pending || cambios.length === 0}>{pending ? 'Guardando…' : `Guardar todo (${cambios.length})`}</Button>
          {cambios.length > 0 && <span className="text-apoyo text-muted">Cada persona se guarda por separado: si una falla, las demás sí quedan.</span>}
        </div>
      </CardContent>

      <Modal open={temporales !== null} onClose={() => setTemporales(null)} title="Contraseñas temporales" subtitle="Anótalas y entrégalas ahora: no se volverán a mostrar.">
        <ModalBody>
          <ul className="space-y-2">
            {(temporales ?? []).map((t) => (
              <li key={t.nombre} className="flex items-center justify-between gap-4">
                <span>{t.nombre}</span>
                <strong className="rounded-r-chico bg-navy/5 text-navy px-2 py-1 tabular-nums">{t.temporal}</strong>
              </li>
            ))}
          </ul>
        </ModalBody>
        <ModalFooter>
          <Button onClick={() => setTemporales(null)}>Ya las entregué</Button>
        </ModalFooter>
      </Modal>
    </Card>
  );
}
