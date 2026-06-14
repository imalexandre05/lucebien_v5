import Link from 'next/link';
import { crearCliente } from '../actions';

const field = 'rounded border border-navy/30 px-3 py-2 font-body text-sm';

export default function NuevoClientePage() {
  return (
    <div className="max-w-xl">
      <h1 className="mb-4 font-display text-3xl font-semibold text-navy">Nuevo cliente</h1>
      <form action={crearCliente} className="grid grid-cols-2 gap-3">
        <input name="nombre" placeholder="Nombre completo" className={`${field} col-span-2`} required />
        <input name="dni" placeholder="DNI (8 dígitos)" className={`${field} font-mono`} />
        <input name="telefono" placeholder="Teléfono" className={field} />
        <input name="sedeCod" placeholder="Sede (LB, ST, TR, AL)" className={field} required />
        <input name="talla" placeholder="Talla" className={field} />
        <div className="col-span-2 mt-2 flex gap-3">
          <button className="rounded bg-navy px-4 py-2 text-white hover:bg-gold">Guardar</button>
          <Link href="/clientes" className="px-4 py-2 text-navy/60 hover:text-navy">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
