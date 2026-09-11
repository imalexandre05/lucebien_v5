'use client';

import { useState, useTransition } from 'react';
import { KeyRound, Wallet } from 'lucide-react';
import { ROL_LABEL, ROLES_BASE, puede, type Rol, type MatrizPermisos } from '@scilb/core';
import type { RolDerivado } from '../../lib/roles-repo';
import type { Sede } from '../../lib/sedes-repo';
import { accionEstablecerContrasena, accionTogglePosCobro } from './actions';
import { Button } from '../../components/ui/button';
import { Aviso, campoCls } from '../../components/ui/form';
import { cn } from '../../lib/cn';

// Este archivo tenía la lista completa de /empleados (EmpleadosCliente) y sus dos modales
// (EditarModal para editar, CrearModal para el alta). Los tres quedaron sin ninguna pantalla que
// los montara desde que /empleados pasó a redirigir a /personal (R1) y se borraron acá (Tarea 6).
// Lo que queda son las piezas de formulario que SÍ se siguen usando, montadas una persona a la
// vez desde otros archivos — ver el comentario de OpcionRol más abajo.

const fieldCls = campoCls;

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
        'rounded-r-pastilla border px-3 py-1.5 text-apoyo font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'border-navy bg-navy text-paper' : 'border-line bg-white text-navy hover:border-gold/60',
      )}
    >
      {children}
    </button>
  );
}

// Opciones de rol combinadas: los 7 base + los roles derivados activos (Fase 1). Un rol derivado
// lleva su rol_base entre paréntesis porque ESE es el que manda para la RLS/alcance por sede.
//
// Exportado (con CamposPerfil, opcionesRol, OperaCajaToggle y ContrasenaForm): esta ficha se monta
// para UNA persona desde dos lugares — la pestaña Datos del expediente
// (app/personal/[id]/datos/cliente.tsx) para editar, y el alta encadenada
// (app/personal/nuevo/cliente.tsx) para crear — un formulario, dos lugares que lo montan.
export type OpcionRol = { valor: string; label: string; rolBase: Rol; rolCod: string | null };

export function opcionesRol(rolesDerivados: RolDerivado[]): OpcionRol[] {
  return [
    ...ROLES_BASE.map((r) => ({ valor: r, label: ROL_LABEL[r], rolBase: r, rolCod: null })),
    ...rolesDerivados
      .filter((r) => r.activo)
      .map((r) => ({ valor: r.cod, label: `${r.nombre} (${ROL_LABEL[r.rolBase]})`, rolBase: r.rolBase, rolCod: r.cod })),
  ];
}

