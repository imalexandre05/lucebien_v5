import { notFound } from 'next/navigation';
import { obtenerPago } from '../../../../lib/pagos-repo';
import { AccionesComprobante } from './imprimir';

export default async function ComprobantePago({ params }: { params: { id: string } }) {
  const p = await obtenerPago(params.id);
  if (!p) notFound();

  const fecha = p.fechaPago ?? p.createdAt.slice(0, 10);
  const estado = p.anulado ? 'anulado' : p.estado;

  return (
    <div className="mx-auto max-w-[700px]">
      <AccionesComprobante />

      <div className="rounded-lg border border-line bg-white p-8 shadow-card print:border-0 print:shadow-none">
        {/* Encabezado */}
        <div className="flex items-start justify-between border-b-2 border-navy pb-4">
          <div>
            <div className="font-display text-2xl font-semibold leading-none text-navy">
              Luce<span className="text-gold">Bien</span>
            </div>
            <div className="mt-1 text-xs text-muted">Confecciones Aliaga E.I.R.L. · RUC 20611777761</div>
            <div className="text-xs text-muted">Huancayo · Junín</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold uppercase tracking-wide text-navy">Comprobante de pago</div>
            <div className="mt-1 font-mono text-xs text-muted">N.º {p.id.slice(0, 8)}</div>
            <div className="font-mono text-xs text-muted">{fecha}</div>
          </div>
        </div>

        {/* Datos */}
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Colaborador</dt>
            <dd className="text-navy">{p.empleadoNombre ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">DNI</dt>
            <dd className="font-mono text-navy">{p.empleadoDni || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Cargo</dt>
            <dd className="capitalize text-navy">{(p.empleadoRol ?? '—').replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Método · Estado</dt>
            <dd className="capitalize text-navy">
              {p.metodo} · {estado}
            </dd>
          </div>
        </dl>

        {/* Monto */}
        <div className="mt-6 rounded-lg border border-gold/30 bg-gold/10 p-5 text-center">
          <div className="text-xs uppercase tracking-wide text-muted">Monto total</div>
          <div className="font-mono text-3xl font-bold tabular-nums text-navy">S/ {p.monto.toFixed(2)}</div>
          {(p.bonus > 0 || p.descuentos > 0) && (
            <div className="mt-1 text-xs text-muted">
              {p.bonus > 0 && <span>incluye bonus S/ {p.bonus.toFixed(2)}</span>}
              {p.bonus > 0 && p.descuentos > 0 && <span> · </span>}
              {p.descuentos > 0 && <span>descuentos S/ {p.descuentos.toFixed(2)}</span>}
            </div>
          )}
        </div>

        {/* Firmas */}
        <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs text-muted">
          <div>
            <div className="border-t border-ink/40 pt-1">Colaborador</div>
          </div>
          <div>
            <div className="border-t border-ink/40 pt-1">Responsable</div>
          </div>
        </div>
      </div>
    </div>
  );
}
