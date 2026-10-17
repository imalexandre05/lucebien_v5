'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ExamenIniciado, Habilidad, IntentoExamen, ResultadoExamen, TipoExamen } from '../../../../lib/capacitacion-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Aviso, campoCls } from '../../../../components/ui/form';
import { cn } from '../../../../lib/cn';
import { accionCalificarPresencial, accionIniciarExamen, accionResponderExamen } from '../../examen-actions';

const NOMBRE: Record<TipoExamen, string> = { software: 'Examen de software', escrito: 'Examen escrito' };

export function ExamenCliente(props: {
  capId: string; enCurso: boolean; soyNuevo: boolean; puedeCalificar: boolean;
  intentos: IntentoExamen[]; habilidades: Habilidad[]; notas: Record<string, number>; vigente: number | null;
}) {
  const { capId, enCurso, soyNuevo, puedeCalificar, intentos, habilidades, notas, vigente } = props;
  const router = useRouter();
  const [error, setError] = useState('');
  const [pendiente, start] = useTransition();
  const [examen, setExamen] = useState<ExamenIniciado | null>(null);
  const [resp, setResp] = useState<Record<string, number>>({});
  const [resultado, setResultado] = useState<ResultadoExamen | null>(null);
  const [borrador, setBorrador] = useState<Record<string, string>>(
    Object.fromEntries(habilidades.map((h) => [h.id, notas[h.id] !== undefined ? String(notas[h.id]) : ''])),
  );

  function empezar(tipo: TipoExamen) {
    setError(''); setResultado(null); setResp({});
    start(async () => {
      const r = await accionIniciarExamen(capId, tipo);
      if (!r.ok) setError(r.error); else setExamen(r.examen);
    });
  }
  function enviar() {
    if (!examen) return;
    setError('');
    start(async () => {
      const r = await accionResponderExamen(examen.intentoId, resp);
      if (!r.ok) { setError(r.error); return; }
      setResultado(r.resultado); setExamen(null); router.refresh();
    });
  }
  function guardarPresencial() {
    setError('');
    const lista = habilidades.filter((h) => borrador[h.id] !== '').map((h) => ({ habilidad: h.id, nota: Number(borrador[h.id]) }));
    start(async () => {
      const r = await accionCalificarPresencial(capId, lista);
      if (!r.ok) setError(r.error); else router.refresh();
    });
  }

  const completas = examen ? examen.preguntas.every((p) => resp[p.id] !== undefined) : false;
  const faltanHab = habilidades.filter((h) => notas[h.id] === undefined).length;

  return (
    <div className="space-y-4">
      {error && <Aviso tono="error">{error}</Aviso>}
      {vigente !== null && (
        <p className="text-cuerpo text-navy">Nota vigente de los exámenes: <span className="tabular-nums font-semibold">{vigente}/20</span></p>
      )}

      {soyNuevo && enCurso && !examen && (
        <Card>
          <CardHeader><CardTitle>Rendir un examen</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-cuerpo text-muted">La nota se calcula sola al terminar. Cuenta la última nota de cada examen.</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pendiente} onClick={() => empezar('software')}>{NOMBRE.software}</Button>
              <Button variant="outline" disabled={pendiente} onClick={() => empezar('escrito')}>{NOMBRE.escrito}</Button>
            </div>
            {resultado && (
              <Aviso tono="exito">Tu nota: {resultado.nota}/20 ({resultado.aciertos} de {resultado.total} correctas).</Aviso>
            )}
          </CardContent>
        </Card>
      )}

      {examen && (
        <Card>
          <CardHeader><CardTitle>{NOMBRE[examen.tipo]}</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {examen.preguntas.map((p, n) => (
              <fieldset key={p.id} className="space-y-2">
                <legend className="text-cuerpo font-medium text-navy">{n + 1}. {p.enunciado}</legend>
                {p.opciones.map((o, i) => (
                  <label key={i} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-r-chico border border-line px-3 text-cuerpo text-navy', resp[p.id] === i && 'border-navy bg-navy/5')}>
                    <input type="radio" name={p.id} checked={resp[p.id] === i} onChange={() => setResp((r) => ({ ...r, [p.id]: i }))} />
                    {o}
                  </label>
                ))}
              </fieldset>
            ))}
            <Button disabled={pendiente || !completas} onClick={enviar}>Terminar examen</Button>
            {!completas && <p className="text-apoyo text-muted">Responde todas las preguntas para poder terminar.</p>}
          </CardContent>
        </Card>
      )}

      {puedeCalificar && (
        <Card>
          <CardHeader><CardTitle>Examen presencial de habilidades</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {habilidades.length === 0 ? (
              <p className="text-cuerpo text-muted">No hay habilidades en la lista. El administrador las agrega en Capacitación → Exámenes.</p>
            ) : (
              <>
                {habilidades.map((h) => (
                  <label key={h.id} className="flex items-center justify-between gap-3 text-cuerpo text-navy">
                    {h.nombre}
                    <input className={cn(campoCls, 'w-24 text-right tabular-nums')} type="number" min={0} max={20} step={0.5}
                      placeholder="/20" disabled={!enCurso} value={borrador[h.id] ?? ''}
                      onChange={(e) => setBorrador((b) => ({ ...b, [h.id]: e.target.value }))} />
                  </label>
                ))}
                {enCurso && <Button disabled={pendiente || Object.values(borrador).every((v) => v === '')} onClick={guardarPresencial}>Guardar notas</Button>}
                <p className="text-apoyo text-muted">
                  {faltanHab === 0 ? 'Todas las habilidades tienen nota: el presencial ya cuenta.' : `Faltan ${faltanHab} habilidad(es): el presencial cuenta cuando todas tienen nota.`}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Intentos</CardTitle></CardHeader>
        <CardContent>
          {intentos.length === 0 ? <p className="text-cuerpo text-muted">Aún no hay intentos.</p> : (
            <ul className="divide-y divide-line/60 text-cuerpo text-navy">
              {intentos.map((i) => (
                <li key={i.id} className="flex justify-between py-1.5">
                  <span>{NOMBRE[i.tipo]} · {new Date(i.creadoEn).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}</span>
                  <span className="tabular-nums">{i.estado === 'calificado' ? `${i.nota}/20` : 'sin terminar'}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
