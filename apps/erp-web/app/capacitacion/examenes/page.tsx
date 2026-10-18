import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSesion } from '../../../lib/auth';
import { PageHeader } from '../../../components/shell/page-header';
import { listarHabilidades, listarPreguntas } from '../../../lib/capacitacion-repo';
import { BancoCliente } from './cliente';

// Banco de preguntas y lista de habilidades del examen presencial. Solo el administrador: el banco
// trae la respuesta correcta y la base (RLS de la 0138) tampoco se lo muestra a nadie más.
export default async function ExamenesAdminPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  if (sesion.usuario.rol !== 'admin' && sesion.usuario.rol !== 'dueno') redirect('/capacitacion');
  const [preguntas, habilidades] = await Promise.all([listarPreguntas(), listarHabilidades()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Exámenes" subtitle={`${preguntas.filter((p) => p.activa).length} preguntas activas · ${habilidades.filter((h) => h.activo).length} habilidades`} />
      <Link href="/capacitacion" className="inline-flex items-center gap-1.5 text-cuerpo text-muted transition-colors duration-150 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Volver a Capacitación
      </Link>
      <BancoCliente preguntas={preguntas} habilidades={habilidades} />
    </div>
  );
}
