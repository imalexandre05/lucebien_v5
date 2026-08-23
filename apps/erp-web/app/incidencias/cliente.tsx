'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Filter, AlertTriangle } from 'lucide-react';
import { accionCrearIncidencia, accionEliminarIncidencia } from './actions';
import type { Incidencia, TipoIncidencia } from '../../lib/incidencias-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Button, buttonVariants } from '../../components/ui/button';
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';
import { StatBox } from '../../components/ui/stat-box';
import { Aviso, campoCls } from '../../components/ui/form';
import { EmptyState } from '../../components/ui/empty-state';
import { DialogoConfirmar, useConfirmacion } from '../../components/ui/confirmar';
import { cn } from '../../lib/cn';

type Emp = { id: string; nombre: string };

const NIVELES = ['Alto', 'Medio', 'Bajo'];
const OPC_FILTRO_NIVEL: Opcion[] = [{ value: '', label: 'Todos los niveles' }, ...NIVELES.map((n) => ({ value: n, label: n }))];
const fieldCls = campoCls;

function NivelPill({ nivel }: { nivel: string }) {
  const cls =
    nivel === 'Alto'
      ? 'bg-error-soft text-error-deep'
      : nivel === 'Medio'
        ? 'bg-aviso-soft text-aviso-deep'
        : 'bg-paper text-muted';
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', cls)}>{nivel}</span>;
}

