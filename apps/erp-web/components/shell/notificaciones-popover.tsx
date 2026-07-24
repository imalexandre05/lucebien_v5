'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, Info, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { Notificacion } from '../../lib/notificaciones-repo';
import { marcarLeidaAction, marcarTodasLeidasAction } from '../../app/notificaciones/actions';
import { Modal, ModalBody } from '../ui/modal';
import { NotificacionesCliente } from '../../app/notificaciones/cliente';
import { cn } from '../../lib/cn';

const SEV_ICON: Record<Notificacion['severidad'], { icon: typeof Info; cls: string }> = {
  critica: { icon: ShieldAlert, cls: 'text-red-600' },
  warn: { icon: AlertTriangle, cls: 'text-amber-600' },
  info: { icon: Info, cls: 'text-navy' },
};

// Campana + ventana emergente (Fase 6): las notificaciones ya NO viven en una página completa.
// La campana abre un popover chico con lo reciente; "Mostrar más" abre un modal con la
// clasificación completa (filtros por severidad, generar alertas) — reusa NotificacionesCliente
// tal cual, solo cambia el contenedor (modal en vez de página).
//
// Overlay Y panel van por portal a <body>, con posición calculada desde el botón: el topbar
// tiene backdrop-blur, que crea un containing block para `position:fixed` (mismo problema que
// documenta mobile-nav.tsx) — un overlay fixed anidado ahí quedaría atrapado dentro del header en
// vez de cubrir la pantalla. Y si solo se portea el overlay pero el panel se queda `absolute`
// dentro del header (que es `sticky z-10`, su propio stacking context), el overlay portado
// terminaría tapando al panel en vez de quedar detrás. Por eso ambos van juntos, con coordenadas
// fijas calculadas del botón.
export function NotificacionesBell({
  notificaciones,
  esAdmin,
}: {
  notificaciones: Notificacion[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => setAbierto(false), [path]);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto]);

  function alternar() {
    if (!abierto && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setAbierto((v) => !v);
  }

  const noLeidas = notificaciones.filter((n) => !n.leida).length;
  const recientes = notificaciones.slice(0, 6);

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

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={alternar}
        title="Notificaciones"
        aria-label={noLeidas > 0 ? `Notificaciones, ${noLeidas} sin leer` : 'Notificaciones'}
        aria-expanded={abierto}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted outline-none transition-colors duration-150 hover:bg-navy/5 hover:text-navy focus-visible:ring-2 focus-visible:ring-gold/70 active:scale-[0.97]"
      >
        <Bell className="h-4 w-4" strokeWidth={1.75} />
        {noLeidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {abierto &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-20" onClick={() => setAbierto(false)} aria-hidden />
            <div
              role="dialog"
              aria-label="Notificaciones"
              style={{ top: pos.top, right: pos.right }}
              className="fixed z-30 w-80 animate-fade rounded-xl border border-line bg-white shadow-lift"
            >
              <div className="flex items-center justify-between border-b border-line/60 px-3.5 py-2.5">
                <span className="text-sm font-semibold text-navy">Notificaciones</span>
                {noLeidas > 0 && (
                  <button
                    type="button"
                    onClick={marcarTodas}
                    className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-navy"
                  >
                    <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} /> Marcar todas
                  </button>
                )}
              </div>

              {recientes.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                  <Bell className="h-6 w-6 text-line" strokeWidth={1.5} />
                  <p className="text-xs text-muted">Sin notificaciones.</p>
                </div>
              ) : (
                <ul className="max-h-80 overflow-y-auto">
                  {recientes.map((n) => {
                    const sev = SEV_ICON[n.severidad];
                    const Icon = sev.icon;
                    return (
                      <li key={n.id} className={cn('flex items-start gap-2.5 border-b border-line/40 px-3.5 py-2.5 last:border-0', !n.leida && 'bg-gold/5')}>
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', sev.cls)} strokeWidth={1.75} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className={cn('truncate text-xs font-semibold', !n.leida ? 'text-navy' : 'text-ink')}>{n.titulo}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{n.mensaje}</p>
                        </div>
                        {!n.leida && (
                          <button
                            type="button"
                            onClick={() => marcar(n.id)}
                            title="Marcar como leída"
                            aria-label="Marcar como leída"
                            className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-navy/5 hover:text-navy"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <button
                type="button"
                onClick={() => {
                  setAbierto(false);
                  setModalAbierto(true);
                }}
                className="block w-full rounded-b-xl border-t border-line/60 py-2.5 text-center text-xs font-medium text-navy transition-colors hover:bg-navy/5"
              >
                Mostrar más
              </button>
            </div>
          </>,
          document.body,
        )}

      <Modal open={modalAbierto} onClose={() => setModalAbierto(false)} title="Notificaciones" size="xl">
        <ModalBody>
          <NotificacionesCliente notificaciones={notificaciones} esAdmin={esAdmin} />
        </ModalBody>
      </Modal>
    </>
  );
}
