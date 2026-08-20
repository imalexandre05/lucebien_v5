'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, Pencil, UserX, UserCheck, KeyRound, Plus, Info, Wallet } from 'lucide-react';
import { ROL_LABEL, ROLES_BASE, puede, type Rol, type MatrizPermisos } from '@scilb/core';
import type { EmpleadoAdmin } from '../../lib/empleados-repo';
import type { RolDerivado } from '../../lib/roles-repo';
import type { Sede } from '../../lib/sedes-repo';
import { accionEstadoEmpleado, accionEditarEmpleado, accionEstablecerContrasena, accionCrearEmpleado, accionTogglePosCobro } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Button, buttonVariants } from '../../components/ui/button';
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { StatBox } from '../../components/ui/stat-box';
import { Aviso } from '../../components/ui/form';
import { cn } from '../../lib/cn';

const ROL: Record<string, { label: string; cls: string }> = {
  admin: { label: 'Administrador', cls: 'bg-gold/20 text-gold-deep' },
  dueno: { label: 'Dueño/a', cls: 'bg-gold/20 text-gold-deep' },
  encargado_tienda: { label: 'Encargado Tienda', cls: 'bg-exito/10 text-exito-deep' },
  encargado_almacen: { label: 'Enc. Almacén', cls: 'bg-exito/10 text-exito-deep' },
  confeccionista: { label: 'Confeccionista', cls: 'bg-violet-50 text-violet-700' },
  ventas_junior: { label: 'Ventas Jr.', cls: 'bg-sky-50 text-sky-700' },
  ventas_junior_2: { label: 'Ventas Jr. 2', cls: 'bg-sky-50 text-sky-700' },
};

const OPC_FILTRO_ESTADO: Opcion[] = [
  { value: '', label: 'Todos' },
  { value: 'activo', label: 'Activos' },
  { value: 'suspendido', label: 'Suspendidos' },
];
const rolInfo = (r: string) => ROL[r] ?? { label: r.replace(/_/g, ' '), cls: 'bg-ink/10 text-muted' };

const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

function iniciales(e: { nombre: string; iniciales: string | null }): string {
  if (e.iniciales) return e.iniciales.slice(0, 2).toUpperCase();
  const p = e.nombre.trim().split(/\s+/).filter(Boolean);
  return (p.map((w) => w[0]).slice(0, 2).join('') || '·').toUpperCase();
}

// Botón tipo pill (patrón "botones > selects" del sistema de diseño): activo = navy sólido.
function Pill({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'border-navy bg-navy text-paper' : 'border-line bg-white text-navy hover:border-gold/60',
      )}
    >
      {children}
    </button>
  );
}

// Opciones de rol combinadas: los 7 base + los roles derivados activos (Fase 1). Un rol derivado
// lleva su rol_base entre paréntesis porque ESE es el que manda para la RLS/alcance por sede.
type OpcionRol = { valor: string; label: string; rolBase: Rol; rolCod: string | null };

function opcionesRol(rolesDerivados: RolDerivado[]): OpcionRol[] {
  return [
    ...ROLES_BASE.map((r) => ({ valor: r, label: ROL_LABEL[r], rolBase: r, rolCod: null })),
    ...rolesDerivados
      .filter((r) => r.activo)
      .map((r) => ({ valor: r.cod, label: `${r.nombre} (${ROL_LABEL[r.rolBase]})`, rolBase: r.rolBase, rolCod: r.cod })),
  ];
}

