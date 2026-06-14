import Link from 'next/link';
import { inventarioRepo } from '../../lib/inventario-repo';
import { eliminarActivo } from './actions';

const ESTADO_LABEL: Record<string, string> = {
  disponible: 'Disponible',
  alquilado: 'Alquilado',
  en_lavanderia: 'En lavandería',
  baja: 'Baja',
};

export default async function InventarioPage() {
  const activos = await inventarioRepo.listar();
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-navy">Inventario comercial</h1>
        <Link href="/inventario/nuevo" className="rounded bg-navy px-4 py-2 text-white hover:bg-gold">
          + Nuevo activo
        </Link>
      </div>
      <p className="mb-4 font-body text-sm text-navy/70">
        Activos de alquiler/venta. El precio sugerido por uso acumulado (E3) se aplica cuando se
        confirme la regla — el modelo ya lo soporta (<code>usosAcumulados</code>).
      </p>
      <table className="w-full border-collapse font-body text-sm">
        <thead>
          <tr className="border-b-2 border-navy text-left text-navy">
            <th className="py-2 font-mono">Código</th>
            <th>Tipo</th>
            <th>Talla</th>
            <th>Color</th>
            <th>Sede</th>
            <th>Estado</th>
            <th className="text-right">Alquiler</th>
            <th className="text-right">Venta</th>
            <th className="text-right">Usos</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {activos.map((a) => (
            <tr key={a.id} className="border-b border-navy/10">
              <td className="py-2 font-mono font-medium text-navy">{a.codigo}</td>
              <td>{a.tipo}</td>
              <td>{a.talla}</td>
              <td>{a.color}</td>
              <td>{a.sedeCod}</td>
              <td>{ESTADO_LABEL[a.estado] ?? a.estado}</td>
              <td className="text-right">S/ {a.precioAlquiler.toFixed(2)}</td>
              <td className="text-right">S/ {a.precioVenta.toFixed(2)}</td>
              <td className="text-right">{a.usosAcumulados}</td>
              <td className="text-right">
                <form action={eliminarActivo}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-xs text-navy/50 hover:text-gold">Baja</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
