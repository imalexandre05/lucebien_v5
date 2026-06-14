import Link from 'next/link';
import { ESTADOS_ACTIVO } from '@scilb/core';
import { crearActivo } from '../actions';

const field = 'rounded border border-navy/30 px-3 py-2 font-body text-sm';

export default function NuevoActivoPage() {
  return (
    <div className="max-w-xl">
      <h1 className="mb-4 font-display text-3xl font-semibold text-navy">Nuevo activo</h1>
      <form action={crearActivo} className="grid grid-cols-2 gap-3">
        <input name="codigo" placeholder="Código (TN-042)" className={`${field} font-mono`} required />
        <input name="tipo" placeholder="Tipo (TN, CM)" className={field} required />
        <input name="talla" placeholder="Talla" className={field} />
        <input name="color" placeholder="Color" className={field} />
        <input name="sedeCod" placeholder="Sede (LB, ST, TR, AL)" className={field} required />
        <select name="estado" className={field} defaultValue="disponible">
          {ESTADOS_ACTIVO.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <input name="precioBase" type="number" step="0.01" placeholder="Precio base" className={field} />
        <input name="precioAlquiler" type="number" step="0.01" placeholder="Precio alquiler" className={field} />
        <input name="precioVenta" type="number" step="0.01" placeholder="Precio venta" className={field} />
        <input name="usosAcumulados" type="number" placeholder="Usos acumulados" className={field} />
        <div className="col-span-2 mt-2 flex gap-3">
          <button className="rounded bg-navy px-4 py-2 text-white hover:bg-gold">Guardar</button>
          <Link href="/inventario" className="px-4 py-2 text-navy/60 hover:text-navy">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
