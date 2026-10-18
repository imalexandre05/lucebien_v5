import Link from 'next/link';
import { Search } from 'lucide-react';
import { estadoTrazabilidad, type EstadoTrazabilidad } from '@scilb/core';
import { buscarTrazabilidad } from '../../lib/trazabilidad-repo';
import { PageHeader } from '../../components/shell/page-header';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { buttonVariants } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';

// Mismas etiquetas que el resto del ERP (app/page.tsx, app/inventario/cliente.tsx,
// app/pedidos/[id]/acciones.tsx) — se duplican localmente siguiendo la convención ya establecida
// en esos archivos en vez de forzar una abstracción compartida nueva.
const ETAPA_LABEL: Record<string, string> = {
  recepcion: 'Recepción',
  codificacion: 'Codificación',
  lavado: 'Lavado',
  empatado: 'Empatado',
  vacio: 'Vacío',
  refaccion: 'Refacción',
  compostura: 'Compostura',
  planchado: 'Planchado',
  control_calidad: 'Calidad',
  listo: 'Listo p/ envío',
};
const ETAPA_CONFECCION_LABEL: Record<string, string> = { corte: 'Corte', armado: 'Armado', ajuste: 'Ajuste', entrega: 'Entrega' };

function EstadoBadge({ estado }: { estado: EstadoTrazabilidad }) {
  const TONE: Record<EstadoTrazabilidad['tipo'], Tone> = {
    baja: 'gray',
    en_confeccion: 'amber',
    en_pipeline: 'gold',
    alquilado: 'navy',
    vendido: 'gray',
    disponible: 'green',
  };
  let texto = 'Disponible en tienda';
  if (estado.tipo === 'baja') texto = 'De baja';
  if (estado.tipo === 'en_confeccion') texto = `En confección · ${estado.etapa ? ETAPA_CONFECCION_LABEL[estado.etapa] ?? estado.etapa : 'sin etapa'}`;
  if (estado.tipo === 'en_pipeline') texto = `En proceso · ${ETAPA_LABEL[estado.etapa] ?? estado.etapa}`;
  if (estado.tipo === 'alquilado') texto = `Alquilado${estado.clienteNombre ? ` · ${estado.clienteNombre}` : ''}`;
  if (estado.tipo === 'vendido') texto = `Vendido${estado.clienteNombre ? ` · ${estado.clienteNombre}` : ''}`;
  return <Badge tone={TONE[estado.tipo]}>{texto}</Badge>;
}

// Buscador de trazabilidad (Fase 10, última del plan): un solo lugar para responder "¿dónde está
// este terno?" reuniendo inventario (Fase 8) + pipeline de lavandería (Fase 5) + pedidos (Fase 9).
export default async function BuscarPage(props: { searchParams: Promise<{ q?: string }> }) {
  const searchParams = await props.searchParams;
  const q = searchParams.q ?? '';
  const resultados = q ? await buscarTrazabilidad(q) : [];

  return (
    <div>
      <PageHeader title="Buscar" subtitle="Dónde está un terno y en qué proceso" />
      <Card>
        <CardContent className="py-4">
          <form className="flex gap-2" action="/buscar">
            <input
              type="text"
              name="q"
              defaultValue={q}
              autoFocus
              placeholder="Código (TN-042), tipo, talla, color…"
              className="flex-1 rounded-r-chico border border-line bg-white px-3 py-2 text-cuerpo text-navy outline-none transition-colors focus:border-gold"
            />
            <button type="submit" className={buttonVariants({ variant: 'primary' })}>
              <Search className="h-4 w-4" strokeWidth={2} />
              Buscar
            </button>
          </form>
        </CardContent>
      </Card>

      {q && (
        <Card className="mt-4">
          <CardContent className="overflow-x-auto px-0 pb-0">
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Código</TH>
                  <TH>Tipo</TH>
                  <TH>Talla / Color</TH>
                  <TH>Sede</TH>
                  <TH>Situación</TH>
                  <TH className="pr-5">Devolución</TH>
                </TR>
              </THead>
              <TBody>
                {resultados.map(({ activo, pedido }) => {
                  const estado = estadoTrazabilidad({ estadoActivo: activo.estado, enPipeline: activo.enPipeline, pedido });
                  return (
                    <TR key={activo.id}>
                      <TD className="pl-5 tabular-nums font-medium text-navy">
                        <Link href="/inventario" className="transition-colors hover:text-gold">
                          {activo.codigo}
                        </Link>
                      </TD>
                      <TD>{activo.tipo}</TD>
                      <TD>
                        {activo.talla} · {activo.color}
                      </TD>
                      <TD className="tabular-nums">{activo.sedeCod}</TD>
                      <TD>
                        <EstadoBadge estado={estado} />
                      </TD>
                      <TD className="pr-5 tabular-nums text-muted">{estado.tipo === 'alquilado' ? estado.fechaDevolucion || '—' : '—'}</TD>
                    </TR>
                  );
                })}
                {resultados.length === 0 && (
                  <TR>
                    <TD colSpan={6} className="px-5 py-10">
                      <EmptyState icon={Search} titulo="Sin coincidencias">
                        Prueba con el código exacto (ej. TN-042) o parte del tipo, talla o color.
                      </EmptyState>
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
