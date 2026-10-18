import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
import { listarMovimientosCodificados } from '../../../lib/pipeline-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { EmptyState } from '../../../components/ui/empty-state';

const ETAPAS: Record<string, string> = {
  recepcion: 'Recepción', lavado: 'Lavado', empatado: 'Empatado', refaccion: 'Refacción',
  compostura: 'Compostura', planchado: 'Planchado', control_calidad: 'Control calidad',
  listo: 'Listo p/ envío', enviado: 'Enviada', recibido: 'Recibida',
};
const etapa = (e: string | null) => (e ? (ETAPAS[e] ?? e) : 'Alta');

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });

// Apartado de codificación (ticket #16): cada movimiento de una prenda lleva su código. Sólo lectura.
// Spec: docs/superpowers/specs/pipeline/2026-10-17-codigo-en-todos-los-movimientos-design.md
export default async function CodificacionPage(props: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await props.searchParams;
  const movimientos = await listarMovimientosCodificados(q).catch(() => []);
  return (
    <div className="space-y-4">
      <PageHeader title="Codificación" subtitle="Cada movimiento de una prenda tiene su propio código" />
      <Link
        href="/pipeline"
        className="inline-flex items-center gap-1.5 text-cuerpo text-muted transition-colors duration-150 hover:text-navy"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Volver al kanban
      </Link>
      <form className="flex max-w-md items-center gap-2" action="/pipeline/codificacion">
        <Search className="h-4 w-4 text-muted" strokeWidth={2} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por código de movimiento (MOV-…)"
          className="h-11 w-full rounded-r-medio border border-line bg-white px-3 text-cuerpo"
        />
      </form>
      <Card>
        <CardContent>
          {movimientos.length === 0 ? (
            <EmptyState icon={Search} titulo="Sin movimientos">
              {q ? 'Ningún movimiento coincide con ese código.' : 'Aún no hay movimientos con código.'}
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <TR><TH>Código</TH><TH>Prenda</TH><TH>Movimiento</TH><TH>Quién</TH><TH>Cuándo</TH></TR>
              </THead>
              <TBody>
                {movimientos.map((m, i) => (
                  <TR key={m.codigoMov ?? `${m.prenda}-${i}`}>
                    <TD className="tabular-nums font-medium text-navy">{m.codigoMov ?? '—'}</TD>
                    <TD className="tabular-nums">{m.prenda}</TD>
                    <TD>{etapa(m.etapaAnterior)} → {etapa(m.etapaNueva)}</TD>
                    <TD>{m.quien ?? '—'}</TD>
                    <TD className="tabular-nums text-muted">{fechaHora(m.fecha)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