export function IncidenciasCliente({
  incidencias,
  tipos,
  empleados,
  esAdmin,
}: {
  incidencias: Incidencia[];
  tipos: TipoIncidencia[];
  empleados: Emp[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState('');
  const [nivel, setNivel] = useState('Medio');
  const [puntos, setPuntos] = useState(2);
  const [responsable, setResponsable] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState('');
  // Un error de la TABLA no puede mostrarse dentro del formulario: cuando se elimina una fila el
  // formulario suele estar cerrado, así que el mensaje se renderizaría en un bloque invisible —
  // peor que el alert() nativo que había, porque al menos aquél se veía.
  const [errorAccion, setErrorAccion] = useState('');
  const conf = useConfirmacion();
  const [pending, startTransition] = useTransition();

  // Filtros.
  const [q, setQ] = useState('');
  const [fSede, setFSede] = useState('');
  const [fNivel, setFNivel] = useState('');
  const [fOrigen, setFOrigen] = useState('');

  const tiposPorCat = useMemo(() => {
    const m = new Map<string, TipoIncidencia[]>();
    for (const t of tipos) {
      const k = t.categoria ?? 'Otros';
      (m.get(k) ?? m.set(k, []).get(k)!).push(t);
    }
    return [...m.entries()];
  }, [tipos]);

  const sedes = useMemo(() => [...new Set(incidencias.map((i) => i.sedeCod))].sort(), [incidencias]);

  const filtradas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return incidencias.filter((i) => {
      if (fSede && i.sedeCod !== fSede) return false;
      if (fNivel && i.nivel !== fNivel) return false;
      if (fOrigen && (i.origen ?? 'manual') !== fOrigen) return false;
      if (needle && !`${i.tipo} ${i.descripcion ?? ''} ${i.responsableNombre ?? ''}`.toLowerCase().includes(needle))
        return false;
      return true;
    });
  }, [incidencias, q, fSede, fNivel, fOrigen]);

  const resumen = useMemo(
    () => ({
      total: filtradas.length,
      alto: filtradas.filter((i) => i.nivel === 'Alto').length,
      medio: filtradas.filter((i) => i.nivel === 'Medio').length,
      bajo: filtradas.filter((i) => i.nivel === 'Bajo').length,
      puntos: Math.round(filtradas.reduce((s, i) => s + i.puntosPenalidad, 0) * 10) / 10,
    }),
    [filtradas],
  );

  function elegirTipo(nombreTipo: string) {
    setTipo(nombreTipo);
    const t = tipos.find((x) => x.tipo === nombreTipo);
    if (t) {
      setNivel(t.nivelDefault);
      setPuntos(t.puntosDefault);
    }
  }

  function registrar() {
    setError('');
    startTransition(async () => {
      const r = await accionCrearIncidencia({
        tipo,
        nivel,
        descripcion,
        responsableId: responsable || null,
        puntosPenalidad: puntos,
      });
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setAbierto(false);
      setTipo('');
      setDescripcion('');
      setResponsable('');
      router.refresh();
    });
  }

  function eliminar(id: string) {
    conf.pedir({
      titulo: '¿Eliminar esta incidencia?',
      detalle: 'Los puntos que descuenta vuelven a la evaluación del responsable.',
      confirmarLabel: 'Eliminar',
      alConfirmar: () =>
        startTransition(async () => {
          setErrorAccion('');
          const r = await accionEliminarIncidencia(id);
          if (r.ok) {
            conf.cerrar();
            router.refresh();
          } else setErrorAccion(r.error ?? 'No se pudo eliminar la incidencia.');
        }),
    });
  }

  return (
    <div className="space-y-4">
      <DialogoConfirmar {...conf.props} pending={pending} />
      {errorAccion && <Aviso tono="error">{errorAccion}</Aviso>}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <StatBox index={0} label="Incidencias" valor={resumen.total} tone="navy" />
        <StatBox index={1} label="Alto" valor={resumen.alto} tone="error" />
        <StatBox index={2} label="Medio" valor={resumen.medio} tone="aviso" />
        <StatBox index={3} label="Bajo" valor={resumen.bajo} tone="neutro" />
        <StatBox index={4} label="Puntos" valor={resumen.puntos} tone="gold" />
      </div>

      {/* Filtros + acción */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <Filter className="h-3.5 w-3.5" strokeWidth={2} /> Filtros
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar tipo, descripción o responsable…"
            className={`${fieldCls} min-w-[13rem] flex-1`}
          />
          <select value={fSede} onChange={(e) => setFSede(e.target.value)} className={fieldCls} aria-label="Sede">
            <option value="">Todas las sedes</option>
            {sedes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <OpcionBotones opciones={OPC_FILTRO_NIVEL} value={fNivel} onChange={setFNivel} ariaLabel="Nivel" />
          <select value={fOrigen} onChange={(e) => setFOrigen(e.target.value)} className={fieldCls} aria-label="Origen">
            <option value="">Todo origen</option>
            <option value="manual">Manual</option>
            <option value="reporte">De reporte</option>
          </select>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className={cn(buttonVariants({ variant: abierto ? 'outline' : 'primary' }), 'ml-auto')}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            {abierto ? 'Cerrar' : 'Nueva incidencia'}
          </button>
        </CardContent>
      </Card>

      {abierto && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar incidencia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tipo</label>
                <select value={tipo} onChange={(e) => elegirTipo(e.target.value)} className={cn(fieldCls, 'w-full')}>
                  <option value="">Elige un tipo…</option>
                  {tiposPorCat.map(([cat, lista]) => (
                    <optgroup key={cat} label={cat}>
                      {lista.map((t) => (
                        <option key={t.id} value={t.tipo}>
                          {t.tipo}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Responsable</label>
                <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={cn(fieldCls, 'w-full')}>
                  <option value="">— sin responsable (el admin investigará) —</option>
                  {empleados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Gravedad</label>
              <div className="grid grid-cols-3 gap-2">
                {NIVELES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNivel(n)}
                    className={cn(
                      'rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors duration-150',
                      nivel === n
                        ? n === 'Alto'
                          ? 'border-error bg-error-soft text-error-deep'
                          : n === 'Medio'
                            ? 'border-aviso bg-aviso-soft text-aviso-deep'
                            : 'border-muted bg-paper text-ink'
                        : 'border-line bg-white text-muted hover:border-gold/60',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Descripción</label>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué pasó…" className={cn(fieldCls, 'w-full')} />
            </div>
            {error && <Aviso tono="error" className="text-sm">{error}</Aviso>}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={registrar}
                disabled={!tipo}
                pending={pending}
                aria-describedby={!tipo ? 'motivo-incidencia' : undefined}
              >
                {pending ? 'Registrando…' : 'Registrar incidencia'}
              </Button>
              {!tipo && (
                <span id="motivo-incidencia" className="text-xs font-medium text-aviso-deep">
                  Elige el tipo de incidencia para poder registrarla.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Fecha</TH>
                <TH>Sede</TH>
                <TH>Tipo</TH>
                <TH>Nivel</TH>
                <TH>Responsable</TH>
                <TH>Origen</TH>
                <TH className="text-right">Puntos</TH>
                {esAdmin && <TH className="pr-5" />}
              </TR>
            </THead>
            <TBody>
              {filtradas.map((i) => (
                <TR key={i.id}>
                  <TD className="pl-5 tabular-nums text-xs text-muted">{i.fecha}</TD>
                  <TD className="tabular-nums">{i.sedeCod}</TD>
                  <TD>
                    <div className="font-medium text-navy">{i.tipo}</div>
                    {i.descripcion && <div className="text-xs text-muted">{i.descripcion}</div>}
                  </TD>
                  <TD>
                    <NivelPill nivel={i.nivel} />
                  </TD>
                  <TD>{i.responsableNombre ?? '—'}</TD>
                  <TD>
                    {i.origen === 'reporte' && i.reporteId ? (
                      <Link
                        href={`/reportes/${i.reporteId}`}
                        className="toque inline-flex items-center rounded-full bg-navy/5 px-2 py-0.5 tabular-nums text-[11px] text-navy transition hover:bg-navy/10"
                      >
                        reporte
                      </Link>
                    ) : (
                      <span className="text-xs text-muted">manual</span>
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">{i.puntosPenalidad || '—'}</TD>
                  {esAdmin && (
                    <TD className="pr-5 text-right">
                      <button type="button" onClick={() => eliminar(i.id)} className="text-muted transition-colors hover:text-error" aria-label="Eliminar">
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </TD>
                  )}
                </TR>
              ))}
              {filtradas.length === 0 && (
                <TR>
                  <TD className="p-0" colSpan={esAdmin ? 8 : 7}>
                    {incidencias.length === 0 ? (
                      <EmptyState icon={AlertTriangle} titulo="Sin incidencias registradas" compacto>
                        Una incidencia deja constancia de algo que salió mal y descuenta puntos de la
                        evaluación del responsable. Se registran con el botón de arriba.
                      </EmptyState>
                    ) : (
                      <EmptyState icon={Filter} titulo="Ninguna coincide con el filtro" compacto>
                        Hay {incidencias.length} registradas en total. Prueba con otro nivel u otro
                        tipo.
                      </EmptyState>
                    )}
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
