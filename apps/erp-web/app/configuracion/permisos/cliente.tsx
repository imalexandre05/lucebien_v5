'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Plus, Shield } from 'lucide-react';
import type { MatrizPermisos, Rol, Accion } from '@scilb/core';
import type { RolDerivado } from '../../../lib/roles-repo';
import { accionGuardarPermisos, accionCrearRol, accionActualizarRol } from './actions';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button, buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/cn';

// Roles base editables (admin/dueno siempre ven todo por mecanismo, no tienen fila en la matriz
// ni tiene sentido derivar un rol nuevo desde ellos — puede() los deja pasar ANTES de mirar
// rolCod, así que cualquier restricción de un rol derivado "admin" nunca se aplicaría).
const ROLES_EDITABLES: { rol: Rol; label: string }[] = [
  { rol: 'encargado_tienda', label: 'Encargado Tienda' },
  { rol: 'encargado_almacen', label: 'Enc. Almacén' },
  { rol: 'confeccionista', label: 'Confeccionista' },
  { rol: 'ventas_junior', label: 'Ventas Jr.' },
  { rol: 'ventas_junior_2', label: 'Ventas Jr. 2' },
];

// Mismos módulos que la sidebar (components/shell/sidebar.tsx), agrupados igual para reconocerlos.
const GRUPOS: { seccion: string; modulos: { modulo: string; label: string }[] }[] = [
  {
    seccion: 'Interno',
    modulos: [
      { modulo: 'dashboard', label: 'Dashboard' },
      { modulo: 'pipeline', label: 'Pipeline' },
      { modulo: 'reportes', label: 'Reporte de Actividades' },
      { modulo: 'reportes_admin', label: 'Reportes: historial y seguimiento' },
      { modulo: 'evaluar_reportes', label: 'Evaluar reportes' },
      { modulo: 'valores', label: 'Valores 360° (evaluar compañeros)' },
      { modulo: 'incidencias', label: 'Incidencias' },
      { modulo: 'asistencias', label: 'Asistencias' },
      { modulo: 'evaluaciones', label: 'Evaluaciones' },
      { modulo: 'pagos', label: 'Pagos' },
      { modulo: 'sueldos', label: 'Contratos de sueldo' },
    ],
  },
  {
    seccion: 'POS',
    modulos: [
      { modulo: 'pedidos', label: 'Pedidos' },
      { modulo: 'caja', label: 'Caja (ver)' },
      { modulo: 'pos_cobro', label: 'Caja: cobrar (cajero)' },
    ],
  },
  {
    seccion: 'Comercial',
    modulos: [
      { modulo: 'inventario', label: 'Inventario' },
      { modulo: 'clientes', label: 'Clientes' },
      { modulo: 'finanzas', label: 'Finanzas' },
      { modulo: 'estadisticas', label: 'Estadísticas' },
    ],
  },
  {
    seccion: 'Abastecimiento',
    modulos: [
      { modulo: 'proveedores', label: 'Proveedores' },
      { modulo: 'materiales', label: 'Materiales' },
      { modulo: 'compras', label: 'Compras' },
    ],
  },
];

const ACCIONES: { accion: Accion; letra: string; titulo: string }[] = [
  { accion: 'ver', letra: 'V', titulo: 'Ver' },
  { accion: 'crear', letra: 'C', titulo: 'Crear' },
  { accion: 'editar', letra: 'E', titulo: 'Editar' },
  { accion: 'eliminar', letra: 'D', titulo: 'Eliminar' },
];

type Estado = Record<string, Record<string, Accion[]>>; // estado[rolKey][modulo] = acciones activas

function estadoInicial(m: MatrizPermisos, columnas: string[]): Estado {
  const e: Estado = {};
  for (const rolKey of columnas) {
    e[rolKey] = {};
    for (const { modulos } of GRUPOS) {
      for (const { modulo } of modulos) {
        e[rolKey][modulo] = [...(m[rolKey]?.[modulo] ?? [])];
      }
    }
  }
  return e;
}

