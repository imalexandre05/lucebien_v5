'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, Pencil, UserX, UserCheck, X } from 'lucide-react';
import type { EmpleadoAdmin } from '../../lib/empleados-repo';
import { accionEstadoEmpleado, accionEditarContacto } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/cn';

const ROL: Record<string, { label: string; cls: string }> = {
  admin: { label: 'Administrador', cls: 'bg-gold/20 text-[#7a6e0e]' },
  dueno: { label: 'Dueño/a', cls: 'bg-gold/20 text-[#7a6e0e]' },
  encargado_tienda: { label: 'Encargado Tienda', cls: 'bg-emerald-600/10 text-emerald-700' },
  encargado_almacen: { label: 'Enc. Almacén', cls: 'bg-emerald-600/10 text-emerald-700' },
  confeccionista: { label: 'Confeccionista', cls: 'bg-violet-50 text-violet-700' },
  ventas_junior: { label: 'Ventas Jr.', cls: 'bg-sky-50 text-sky-700' },
  ventas_junior_2: { label: 'Ventas Jr. 2', cls: 'bg-sky-50 text-sky-700' },
};
const rolInfo = (r: string) => ROL[r] ?? { label: r.replace(/_/g, ' '), cls: 'bg-ink/10 text-muted' };

const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

function iniciales(e: EmpleadoAdmin): string {
  if (e.iniciales) return e.iniciales.slice(0, 2).toUpperCase();
  const p = e.nombre.trim().split(/\s+/).filter(Boolean);
  return (p.map((w) => w[0]).slice(0, 2).join('') || '·').toUpperCase();
}

