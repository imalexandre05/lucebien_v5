'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabase/browser';

// Escucha cambios en prenda_pasada (avanzar/enviar) y refresca el tablero EN VIVO, sin
// recargar. El canal respeta la RLS con la sesión del usuario. Reemplaza el SSE del viejo.
export function RealtimeRefresh() {
  const router = useRouter();
  useEffect(() => {
    const sb = getBrowserClient();
    const canal = sb
      .channel('pipeline-tablero')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prenda_pasada' }, () => {
        router.refresh();
      })
      .subscribe();
    return () => {
      sb.removeChannel(canal);
    };
  }, [router]);
  return null;
}
