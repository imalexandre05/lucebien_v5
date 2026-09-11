'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Filter, AlertTriangle } from 'lucide-react';
import { accionAsignarResponsableIncidencia, accionCrearIncidencia, accionEliminarIncidencia } from './actions';
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

// Valor centinela del filtro por responsable: '' ya significa «todos», así que las incidencias
// sin responsable necesitan un valor propio. No colisiona con ningún id porque los ids de
// empleado son UUID.
const SIN_RESPONSABLE = '__sin_responsable__';

function NivelPill({ nivel }: { nivel: string }) {
  const cls =
    nivel === 'Alto'
      ? 'bg-error-soft text-error-deep'
      : nivel === 'Medio'
        ? 'bg-aviso-soft text-aviso-deep'
        : 'bg-paper text-muted';
  return <span className={cn('rounded-r-pastilla px-2.5 py-0.5 text-apoyo font-medium', cls)}>{nivel}</span>;
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
  const [fResponsable, setFResponsable] = useState('');
  // Qué fila está guardando su responsable: sin esto, el `pending` global de la transición
  // deshabilitaría los diez selectores a la vez y no se sabría cuál se está guardando.
  const [asignando, setAsignando] = useState<string | null>(null);

  const tiposPorCat = useMemo(() => {
    const m = new Map<string, TipoIncidencia[]>();
    for (const t of tipos) {
      const k = t.categoria ?? 'Otros';
      (m.get(k) ?? m.set(k, []).get(k)!).push(t);
    }
    return [...m.entries()];
  }, [tipos]);

  // C-2 (spec 2026-08-25-incidencias-alcance-y-formulario-design.md §3): el catálogo ya sabe la
  // gravedad de cada tipo (nivel_default). Sólo el tipo de categoría 'Otros' —hoy, únicamente
  // «Otro (especificar)»— deja elegir gravedad a mano, y en ese caso la descripción pasa a ser
  // obligatoria: es la única forma de saber qué pasó cuando el catálogo no lo puede decidir solo.
  const tipoSeleccionado = useMemo(() => tipos.find((t) => t.tipo === tipo), [tipos, tipo]);
  const esOtros = tipoSeleccionado?.categoria === 'Otros';
  const descripcionFalta = esOtros && !descripcion.trim();

  const sedes = useMemo(() => [...new Set(incidencias.map((i) => i.sedeCod))].sort(), [incidencias]);

  const filtradas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return incidencias.filter((i) => {
      if (fSede && i.sedeCod !== fSede) return false;
      if (fNivel && i.nivel !== fNivel) return false;
      if (fOrigen && (i.origen ?? 'manual') !== fOrigen) return false;
      if (fResponsable === SIN_RESPONSABLE) {
        if (i.responsableId) return false;
      } else if (fResponsable && i.responsableId !== fResponsable) return false;
      if (needle && !`${i.tipo} ${i.descripcion ?? ''} ${i.responsableNombre ?? ''}`.toLowerCase().includes(needle))
        return false;
      return true;
    });
  }, [incidencias, q, fSede, fNivel, fOrigen, fResponsable]);

  // Las que se registraron con «— sin responsable (el admin investigará) —» y siguen sin asignar:
  // es la cola de trabajo del admin y hasta ahora no había forma de encontrarlas.
  const sinResponsable = useMemo(() => incidencias.filter((i) => !i.responsableId).length, [incidencias]);

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

  // Asignar responsable NO pide confirmación a propósito: al contrario que eliminar, es
  // reversible desde el mismo selector — basta con volver a elegir. Lo que sí hace es guardar al
  // instante, porque un botón «Guardar» por fila en una tabla de 200 filas no se usa.
  function asignarResponsable(id: string, responsableId: string) {
    setErrorAccion('');
    setAsignando(id);
    startTransition(async () => {
      const r = await accionAsignarResponsableIncidencia(id, responsableId || null);
      setAsignando(null);
      if (r.ok) router.refresh();
      else setErrorAccion(r.error ?? 'No se pudo asignar el responsable.');
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
          <span className="inline-flex items-center gap-1.5 text-rotulo font-semibold uppercase text-muted">
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
          <select
            value={fResponsable}
            onChange={(e) => setFResponsable(e.target.value)}
            className={fieldCls}
            aria-label="Responsable"
          >
            <option value="">Todo responsable</option>
            <option value={SIN_RESPONSABLE}>Sin responsable{sinResponsable > 0 ? ` (${sinResponsable})` : ''}</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
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
                <label className="mb-1 block text-rotulo uppercase text-muted">Tipo</label>
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
                <label className="mb-1 block text-rotulo uppercase text-muted">Responsable</label>
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
            {esOtros && (
              // Sólo la categoría 'Otros' deja elegir gravedad a mano — en el resto de los 20
              // tipos ya la trae el catálogo (nivel_default) y preguntarla de nuevo es redundante.
              <div>
                <label className="mb-1 block text-rotulo uppercase text-muted">Gravedad</label>
                <div className="grid grid-cols-3 gap-2">
                  {NIVELES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNivel(n)}
                      className={cn(
                        'rounded-md border-2 px-3 py-2 text-cuerpo font-medium transition-colors duration-150',
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
            )}
            <div>
              <label className="mb-1 block text-rotulo uppercase text-muted">
                Descripción
                {esOtros && (
                  <span className="ml-0.5 font-semibold text-gold-deep">
                    *<span className="sr-only"> (obligatoria)</span>
                  </span>
                )}
              </label>
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder={esOtros ? 'Qué pasó… (obligatoria para este tipo)' : 'Qué pasó…'}
                aria-invalid={descripcionFalta}
                className={cn(fieldCls, 'w-full')}
              />
            </div>
            {error && <Aviso tono="error" className="text-cuerpo">{error}</Aviso>}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={registrar}
                disabled={!tipo || descripcionFalta}
                pending={pending}
                aria-describedby={!tipo || descripcionFalta ? 'motivo-incidencia' : undefined}
              >
                {pending ? 'Registrando…' : 'Registrar incidencia'}
              </Button>
              {!tipo ? (
                <span id="motivo-incidencia" className="text-apoyo font-medium text-aviso-deep">
                  Elige el tipo de incidencia para poder registrarla.
                </span>
              ) : (
                descripcionFalta && (
                  <span id="motivo-incidencia" className="text-apoyo font-medium text-aviso-deep">
                    La descripción es obligatoria para este tipo de incidencia.
                  </span>
                )
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
                  <TD className="pl-5 tabular-nums text-dato text-muted">{i.fecha}</TD>
                  <TD className="tabular-nums">{i.sedeCod}</TD>
                  <TD>
                    <div className="font-medium text-navy">{i.tipo}</div>
                    {i.descripcion && <div className="text-apoyo text-muted">{i.descripcion}</div>}
                  </TD>
                  <TD>
                    <NivelPill nivel={i.nivel} />
                  </TD>
                  <TD>
                    {esAdmin ? (
                      <>
                        <select
                          value={i.responsableId ?? ''}
                          onChange={(ev) => asignarResponsable(i.id, ev.target.value)}
                          disabled={pending && asignando === i.id}
                          className={cn(fieldCls, 'min-w-[10rem] max-w-[14rem]', !i.responsableId && 'border-aviso text-aviso-deep')}
                          aria-label={`Responsable de la incidencia ${i.tipo} del ${i.fecha}`}
                        >
                          <option value="">— sin responsable —</option>
                          {empleados.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.nombre}
                            </option>
                          ))}
                        </select>
                        {/* Sólo el administrador ve quién reportó (confirmado por Alexander): el
                            repo ya deja reportadoPorNombre en null para cualquier otra sesión. */}
                        {i.reportadoPorNombre && (
                          <div className="mt-1 text-apoyo text-muted">Reportado por: {i.reportadoPorNombre}</div>
                        )}
                      </>
                    ) : (
                      (i.responsableNombre ?? '—')
                    )}
                  </TD>
                  <TD>
                    {i.origen === 'reporte' && i.reporteId ? (
                      <Link
                        href={`/reportes/${i.reporteId}`}
                        className="toque inline-flex items-center rounded-r-pastilla bg-navy/5 px-2 py-0.5 tabular-nums text-micro text-navy transition hover:bg-navy/10"
                      >
                        reporte
                      </Link>
                    ) : (
                      <span className="text-apoyo text-muted">manual</span>
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

      {esAdmin && (
        // La consecuencia se dice donde se toma la decisión: quien cambia el responsable está
        // moviendo puntos de una evaluación a otra, y eso termina en el sueldo de alguien.
        <p className="text-apoyo text-muted">
          Elige el responsable en la columna correspondiente para asignarlo o cambiarlo; se guarda al
          instante. Los puntos de penalidad descuentan de la evaluación mensual de quien quede como
          responsable, así que un cambio mueve el descuento de una persona a la otra. Las
          evaluaciones ya cerradas conservan la nota con la que se cerraron.
        </p>
      )}
    </div>
  );
}
