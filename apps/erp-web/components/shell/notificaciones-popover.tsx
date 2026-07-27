'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, Info, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { Notificacion } from '../../lib/notificaciones-repo';
import { marcarLeidaAction, marcarTodasLeidasAction } from '../../app/notificaciones/actions';
import { cn } from '../../lib/cn';

const SEV_ICON: Record<Notificacion['severidad'], { icon: typeof Info; cls: string }> = {
  critica: { icon: ShieldAlert, cls: 'text-red-600' },
  warn: { icon: AlertTriangle, cls: 'text-amber-600' },
  info: { icon: Info, cls: 'text-navy' },
};

// Estimado antes de medir el panel real (evita un salto visible en el primer paint — ver
// `reposicionar`). Un poco generoso: header + hasta 6 filas + footer.
const ALTURA_ESTIMADA = 420;

// Campana + ventana emergente (Fase 6, reposicionamiento en Fase 3): las notificaciones ya NO
// viven en una página completa para lo reciente. La campana abre un popover chico; "Mostrar más"
// ahora NAVEGA a /notificaciones (antes abría un modal `size='xl'` de 672px, insuficiente para
// filtros + tabla completa — la página ya existe y hace exactamente eso).
//
// Overlay Y panel van por portal a <body>, con posición calculada desde el botón: el topbar tiene
// backdrop-blur, que crea un containing block para `position:fixed` — un overlay fixed anidado ahí
// quedaría atrapado dentro del header en vez de cubrir la pantalla (mismo problema que documenta
// mobile-nav.tsx).
//
// Antes la posición se calculaba UNA sola vez al abrir (sin listeners de resize/scroll ni flip),
// así que scrollear la página o abrir la campana cerca del borde inferior dejaba el panel
// flotando lejos del botón o cortado por el viewport. `reposicionar` se llama al abrir y de nuevo
// en cada resize/scroll mientras está abierto, y decide `top` vs `bottom` según la altura real del
// panel (medida por `panelRef`) contra el espacio disponible.
export function NotificacionesBell({ notificaciones }: { notificaciones: Notificacion[] }) {
  const router = useRouter();
  const path = usePathname();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [coords, setCoords] = useState<{ top: number | null; bottom: number | null; right: number }>({
    top: null,
    bottom: null,
    right: 8,
  });
  const [, startTransition] = useTransition();

  useEffect(() => setAbierto(false), [path]);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto]);

  const reposicionar = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const margen = 8;
    const alturaPanel = panelRef.current?.offsetHeight ?? ALTURA_ESTIMADA;
    const cabeAbajo = r.bottom + margen + alturaPanel <= window.innerHeight;
    setCoords({
      top: cabeAbajo ? r.bottom + margen : null,
      bottom: cabeAbajo ? null : Math.max(8, window.innerHeight - r.top + margen),
      right: Math.max(8, window.innerWidth - r.right),
    });
  }, []);

  // Primera pasada (con estimado) antes de pintar, para no mostrar un flash en (0,0).
  useLayoutEffect(() => {
    if (!abierto) return;
    reposicionar();
  }, [abierto, reposicionar]);

  // Segunda pasada: el panel ya está en el DOM, así que `panelRef.offsetHeight` es la altura
  // real — corrige el flip si el estimado se pasó o se quedó corto.
  useLayoutEffect(() => {
    if (!abierto || !panelRef.current) return;
    reposicionar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, notificaciones.length]);

  useEffect(() => {
    if (!abierto) return;
    window.addEventListener('resize', reposicionar);
    window.addEventListener('scroll', reposicionar, true);
    return () => {
      window.removeEventListener('resize', reposicionar);
      window.removeEventListener('scroll', reposicionar, true);
    };
  }, [abierto, reposicionar]);

  function alternar() {
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
        createPortal(
          <>
            <div className="fixed inset-0 z-20" onClick={() => setAbierto(false)} aria-hidden />
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Notificaciones"
              style={{
                top: coords.top ?? undefined,
                bottom: coords.bottom ?? undefined,
                right: coords.right,
                visibility: coords.top === null && coords.bottom === null ? 'hidden' : 'visible',
              }}
              className="fixed z-30 w-80 max-w-[calc(100vw-1rem)] animate-fade rounded-xl border border-line bg-white shadow-lift"
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

              <Link
                href="/notificaciones"
                onClick={() => setAbierto(false)}
                className="block w-full rounded-b-xl border-t border-line/60 py-2.5 text-center text-xs font-medium text-navy transition-colors hover:bg-navy/5"
              >
                Mostrar más
              </Link>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
