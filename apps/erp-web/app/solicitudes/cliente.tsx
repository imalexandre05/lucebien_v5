'use client';

import { useMemo, useState } from 'react';
import { Plus, Filter, ClipboardList } from 'lucide-react';
import { ESTADOS_SOLICITUD, URGENCIAS_SOLICITUD, type Rol } from '@scilb/core';
import type { Solicitud } from '../../lib/solicitudes-repo';
import type { ColorSolicitud, ArticuloSolicitud, TipoPrendaSolicitud } from '../../lib/solicitud-catalogos-repo';
import { NuevaSolicitudModal } from './nueva-solicitud';
import { DetalleSolicitudModal } from './detalle-solicitud';
import { ESTADO_LABEL, ESTADO_TONE, URGENCIA_LABEL, URGENCIA_TONE, fechaHora, resumenItems } from './constantes';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { buttonVariants } from '../../components/ui/button';
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';
import { StatBox } from '../../components/ui/stat-box';
import { EmptyState } from '../../components/ui/empty-state';
import { cn } from '../../lib/cn';

type Emp = { id: string; nombre: string; sedeCod: string | null };

// "Activas" (default) oculta rechazada/confirmada — mismo criterio que el filtro por defecto del
// sistema viejo (renderSolicitudes: `if(!fE&&(s.estado==='confirmada'||s.estado==='rechazada'))
// return false`), para que la bandeja del día a día no se llene de solicitudes ya cerradas.
const OPC_ESTADO: Opcion[] = [{ value: '', label: 'Activas' }, ...ESTADOS_SOLICITUD.map((e) => ({ value: e, label: ESTADO_LABEL[e] }))];
const OPC_URGENCIA: Opcion[] = [{ value: '', label: 'Toda urgencia' }, ...URGENCIAS_SOLICITUD.map((u) => ({ value: u, label: URGENCIA_LABEL[u] }))];

