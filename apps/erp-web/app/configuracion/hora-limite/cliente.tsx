'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { HoraLimite, TurnoHora } from '../../../lib/hora-limite-repo';
import { accionGuardarHoras, type CambioHora } from './actions';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Button } from '../../../components/ui/button';
import { Aviso, campoCls } from '../../../components/ui/form';

const TURNOS: { id: TurnoHora; label: string }[] = [
  { id: 'M', label: 'Mañana' },
  { id: 'T', label: 'Tarde' },
  { id: 'C', label: 'Corrido' },
];

export function HoraLimiteCliente({
  sedes,
  horas,
  globales,
}: {
  sedes: { cod: string; nombre: string }[];
  horas: HoraLimite[];
  globales: Record<TurnoHora, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inicial = (s: string, t: TurnoHora) => horas.find((h) => h.sedeCod === s && h.turno === t)?.hora ?? '';
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(sedes.flatMap((s) => TURNOS.map((t) => [`${s.cod}|${t.id}`, inicial(s.cod, t.id)]))),
  );
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function guardar() {
    const cambios: CambioHora[] = [];
    for (const s of sedes) {
      for (const t of TURNOS) {
        const v = valores[`${s.cod}|${t.id}`] ?? '';
        if (v !== inicial(s.cod, t.id)) cambios.push({ sede: s.cod, turno: t.id, hora: v });
      }
    }
    if (cambios.length === 0) {
      setMsg({ ok: true, texto: 'No hay cambios por guardar.' });
      return;
    }
    startTransition(async () => {
      const r = await accionGuardarHoras(cambios);
      setMsg(r.ok ? { ok: true, texto: 'Horas guardadas.' } : { ok: false, texto: r.error ?? 'No se pudo guardar' });
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <Table>
          <THead>
            <TR>
              <TH>Sede</TH>
              {TURNOS.map((t) => (
                <TH key={t.id}>
                  {t.label} <span className="text-muted">(general {globales[t.id]})</span>
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {sedes.map((s) => (
              <TR key={s.cod}>
                <TD>{s.nombre}</TD>
                {TURNOS.map((t) => (
                  <TD key={t.id}>
                    <input
                      type="time"
                      aria-label={`${s.nombre} · ${t.label}`}
                      className={`${campoCls} tabular-nums`}
                      value={valores[`${s.cod}|${t.id}`] ?? ''}
                      onChange={(e) => setValores((v) => ({ ...v, [`${s.cod}|${t.id}`]: e.target.value }))}
                    />
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
        {msg && <Aviso tono={msg.ok ? 'exito' : 'error'}>{msg.texto}</Aviso>}
        <Button onClick={guardar} disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar horas'}
        </Button>
      </CardContent>
    </Card>
  );
}
