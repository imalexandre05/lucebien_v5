import { notFound } from 'next/navigation';
import { pedidosRepo } from '../../../../lib/pedidos-repo';
import { PrintButton } from '../../../../components/print-button';

const SEDE_NOMBRE: Record<string, string> = {
  LB: 'Lucebien (Calle Real 380)',
  ST: 'Stand (Real 326)',
  TR: 'Trece',
  AL: 'Almacén Central',
};

export default async function ContratoPage({ params }: { params: { id: string } }) {
  const p = await pedidosRepo.obtener(params.id);
  if (!p) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end">
        <PrintButton />
      </div>

      <article className="rounded-r-medio border border-line bg-white p-10 shadow-card print:border-0 print:shadow-elev-0">
        <header className="border-b-2 border-navy pb-4">
          <div className="text-3xl font-semibold text-navy">LuceBien</div>
          <div className="mt-1 tabular-nums text-[10px] tracking-brand text-gold">CONTRATO DE ALQUILER · SCI-LB</div>
          <div className="mt-2 text-xs text-muted">Confecciones Aliaga E.I.R.L. · Huancayo, Perú</div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Cliente</div>
            <div className="mt-0.5 font-medium text-navy">{p.clienteNombre ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Sede</div>
            <div className="mt-0.5 text-navy">{SEDE_NOMBRE[p.sedeCod] ?? p.sedeCod}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Prenda</div>
            <div className="mt-0.5 tabular-nums text-navy">{p.detalle}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Monto</div>
            <div className="mt-0.5 tabular-nums text-navy">S/ {p.total.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Entrega</div>
            <div className="mt-0.5 tabular-nums text-navy">{p.fecha}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Devolución</div>
            <div className="mt-0.5 tabular-nums text-navy">{p.fechaDevolucion || '—'}</div>
          </div>
        </section>

        <section className="mt-6 space-y-2 text-xs leading-relaxed text-ink/80">
          <p className="font-medium text-navy">Condiciones</p>
          <p>1. El cliente recibe la prenda en buen estado y se compromete a devolverla en la fecha indicada.</p>
          <p>2. La demora en la devolución genera un recargo según tarifa vigente de la tienda.</p>
          <p>3. Daños o pérdida se cobran según el valor del activo registrado en inventario.</p>
          <p className="text-muted">* Cláusulas de muestra — el texto legal definitivo lo provee LuceBien.</p>
        </section>

        <section className="mt-12 grid grid-cols-2 gap-10 text-center text-xs text-muted">
          <div>
            <div className="border-t border-ink/40 pt-2">Firma del cliente</div>
          </div>
          <div>
            <div className="border-t border-ink/40 pt-2">Por LuceBien</div>
          </div>
        </section>
      </article>
    </div>
  );
}