export function PermisosCliente({
  matrizInicial,
  rolesDerivadosIniciales,
}: {
  matrizInicial: MatrizPermisos;
  rolesDerivadosIniciales: RolDerivado[];
}) {
  const router = useRouter();
  const columnas = useMemo(
    () => [...ROLES_EDITABLES.map((r) => r.rol as string), ...rolesDerivadosIniciales.filter((r) => r.activo).map((r) => r.cod)],
    [rolesDerivadosIniciales],
  );
  const [estado, setEstado] = useState<Estado>(() => estadoInicial(matrizInicial, columnas));
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const labelColumna = (rolKey: string): string => {
    const base = ROLES_EDITABLES.find((r) => r.rol === rolKey);
    if (base) return base.label;
    const derivado = rolesDerivadosIniciales.find((r) => r.cod === rolKey);
    return derivado ? derivado.nombre : rolKey;
  };

  const toggle = (rolKey: string, modulo: string, accion: Accion) => {
    setGuardado(false);
    setEstado((prev) => {
      const actuales = prev[rolKey]?.[modulo] ?? [];
      const siguientes = actuales.includes(accion) ? actuales.filter((a) => a !== accion) : [...actuales, accion];
      return { ...prev, [rolKey]: { ...prev[rolKey], [modulo]: siguientes } };
    });
  };

  const totalActivos = useMemo(
    () => Object.values(estado).reduce((s, m) => s + Object.values(m).reduce((s2, arr) => s2 + arr.length, 0), 0),
    [estado],
  );

  function guardar() {
    setError('');
    setGuardado(false);
    const filas: { rol: string; modulo: string; acciones: Accion[] }[] = [];
    for (const rolKey of columnas) {
      for (const { modulos } of GRUPOS) {
        for (const { modulo } of modulos) {
          filas.push({ rol: rolKey, modulo, acciones: estado[rolKey]?.[modulo] ?? [] });
        }
      }
    }
    startTransition(async () => {
      const r = await accionGuardarPermisos(filas);
      if (!r.ok) {
        setError(r.error ?? 'Error al guardar');
        return;
      }
      setGuardado(true);
    });
  }

  return (
    <div className="space-y-4">
      <RolesDerivados roles={rolesDerivadosIniciales} onCambio={() => router.refresh()} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <p className="text-sm text-muted">
            Clic en cada letra para activar/desactivar esa acción. <span className="font-mono text-xs">V</span> ver ·{' '}
            <span className="font-mono text-xs">C</span> crear · <span className="font-mono text-xs">E</span> editar ·{' '}
            <span className="font-mono text-xs">D</span> eliminar ·{' '}
            <span className="font-mono text-xs">{totalActivos}</span> activadas.
          </p>
          <div className="ml-auto flex items-center gap-3">
            {guardado && <span className="text-xs font-medium text-emerald-700">Guardado ✓</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
            <Button type="button" onClick={guardar} pending={pending}>
              {!pending && <Save className="h-4 w-4" strokeWidth={2} />}
              {pending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {GRUPOS.map((grupo) => (
        <Card key={grupo.seccion}>
          <CardContent className="overflow-x-auto px-0 pb-0 pt-0">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-paper/60">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {grupo.seccion}
                  </th>
                  {columnas.map((rolKey) => (
                    <th key={rolKey} className="px-2 py-2.5 text-center text-[11px] font-semibold text-navy">
                      {labelColumna(rolKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grupo.modulos.map(({ modulo, label }) => (
                  <tr key={modulo} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2 text-navy">{label}</td>
                    {columnas.map((rolKey) => {
                      const activas = estado[rolKey]?.[modulo] ?? [];
                      return (
                        <td key={rolKey} className="px-2 py-2">
                          <div className="flex items-center justify-center gap-0.5">
                            {ACCIONES.map(({ accion, letra, titulo }) => {
                              const on = activas.includes(accion);
                              return (
                                <button
                                  key={accion}
                                  type="button"
                                  onClick={() => toggle(rolKey, modulo, accion)}
                                  aria-pressed={on}
                                  title={`${titulo} — ${label} — ${labelColumna(rolKey)}`}
                                  className={cn(
                                    'flex h-6 w-6 items-center justify-center rounded border text-[10px] font-bold transition-colors duration-150 active:scale-95',
                                    on
                                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                      : 'border-line bg-white text-muted/50 hover:border-gold/50',
                                  )}
                                >
                                  {letra}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Roles derivados (Fase 1): el admin crea un rol propio a partir de uno de los 5 base
// "restringibles" (admin/dueno quedan fuera — bypasean la matriz por mecanismo, derivar de ellos
// no tendría efecto). El rol derivado aparece como columna extra en la matriz de arriba.
function RolesDerivados({ roles, onCambio }: { roles: RolDerivado[]; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [rolBase, setRolBase] = useState<Rol>('ventas_junior');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function crear() {
    setError('');
    if (!nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    startTransition(async () => {
      const r = await accionCrearRol(nombre, rolBase);
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setNombre('');
      setAbierto(false);
      onCambio();
    });
  }

  function toggleActivo(rol: RolDerivado) {
    startTransition(async () => {
      await accionActualizarRol(rol.cod, { nombre: rol.nombre, activo: !rol.activo });
      onCambio();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Roles derivados
        </CardTitle>
        <button type="button" onClick={() => setAbierto((v) => !v)} className={buttonVariants({ variant: 'outline' })}>
          <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo rol
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted">
          Un rol derivado hereda la seguridad de un rol base (mismas sedes, mismo alcance) pero
          puede tener su propia fila en la matriz de abajo — así se le suma o quita acceso a
          módulos concretos sin tocar al resto del rol base.
        </p>

        {roles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <button
                key={r.cod}
                type="button"
                onClick={() => toggleActivo(r)}
                disabled={pending}
                title={`Basado en ${r.rolBase} · clic para ${r.activo ? 'desactivar' : 'activar'}`}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  r.activo ? 'border-navy bg-navy/5 text-navy' : 'border-line bg-white text-muted line-through',
                )}
              >
                {r.nombre}
              </button>
            ))}
          </div>
        )}

        {abierto && (
          <div className="space-y-3 rounded-md border border-line bg-paper/40 p-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Nombre del rol</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Vendedor Senior"
                className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Basado en</label>
              <div className="flex flex-wrap gap-1.5">
                {ROLES_EDITABLES.map((r) => (
                  <button
                    key={r.rol}
                    type="button"
                    onClick={() => setRolBase(r.rol)}
                    aria-pressed={rolBase === r.rol}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      rolBase === r.rol ? 'border-navy bg-navy text-paper' : 'border-line bg-white text-navy hover:border-gold/60',
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} className={buttonVariants({ variant: 'outline' })}>
                Cancelar
              </button>
              <Button type="button" onClick={crear} pending={pending}>
                {pending ? 'Creando…' : 'Crear rol'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
