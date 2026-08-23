'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Info, UserCheck, UserX } from 'lucide-react';
import type { MatrizPermisos } from '@scilb/core';
import type { EmpleadoAdmin } from '../../../../lib/empleados-repo';
import type { Sede } from '../../../../lib/sedes-repo';
import type { RolDerivado } from '../../../../lib/roles-repo';
import {
  CamposPerfil,
  ContactoYSalarioCampos,
  OperaCajaToggle,
  ContrasenaForm,
  opcionesRol,
} from '../../../empleados/cliente';
import { accionEditarEmpleado, accionEstadoEmpleado } from '../../../empleados/actions';
import { Card, CardContent } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Aviso } from '../../../../components/ui/form';
import { DialogoConfirmar, useConfirmacion } from '../../../../components/ui/confirmar';
import { cn } from '../../../../lib/cn';

// La misma ficha de /empleados —CamposPerfil, OperaCajaToggle, ContactoYSalarioCampos,
// ContrasenaForm, las cuatro exportadas desde app/empleados/cliente.tsx—, montada para UNA
// persona en vez de para las 18 de la lista.
//
// EL TOGGLE DE ACTIVO/SUSPENDIDO NO SE EXTRAJO. Llama a la misma accionEstadoEmpleado y usa el
// mismo useConfirmacion()/DialogoConfirmar que la fila de /empleados, pero acá no vive dentro de
// una fila de tabla — sacarlo a una pieza compartida hubiera significado tocar también el
// renderizado de esa lista por una veintena de líneas de wiring, no de campos de formulario.
export function DatosCliente({
  emp,
  sedes,
  rolesDerivados,
  matrizPermisos,
}: {
  emp: EmpleadoAdmin;
  sedes: Sede[];
  rolesDerivados: RolDerivado[];
  matrizPermisos: MatrizPermisos;
}) {
  const router = useRouter();
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
  const [guardado, setGuardado] = useState(false);
  const [pending, startTransition] = useTransition();

  function guardar() {
    setError('');
    setGuardado(false);
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
      setGuardado(true);
      // A diferencia del override optimista de OperaCajaToggle, acá SÍ conviene refrescar: el
      // nombre y el rol que se acaban de guardar también se muestran en la cabecera del
      // expediente y en el selector de personas, un nivel arriba de esta pestaña.
      router.refresh();
    });
  }

  // Suspender / reactivar: misma acción y el mismo diálogo de confirmación que usa la fila de
  // /empleados, para esta única persona.
  const conf = useConfirmacion();
  const [errorEstado, setErrorEstado] = useState('');
  const [estadoPending, startEstadoTransition] = useTransition();

  function toggleEstado() {
    const verbo = emp.activo ? 'Suspender' : 'Reactivar';
    conf.pedir({
      titulo: `¿${verbo} a ${emp.nombre}?`,
      detalle: emp.activo
        ? 'Deja de poder entrar al sistema y sale de las listas de asignación. Su historial no se toca.'
        : 'Vuelve a poder entrar y a aparecer en las listas de asignación.',
      confirmarLabel: verbo,
      tono: emp.activo ? 'peligro' : 'aviso',
      alConfirmar: () =>
        startEstadoTransition(async () => {
          setErrorEstado('');
          const r = await accionEstadoEmpleado(emp.id, !emp.activo);
          if (!r.ok) setErrorEstado(r.error ?? `No se pudo ${verbo.toLowerCase()} a ${emp.nombre}.`);
          else {
            conf.cerrar();
            router.refresh();
          }
        }),
    });
  }

  return (
    <div className="space-y-3">
      <DialogoConfirmar {...conf.props} pending={estadoPending} />
      {errorEstado && <Aviso tono="error">{errorEstado}</Aviso>}

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                emp.activo ? 'bg-exito-soft text-exito-deep' : 'bg-ink/10 text-muted',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', emp.activo ? 'bg-exito' : 'bg-muted')} />
              {emp.activo ? 'Activo' : 'Suspendido'}
            </span>
            <button
              type="button"
              onClick={toggleEstado}
              disabled={estadoPending}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition',
                emp.activo
                  ? 'border-error-line text-error-deep hover:bg-error-soft'
                  : 'border-exito-line text-exito-deep hover:bg-exito-soft',
              )}
            >
              {emp.activo ? (
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

          <OperaCajaToggle
            rolValor={rolValor}
            opciones={opciones}
            matrizPermisos={matrizPermisos}
            nombrePersona={emp.nombre}
          />

          <ContactoYSalarioCampos
            telefono={telefono}
            setTelefono={setTelefono}
            dni={dni}
            setDni={setDni}
            direccion={direccion}
            setDireccion={setDireccion}
            salario={salario}
            setSalario={setSalario}
          />
          {error && (
            <Aviso tono="error" className="text-sm">
              {error}
            </Aviso>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            {guardado && !pending && (
              <span className="text-xs font-medium text-exito-deep">Cambios guardados ✓</span>
            )}
            <Button type="button" onClick={guardar} pending={pending}>
              {pending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>

          <ContrasenaForm empleadoId={emp.id} />
        </CardContent>
      </Card>
    </div>
  );
}
