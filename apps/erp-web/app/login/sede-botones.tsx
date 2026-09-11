'use client';

import { useState } from 'react';
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';

// "El dispositivo manda" (Fase 2): botones grandes en vez de <select> — el admin ya asignó una
// sede a este equipo desde /dispositivos y login/page.tsx la resuelve por RPC/lookup ANTES de
// pintar, así que `defaultSede` llega pre-marcada. Quien tiene varias tiendas (o entra desde un
// equipo compartido) puede cambiarla acá mismo antes de entrar; input oculto porque el value real
// lo manda el <form> del server action (iniciarSesion), no este componente.
export function SedeBotones({
  sedes,
  defaultSede,
}: {
  sedes: { cod: string; nombre: string }[];
  defaultSede: string;
}) {
  const [sede, setSede] = useState(defaultSede);
  const opciones: Opcion[] = sedes.map((s) => ({ value: s.cod, label: s.nombre }));

  return (
    <div>
      {/* Sin htmlFor: no hay un único control asociable (es un radiogroup) — accesible vía
          aria-label en OpcionBotones, igual que el resto de grupos de pills del proyecto. */}
      <label className="mb-1 block text-apoyo font-medium text-muted">Sede</label>
      <input type="hidden" name="sede" value={sede} />
      <OpcionBotones opciones={opciones} value={sede} onChange={setSede} ariaLabel="Sede" className="gap-2" />
    </div>
  );
}