function StatBox({ label, valor, tone }: { label: string; valor: number; tone: string }) {
  return (
    <div className={cn('rounded-xl border p-4 text-center', tone)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="font-mono text-2xl font-bold tabular-nums">{valor}</div>
    </div>
  );
}

export function EmpleadosCliente({ empleados }: { empleados: EmpleadoAdmin[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [fRol, setFRol] = useState('');
  const [fSede, setFSede] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [editar, setEditar] = useState<EmpleadoAdmin | null>(null);
  const [pending, startTransition] = useTransition();

  const roles = useMemo(() => [...new Set(empleados.map((e) => e.rol))].sort(), [empleados]);
  const sedes = useMemo(() => [...new Set(empleados.flatMap((e) => e.tiendas))].sort(), [empleados]);

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return empleados.filter((e) => {
      if (fRol && e.rol !== fRol) return false;
      if (fSede && !e.tiendas.includes(fSede)) return false;
      if (fEstado === 'activo' && !e.activo) return false;
      if (fEstado === 'suspendido' && e.activo) return false;
      if (needle && !e.nombre.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [empleados, q, fRol, fSede, fEstado]);

  const resumen = useMemo(
    () => ({
      total: empleados.length,
      activos: empleados.filter((e) => e.activo).length,
      suspendidos: empleados.filter((e) => !e.activo).length,
      encargados: empleados.filter((e) => e.rol.startsWith('encargado')).length,
    }),
    [empleados],
  );

  function toggleEstado(e: EmpleadoAdmin) {
    const verbo = e.activo ? 'Suspender' : 'Reactivar';
    if (!confirm(`¿${verbo} a ${e.nombre}?`)) return;
    startTransition(async () => {
      const r = await accionEstadoEmpleado(e.id, !e.activo);
      if (!r.ok) alert(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Colaboradores" valor={resumen.total} tone="border-navy/15 bg-navy/5 text-navy" />
        <StatBox label="Activos" valor={resumen.activos} tone="border-emerald-200 bg-emerald-50 text-emerald-700" />
        <StatBox label="Suspendidos" valor={resumen.suspendidos} tone="border-line bg-white text-muted" />
        <StatBox label="Encargados" valor={resumen.encargados} tone="border-gold/30 bg-gold/10 text-[#7a6e0e]" />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <Filter className="h-3.5 w-3.5" strokeWidth={2} /> Filtros
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar colaborador…"
            className={`${fieldCls} min-w-[12rem] flex-1`}
          />
          <select value={fRol} onChange={(e) => setFRol(e.target.value)} className={fieldCls} aria-label="Rol">
            <option value="">Todos los roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {rolInfo(r).label}
              </option>
            ))}
          </select>
          <select value={fSede} onChange={(e) => setFSede(e.target.value)} className={fieldCls} aria-label="Sede">
            <option value="">Todas las sedes</option>
            {sedes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className={fieldCls} aria-label="Estado">
            <option value="">Todos</option>
            <option value="activo">Activos</option>
            <option value="suspendido">Suspendidos</option>
          </select>
          <span className="ml-auto font-mono text-xs text-muted tabular-nums">{filtrados.length} colaboradores</span>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Colaborador</TH>
                <TH>Tiendas</TH>
                <TH>Rol</TH>
                <TH>Estado</TH>
                <TH>Teléfono</TH>
                <TH className="pr-5 text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {filtrados.map((e) => {
                const rol = rolInfo(e.rol);
                return (
                  <TR key={e.id} className={cn(!e.activo && 'opacity-60')}>
                    <TD className="pl-5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-deep text-[11px] font-bold text-gold">
                          {iniciales(e)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-navy">{e.nombre}</div>
                          <div className="font-mono text-[10px] tracking-widest text-muted">••••</div>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {e.tiendas.length ? (
                          e.tiendas.map((t) => (
                            <span key={t} className="rounded bg-navy/5 px-1.5 py-0.5 font-mono text-[10px] text-navy">
                              {t}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </div>
                    </TD>
                    <TD>
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', rol.cls)}>
                        {rol.label}
                      </span>
                    </TD>
                    <TD>
                      {e.activo ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Suspendido
                        </span>
                      )}
                    </TD>
                    <TD className="font-mono text-xs">{e.telefono || '—'}</TD>
                    <TD className="pr-5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditar(e)}
                          className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-navy transition hover:border-gold"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={2} /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleEstado(e)}
                          disabled={pending}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition',
                            e.activo
                              ? 'border-red-200 text-red-700 hover:bg-red-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
                          )}
                        >
                          {e.activo ? (
                            <>
                              <UserX className="h-3.5 w-3.5" strokeWidth={2} /> Suspender
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-3.5 w-3.5" strokeWidth={2} /> Reactivar
                            </>
                          )}
                        </button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
              {filtrados.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={6}>
                    Ningún colaborador coincide con el filtro.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {editar && (
        <EditarModal
          emp={editar}
          onClose={() => setEditar(null)}
          onSaved={() => {
            setEditar(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EditarModal({ emp, onClose, onSaved }: { emp: EmpleadoAdmin; onClose: () => void; onSaved: () => void }) {
  const [telefono, setTelefono] = useState(emp.telefono ?? '');
  const [dni, setDni] = useState(emp.dni ?? '');
  const [direccion, setDireccion] = useState(emp.direccion ?? '');
  const [salario, setSalario] = useState(emp.salarioBase);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function guardar() {
    setError('');
    startTransition(async () => {
      const r = await accionEditarContacto(emp.id, { telefono, dni, direccion, salarioBase: salario });
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md animate-scale-in rounded-2xl border border-line bg-white shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-deep text-[11px] font-bold text-gold">
              {iniciales(emp)}
            </span>
            <div>
              <div className="font-display text-lg font-semibold text-navy">{emp.nombre}</div>
              <div className="text-xs text-muted">{rolInfo(emp.rol).label}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted transition hover:text-navy" aria-label="Cerrar">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-xs text-muted">Datos de contacto. El nombre, código y rol se gestionan aparte (afectan credenciales e historial).</p>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Teléfono</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={cn(fieldCls, 'w-full')} />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">DNI</label>
            <input value={dni} onChange={(e) => setDni(e.target.value)} className={cn(fieldCls, 'w-full')} />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Dirección</label>
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={cn(fieldCls, 'w-full')} />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Salario base (S/)</label>
            <input
              type="number"
              step="0.5"
              value={salario}
              onChange={(e) => setSalario(Number(e.target.value))}
              className={cn(fieldCls, 'w-full')}
            />
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <button type="button" onClick={onClose} className={buttonVariants({ variant: 'outline' })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={pending}
            className={cn(buttonVariants({ variant: 'primary' }), pending && 'opacity-60')}
          >
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
