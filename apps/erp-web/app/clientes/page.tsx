import Link from 'next/link';
import { clientesRepo } from '../../lib/clientes-repo';
import { eliminarCliente } from './actions';

export default async function ClientesPage() {
  const clientes = await clientesRepo.listar();
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-navy">Clientes</h1>
        <Link href="/clientes/nuevo" className="rounded bg-navy px-4 py-2 text-white hover:bg-gold">
          + Nuevo cliente
        </Link>
      </div>
      <table className="w-full border-collapse font-body text-sm">
        <thead>
          <tr className="border-b-2 border-navy text-left text-navy">
            <th className="py-2">Nombre</th>
            <th className="font-mono">DNI</th>
            <th>Teléfono</th>
            <th>Sede</th>
            <th>Talla</th>
            <th>Alta</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.id} className="border-b border-navy/10">
              <td className="py-2 font-medium text-navy">{c.nombre}</td>
              <td className="font-mono">{c.dni || '—'}</td>
              <td>{c.telefono || '—'}</td>
              <td>{c.sedeCod}</td>
              <td>{c.medidas.talla || '—'}</td>
              <td className="font-mono text-navy/60">{c.createdAt}</td>
              <td className="text-right">
                <form action={eliminarCliente}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-xs text-navy/50 hover:text-gold">Eliminar</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
