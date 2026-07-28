'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import type { MatrizPermisos, Rol, SedePerfil } from '@scilb/core';
import { Logo } from '../brand/logo';
import { SidebarNav, SidebarFooter } from './sidebar';

// Navegación móvil (<lg): hamburguesa en la topbar que abre la misma navegación de la
// sidebar como drawer off-canvas. Cierra con Escape, al tocar el fondo o al navegar.
// El drawer va por portal a <body>: el backdrop-blur de la topbar crea un containing
// block y un `fixed` anidado quedaría atrapado dentro del header.
export function MobileNav({
  rol,
  matriz,
  rolCod,
  perfilSede,
}: {
  rol: Rol;
  matriz: MatrizPermisos;
  rolCod?: string | null;
  perfilSede?: SedePerfil | null;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Abrir menú"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="-ml-2 flex h-11 w-11 items-center justify-center rounded-md text-navy outline-none transition-colors duration-150 hover:bg-navy/5 focus-visible:ring-2 focus-visible:ring-gold/70 active:scale-[0.97] lg:hidden"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú de navegación">
            <div className="absolute inset-0 animate-fade bg-navy-deep/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-drawer-in flex-col bg-navy-deep text-paper/80 shadow-lift">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
                <Logo tone="onDark" size="sm" />
                <button
                  type="button"
                  aria-label="Cerrar menú"
                  autoFocus
                  onClick={() => setOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-md text-paper/70 outline-none transition-colors duration-150 hover:bg-white/10 hover:text-paper focus-visible:ring-2 focus-visible:ring-gold/70 active:scale-[0.97]"
                >
                  <X className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </div>
              <SidebarNav rol={rol} matriz={matriz} rolCod={rolCod} perfilSede={perfilSede} />
              <SidebarFooter />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
