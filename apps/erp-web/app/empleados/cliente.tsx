'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, Pencil, UserX, UserCheck, KeyRound } from 'lucide-react';
import type { EmpleadoAdmin } from '../../lib/empleados-repo';
import { accionEstadoEmpleado, accionEditarContacto, accionEstablecerContrasena } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { buttonVariants } from '../../components/ui/button';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { StatBox } from '../../components/ui/stat-box';
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
        <StatBox index={0} label="Colaboradores" valor={resumen.total} tone="border-navy/15 bg-navy/5 text-navy" />
        <StatBox index={1} label="Activos" valor={resumen.activos} tone="border-emerald-200 bg-emerald-50 text-emerald-700" />
        <StatBox index={2} label="Suspendidos" valor={resumen.suspendidos} tone="border-line bg-white text-muted" />
        <StatBox index={3} label="Encargados" valor={resumen.encargados} tone="border-gold/30 bg-gold/10 text-[#7a6e0e]" />
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

  // Contraseña: acción propia, separada del guardado de contacto (distinto endpoint, distinto
  // feedback — no tiene sentido bloquear una por la otra).
  const [password, setPassword] = useState('');
  const [passError, setPassError] = useState('');
  const [passOk, setPassOk] = useState(false);
  const [passPending, startPassTransition] = useTransition();

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

  function guardarContrasena() {
    setPassError('');
    setPassOk(false);
    startPassTransition(async () => {
      const r = await accionEstablecerContrasena(emp.id, password);
      if (!r.ok) {
        setPassError(r.error ?? 'Error');
        return;
      }
      setPassword('');
      setPassOk(true);
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={emp.nombre}
      subtitle={rolInfo(emp.rol).label}
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-deep text-[11px] font-bold text-gold">
          {iniciales(emp)}
        </span>
      }
    >
      <ModalBody className="space-y-3">
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

        <div className="border-t border-line/60 pt-3">
          <label className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">
            <KeyRound className="h-3.5 w-3.5" strokeWidth={2} /> Asignar / reiniciar contraseña
          </label>
          <p className="mb-2 text-[11px] text-muted">
            Toma efecto cuando el login por usuario+contraseña esté activado. No afecta el código de 4 dígitos.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nueva contraseña"
              className={cn(fieldCls, 'flex-1')}
            />
            <button
              type="button"
              onClick={guardarContrasena}
              disabled={passPending || password.length < 4}
              className={cn(buttonVariants({ variant: 'outline' }), passPending && 'opacity-60')}
            >
              {passPending ? 'Guardando…' : 'Asignar'}
            </button>
          </div>
          {passOk && <p className="mt-1.5 text-xs font-medium text-emerald-700">Contraseña actualizada ✓</p>}
          {passError && <p className="mt-1.5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{passError}</p>}
        </div>
      </ModalBody>
      <ModalFooter>
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
      </ModalFooter>
    </Modal>
  );
}
