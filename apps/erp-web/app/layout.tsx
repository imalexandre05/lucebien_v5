import './globals.css';
import type { Metadata } from 'next';
import type { MatrizPermisos, Rol } from '@scilb/core';
import { Sidebar } from '../components/shell/sidebar';
import { Topbar } from '../components/shell/topbar';
import { PageTransition } from '../components/shell/page-transition';
import { ModuloAcento } from '../components/shell/modulo-acento';
import { getSesion } from '../lib/auth';
import { leerMatrizPermisos } from '../lib/permisos-repo';
import { getPerfilSede } from '../lib/sedes-repo';

export const metadata: Metadata = {
  title: 'SCI-LB · ERP LuceBien',
  description: 'Plataforma digital integral — Confecciones Aliaga E.I.R.L.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesion();
  const rol: Rol = sesion?.usuario.rol ?? 'ventas_junior_2';
  // Fallback seguro: matriz vacía = solo admin/dueno ven módulos no-operativos, nunca tumba el layout.
  let matriz: MatrizPermisos = {};
  // Perfil de la sede activa (Fase 2): filtra pipeline vs. pedidos/caja en el sidebar — ver
  // permiteModuloPerfil() en @scilb/core. null = no filtra (sesión sin sede, o error defensivo).
  let perfilSede: Awaited<ReturnType<typeof getPerfilSede>> = null;
  if (sesion) {
    try {
      matriz = await leerMatrizPermisos();
    } catch {
      matriz = {};
    }
    try {
      perfilSede = await getPerfilSede(sesion.usuario.sede);
    } catch {
      perfilSede = null;
    }
  }
  return (
    <html lang="es">
      <body>
        <ModuloAcento className="flex min-h-screen">
          <Sidebar rol={rol} matriz={matriz} rolCod={sesion?.usuario.rolCod} perfilSede={perfilSede} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 px-4 py-6 sm:px-7 sm:py-8">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </ModuloAcento>
      </body>
    </html>
  );
}
