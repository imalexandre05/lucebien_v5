import Link from 'next/link';
import { TIPOS_PEDIDO } from '@scilb/core';
import { clientesRepo } from '../../../lib/clientes-repo';
import { inventarioRepo } from '../../../lib/inventario-repo';
import { crearPedido } from '../actions';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Input, Select, Label } from '../../../components/ui/form';
import { Button, buttonVariants } from '../../../components/ui/button';

const SEDES = ['LB', 'ST', 'TR', 'AL'];

export default async function NuevoPedidoPage({ searchParams }: { searchParams: { error?: string } }) {
  const [clientes, activos] = await Promise.all([clientesRepo.listar(), inventarioRepo.listar()]);
  const disponibles = activos.filter((a) => a.estado === 'disponible' || a.estado === 'alquilado');

  return (
    <div className="max-w-2xl">
      <PageHeader title="Nuevo pedido" subtitle="Alquiler, venta o servicio" />
      <Card>
        <CardContent className="pt-5">
          {searchParams.error && (
            <p className="mb-4 rounded-md bg-amber-500/15 px-3 py-2 text-xs text-amber-700">
              Revisá los campos obligatorios (cliente, tipo, sede, fecha).
            </p>
          )}
          <form action={crearPedido} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="clienteId">Cliente</Label>
              <Select id="clienteId" name="clienteId" required defaultValue="">
                <option value="" disabled>
                  Elegí un cliente…
                </option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="tipo">Tipo</Label>
              <Select id="tipo" name="tipo" defaultValue="alquiler">
                {TIPOS_PEDIDO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="activoId">Activo (alquiler/venta)</Label>
              <Select id="activoId" name="activoId" defaultValue="">
                <option value="">— sin activo (servicio) —</option>
                {disponibles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} · {a.tipo} {a.talla}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="sedeCod">Sede</Label>
              <Select id="sedeCod" name="sedeCod" defaultValue="LB">
                {SEDES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="descripcion">Descripción (servicio)</Label>
              <Input id="descripcion" name="descripcion" placeholder="ej. Lavado en seco de saco" />
            </div>
            <div>
              <Label htmlFor="fecha">Fecha</Label>
              <Input id="fecha" name="fecha" type="date" required />
            </div>
            <div>
              <Label htmlFor="fechaDevolucion">Devolución (alquiler)</Label>
              <Input id="fechaDevolucion" name="fechaDevolucion" type="date" />
            </div>
            <div>
              <Label htmlFor="total">Total (S/)</Label>
              <Input id="total" name="total" type="number" step="0.01" placeholder="0.00" />
            </div>
            <div className="mt-2 flex gap-3 sm:col-span-2">
              <Button type="submit">Crear pedido</Button>
              <Link href="/pedidos" className={buttonVariants({ variant: 'ghost' })}>
                Cancelar
              </Link>
            </div>
          </form>
          <p className="mt-4 text-xs text-muted">
            Un pedido de <span className="font-medium">servicio</span> crea automáticamente una pasada en el pipeline interno.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
