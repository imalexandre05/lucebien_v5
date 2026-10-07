import { notFound } from 'next/navigation';
import { obtenerPago } from '../../../../lib/pagos-repo';
import { AccionesComprobante } from './imprimir';

export default async function ComprobantePago(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const p = await obtenerPago(params.id);
  if (!p) notFound();

  const fecha = p.fechaPago ?? p.createdAt.slice(0, 10);
  const estado = p.anulado ? 'anulado' : p.estado;

  return (
    <div className="mx-auto max-w-[700px]">
      <AccionesComprobante />

      <div className="rounded-r-medio border border-line bg-white p-8 shadow-card print:border-0 print:shadow-elev-0">
        {/* Encabezado */}
        <div className="flex items-start justify-between border-b-2 border-navy pb-4">
          <div>
            <div className="text-2xl font-semibold leading-none text-navy">
              Luce<span className="text-gold">Bien</span>
            </div>
            <div className="mt-1 text-apoyo text-muted">Confecciones Aliaga E.I.R.L. · RUC 20611777761</div>
            <div className="text-apoyo text-muted">Huancayo · Junín</div>
          </div>
          <div className="text-right">
            <div className="text-rotulo font-semibold uppercase text-navy">Comprobante de pago</div>
            <div className="mt-1 tabular-nums text-dato text-muted">N.º {p.id.slice(0, 8)}</div>
            <div className="tabular-nums text-dato text-muted">{fecha}</div>
          </div>
        </div>

        {/* Datos */}
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-cuerpo">
          <div>
            <dt className="text-rotulo uppercase text-muted">Colaborador</dt>
            <dd className="text-navy">{p.empleadoNombre ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-rotulo uppercase text-muted">DNI</dt>
            <dd className="tabular-nums text-navy">{p.empleadoDni || '—'}</dd>
          </div>
          <div>
            <dt className="text-rotulo uppercase text-muted">Cargo</dt>
            <dd className="capitalize text-navy">{(p.empleadoRol ?? '—').replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-rotulo uppercase text-muted">Método · Estado</dt>
            <dd className="capitalize text-navy">
              {p.metodo} · {estado}
            </dd>
          </div>
        </dl>

        {/* Monto */}
        <div className="mt-6 rounded-r-chico border border-gold/30 bg-gold/10 p-5 text-center">
          <div className="text-rotulo uppercase text-muted">Monto total</div>
          <div className="tabular-nums text-3xl font-bold text-navy">S/ {p.monto.toFixed(2)}</div>
          {(p.bonus > 0 || p.descuentos > 0) && (
            <div className="mt-1 text-apoyo text-muted">
              {p.bonus > 0 && <span>incluye bonus S/ {p.bonus.toFixed(2)}</span>}
              {p.bonus > 0 && p.descuentos > 0 && <span> · </span>}
              {p.descuentos > 0 && <span>descuentos S/ {p.descuentos.toFixed(2)}</span>}
            </div>
          )}
        </div>

        {/* Firmas */}
        <div className="mt-12 grid grid-cols-2 gap-8 text-center text-apoyo text-muted">
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