export function EmpleadosCliente({
  empleados,
  sedes,
  rolesDerivados,
  matrizPermisos,
}: {
  empleados: EmpleadoAdmin[];
  sedes: Sede[];
  rolesDerivados: RolDerivado[];
  matrizPermisos: MatrizPermisos;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [fRol, setFRol] = useState('');
  const [fSede, setFSede] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [editar, setEditar] = useState<EmpleadoAdmin | null>(null);
  const [crear, setCrear] = useState(false);
  const [pending, startTransition] = useTransition();

  const roles = useMemo(() => [...new Set(empleados.map((e) => e.rol))].sort(), [empleados]);
  const sedesFiltro = useMemo(() => [...new Set(empleados.flatMap((e) => e.tiendas))].sort(), [empleados]);

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
        <StatBox index={0} label="Colaboradores" valor={resumen.total} tone="navy" />
        <StatBox index={1} label="Activos" valor={resumen.activos} tone="exito" />
        <StatBox index={2} label="Suspendidos" valor={resumen.suspendidos} tone="neutro" />
        <StatBox index={3} label="Encargados" valor={resumen.encargados} tone="gold" />
      </div>

      {/* Filtros + nuevo colaborador */}
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
            {sedesFiltro.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <OpcionBotones opciones={OPC_FILTRO_ESTADO} value={fEstado} onChange={setFEstado} ariaLabel="Estado" />
          <span className="font-mono text-xs text-muted tabular-nums">{filtrados.length} colaboradores</span>
          <button type="button" onClick={() => setCrear(true)} className={cn(buttonVariants({ variant: 'gold' }), 'ml-auto')}>
            <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo colaborador
          </button>
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
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', rol.cls)}>
                          {rol.label}
                          {e.rolCod && <span className="ml-1 opacity-70">· {e.rolCod}</span>}
                        </span>
                        {puede(matrizPermisos, e.rol as Rol, 'pos_cobro', 'ver', e.rolCod) && (
                          <span
                            title="Este rol tiene el permiso de cajero (opera caja)"
                            className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-medium text-gold-deep"
                          >
                            <Wallet className="h-3 w-3" strokeWidth={2} /> Opera caja
                          </span>
                        )}
                      </div>
                    </TD>
                    <TD>
                      {e.activo ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-exito-deep">
                          <span className="h-1.5 w-1.5 rounded-full bg-exito" /> Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted" /> Suspendido
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
                              ? 'border-error-line text-error-deep hover:bg-error-soft'
                              : 'border-exito-line text-exito-deep hover:bg-exito-soft',
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
          sedes={sedes}
          rolesDerivados={rolesDerivados}
          matrizPermisos={matrizPermisos}
          onClose={() => setEditar(null)}
          onSaved={() => {
            setEditar(null);
            router.refresh();
          }}
        />
      )}
      {crear && (
        <CrearModal
          sedes={sedes}
          rolesDerivados={rolesDerivados}
          onClose={() => setCrear(false)}
          onCreado={() => {
            setCrear(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Campos compartidos entre Crear y Editar (identidad + rol + sedes + notas) ──────────────────
function CamposPerfil({
  nombre,
  setNombre,
  rolValor,
  setRolValor,
  sedePrimaria,
  setSedePrimaria,
  tiendas,
  setTiendas,
  fechaIngreso,
  setFechaIngreso,
  notas,
  setNotas,
  sedes,
  opciones,
}: {
  nombre: string;
  setNombre: (v: string) => void;
  rolValor: string;
  setRolValor: (v: string) => void;
  sedePrimaria: string;
  setSedePrimaria: (v: string) => void;
  tiendas: string[];
  setTiendas: (v: string[]) => void;
  fechaIngreso: string;
  setFechaIngreso: (v: string) => void;
  notas: string;
  setNotas: (v: string) => void;
  sedes: Sede[];
  opciones: OpcionRol[];
}) {
  function toggleTienda(cod: string) {
    setTiendas(tiendas.includes(cod) ? tiendas.filter((t) => t !== cod) : [...tiendas, cod]);
  }
  function elegirSedePrimaria(cod: string) {
    setSedePrimaria(cod);
    if (!tiendas.includes(cod)) setTiendas([...tiendas, cod]);
  }

  return (
    <>
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Nombre completo</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={cn(fieldCls, 'w-full')} />
        <p className="mt-1 text-[11px] text-muted">Es también el usuario de login — debe ser único.</p>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Rol</label>
        <div className="flex flex-wrap gap-1.5">
          {opciones.map((o) => (
            <Pill key={o.valor} active={rolValor === o.valor} onClick={() => setRolValor(o.valor)}>
              {o.label}
            </Pill>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Sede primaria</label>
        <div className="flex flex-wrap gap-1.5">
          {sedes.map((s) => (
            <Pill key={s.cod} active={sedePrimaria === s.cod} onClick={() => elegirSedePrimaria(s.cod)}>
              {s.nombre} ({s.cod})
            </Pill>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tiendas (acceso)</label>
        <div className="flex flex-wrap gap-1.5">
          {sedes.map((s) => (
            <Pill
              key={s.cod}
              active={tiendas.includes(s.cod)}
              onClick={() => toggleTienda(s.cod)}
              disabled={s.cod === sedePrimaria}
            >
              {s.cod}
            </Pill>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted">La sede primaria siempre queda incluida.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Fecha de ingreso</label>
          <input
            type="date"
            value={fechaIngreso}
            onChange={(e) => setFechaIngreso(e.target.value)}
            className={cn(fieldCls, 'w-full')}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Notas</label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className={cn(fieldCls, 'w-full resize-none')}
        />
      </div>
    </>
  );
}

function EditarModal({
  emp,
  sedes,
  rolesDerivados,
  matrizPermisos,
  onClose,
  onSaved,
}: {
  emp: EmpleadoAdmin;
  sedes: Sede[];
  rolesDerivados: RolDerivado[];
  matrizPermisos: MatrizPermisos;
  onClose: () => void;
  onSaved: () => void;
}) {
  const opciones = useMemo(() => opcionesRol(rolesDerivados), [rolesDerivados]);
  const [nombre, setNombre] = useState(emp.nombre);
  const [rolValor, setRolValor] = useState(emp.rolCod ?? emp.rol);
  const [sedePrimaria, setSedePrimaria] = useState(emp.sedeCod ?? '');
  const [tiendas, setTiendas] = useState<string[]>(emp.tiendas);
  const [fechaIngreso, setFechaIngreso] = useState(emp.fechaIngreso ?? '');
  const [notas, setNotas] = useState(emp.notas ?? '');
  const [telefono, setTelefono] = useState(emp.telefono ?? '');
  const [dni, setDni] = useState(emp.dni ?? '');
  const [direccion, setDireccion] = useState(emp.direccion ?? '');
  const [salario, setSalario] = useState(emp.salarioBase);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  // "Opera caja" (Fase 10, punto 4): refleja el permiso 'pos_cobro' del ROL seleccionado ahora
  // mismo en el picker de arriba (no necesariamente el rol original del empleado, si el admin lo
  // está cambiando en el mismo modal). admin/dueno quedan fuera: puede() los deja pasar siempre,
  // sin importar la matriz — togglear no tendría ningún efecto.
  const opcionRolActual = opciones.find((o) => o.valor === rolValor);
  const esAdminODueno = opcionRolActual?.rolBase === 'admin' || opcionRolActual?.rolBase === 'dueno';
  const [posCobroPending, startPosCobroTransition] = useTransition();
  const [posCobroError, setPosCobroError] = useState('');
  // Override optimista, keado por rol: NO se usa router.refresh() acá — /empleados tiene
  // loading.tsx (Fase 3), y refresh() dispara su fallback de Suspense, que desmonta la página
  // (y con ella este modal, perdiendo `editar`) mientras recarga. El toggle ya confirmó server-
  // side (accionTogglePosCobro esperó la respuesta); reflejar el nuevo valor localmente es
  // correcto y evita el parpadeo — la próxima carga normal de /empleados ya viene con
  // `revalidatePath` aplicado.
  const [posCobroOverride, setPosCobroOverride] = useState<{ rol: string; valor: boolean } | null>(null);
  const operaCajaBase = opcionRolActual
    ? puede(matrizPermisos, opcionRolActual.rolBase, 'pos_cobro', 'ver', opcionRolActual.rolCod)
    : false;
  const operaCaja = posCobroOverride && posCobroOverride.rol === rolValor ? posCobroOverride.valor : operaCajaBase;

  function togglePosCobro() {
    if (!opcionRolActual) return;
    setPosCobroError('');
    const rolAlTogglear = rolValor;
    const nuevoValor = !operaCaja;
    startPosCobroTransition(async () => {
      const r = await accionTogglePosCobro(rolAlTogglear, nuevoValor);
      if (!r.ok) {
        setPosCobroError(r.error ?? 'Error');
        return;
      }
      setPosCobroOverride({ rol: rolAlTogglear, valor: nuevoValor });
    });
  }

  // Contraseña: acción propia, separada del guardado de perfil (distinto endpoint, distinto
  // feedback — no tiene sentido bloquear una por la otra).
  const [password, setPassword] = useState('');
  const [passError, setPassError] = useState('');
  const [passOk, setPassOk] = useState(false);
  const [passPending, startPassTransition] = useTransition();

  function guardar() {
    setError('');
    if (!sedePrimaria) {
      setError('Elige una sede primaria');
      return;
    }
    const opcion = opciones.find((o) => o.valor === rolValor);
    if (!opcion) {
      setError('Elige un rol');
      return;
    }
    startTransition(async () => {
      const r = await accionEditarEmpleado(emp.id, {
        nombre,
        rolBase: opcion.rolBase,
        rolCod: opcion.rolCod,
        sedeCod: sedePrimaria,
        tiendas,
        fechaIngreso: fechaIngreso || null,
        notas,
        telefono,
        dni,
        direccion,
        salarioBase: salario,
      });
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
      <ModalBody className="max-h-[70vh] space-y-3 overflow-y-auto">
        <p className="flex items-start gap-1.5 rounded-md bg-navy/5 px-3 py-2 text-[11px] text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          El código de acceso (4 dígitos) es fijo y no se muestra ni se edita aquí — es la
          credencial interna de Supabase Auth. El login usa nombre + contraseña.
        </p>

        <CamposPerfil
          nombre={nombre}
          setNombre={setNombre}
          rolValor={rolValor}
          setRolValor={setRolValor}
          sedePrimaria={sedePrimaria}
          setSedePrimaria={setSedePrimaria}
          tiendas={tiendas}
          setTiendas={setTiendas}
          fechaIngreso={fechaIngreso}
          setFechaIngreso={setFechaIngreso}
          notas={notas}
          setNotas={setNotas}
          sedes={sedes}
          opciones={opciones}
        />

        {/* "Opera caja" (Fase 10, punto 4): expone el permiso 'pos_cobro' del rol seleccionado
            arriba como un toggle directo, en vez de mandar al admin hasta la matriz completa de
            /configuracion/permisos. */}
        {!esAdminODueno && (
          <div className="rounded-md border border-line bg-paper/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden />
                <div>
                  <p className="text-sm font-medium text-navy">Opera caja</p>
                  <p className="text-[11px] text-muted">
                    Permiso de cajero (<span className="font-mono">pos_cobro</span>) del rol{' '}
                    <span className="font-medium">{opcionRolActual?.label}</span> — aplica a TODOS
                    los colaboradores con este rol, no solo a {emp.nombre.split(' ')[0]}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={togglePosCobro}
                disabled={posCobroPending}
                aria-pressed={operaCaja}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  operaCaja ? 'border-exito bg-exito-soft text-exito-deep' : 'border-line bg-white text-muted hover:border-gold/60',
                )}
              >
                {posCobroPending ? 'Guardando…' : operaCaja ? 'Sí, opera caja' : 'No opera caja'}
              </button>
            </div>
            {posCobroError && <Aviso tono="error" className="mt-2">{posCobroError}</Aviso>}
          </div>
        )}
        {esAdminODueno && (
          <p className="rounded-md bg-navy/5 px-3 py-2 text-[11px] text-muted">
            Administrador/dueño siempre puede operar caja — no depende de este permiso.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Teléfono</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={cn(fieldCls, 'w-full')} />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">DNI</label>
            <input value={dni} onChange={(e) => setDni(e.target.value)} className={cn(fieldCls, 'w-full')} />
          </div>
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
        {error && <Aviso tono="error" className="text-sm">{error}</Aviso>}

        <div className="border-t border-line/60 pt-3">
          <label className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">
            <KeyRound className="h-3.5 w-3.5" strokeWidth={2} /> Asignar / reiniciar contraseña
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nueva contraseña"
              className={cn(fieldCls, 'flex-1')}
            />
            <Button
              type="button"
              variant="outline"
              onClick={guardarContrasena}
              disabled={password.length < 4}
              pending={passPending}
            >
              {passPending ? 'Guardando…' : 'Asignar'}
            </Button>
          </div>
          {passOk && <p className="mt-1.5 text-xs font-medium text-exito-deep">Contraseña actualizada ✓</p>}
          {passError && <p className="mt-1.5 rounded-md bg-error-soft px-3 py-2 text-sm text-error-deep">{passError}</p>}
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={buttonVariants({ variant: 'outline' })}>
          Cancelar
        </button>
        <Button type="button" onClick={guardar} pending={pending}>
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function CrearModal({
  sedes,
  rolesDerivados,
  onClose,
  onCreado,
}: {
  sedes: Sede[];
  rolesDerivados: RolDerivado[];
  onClose: () => void;
  onCreado: () => void;
}) {
  const opciones = useMemo(() => opcionesRol(rolesDerivados), [rolesDerivados]);
  const [nombre, setNombre] = useState('');
  const [rolValor, setRolValor] = useState<string>('ventas_junior');
  const [sedePrimaria, setSedePrimaria] = useState(sedes[0]?.cod ?? '');
  const [tiendas, setTiendas] = useState<string[]>(sedes[0] ? [sedes[0].cod] : []);
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [notas, setNotas] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cod, setCod] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function crear() {
    setError('');
    if (!nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!sedePrimaria) {
      setError('Elige una sede primaria');
      return;
    }
    if (password.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres');
      return;
    }
    const opcion = opciones.find((o) => o.valor === rolValor);
    if (!opcion) {
      setError('Elige un rol');
      return;
    }
    startTransition(async () => {
      const r = await accionCrearEmpleado({
        nombre,
        rolBase: opcion.rolBase,
        rolCod: opcion.rolCod,
        sedeCod: sedePrimaria,
        tiendas,
        fechaIngreso: fechaIngreso || null,
        notas,
        password,
      });
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setCod(r.cod ?? null);
    });
  }

  // Tras crear, se muestra el código interno una sola vez (referencia de soporte; el login del
  // día a día es nombre + contraseña, no requiere que el empleado lo sepa).
  if (cod) {
    return (
      <Modal open onClose={onCreado} size="sm" title="Colaborador creado">
        <ModalBody className="space-y-2 text-center">
          <p className="text-sm text-navy">
            <strong>{nombre}</strong> ya puede iniciar sesión con su nombre y la contraseña asignada.
          </p>
          <p className="text-xs text-muted">
            Código interno (soporte): <span className="font-mono text-navy">{cod}</span>
          </p>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={onCreado} className={buttonVariants({ variant: 'primary' })}>
            Listo
          </button>
        </ModalFooter>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} size="md" title="Nuevo colaborador" subtitle="Crea el acceso y el perfil en un solo paso">
      <ModalBody className="max-h-[70vh] space-y-3 overflow-y-auto">
        <CamposPerfil
          nombre={nombre}
          setNombre={setNombre}
          rolValor={rolValor}
          setRolValor={setRolValor}
          sedePrimaria={sedePrimaria}
          setSedePrimaria={setSedePrimaria}
          tiendas={tiendas}
          setTiendas={setTiendas}
          fechaIngreso={fechaIngreso}
          setFechaIngreso={setFechaIngreso}
          notas={notas}
          setNotas={setNotas}
          sedes={sedes}
          opciones={opciones}
        />
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Contraseña inicial</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 4 caracteres"
            className={cn(fieldCls, 'w-full')}
          />
        </div>
        {error && <Aviso tono="error" className="text-sm">{error}</Aviso>}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={buttonVariants({ variant: 'outline' })}>
          Cancelar
        </button>
        <Button type="button" onClick={crear} pending={pending}>
          {pending ? 'Creando…' : 'Crear colaborador'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
