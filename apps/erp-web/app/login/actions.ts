'use server';

import { redirect } from 'next/navigation';
import { loginUsuarioSchema } from '@scilb/core';
import { loginConUsuario, logout } from '../../lib/auth';

// Login usuario + contraseña (spec permisos/2026-10-06-login-usuario-contrasena). La rama cod+sede
// —el código de 4 dígitos como contraseña— se eliminó el 6-oct-2026 (H0 de la auditoría).
export async function iniciarSesion(formData: FormData) {
  const parsed = loginUsuarioSchema.safeParse({
    usuario: formData.get('usuario'),
    password: formData.get('password'),
  });
  if (!parsed.success) redirect('/login?error=datos');
  // `sede` (Fase 2): botón pre-marcado por el equipo (SedeBotones) — no forma parte del schema
  // de credenciales porque no es una entrada de seguridad, solo la sede activa inicial.
  const sede = String(formData.get('sede') ?? '');
  const res = await loginConUsuario(parsed.data.usuario, parsed.data.password, sede);
  if (!res.ok) {
    if (res.motivo === 'bloqueado') redirect(`/login?error=bloqueado&min=${res.minutos}`);
    redirect('/login?error=credenciales');
  }
  redirect('/');
}

export async function cerrarSesion() {
  await logout();
  redirect('/login');
}
