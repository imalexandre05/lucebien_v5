import Link from 'next/link';
import { cookies } from 'next/headers';
import { ShieldCheck, Clock, Ban, Laptop, ArrowRight } from 'lucide-react';
import { getSesion } from '../../lib/auth';
import { estadoDispositivo, type EstadoDispositivo } from '../../lib/dispositivos-repo';
import { LogoMark } from '../../components/brand/logo';
import { Card, CardContent } from '../../components/ui/card';
import { Button, buttonVariants } from '../../components/ui/button';
import { Input } from '../../components/ui/form';
import { cn } from '../../lib/cn';
import { autorizarEsteEquipo, solicitarAcceso } from './actions';

export default async function DispositivoPage(
  props: {
    searchParams: Promise<{ error?: string; solicitado?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  const deviceId = (await cookies()).get('sci_device')?.value ?? '';

  let estado: EstadoDispositivo = 'none';
  try {
    estado = await estadoDispositivo(deviceId);
  } catch {
    estado = 'none';
  }
  const aprobado = estado === 'aprobado' || estado === 'setup';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center">
          <LogoMark size="lg" className="animate-scale-in" />
          <div className="mt-3 animate-rise text-titulo font-display font-bold text-navy [animation-delay:90ms]">
            Equipo {aprobado ? 'autorizado' : 'no autorizado'}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {searchParams.error === 'permiso' && (
              <p className="mb-4 rounded-r-chico bg-aviso/15 px-3 py-2 text-apoyo text-aviso-deep">
                Solo un administrador puede autorizar este equipo.
              </p>
            )}

            {aprobado ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-r-pastilla bg-exito/10 text-exito-deep">
                  <ShieldCheck className="h-6 w-6" strokeWidth={2} />
                </span>
                <p className="text-cuerpo text-muted">Este equipo está autorizado para usar SCI-LB.</p>
                <Link href="/" className={cn(buttonVariants({ variant: 'primary' }), 'w-full justify-center')}>
                  Entrar <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <EstadoAviso estado={estado} solicitado={searchParams.solicitado === '1'} />

                {esAdmin ? (
                  <form action={autorizarEsteEquipo}>
                    <p className="mb-3 flex items-center gap-2 text-apoyo text-muted">
                      <Laptop className="h-4 w-4 shrink-0 text-gold" strokeWidth={1.75} />
                      Eres administrador: puedes autorizar este equipo directamente.
                    </p>
                    <Button type="submit" className="w-full justify-center">
                      <ShieldCheck className="h-4 w-4" strokeWidth={2} /> Autorizar este equipo
                    </Button>
                  </form>
                ) : (
                  <form action={solicitarAcceso} className="space-y-3">
                    <div>
                      <label className="mb-1 block text-apoyo font-medium text-muted">Nombre del equipo (para el admin)</label>
                      <Input name="nombre" placeholder="ej. PC Caja — Lucebien" maxLength={80} />
                    </div>
                    <Button type="submit" variant="outline" className="w-full justify-center">
                      Solicitar acceso
                    </Button>
                    <p className="text-center text-micro text-muted">
                      Un administrador debe aprobar este equipo antes de que puedas continuar.
                    </p>
                  </form>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {sesion && (
          <p className="mt-4 text-center text-micro text-muted">
            Sesión de <span className="font-medium text-navy">{sesion.nombre}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function EstadoAviso({ estado, solicitado }: { estado: EstadoDispositivo; solicitado: boolean }) {
  if (solicitado || estado === 'pendiente') {
    return (
      <div className="flex items-start gap-3 rounded-r-chico border border-aviso-line bg-aviso-soft px-3 py-2.5 text-cuerpo text-aviso-deep">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
        <span>Solicitud registrada. Este equipo queda <strong>pendiente</strong> hasta que un administrador lo apruebe.</span>
      </div>
    );
  }
  if (estado === 'rechazado' || estado === 'revocado') {
    return (
      <div className="flex items-start gap-3 rounded-r-chico border border-error-line bg-error-soft px-3 py-2.5 text-cuerpo text-error-deep">
        <Ban className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
        <span>El acceso de este equipo fue <strong>{estado}</strong>. Contacta a un administrador.</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-r-chico border border-line bg-paper px-3 py-2.5 text-cuerpo text-muted">
      <Laptop className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
      <span>Este equipo no está registrado como autorizado.</span>
    </div>
  );
}
