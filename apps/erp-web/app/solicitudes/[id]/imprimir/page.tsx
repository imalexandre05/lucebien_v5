import { notFound } from 'next/navigation';
import { obtenerSolicitud } from '../../../../lib/solicitudes-repo';
import { ESTADO_LABEL, URGENCIA_LABEL, fechaHora } from '../../constantes';
import { ImprimirAcciones } from './imprimir-acciones';

// Formato imprimible único (Fase 11): a diferencia del sistema viejo, que tenía dos plantillas
// separadas (soliImprimirPedido / soliImprimirConfirmacion), esta se adapta sola según el estado
// actual — antes de la entrega muestra "Pedido a almacén" (qué se pide/envía), desde 'entregada'
// muestra también la columna Recibido y pasa a "Confirmación de entrega". Menos superficie que
// mantener sin perder ninguna de las dos lecturas.
export default async function ImprimirSolicitudPage({ params }: { params: { id: string } }) {
  const s = await obtenerSolicitud(params.id);
  if (!s) notFound();

  const tipo: 'pedido' | 'confirmacion' = s.estado === 'entregada' || s.estado === 'confirmada' ? 'confirmacion' : 'pedido';
  const yaImpreso = tipo === 'pedido' ? s.pedidoImpreso : s.confirmacionImpresa;

  return (
    <div className="mx-auto max-w-3xl">
      <ImprimirAcciones id={s.id} tipo={tipo} yaImpreso={yaImpreso} />

      <article className="rounded-lg border border-line bg-white p-10 shadow-card print:border-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-navy pb-4">
          <div>
            <div className="text-3xl font-semibold text-navy">LuceBien</div>
            <div className="mt-1 font-mono text-[10px] tracking-brand text-gold">
              {tipo === 'confirmacion' ? 'CONFIRMACIÓN DE ENTREGA' : 'PEDIDO A ALMACÉN'} · SCI-LB
            </div>
            <div className="mt-2 text-xs text-muted">Confecciones Aliaga E.I.R.L. · Huancayo, Perú</div>
          </div>
          <div className="text-right text-xs text-muted">
            <div className="font-mono text-[11px] text-navy">Ref. #{s.id.slice(0, 8).toUpperCase()}</div>
            <div className="mt-0.5">{fechaHora(s.createdAt)}</div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Sede</div>
            <div className="mt-0.5 font-mono text-navy">{s.sedeCod}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Solicitante</div>
            <div className="mt-0.5 text-navy">{s.solicitanteNombre ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Urgencia</div>
            <div className="mt-0.5 text-navy">{URGENCIA_LABEL[s.urgencia]}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Estado</div>
            <div className="mt-0.5 text-navy">{ESTADO_LABEL[s.estado]}</div>
          </div>
        </section>

        {s.obs && (
          <p className="mt-4 rounded-md bg-navy/5 px-3 py-2 text-xs text-ink">
            <b>Observación:</b> {s.obs}
          </p>
        )}
        {s.obsRespuesta && (
          <p className="mt-2 rounded-md bg-gold/10 px-3 py-2 text-xs text-ink">
            <b>Respuesta de almacén:</b> {s.obsRespuesta}
          </p>
        )}

        <table className="mt-6 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-navy/20 text-left uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-2">Tipo</th>
              <th className="py-1.5 pr-2">Color</th>
              <th className="py-1.5 pr-2">Talla</th>
              <th className="py-1.5 pr-2">Tela / Modelo</th>
              <th className="py-1.5 pr-2 text-right">Solicit.</th>
              <th className="py-1.5 pr-2 text-right">Enviado</th>
              {tipo === 'confirmacion' && <th className="py-1.5 pr-2 text-right">Recibido</th>}
              <th className="py-1.5">Obs.</th>
            </tr>
          </thead>
          <tbody>
            {s.items.map((i) => (
              <tr key={i.id} className="border-b border-line/70">
                <td className="py-1.5 pr-2 font-medium text-navy">{i.tipo}</td>
                <td className="py-1.5 pr-2">{i.color ?? '—'}</td>
                <td className="py-1.5 pr-2">{i.talla ?? '—'}</td>
                <td className="py-1.5 pr-2 text-muted">{[i.tela, i.modelo].filter(Boolean).join(' · ') || '—'}</td>
                <td className="py-1.5 pr-2 text-right font-mono">{i.cantidad}</td>
                <td className="py-1.5 pr-2 text-right font-mono">{i.cantidadEnviada || '—'}</td>
                {tipo === 'confirmacion' && <td className="py-1.5 pr-2 text-right font-mono">{i.cantidadRecibida || '—'}</td>}
                <td className="py-1.5 text-muted">{i.obs || i.detalle || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {s.recibeEnTienda && (
          <p className="mt-4 text-xs text-muted">
            Entregado a <b className="text-navy">{s.recibeEnTienda}</b> por <b className="text-navy">{s.entregadoPorNombre ?? '—'}</b> ·{' '}
            {fechaHora(s.fechaEntrega)}
          </p>
        )}
        {s.codigosPrenda && Object.keys(s.codigosPrenda).length > 0 && (
          <p className="mt-2 text-xs text-muted">
            <b className="text-navy">Códigos:</b> {Object.values(s.codigosPrenda).flat().join(', ')}
          </p>
        )}
        {s.motivoRechazo && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
            <b>Rechazada</b> por {s.rechazadoPorNombre ?? '—'} — {s.motivoRechazo}
          </p>
        )}

        <section className="mt-16 grid grid-cols-2 gap-10 text-center text-xs text-muted">
          <div>
            <div className="border-t border-ink/40 pt-2">Entrega — Almacén</div>
          </div>
          <div>
            <div className="border-t border-ink/40 pt-2">Recibe — {s.sedeCod}</div>
          </div>
        </section>
      </article>
    </div>
  );
}
