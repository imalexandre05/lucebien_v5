import './globals.css';
import type { Metadata } from 'next';
import { Sidebar } from '../components/shell/sidebar';
import { Topbar } from '../components/shell/topbar';
import { PageTransition } from '../components/shell/page-transition';
import { getSesion } from '../lib/auth';

export const metadata: Metadata = {
  title: 'SCI-LB · ERP LuceBien',
  description: 'Plataforma digital integral — Confecciones Aliaga E.I.R.L.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  return (
    <html lang="es">
      <body>
        <div className="flex min-h-screen">
          <Sidebar esAdmin={esAdmin} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 px-7 py-8">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
