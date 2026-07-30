'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import {
  actualizarEstadoEmpleado,
  establecerContrasenaEmpleado,
  actualizarEmpleado,
  crearEmpleado,
  type EditarEmpleadoInput,
  type NuevoEmpleadoInput,
} from '../../lib/empleados-repo';
import { togglePosCobro } from '../../lib/permisos-repo';

async function exigirAdmin(): Promise<void> {
  const s = await getSesion();
  const ok = s?.usuario.rol === 'admin' || s?.usuario.rol === 'dueno';
  if (!ok) throw new Error('Solo administradores pueden gestionar colaboradores');
}

export async function accionEstadoEmpleado(id: string, activo: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirAdmin();
    await actualizarEstadoEmpleado(id, activo);
    revalidatePath('/empleados');
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
    revalidatePath('/empleados');
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
): Promise<{ ok: boolean; error?: string; cod?: string }> {
  try {
    await exigirAdmin();
    const { cod } = await crearEmpleado(p);
    revalidatePath('/empleados');
    return { ok: true, cod };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

export async function accionEstablecerContrasena(id: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirAdmin();
    if (password.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres');
    await establecerContrasenaEmpleado(id, password);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

// "Opera caja" (Fase 10, punto 4): toggle directo del permiso 'pos_cobro' desde /empleados, sin
// tener que ir hasta /configuracion/permisos. `rolKey` es el rol EFECTIVO del empleado (su rolCod
// derivado si tiene uno, si no su rol base) — togglePosCobro() ya avisa en su comentario que esto
// es por ROL, no por persona: afecta a todos los que compartan ese rol/rol derivado.
//
// A propósito SIN `revalidatePath()`: /empleados, /caja y /configuracion/permisos ya son rutas
// dinámicas (leen la sesión vía cookies en cada request, nunca caché estático), así que la
// próxima carga real de cualquiera de las tres YA trae el dato fresco sin necesidad de invalidar
// nada. Y para ESTE toggle en particular, `revalidatePath` sería contraproducente: dispara un
// refresh automático de la ruta actual apenas la Server Action resuelve, y /empleados tiene
// `loading.tsx` (Fase 3) — ese refresh muestra su fallback de Suspense, que desmonta la página (y
// con ella el modal de edición abierto, perdiendo el estado del admin a mitad de edición). El
// cliente refleja el cambio con estado local optimista (ver EditarModal en cliente.tsx).
export async function accionTogglePosCobro(rolKey: string, activar: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirAdmin();
    await togglePosCobro(rolKey, activar);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al cambiar el permiso de caja' };
  }
}
