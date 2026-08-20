'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Bell, Check, CheckCheck, Info, RefreshCw, ShieldAlert } from 'lucide-react';
import type { Notificacion } from '../../lib/notificaciones-repo';
import { generarAlertasAction, marcarLeidaAction, marcarTodasLeidasAction } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/cn';

const SEV: Record<Notificacion['severidad'], { icon: typeof Info; cls: string; tone: 'gray' | 'amber' | 'navy'; label: string }> = {
  critica: { icon: ShieldAlert, cls: 'text-error', tone: 'amber', label: 'Crítica' },
  warn: { icon: AlertTriangle, cls: 'text-aviso', tone: 'amber', label: 'Aviso' },
  info: { icon: Info, cls: 'text-navy', tone: 'navy', label: 'Info' },
};

// Enlace útil según el origen de la alerta.
function refHref(n: Notificacion): string | null {
  if (!n.refId) return null;
  switch (n.refTipo) {
    case 'pedido':
      return `/pedidos/${n.refId}`;
    case 'material':
      return '/materiales';
    case 'caja':
      return '/caja';
    case 'reporte':
      return `/reportes/${n.refId}`;
    default:
      return null;
  }
}

export function NotificacionesCliente({ notificaciones, esAdmin }: { notificaciones: Notificacion[]; esAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filtro, setFiltro] = useState<'todas' | 'no_leidas' | Notificacion['severidad']>('no_leidas');
  const [aviso, setAviso] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    return notificaciones.filter((n) => {
      if (filtro === 'no_leidas') return !n.leida;
      if (filtro === 'todas') return true;
      return n.severidad === filtro;
    });
  }, [notificaciones, filtro]);

  const hayNoLeidas = notificaciones.some((n) => !n.leida);

  function generar() {
    setAviso(null);
    startTransition(async () => {
      const r = await generarAlertasAction();
      if (r.error) setAviso(r.error);
      else setAviso(r.creadas > 0 ? `${r.creadas} alerta(s) nueva(s).` : 'Sin novedades: todo al día.');
      router.refresh();
    });
  }
  function marcar(id: string) {
    startTransition(async () => {
      await marcarLeidaAction(id);
      router.refresh();
    });
  }
  function marcarTodas() {
    startTransition(async () => {
      await marcarTodasLeidasAction();
      router.refresh();
    });
  }

  const filtros: { k: typeof filtro; label: string }[] = [
    { k: 'no_leidas', label: 'Sin leer' },
    { k: 'todas', label: 'Todas' },
    { k: 'critica', label: 'Críticas' },
    { k: 'warn', label: 'Avisos' },
    { k: 'info', label: 'Info' },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <div className="flex flex-wrap gap-1">
            {filtros.map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => setFiltro(f.k)}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-xs transition',
                  filtro === f.k ? 'border-navy bg-navy text-white' : 'border-line text-navy hover:border-gold',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {aviso && <span className="text-xs text-muted">{aviso}</span>}
            {hayNoLeidas && (
              <button
                type="button"
                onClick={marcarTodas}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-navy transition hover:border-gold"
              >
                <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} /> Marcar todas
              </button>
            )}
            {esAdmin && (
              <button
                type="button"
                onClick={generar}
                disabled={pending}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white transition hover:bg-navy-deep',
                  pending && 'opacity-60',
                )}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', pending && 'animate-spin')} strokeWidth={2} /> Generar alertas
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {filtradas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center text-muted">
            <Bell className="h-8 w-8 text-line" strokeWidth={1.5} />
            <p className="text-sm">{filtro === 'no_leidas' ? 'No tienes notificaciones sin leer.' : 'No hay notificaciones.'}</p>
            {esAdmin && filtro !== 'no_leidas' && <p className="text-xs">Usa “Generar alertas” para evaluar el estado actual.</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtradas.map((n) => {
            const sev = SEV[n.severidad];
            const Icon = sev.icon;
            const href = refHref(n);
            return (
              <Card key={n.id} className={cn('transition', !n.leida && 'border-l-4 border-l-gold')}>
                <CardContent className="flex items-start gap-3 py-3.5">
                  <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', sev.cls)} strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-sm font-semibold', !n.leida ? 'text-navy' : 'text-ink')}>{n.titulo}</span>
                      {n.sede && <Badge tone="navy">{n.sede}</Badge>}
                      {!n.leida && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-label="sin leer" />}
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{n.mensaje}</p>
                    {href && (
                      <Link href={href} className="mt-1 inline-block text-xs font-medium text-navy underline underline-offset-2 hover:text-gold">
                        Ver detalle
                      </Link>
                    )}
                  </div>
                  {!n.leida && (
                    <button
                      type="button"
                      onClick={() => marcar(n.id)}
                      disabled={pending}
                      title="Marcar como leída"
                      aria-label="Marcar como leída"
                      className="shrink-0 rounded-md border border-line p-1.5 text-muted transition hover:border-gold hover:text-navy"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