// ── Campos compartidos entre Crear y Editar (identidad + rol + sedes + notas) ──────────────────
export function CamposPerfil({
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
        <label className="mb-1 block text-rotulo uppercase text-muted">Nombre completo</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={cn(fieldCls, 'w-full')} />
        <p className="mt-1 text-micro text-muted">Es también el usuario de login — debe ser único.</p>
      </div>

      <div>
        <label className="mb-1 block text-rotulo uppercase text-muted">Rol</label>
        <div className="flex flex-wrap gap-1.5">
          {opciones.map((o) => (
            <Pill key={o.valor} active={rolValor === o.valor} onClick={() => setRolValor(o.valor)}>
              {o.label}
            </Pill>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-rotulo uppercase text-muted">Sede primaria</label>
        <div className="flex flex-wrap gap-1.5">
          {sedes.map((s) => (
            <Pill key={s.cod} active={sedePrimaria === s.cod} onClick={() => elegirSedePrimaria(s.cod)}>
              {s.nombre} ({s.cod})
            </Pill>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-rotulo uppercase text-muted">Tiendas (acceso)</label>
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
        <p className="mt-1 text-micro text-muted">La sede primaria siempre queda incluida.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-rotulo uppercase text-muted">Fecha de ingreso</label>
          <input
            type="date"
            value={fechaIngreso}
            onChange={(e) => setFechaIngreso(e.target.value)}
            className={cn(fieldCls, 'w-full')}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-rotulo uppercase text-muted">Notas</label>
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

// ── Contacto (compartido, ver nota en OpcionRol arriba) ─────────────────────────────────────────
// Hasta R3/T7 esta pieza se llamaba ContactoYSalarioCampos y traía también el salario editable de
// la ficha. Salió (spec 2026-08-23-personal-fusion-design.md §2.5): el sueldo real lo paga el
// contrato (`sueldo_pactado`), nunca `empleados.salario_base` — editarlo acá no tenía ningún
// efecto en lo que cobraba la persona. La pestaña Datos ahora muestra el sueldo del contrato
// vigente en solo lectura (app/personal/[id]/datos/cliente.tsx); la columna sigue en la base para
// los consumidores congelados (ver docs/pendientes-negocio.md).
export function ContactoCampos({
  telefono,
  setTelefono,
  dni,
  setDni,
  direccion,
  setDireccion,
  recomendaciones,
  setRecomendaciones,
}: {
  telefono: string;
  setTelefono: (v: string) => void;
  dni: string;
  setDni: (v: string) => void;
  direccion: string;
  setDireccion: (v: string) => void;
  /** C-2: referencias/recomendaciones en texto libre — no existía ningún dato capturado antes de
      esto, así que es opcional a propósito (llamadores viejos de esta pieza no lo rompen). */
  recomendaciones?: string;
  setRecomendaciones?: (v: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-rotulo uppercase text-muted">Teléfono</label>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={cn(fieldCls, 'w-full')} />
        </div>
        <div>
          <label className="mb-1 block text-rotulo uppercase text-muted">DNI</label>
          <input value={dni} onChange={(e) => setDni(e.target.value)} className={cn(fieldCls, 'w-full')} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-rotulo uppercase text-muted">Dirección</label>
        <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={cn(fieldCls, 'w-full')} />
      </div>
      {setRecomendaciones && (
        <div>
          <label className="mb-1 block text-rotulo uppercase text-muted">Recomendaciones</label>
          <textarea
            value={recomendaciones ?? ''}
            onChange={(e) => setRecomendaciones(e.target.value)}
            rows={3}
            className={cn(fieldCls, 'w-full')}
          />
        </div>
      )}
    </>
  );
}

// "Opera caja" (Fase 10, punto 4): expone el permiso 'pos_cobro' del rol seleccionado en el picker
// de arriba como un toggle directo, en vez de mandar al admin hasta la matriz completa de
// /configuracion/permisos. Compartido (ver nota en OpcionRol arriba).
export function OperaCajaToggle({
  rolValor,
  opciones,
  matrizPermisos,
  nombrePersona,
}: {
  rolValor: string;
  opciones: OpcionRol[];
  matrizPermisos: MatrizPermisos;
  nombrePersona: string;
}) {
  const opcionRolActual = opciones.find((o) => o.valor === rolValor);
  const esAdminODueno = opcionRolActual?.rolBase === 'admin' || opcionRolActual?.rolBase === 'dueno';
  const [posCobroPending, startPosCobroTransition] = useTransition();
  const [posCobroError, setPosCobroError] = useState('');
  // Override optimista, keado por rol: NO se usa router.refresh() acá — quien monta este bloque
  // (el modal de /empleados o la pestaña Datos) puede vivir bajo un Suspense que lo desmontaría
  // a mitad de edición. El toggle ya confirmó server-side (accionTogglePosCobro esperó la
  // respuesta); reflejar el nuevo valor localmente es correcto y evita el parpadeo.
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

  if (esAdminODueno) {
    return (
      <p className="rounded-r-chico bg-navy/5 px-3 py-2 text-micro text-muted">
        Administrador/dueño siempre puede operar caja — no depende de este permiso.
      </p>
    );
  }

  return (
    <div className="rounded-r-chico border border-line bg-paper/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden />
          <div>
            <p className="text-cuerpo font-medium text-navy">Opera caja</p>
            <p className="text-micro text-muted">
              Permiso de cajero (<span className="tabular-nums">pos_cobro</span>) del rol{' '}
              <span className="font-medium">{opcionRolActual?.label}</span> — aplica a TODOS
              los colaboradores con este rol, no solo a {nombrePersona.split(' ')[0]}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={togglePosCobro}
          disabled={posCobroPending}
          aria-pressed={operaCaja}
          className={cn(
            'shrink-0 rounded-r-pastilla border px-3 py-1.5 text-apoyo font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            operaCaja ? 'border-exito bg-exito-soft text-exito-deep' : 'border-line bg-white text-muted hover:border-gold/60',
          )}
        >
          {posCobroPending ? 'Guardando…' : operaCaja ? 'Sí, opera caja' : 'No opera caja'}
        </button>
      </div>
      {posCobroError && <Aviso tono="error" className="mt-2">{posCobroError}</Aviso>}
    </div>
  );
}

// Cambiar la contraseña es una acción propia, separada del guardado de perfil (distinto endpoint,
// distinto feedback — no tiene sentido bloquear una por la otra). Compartido (ver nota arriba).
export function ContrasenaForm({ empleadoId }: { empleadoId: string }) {
  const [password, setPassword] = useState('');
  const [passError, setPassError] = useState('');
  const [passOk, setPassOk] = useState(false);
  const [passPending, startPassTransition] = useTransition();

  function guardarContrasena() {
    setPassError('');
    setPassOk(false);
    startPassTransition(async () => {
      const r = await accionEstablecerContrasena(empleadoId, password);
      if (!r.ok) {
        setPassError(r.error ?? 'Error');
        return;
      }
      setPassword('');
      setPassOk(true);
    });
  }

  return (
    <div className="border-t border-line/60 pt-3">
      <label className="mb-1 flex items-center gap-1.5 text-rotulo uppercase text-muted">
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
      {passOk && <p className="mt-1.5 text-apoyo font-medium text-exito-deep">Contraseña actualizada ✓</p>}
      {passError && <p className="mt-1.5 rounded-r-chico bg-error-soft px-3 py-2 text-cuerpo text-error-deep">{passError}</p>}
    </div>
  );
}
