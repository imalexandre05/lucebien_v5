'use server';

import { redirect } from 'next/navigation';
import { loginSchema } from '@scilb/core';
import { login, logout } from '../../lib/auth';

export async function iniciarSesion(formData: FormData) {
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
