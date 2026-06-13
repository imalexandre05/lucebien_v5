import './globals.css';
import type { Metadata } from 'next';
import { Nav } from '../components/nav';

export const metadata: Metadata = {
  title: 'SCI-LB · ERP',
  description: 'Plataforma digital integral — LuceBien',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Nav />
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
