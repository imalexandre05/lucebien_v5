import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSesion } from '../../../../lib/auth';
import { PageHeader } from '../../../../components/shell/page-header';
import {
  listarCapacitaciones, listarHabilidades, listarIntentos, listarNotasPresencial,
} from '../../../../lib/capacitacion-repo';
import { ExamenCliente } from './cliente';

// Exámenes de una capacitación. La base (RLS de la 0131/0138) decide quién la ve: la persona nueva
// rinde los exámenes online; quien la capacita (o el administrador) califica el presencial.
export default async function ExamenPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  const cap = (await listarCapacitaciones()).find((c) => c.id === id);
  if (!cap) notFound();
  const [intentos, habilidades, notas] = await Promise.all([listarIntentos(id), listarHabilidades(), listarNotasPresencial(id)]);
  const soyNuevo = cap.nuevoId === sesion.usuario.id;
  return (
    <div className="space-y-4">
      <PageHeader title="Exámenes" subtitle={`${cap.nuevoNombre} · capacitación ${cap.estado === 'en_curso' ? 'en curso' : 'cerrada'}`} />
      <Link href="/capacitacion" className="inline-flex items-center gap-1.5 text-cuerpo text-muted transition-colors duration-150 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Volver a Capacitación
      </Link>
      <ExamenCliente
        capId={id}
        enCurso={cap.estado === 'en_curso'}
        soyNuevo={soyNuevo}
        puedeCalificar={!soyNuevo}
        intentos={intentos}
        habilidades={habilidades.filter((h) => h.activo)}
        notas={notas}
        vigente={cap.examenes.length > 0 ? cap.examenes[cap.examenes.length - 1].nota : null}
      />
    </div>
  );
}
