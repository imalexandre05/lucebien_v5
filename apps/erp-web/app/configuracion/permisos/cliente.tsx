'use client';

import { useMemo, useState, useTransition } from 'react';
import { Check, Save } from 'lucide-react';
import type { MatrizPermisos, Rol } from '@scilb/core';
import { accionGuardarPermisos } from './actions';
import { Card, CardContent } from '../../../components/ui/card';
import { buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/cn';

// Roles editables (admin/dueno siempre ven todo por mecanismo, no tienen fila en la matriz).
const ROLES: { rol: Rol; label: string }[] = [
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
      { modulo: 'notificaciones', label: 'Notificaciones' },
      { modulo: 'pipeline', label: 'Pipeline' },
      { modulo: 'reportes', label: 'Reporte de Actividades' },
      { modulo: 'evaluar_reportes', label: 'Evaluar reportes' },
      { modulo: 'incidencias', label: 'Incidencias' },
      { modulo: 'asistencias', label: 'Asistencias' },
      { modulo: 'evaluaciones', label: 'Evaluaciones' },
      { modulo: 'pagos', label: 'Pagos' },
    ],
  },
  {
    seccion: 'Comercial',
    modulos: [
      { modulo: 'inventario', label: 'Inventario' },
      { modulo: 'clientes', label: 'Clientes' },
      { modulo: 'pedidos', label: 'Pedidos' },
      { modulo: 'caja', label: 'Caja' },
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

type Estado = Record<string, Record<string, boolean>>; // estado[rol][modulo] = ve

function desdeMatriz(m: MatrizPermisos): Estado {
  const e: Estado = {};
  for (const { rol } of ROLES) {
    e[rol] = {};
    for (const { modulos } of GRUPOS) {
      for (const { modulo } of modulos) {
        e[rol][modulo] = Boolean(m[rol]?.[modulo]?.includes('ver'));
      }
    }
  }
  return e;
}

export function PermisosCliente({ matrizInicial }: { matrizInicial: MatrizPermisos }) {
  const [estado, setEstado] = useState<Estado>(() => desdeMatriz(matrizInicial));
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const toggle = (rol: string, modulo: string) => {
    setGuardado(false);
    setEstado((p) => ({ ...p, [rol]: { ...p[rol], [modulo]: !p[rol][modulo] } }));
  };

  const totalActivos = useMemo(
    () => Object.values(estado).reduce((s, m) => s + Object.values(m).filter(Boolean).length, 0),
    [estado],
  );

  function guardar() {
    setError('');
    setGuardado(false);
    const filas: { rol: Rol; modulo: string; acciones: ('ver' | 'crear' | 'editar' | 'eliminar')[] }[] = [];
    for (const { rol } of ROLES) {
      for (const { modulos } of GRUPOS) {
        for (const { modulo } of modulos) {
          if (estado[rol][modulo]) filas.push({ rol, modulo, acciones: ['ver'] });
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
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <p className="text-sm text-muted">
            Clic en cada celda para mostrar/ocultar ese módulo en el menú de ese rol.{' '}
            <span className="font-mono text-xs">{totalActivos}</span> activados.
          </p>
          <div className="ml-auto flex items-center gap-3">
            {guardado && <span className="text-xs font-medium text-emerald-700">Guardado ✓</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button
              type="button"
              onClick={guardar}
              disabled={pending}
              className={cn(buttonVariants({ variant: 'primary' }), pending && 'opacity-60')}
            >
              <Save className="h-4 w-4" strokeWidth={2} />
              {pending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </CardContent>
      </Card>

      {GRUPOS.map((grupo) => (
        <Card key={grupo.seccion}>
          <CardContent className="overflow-x-auto px-0 pb-0 pt-0">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-paper/60">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {grupo.seccion}
                  </th>
                  {ROLES.map(({ rol, label }) => (
                    <th key={rol} className="px-2 py-2.5 text-center text-[11px] font-semibold text-navy">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grupo.modulos.map(({ modulo, label }) => (
                  <tr key={modulo} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2 text-navy">{label}</td>
                    {ROLES.map(({ rol }) => {
                      const on = estado[rol]?.[modulo] ?? false;
                      return (
                        <td key={rol} className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggle(rol, modulo)}
                            aria-pressed={on}
                            aria-label={`${label} — ${rol}`}
                            className={cn(
                              'inline-flex h-7 w-7 items-center justify-center rounded-md border-2 transition-colors duration-150 active:scale-95',
                              on ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-line bg-white text-transparent hover:border-gold/50',
                            )}
                          >
                            <Check className="h-4 w-4" strokeWidth={3} />
                          </button>
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