export function SolicitudesCliente({
  solicitudesIniciales,
  colores,
  articulos,
  tiposPrenda,
  empleados,
  rol,
  sedeActual,
}: {
  solicitudesIniciales: Solicitud[];
  colores: ColorSolicitud[];
  articulos: ArticuloSolicitud[];
  tiposPrenda: TipoPrendaSolicitud[];
  empleados: Emp[];
  rol: Rol;
  sedeActual: string;
}) {
  // Igual que PedidosCliente: los datos vienen del server component (page.tsx); las mutaciones
  // hacen router.refresh() dentro de los modales, que vuelve a pedir esta prop actualizada.
  const solicitudes = solicitudesIniciales;
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fUrgencia, setFUrgencia] = useState('');
  const [fSede, setFSede] = useState('');

  const sedes = useMemo(() => [...new Set(solicitudes.map((s) => s.sedeCod))].sort(), [solicitudes]);

  const resumen = useMemo(
    () => ({
      pendientes: solicitudes.filter((s) => s.estado === 'pendiente').length,
      aprobadas: solicitudes.filter((s) => s.estado === 'aprobada').length,
      entregadas: solicitudes.filter((s) => s.estado === 'entregada').length,
      confirmadas: solicitudes.filter((s) => s.estado === 'confirmada').length,
    }),
    [solicitudes],
  );

  const filtradas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return solicitudes.filter((s) => {
      if (fEstado) {
        if (s.estado !== fEstado) return false;
      } else if (s.estado === 'confirmada' || s.estado === 'rechazada') {
        return false;
      }
      if (fUrgencia && s.urgencia !== fUrgencia) return false;
      if (fSede && s.sedeCod !== fSede) return false;
      if (needle) {
        const texto = `${resumenItems(s.items)} ${s.solicitanteNombre ?? ''} ${s.obs}`.toLowerCase();
        if (!texto.includes(needle)) return false;
      }
      return true;
    });
  }, [solicitudes, q, fEstado, fUrgencia, fSede]);

  const detalle = detalleId ? (solicitudes.find((s) => s.id === detalleId) ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox index={0} label="Pendientes" valor={resumen.pendientes} tone="aviso" />
        <StatBox index={1} label="Aprobadas" valor={resumen.aprobadas} tone="navy" />
        <StatBox index={2} label="Entregadas" valor={resumen.entregadas} tone="exito" />
        <StatBox index={3} label="Confirmadas" valor={resumen.confirmadas} tone="neutro" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <span className="inline-flex items-center gap-1.5 text-rotulo font-semibold uppercase text-muted">
            <Filter className="h-3.5 w-3.5" strokeWidth={2} /> Filtros
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar ítem, solicitante u observación…"
            className="min-w-[13rem] flex-1 rounded-r-chico border border-line bg-white px-2.5 py-1.5 text-cuerpo text-navy outline-none transition-colors focus:border-gold"
          />
          <OpcionBotones opciones={OPC_ESTADO} value={fEstado} onChange={setFEstado} ariaLabel="Estado" />
          <OpcionBotones opciones={OPC_URGENCIA} value={fUrgencia} onChange={setFUrgencia} ariaLabel="Urgencia" />
          {sedes.length > 1 && (
            <select
              value={fSede}
              onChange={(e) => setFSede(e.target.value)}
              className="rounded-r-chico border border-line bg-white px-2.5 py-1.5 text-cuerpo text-navy outline-none focus:border-gold"
              aria-label="Sede"
            >
              <option value="">Todas las sedes</option>
              {sedes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => setNuevoAbierto(true)} className={cn(buttonVariants({ variant: 'primary' }), 'ml-auto')}>
            <Plus className="h-4 w-4" strokeWidth={2} /> Nueva solicitud
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Fecha</TH>
                <TH>Sede</TH>
                <TH>Ítems</TH>
                <TH>Urgencia</TH>
                <TH>Estado</TH>
                <TH>Solicitante</TH>
                <TH className="pr-5" />
              </TR>
            </THead>
            <TBody>
              {filtradas.map((s) => (
                <TR key={s.id} className={cn(s.sedeCod === sedeActual && 'border-l-2 border-l-navy bg-navy/[0.03]')}>
                  <TD className="pl-5 tabular-nums text-dato text-muted">{fechaHora(s.createdAt)}</TD>
                  <TD className="tabular-nums">{s.sedeCod}</TD>
                  <TD className="text-cuerpo">{resumenItems(s.items)}</TD>
                  <TD>
                    <Badge tone={URGENCIA_TONE[s.urgencia]}>{URGENCIA_LABEL[s.urgencia]}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={ESTADO_TONE[s.estado]}>{ESTADO_LABEL[s.estado]}</Badge>
                  </TD>
                  <TD>{s.solicitanteNombre ?? '—'}</TD>
                  <TD className="pr-5 text-right">
                    <button type="button" onClick={() => setDetalleId(s.id)} className={buttonVariants({ variant: 'ghost' })}>
                      Ver
                    </button>
                  </TD>
                </TR>
              ))}
              {filtradas.length === 0 && (
                <TR>
                  <TD colSpan={7} className="px-5 py-10">
                    <EmptyState icon={ClipboardList} titulo={solicitudes.length === 0 ? 'Sin solicitudes todavía' : 'Ninguna coincide con el filtro'}>
                      {solicitudes.length === 0 ? 'Usa "Nueva solicitud" para pedir prendas o artículos a almacén.' : undefined}
                    </EmptyState>
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <NuevaSolicitudModal open={nuevoAbierto} onClose={() => setNuevoAbierto(false)} colores={colores} articulos={articulos} tiposPrenda={tiposPrenda} />
      <DetalleSolicitudModal solicitud={detalle} onClose={() => setDetalleId(null)} rol={rol} sedeActual={sedeActual} empleados={empleados} colores={colores} />
    </div>
  );
}
