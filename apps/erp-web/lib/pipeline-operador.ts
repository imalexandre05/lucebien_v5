import { cookies } from 'next/headers';
import { dispositivoCompartido } from './pipeline-repo';
import { getServerClient } from './supabase/server';
import { tokenOperadorValido } from './operador-token';

// Código personal (spec codigo-personal §3): en un equipo marcado como compartido, toda acción de
// atribución del pipeline exige un token de operador. En uno que no lo es, el token se ignora y
// el actor es la sesión, como hoy. La decisión la toma el servidor (la cookie `sci_device` es
// httpOnly): el navegador no puede declararse «no compartido».
const DEVICE_COOKIE = 'sci_device';

export async function deviceIdActual(): Promise<string> {
  return (await cookies()).get(DEVICE_COOKIE)?.value ?? '';
}

export async function equipoCompartido(): Promise<boolean> {
  return dispositivoCompartido(await deviceIdActual());
}

// Devuelve el token a pasar a la RPC (o null = actor es la sesión). Lanza CODIGO: si el equipo es
// compartido y no llegó ningún operador.
export async function operadorParaAccion(operador?: string | null): Promise<string | null> {
  if (!(await equipoCompartido())) return null;
  if (!operador) throw new Error('CODIGO: este equipo es compartido, ingresa tu código para continuar');
  if (!tokenOperadorValido(operador)) throw new Error('CODIGO: tu sesión de operador no es válida, ingresa tu código de nuevo');
  return operador;
}

// ¿Debe la pantalla pedir el código? Sí si el equipo está marcado como compartido o si la CUENTA
// de la sesión es de un equipo compartido: en este segundo caso la base exige el token aunque el
// navegador no tenga la cookie del equipo (0146, sesion_cuenta_compartida).
export async function pedirCodigoEnPantalla(): Promise<boolean> {
  if (await equipoCompartido()) return true;
  const { data, error } = await getServerClient().rpc('sesion_cuenta_compartida');
  return !error && data === true;
}
