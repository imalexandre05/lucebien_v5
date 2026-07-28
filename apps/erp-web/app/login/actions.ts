'use server';

import { redirect } from 'next/navigation';
import { loginSchema, loginUsuarioSchema } from '@scilb/core';
import { isOn } from '@scilb/adapter-lucebien';
import { login, loginConUsuario, logout } from '../../lib/auth';

export async function iniciarSesion(formData: FormData) {
  if (isOn('LOGIN_V2')) {
    const parsed = loginUsuarioSchema.safeParse({
      usuario: formData.get('usuario'),
      password: formData.get('password'),
    });
    if (!parsed.success) redirect('/login?error=datos');
    // `sede` (Fase 2): botón pre-marcado por el equipo (SedeBotones) — no forma parte del schema
    // de credenciales porque no es una entrada de seguridad, solo la sede activa inicial.
    const sede = String(formData.get('sede') ?? '');
    const res = await loginConUsuario(parsed.data.usuario, parsed.data.password, sede);
    if (!res.ok) redirect('/login?error=credenciales');
    redirect('/');
  }

  const parsed = loginSchema.safeParse({
    sede: formData.get('sede'),
    cod: formData.get('cod'),
  });
  if (!parsed.success) redirect('/login?error=datos');

  const res = await login(parsed.data.cod, parsed.data.sede);
  if (!res.ok) redirect('/login?error=credenciales');

  redirect('/');
}

export async function cerrarSesion() {
  await logout();
  redirect('/login');
}
