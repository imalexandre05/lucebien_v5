import './globals.css';
import type { Metadata } from 'next';
import { Sidebar } from '../components/shell/sidebar';
import { Topbar } from '../components/shell/topbar';

export const metadata: Metadata = {
  title: 'SCI-LB · ERP LuceBien',
  description: 'Plataforma digital integral — Confecciones Aliaga E.I.R.L.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 px-7 py-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
