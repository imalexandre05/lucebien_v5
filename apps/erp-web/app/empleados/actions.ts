'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import {
  actualizarEstadoEmpleado,
  generarContrasenaTemporalEmpleado,
  actualizarEmpleado,
  crearEmpleado,
  empleadoBorrarAltaPrevio,
  empleadoBorrarAlta,
  type EditarEmpleadoInput,
  type NuevoEmpleadoInput,
  type BorrarAltaPrevio,
} from '../../lib/empleados-repo';
import { togglePosCobro } from '../../lib/permisos-repo';
import { subirDocumento, eliminarDocumento, urlFirmadaDocumento, type DocumentoEmpleado } from '../../lib/documentos-repo';

async function exigirAdmin(): Promise<void> {
  const s = await getSesion();
  const ok = s?.usuario.rol === 'admin' || s?.usuario.rol === 'dueno';
  if (!ok) throw new Error('Solo administradores pueden gestionar colaboradores');
}

export async function accionEstadoEmpleado(id: string, activo: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirAdmin();
    await actualizarEstadoEmpleado(id, activo);
    revalidatePath('/personal');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

// Editar TODO el empleado (Fase 1): nombre, rol, sede primaria, tiendas, fecha de ingreso, notas
// + contacto. `cod` nunca se recibe (inmutable, es la credencial de Supabase Auth).
export async function accionEditarEmpleado(
  id: string,
  p: EditarEmpleadoInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirAdmin();
    await actualizarEmpleado(id, p);
    revalidatePath('/personal');
    // El nombre/rol pueden cambiar la sesión de OTRO usuario (o la propia, si el admin se edita
    // a sí mismo) — refrescar el shell entero para que sidebar/topbar reflejen el rol nuevo.
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

export async function accionCrearEmpleado(
  p: NuevoEmpleadoInput,
): Promise<{ ok: boolean; error?: string; id?: string; cod?: string }> {
  try {
    await exigirAdmin();
    // `id` (Tarea 6, alta encadenada): la persona recién creada no queda en una lista a la que
    // volver a buscarla — la cadena sigue directo a su contrato, y para eso hace falta su id.
    const { id, cod } = await crearEmpleado(p);
    revalidatePath('/personal');
    return { ok: true, id, cod };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

// Deshacer un alta hecha por error (docs/superpowers/specs/empleados/
// 2026-08-25-borrar-alta-por-error-design.md). `accionBorrarAltaPrevio` sólo lee, para el diálogo
// de C-1 que muestra el costo ANTES de confirmar. Las dos delegan el guard de admin en la RPC
// (0099) igual que el resto de este archivo — `exigirAdmin()` acá es sólo un mensaje legible antes
// de intentar, no la única cerradura.
export async function accionBorrarAltaPrevio(
  id: string,
): Promise<{ ok: boolean; error?: string; datos?: BorrarAltaPrevio }> {
  try {
    await exigirAdmin();
    const datos = await empleadoBorrarAltaPrevio(id);
    return { ok: true, datos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

export async function accionBorrarAlta(id: string): Promise<{ ok: boolean; error?: string; aviso?: string }> {
  try {
    await exigirAdmin();
    const { avisoAuth } = await empleadoBorrarAlta(id);
    // Con aviso NO se revalida: la página actual (/personal/[id]) ya no existe y revalidarla
    // devolvería un 404 que desmonta el diálogo antes de que el administrador lea el aviso.
    if (!avisoAuth) revalidatePath('/personal');
    return { ok: true, aviso: avisoAuth };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

// Contraseña temporal (spec permisos/2026-10-06-login-usuario-contrasena §6): la devuelve UNA vez
// para que el admin la entregue en persona. También desbloquea la cuenta.
export async function accionContrasenaTemporal(id: string): Promise<{ ok: true; temporal: string } | { ok: false; error: string }> {
  try {
    await exigirAdmin();
    return { ok: true, temporal: await generarContrasenaTemporalEmpleado(id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

// "Opera caja" (Fase 10, punto 4): toggle directo del permiso 'pos_cobro' desde /empleados, sin
// tener que ir hasta /configuracion/permisos. `rolKey` es el rol EFECTIVO del empleado (su rolCod
// derivado si tiene uno, si no su rol base) — togglePosCobro() ya avisa en su comentario que esto
// es por ROL, no por persona: afecta a todos los que compartan ese rol/rol derivado.
//
// A propósito SIN `revalidatePath()`: /personal, /caja y /configuracion/permisos ya son rutas
// dinámicas (leen la sesión vía cookies en cada request, nunca caché estático), así que la
// próxima carga real de cualquiera de las tres YA trae el dato fresco sin necesidad de invalidar
// nada. Y para ESTE toggle en particular, `revalidatePath` sería contraproducente: dispara un
// refresh automático de la ruta actual apenas la Server Action resuelve, y el expediente de
// /personal tiene `loading.tsx` (Fase 3) — ese refresh muestra su fallback de Suspense, que
// desmonta la página a mitad de edición. El cliente refleja el cambio con estado local optimista
// (ver OperaCajaToggle en cliente.tsx, montado hoy desde la pestaña Datos del expediente).
export async function accionTogglePosCobro(rolKey: string, activar: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirAdmin();
    await togglePosCobro(rolKey, activar);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al cambiar el permiso de caja' };
  }
}

// Adjuntos de personal (C-3, migración 0105). `exigirAdmin()` es cinturón y tirantes: la RLS de
// empleado_documentos/storage.objects ya lo exige en las dos capas (documentos-repo.ts), esto sólo
// da un mensaje de error legible antes de intentar la subida en vez de dejar que PostgREST lo
// rechace con un 42501 crudo.
export async function accionSubirDocumento(
  empleadoId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; documento?: DocumentoEmpleado }> {
  try {
    await exigirAdmin();
    const archivo = formData.get('archivo');
    if (!(archivo instanceof File) || archivo.size === 0) throw new Error('Elegí un archivo primero');
    const documento = await subirDocumento(empleadoId, archivo);
    revalidatePath(`/personal/${empleadoId}/datos`);
    return { ok: true, documento };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al subir el documento' };
  }
}

export async function accionEliminarDocumento(documentoId: string, empleadoId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirAdmin();
    await eliminarDocumento(documentoId);
    revalidatePath(`/personal/${empleadoId}/datos`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al borrar el documento' };
  }
}

export async function accionUrlDocumento(storagePath: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    await exigirAdmin();
    const url = await urlFirmadaDocumento(storagePath);
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al abrir el documento' };
  }
}
