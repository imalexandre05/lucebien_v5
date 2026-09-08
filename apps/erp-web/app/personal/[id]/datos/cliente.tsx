'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Info, UserCheck, UserX, Wallet, Paperclip, Trash2, ExternalLink, Upload } from 'lucide-react';
import type { MatrizPermisos } from '@scilb/core';
import type { EmpleadoAdmin } from '../../../../lib/empleados-repo';
import type { Sede } from '../../../../lib/sedes-repo';
import type { RolDerivado } from '../../../../lib/roles-repo';
import type { DocumentoEmpleado } from '../../../../lib/documentos-repo';
import { rutaSeccion } from '../../../../lib/colaboradores-secciones';
import {
  CamposPerfil,
  ContactoCampos,
  OperaCajaToggle,
  ContrasenaForm,
  opcionesRol,
} from '../../../empleados/cliente';
import {
  accionEditarEmpleado,
  accionEstadoEmpleado,
  accionSubirDocumento,
  accionEliminarDocumento,
  accionUrlDocumento,
} from '../../../empleados/actions';
import { Card, CardContent } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Aviso } from '../../../../components/ui/form';
import { DialogoConfirmar, useConfirmacion } from '../../../../components/ui/confirmar';
import { cn } from '../../../../lib/cn';

// La misma ficha de /empleados —CamposPerfil, OperaCajaToggle, ContactoCampos, ContrasenaForm,
// las cuatro exportadas desde app/empleados/cliente.tsx—, montada para UNA persona en vez de para
// las 18 de la lista.
//
// EL TOGGLE DE ACTIVO/SUSPENDIDO NO SE EXTRAJO. Llama a la misma accionEstadoEmpleado y usa el
// mismo useConfirmacion()/DialogoConfirmar que la fila de /empleados, pero acá no vive dentro de
// una fila de tabla — sacarlo a una pieza compartida hubiera significado tocar también el
// renderizado de esa lista por una veintena de líneas de wiring, no de campos de formulario.
const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DatosCliente({
  emp,
  sedes,
  rolesDerivados,
  matrizPermisos,
  sueldoVigente,
  documentosIniciales,
}: {
  emp: EmpleadoAdmin;
  sedes: Sede[];
  rolesDerivados: RolDerivado[];
  matrizPermisos: MatrizPermisos;
  /** `sueldoPactado` del contrato vigente de esta persona, o null si no tiene (R3/T7, spec §2.5). */
  sueldoVigente: number | null;
  /** C-3 (migración 0105): DNI, CV, imágenes. Sólo admin/dueño — esta pantalla entera ya lo es. */
  documentosIniciales: DocumentoEmpleado[];
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
  const [recomendaciones, setRecomendaciones] = useState(emp.recomendaciones ?? '');
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
        recomendaciones,
        // El sueldo ya no se edita acá (R3/T7): la RPC empleado_actualizar (0050) recibe
        // p_salario_base como parámetro obligatorio y hace `coalesce(p_salario_base, 0)`, así que
        // omitirlo o mandar null pondría la columna en 0. Se manda el valor YA guardado, sin
        // pasar por ningún input, para que editar el resto de la ficha deje salario_base
        // byte-idéntico — la columna sigue viva para sus consumidores congelados (pagos/
        // evaluaciones, ver docs/pendientes-negocio.md).
        salarioBase: emp.salarioBase,
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

          <ContactoCampos
            telefono={telefono}
            setTelefono={setTelefono}
            dni={dni}
            setDni={setDni}
            direccion={direccion}
            setDireccion={setDireccion}
            recomendaciones={recomendaciones}
            setRecomendaciones={setRecomendaciones}
          />

          {/* Sueldo único (R3/T7): manda solo el contrato. Acá donde antes vivía el input de
              «Salario base» ahora se lee el sueldo pactado, en solo lectura, con enlace a la
              pestaña Contrato — nunca se edita desde la ficha. */}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Sueldo</label>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper/40 px-3 py-2">
              <Wallet className="h-4 w-4 shrink-0 text-gold" strokeWidth={1.75} aria-hidden />
              {sueldoVigente != null ? (
                <>
                  <p className="text-sm text-ink">
                    Sueldo (contrato vigente):{' '}
                    <span className="font-semibold tabular-nums text-navy">{soles(sueldoVigente)}</span>
                  </p>
                  <Link
                    href={rutaSeccion(emp.id, 'contrato', '')}
                    className="ml-auto text-xs font-medium text-navy underline decoration-gold decoration-2 underline-offset-2 hover:text-navy-dark"
                  >
                    Ver contrato
                  </Link>
                </>
              ) : (
                <Link
                  href={rutaSeccion(emp.id, 'contrato', '')}
                  className="text-sm font-medium text-navy underline decoration-gold decoration-2 underline-offset-2 hover:text-navy-dark"
                >
                  Sin contrato — pactarlo
                </Link>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              El sueldo se pacta en el contrato — esta ficha ya no lo edita.
            </p>
          </div>

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

      <DocumentosCard empleadoId={emp.id} documentosIniciales={documentosIniciales} />
    </div>
  );
}

// C-3 (migración 0105): DNI, CV, imágenes — solo admin/dueño (esta pantalla entera ya lo es, sin
// gate propio acá). 10 MB, jpg/png/webp/pdf (mismos límites que el bucket, comprobados también acá
// para un mensaje legible antes de intentar subir). Sin previsualización ni categorías (spec §6):
// nombre, tamaño, fecha, un enlace de descarga con URL firmada de corta duración, y borrar.
function DocumentosCard({
  empleadoId,
  documentosIniciales,
}: {
  empleadoId: string;
  documentosIniciales: DocumentoEmpleado[];
}) {
  const [documentos, setDocumentos] = useState(documentosIniciales);
  const [error, setError] = useState('');
  const [subiendo, startSubida] = useTransition();
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [pendingBorrado, startBorrado] = useTransition();
  const conf = useConfirmacion();

  function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo si hubo error
    if (!archivo) return;
    setError('');
    const formData = new FormData();
    formData.set('archivo', archivo);
    startSubida(async () => {
      const r = await accionSubirDocumento(empleadoId, formData);
      if (!r.ok || !r.documento) {
        setError(r.error ?? 'No se pudo subir el documento');
        return;
      }
      // Estado local, sin router.refresh(): esta tarjeta lleva su propia lista, y refrescar la
      // ruta entera tiraría abajo el resto del formulario si alguien estaba editando otro campo.
      setDocumentos((prev) => [r.documento!, ...prev]);
    });
  }

  function verDocumento(storagePath: string) {
    abrirDocumento(storagePath, setError);
  }

  function borrar(doc: DocumentoEmpleado) {
    conf.pedir({
      titulo: `¿Borrar "${doc.nombreArchivo}"?`,
      detalle: 'No se puede deshacer. El archivo se elimina del almacenamiento.',
      confirmarLabel: 'Borrar',
      tono: 'peligro',
      alConfirmar: () =>
        startBorrado(async () => {
          setBorrandoId(doc.id);
          setError('');
          const r = await accionEliminarDocumento(doc.id, empleadoId);
          setBorrandoId(null);
          if (!r.ok) {
            setError(r.error ?? 'No se pudo borrar el documento');
            return;
          }
          setDocumentos((prev) => prev.filter((d) => d.id !== doc.id));
          conf.cerrar();
        }),
    });
  }

  return (
    <Card>
      <DialogoConfirmar {...conf.props} pending={pendingBorrado} />
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between gap-3 border-b border-line/60 pb-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-navy">
            <Paperclip className="h-4 w-4" strokeWidth={1.75} /> Documentos
          </p>
          <label
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-navy transition hover:bg-navy/5',
              subiendo && 'pointer-events-none opacity-60',
            )}
          >
            <Upload className="h-3.5 w-3.5" strokeWidth={2} /> {subiendo ? 'Subiendo…' : 'Adjuntar'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              disabled={subiendo}
              onChange={alElegirArchivo}
            />
          </label>
        </div>

        {error && <Aviso tono="error">{error}</Aviso>}

        {documentos.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted">Sin documentos adjuntos.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {documentos.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{d.nombreArchivo}</p>
                  <p className="text-xs text-muted">
                    {(d.tamanoBytes / 1024).toFixed(0)} KB · {d.subidoEn.slice(0, 10)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => verDocumento(d.storagePath)}
                    className="rounded-md p-1.5 text-muted transition hover:bg-navy/5 hover:text-navy"
                    title="Ver / descargar"
                  >
                    <ExternalLink className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => borrar(d)}
                    disabled={pendingBorrado && borrandoId === d.id}
                    className="rounded-md p-1.5 text-muted transition hover:bg-error-soft hover:text-error-deep"
                    title="Borrar"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted">Máximo 10 MB por archivo — imágenes o PDF.</p>
      </CardContent>
    </Card>
  );
}

// Aparte de DocumentosCard porque abre una pestaña nueva apenas la Action devuelve la URL firmada
// — no hay un estado de "pending" que valga la pena mostrar en la lista por esto, sólo el error.
async function abrirDocumento(storagePath: string, setError: (v: string) => void) {
  const r = await accionUrlDocumento(storagePath);
  if (!r.ok || !r.url) {
    setError(r.error ?? 'No se pudo abrir el documento');
    return;
  }
  window.open(r.url, '_blank', 'noopener,noreferrer');
}
