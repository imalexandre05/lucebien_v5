'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Save, Grid3x3, Copy, Trash2, CopyPlus, AlertTriangle, Check } from 'lucide-react';
import { zonasSolapadasInesperadas } from '@scilb/core';
import type { LayoutZona } from '../../../lib/reportes-repo';
import type { Sede } from '../../../lib/sedes-repo';
import type { ZonaInput } from '../../../lib/layout-repo';
import { accionGuardarLayout, accionClonarLayout } from './actions';
import { LIENZO_W, LIENZO_H, formaZona, texturaZona } from '../../reportes/layout-map';
import { Card, CardContent } from '../../../components/ui/card';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Aviso, campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

const fieldCls = campoCls;

const GRID = 5;
const TIPOS = ['mueble', 'maniqui', 'vitrina', 'espejo', 'riel', 'silla', 'equipo', 'area'];
// Los colores que se le ofrecen al administrador para pintar una zona del lienzo.
//
// Van en hexadecimal porque terminan guardados en la base y dibujados con `style`, no con clases:
// el guard de diseño no los ve. Eran seis amarillos, azules y grises por defecto de Tailwind —la
// paleta que el sistema dejó de usar— colados por esa puerta.
//
// Ahora salen de los tokens. Las zonas ya pintadas conservan su color: lo guardado es un valor, no
// una referencia, así que cambiar esta lista no repinta nada de lo que ya existe.
const SWATCHES = [
  '#b8a515', // gold
  '#d4bf1e', // gold-soft
  '#2e3e6e', // navy
  '#2f7f88', // cat-mar
  '#6f5aa8', // cat-lila
  '#b5643f', // cat-arcilla
];
const TIPO_LABEL: Record<string, string> = {
  mueble: 'Mueble / mostrador',
  maniqui: 'Maniquí',
  vitrina: 'Mampara / vitrina',
  espejo: 'Espejo',
  riel: 'Riel',
  silla: 'Silla',
  equipo: 'Equipo',
  area: 'Área (no puntúa)',
};

type ZonaEdit = ZonaInput & { key: number };
type Drag = {
  key: number;
  modo: 'move' | 'nw' | 'ne' | 'sw' | 'se';
  startX: number;
  startY: number;
  orig: { posX: number; posY: number; ancho: number; alto: number };
};

const snap = (v: number) => Math.round(v / GRID) * GRID;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function LayoutEditor({
  sede,
  sedes,
  zonasIniciales,
}: {
  sede: string;
  sedes: Sede[];
  zonasIniciales: LayoutZona[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [zonas, setZonas] = useState<ZonaEdit[]>(() =>
    zonasIniciales.map(({ id: _id, ...z }, i) => ({ ...z, key: i + 1 })),
  );
  const [selKey, setSelKey] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'M' | 'T'>('todos');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [clonarAbierto, setClonarAbierto] = useState(false);
  const [clonarDe, setClonarDe] = useState('');

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const enCanvas = zonas.filter((z) => z.forma !== 'special');
  const especiales = zonas.filter((z) => z.forma === 'special');
  const sel = zonas.find((z) => z.key === selKey) ?? null;
  const totalPts = useMemo(
    () => Math.round(zonas.filter((z) => z.tipo !== 'area').reduce((s, z) => s + (z.peso || 0), 0) * 10) / 10,
    [zonas],
  );
  const muebles = enCanvas.filter((z) => z.tipo === 'mueble');

  // Fase 5 tarea 2: aviso de solapes al guardar. zonasSolapadasInesperadas ya descarta el solape
  // "sobre" declarado (un maniquí sobre su mueble exacto es intencional) — solo avisa de pares
  // que probablemente sean un accidente de arrastre. No bloquea: el mapa de limpieza ya resuelve
  // cualquier solape con el desplegable de "zonas ocultas aquí", así que guardar sigue siendo
  // seguro; esto es solo una señal para que el admin confirme que la posición es la deseada.
  const solapesInesperados = useMemo(
    () =>
      zonasSolapadasInesperadas(
        enCanvas.map((z) => ({
          cod: z.cod,
          posX: z.posX,
          posY: z.posY,
          ancho: z.ancho,
          alto: z.alto,
          nivel: z.nivel,
          sobreCod: z.sobreCod,
        })),
      ),
    [enCanvas],
  );

  // Aviso al salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = (key: number, patch: Partial<ZonaEdit>) => {
    setZonas((zs) => zs.map((z) => (z.key === key ? { ...z, ...patch } : z)));
    setDirty(true);
    setOkMsg('');
  };

  const aplicaFiltro = (z: ZonaEdit) => {
    if (filtro === 'todos') return true;
    const t = (z.turno || 'ambos').toLowerCase();
    if (filtro === 'M') return t === 'ambos' || t === 'mañana';
    return t === 'ambos' || t === 'tarde';
  };

  // ── Drag & resize (pointer events, coordenadas del lienzo 800×580) ──
  function empezarDrag(e: React.PointerEvent, z: ZonaEdit, modo: Drag['modo']) {
    e.preventDefault();
    e.stopPropagation();
    setSelKey(z.key);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      key: z.key,
      modo,
      startX: e.clientX,
      startY: e.clientY,
      orig: { posX: z.posX, posY: z.posY, ancho: z.ancho, alto: z.alto },
    };
  }

  function moverDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const sx = LIENZO_W / rect.width;
    const sy = LIENZO_H / rect.height;
    const dx = (e.clientX - d.startX) * sx;
    const dy = (e.clientY - d.startY) * sy;
    const o = d.orig;

    let { posX, posY, ancho, alto } = o;
    if (d.modo === 'move') {
      posX = clamp(snap(o.posX + dx), 0, LIENZO_W - o.ancho);
      posY = clamp(snap(o.posY + dy), 0, LIENZO_H - o.alto);
    } else {
      if (d.modo.includes('e')) ancho = clamp(snap(o.ancho + dx), 12, LIENZO_W - o.posX);
      if (d.modo.includes('s')) alto = clamp(snap(o.alto + dy), 12, LIENZO_H - o.posY);
      if (d.modo.includes('w')) {
        ancho = clamp(snap(o.ancho - dx), 12, o.posX + o.ancho);
        posX = o.posX + o.ancho - ancho;
      }
      if (d.modo.includes('n')) {
        alto = clamp(snap(o.alto - dy), 12, o.posY + o.alto);
        posY = o.posY + o.alto - alto;
      }
    }
    set(d.key, { posX, posY, ancho, alto });
  }

  const soltarDrag = () => {
    dragRef.current = null;
  };

  function tecla(e: React.KeyboardEvent, z: ZonaEdit) {
    const paso = e.shiftKey ? 1 : GRID;
    if (e.key === 'ArrowLeft') set(z.key, { posX: clamp(z.posX - paso, 0, LIENZO_W - z.ancho) });
    else if (e.key === 'ArrowRight') set(z.key, { posX: clamp(z.posX + paso, 0, LIENZO_W - z.ancho) });
    else if (e.key === 'ArrowUp') set(z.key, { posY: clamp(z.posY - paso, 0, LIENZO_H - z.alto) });
    else if (e.key === 'ArrowDown') set(z.key, { posY: clamp(z.posY + paso, 0, LIENZO_H - z.alto) });
    else if (e.key === 'Delete') eliminarZona(z.key);
    else return;
    e.preventDefault();
  }

  // ── Herramientas ──
  function agregarZona() {
    const key = Math.max(0, ...zonas.map((z) => z.key)) + 1;
    const usados = zonas.map((z) => parseInt(z.cod.replace(/^Z/, ''), 10) || 0);
    const cod = `Z${String(Math.max(0, ...usados) + 1).padStart(2, '0')}`;
    const nueva: ZonaEdit = {
      key,
      cod,
      nombre: 'Nueva zona',
      turno: 'ambos',
      tipo: 'mueble',
      peso: 1,
      posX: snap(LIENZO_W / 2 - 40),
      posY: snap(LIENZO_H / 2 - 25),
      ancho: 80,
      alto: 50,
      color: '#b8a515', // gold: el color con el que nace una zona nueva
      forma: 'rect',
      nivel: 'piso',
      sobreCod: '',
    };
    setZonas((zs) => [...zs, nueva]);
    setSelKey(key);
    setDirty(true);
  }

  function duplicarZona(key: number) {
    const z = zonas.find((x) => x.key === key);
    if (!z) return;
    const nk = Math.max(0, ...zonas.map((x) => x.key)) + 1;
    setZonas((zs) => [...zs, { ...z, key: nk, cod: `${z.cod}-2`, posX: clamp(z.posX + 20, 0, LIENZO_W - z.ancho), posY: clamp(z.posY + 20, 0, LIENZO_H - z.alto) }]);
    setSelKey(nk);
    setDirty(true);
  }

  function eliminarZona(key: number) {
    setZonas((zs) => zs.filter((z) => z.key !== key));
    if (selKey === key) setSelKey(null);
    setDirty(true);
  }

  const alinearGrilla = () => {
    setZonas((zs) =>
      zs.map((z) => (z.forma === 'special' ? z : { ...z, posX: snap(z.posX), posY: snap(z.posY), ancho: snap(z.ancho), alto: snap(z.alto) })),
    );
    setDirty(true);
  };

  function cambiarTurno(z: ZonaEdit, turno: string) {
    // Mañana en oro y tarde en mar: dos tokens del sistema que se distinguen de un vistazo sobre
    // el lienzo, que es para lo único que sirve este color.
    const color = turno === 'mañana' ? '#b8a515' : turno === 'tarde' ? '#2f7f88' : z.color;
    set(z.key, { turno, color });
  }

  function guardar() {
    setError('');
    startTransition(async () => {
      const r = await accionGuardarLayout(sede, zonas.map(({ key: _k, ...z }) => z));
      if (!r.ok) {
        setError(r.error ?? 'Error al guardar');
        return;
      }
      setDirty(false);
      setOkMsg(`Guardado: ${r.n} zona(s).`);
      router.refresh();
    });
  }

  function clonar() {
    setError('');
    startTransition(async () => {
      const r = await accionClonarLayout(clonarDe, sede);
      if (!r.ok) {
        setError(r.error ?? 'Error al clonar');
        return;
      }
      setClonarAbierto(false);
      router.refresh();
    });
  }

  // ── UI ──
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          {sedes.map((s) => (
            <Link
              key={s.cod}
              href={`/configuracion/layout?sede=${s.cod}`}
              aria-current={s.cod === sede ? 'page' : undefined}
              onClick={(e) => {
                if (dirty && !confirm('Hay cambios sin guardar. ¿Cambiar de sede igual?')) e.preventDefault();
              }}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
                s.cod === sede ? 'bg-navy text-paper' : 'text-muted hover:bg-navy/5 hover:text-navy',
              )}
            >
              {s.cod}
            </Link>
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {(['todos', 'M', 'T'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                filtro === f ? 'border-navy bg-navy/10 text-navy' : 'border-line text-muted hover:border-gold',
              )}
            >
              {f === 'todos' ? 'Todos' : f === 'M' ? 'AM' : 'PM'}
            </button>
          ))}
          <span className="ml-2 font-mono text-xs text-muted">
            {zonas.length} zonas · {totalPts} pts
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={agregarZona} className={cn(buttonVariants({ variant: 'outline' }), 'text-xs')}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Zona
            </button>
            <button type="button" onClick={alinearGrilla} className={cn(buttonVariants({ variant: 'outline' }), 'text-xs')} title="Alinear todas las zonas a la grilla">
              <Grid3x3 className="h-3.5 w-3.5" strokeWidth={2} /> Alinear grilla
            </button>
            <button
              type="button"
              onClick={() => {
                setClonarDe(sedes.find((s) => s.cod !== sede)?.cod ?? '');
                setClonarAbierto(true);
                setError('');
              }}
              className={cn(buttonVariants({ variant: 'outline' }), 'text-xs')}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} /> Clonar de sede
            </button>
            <Button type="button" onClick={guardar} disabled={!dirty} pending={pending}>
              {!pending && <Save className="h-4 w-4" strokeWidth={2} />} {pending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {(error || okMsg) && (
        <p
          className={cn(
            'flex animate-fade items-center gap-1.5 rounded-md px-3 py-2 text-sm',
            error ? 'bg-error-soft text-error-deep' : 'bg-exito-soft text-exito-deep',
          )}
        >
          {okMsg && <Check className="h-4 w-4" strokeWidth={2.5} />} {error || okMsg}
        </p>
      )}

      {/* Fase 5 tarea 2: aviso de solapes (no bloquea — el mapa de limpieza los resuelve con el
          desplegable de "zonas ocultas aquí"). Solo pares NO explicados por nivel=sobre+sobreCod. */}
      {solapesInesperados.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-aviso-line bg-aviso-soft px-3 py-2 text-xs text-aviso-deep">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <p>
            <span className="font-semibold">{solapesInesperados.length} solape(s) sin declarar:</span>{' '}
            {solapesInesperados.map(([a, b], i) => (
              <span key={`${a}-${b}`} className="font-mono">
                {i > 0 && ', '}
                {a}↔{b}
              </span>
            ))}
            . El operador podrá elegir entre ellas con el menú al marcar limpieza, pero confirma que
            la posición es intencional (o ajústalas antes de guardar).
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4 xl:flex-row">
        {/* Lienzo */}
        <div className="min-w-0 flex-1">
          <div
            ref={canvasRef}
            onPointerMove={moverDrag}
            onPointerUp={soltarDrag}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelKey(null);
            }}
            className="relative w-full touch-none overflow-hidden rounded-xl border border-line bg-paper"
            style={{
              aspectRatio: `${LIENZO_W} / ${LIENZO_H}`,
              backgroundImage:
                'linear-gradient(to right, rgba(46,62,110,.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(46,62,110,.04) 1px, transparent 1px)',
              backgroundSize: `${(GRID * 4 * 100) / LIENZO_W}% ${(GRID * 4 * 100) / LIENZO_H}%`,
            }}
          >
            {enCanvas.map((z) => {
              const activa = aplicaFiltro(z);
              const esSel = z.key === selKey;
              const esArea = z.tipo === 'area';
              return (
                <div
                  key={z.key}
                  role="button"
                  tabIndex={0}
                  aria-label={`${z.cod} ${z.nombre}`}
                  onKeyDown={(e) => tecla(e, z)}
                  onPointerDown={(e) => empezarDrag(e, z, 'move')}
                  title={`${z.cod} · ${z.nombre}`}
                  className={cn(
                    'group absolute flex cursor-move items-center justify-center outline-none transition-shadow duration-150',
                    esSel && 'z-20',
                  )}
                  style={{
                    left: `${(z.posX / LIENZO_W) * 100}%`,
                    top: `${(z.posY / LIENZO_H) * 100}%`,
                    width: `${(z.ancho / LIENZO_W) * 100}%`,
                    height: `${(z.alto / LIENZO_H) * 100}%`,
                    ...formaZona(z),
                    // Un área es el suelo de la zona, no un objeto: se dibuja con el gris del
                    // sistema y no con el slate de Tailwind.
                    background: esArea ? 'rgba(128,122,108,.15)' : z.color,
                    border: esArea
                      ? '1.5px dashed #807a6c'
                      : esSel
                        ? '2px solid #b8a515'
                        : '1px solid rgba(32,40,63,.12)',
                    opacity: activa ? 1 : 0.25,
                    boxShadow: esSel ? '0 0 0 3px rgba(184,165,21,.25)' : undefined,
                    zIndex: esSel ? 20 : 4,
                  }}
                >
                  {texturaZona(z)}
                  <span
                    className={cn(
                      'pointer-events-none px-0.5 font-mono text-[7px] font-semibold leading-none',
                      esArea ? 'text-muted' : 'text-white',
                    )}
                    style={esArea ? undefined : { textShadow: '0 0 2px rgba(0,0,0,.3)' }}
                  >
                    {z.cod}
                  </span>
                  {z.sobreCod && (
                    <span className="pointer-events-none absolute -bottom-2 left-1/2 z-[6] -translate-x-1/2 whitespace-nowrap rounded-full bg-navy-deep px-1 py-px font-mono text-[6px] leading-tight text-paper/90">
                      s/{z.sobreCod}
                    </span>
                  )}
                  {esSel &&
                    (['nw', 'ne', 'sw', 'se'] as const).map((dir) => (
                      <span
                        key={dir}
                        onPointerDown={(e) => empezarDrag(e, z, dir)}
                        className="absolute z-30 h-2.5 w-2.5 rounded-[3px] border-2 border-gold bg-white"
                        style={{
                          left: dir.includes('w') ? -5 : undefined,
                          right: dir.includes('e') ? -5 : undefined,
                          top: dir.includes('n') ? -5 : undefined,
                          bottom: dir.includes('s') ? -5 : undefined,
                          cursor: `${dir}-resize`,
                        }}
                      />
                    ))}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Arrastra para mover · esquinas para redimensionar · flechas del teclado mueven (Shift = fino) ·
            Supr elimina · grilla de {GRID}px
          </p>
        </div>

        {/* Panel derecho: zona seleccionada + catálogo */}
        <aside className="w-full shrink-0 space-y-4 xl:w-80">
          {sel ? (
            <Card>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold text-navy">Zona {sel.cod}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => duplicarZona(sel.key)} aria-label="Duplicar zona" title="Duplicar zona" className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-navy/5 hover:text-navy">
                      <CopyPlus className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                    <button type="button" onClick={() => eliminarZona(sel.key)} aria-label="Eliminar zona" title="Eliminar zona" className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-error-soft hover:text-error">
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Código</span>
                    <input value={sel.cod} onChange={(e) => set(sel.key, { cod: e.target.value.toUpperCase() })} className={cn(fieldCls, 'w-full font-mono uppercase')} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Peso (pts)</span>
                    <input type="number" step="0.1" min={0} value={sel.peso} onChange={(e) => set(sel.key, { peso: Number(e.target.value) })} className={cn(fieldCls, 'w-full text-right')} />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Nombre</span>
                  <input value={sel.nombre} onChange={(e) => set(sel.key, { nombre: e.target.value })} className={cn(fieldCls, 'w-full')} />
                </label>

                {sel.forma !== 'special' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Tipo</span>
                        <select value={sel.tipo} onChange={(e) => set(sel.key, { tipo: e.target.value })} className={cn(fieldCls, 'w-full')}>
                          {TIPOS.map((t) => (
                            <option key={t} value={t}>
                              {TIPO_LABEL[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Forma</span>
                        <select value={sel.forma} onChange={(e) => set(sel.key, { forma: e.target.value })} className={cn(fieldCls, 'w-full')}>
                          <option value="rect">Rectángulo</option>
                          <option value="circle">Círculo</option>
                          <option value="tri">Domo (maniquí)</option>
                        </select>
                      </label>
                    </div>

                    <div>
                      <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Turno</span>
                      <div className="flex gap-1.5">
                        {['ambos', 'mañana', 'tarde'].map((t) => (
                          <button
                            key={t}
                            type="button"
                            aria-pressed={sel.turno === t}
                            onClick={() => cambiarTurno(sel, t)}
                            className={cn(
                              'rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors duration-150',
                              sel.turno === t ? 'border-navy bg-navy text-paper' : 'border-line text-muted hover:border-gold',
                            )}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Color</span>
                      <div className="flex items-center gap-1.5">
                        {SWATCHES.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`Color ${c}`}
                            aria-pressed={sel.color === c}
                            onClick={() => set(sel.key, { color: c })}
                            className={cn('h-6 w-6 rounded-md border transition-transform', sel.color === c ? 'scale-110 border-navy ring-2 ring-gold/50' : 'border-line')}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Nivel</span>
                        <select
                          value={sel.nivel === 'sobre' ? 'sobre' : 'piso'}
                          onChange={(e) => set(sel.key, { nivel: e.target.value, sobreCod: e.target.value === 'piso' ? '' : sel.sobreCod })}
                          className={cn(fieldCls, 'w-full')}
                        >
                          <option value="piso">Piso</option>
                          <option value="sobre">Sobre un mueble</option>
                        </select>
                      </label>
                      {sel.nivel === 'sobre' && (
                        <label className="block">
                          <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Sobre</span>
                          <select value={sel.sobreCod} onChange={(e) => set(sel.key, { sobreCod: e.target.value })} className={cn(fieldCls, 'w-full font-mono')}>
                            <option value="">—</option>
                            {muebles.map((m) => (
                              <option key={m.key} value={m.cod}>
                                {m.cod}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-5 text-center text-sm text-muted">
                Selecciona una zona del lienzo o del catálogo para editarla.
              </CardContent>
            </Card>
          )}

          {/* Catálogo */}
          <Card>
            <CardContent className="max-h-[480px] overflow-y-auto px-0 py-2">
              {especiales.length > 0 && (
                <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Tarjetas del mapa
                </div>
              )}
              {especiales.map((z) => (
                <button
                  key={z.key}
                  type="button"
                  onClick={() => setSelKey(z.key)}
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-1.5 text-left transition-colors hover:bg-paper/70',
                    selKey === z.key && 'bg-gold/10',
                  )}
                >
                  <span className="w-12 shrink-0 rounded bg-navy px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold text-paper">
                    {z.cod}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">{z.nombre}</span>
                  <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-navy">{z.peso}</span>
                </button>
              ))}
              {TIPOS.map((tipo) => {
                const grupo = enCanvas
                  .filter((z) => z.tipo === tipo)
                  .sort((a, b) => a.cod.localeCompare(b.cod));
                if (!grupo.length) return null;
                return (
                  <div key={tipo}>
                    <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted">
                      {TIPO_LABEL[tipo]} ({grupo.length})
                    </div>
                    {grupo.map((z) => (
                      <button
                        key={z.key}
                        type="button"
                        onClick={() => setSelKey(z.key)}
                        className={cn(
                          'flex w-full items-center gap-2 px-4 py-1 text-left transition-colors hover:bg-paper/70',
                          selKey === z.key && 'bg-gold/10',
                        )}
                      >
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-black/10" style={{ background: z.color }} />
                        <span className="w-10 shrink-0 font-mono text-[10px] font-semibold text-navy">{z.cod}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-ink">{z.nombre}</span>
                        {z.sobreCod && (
                          <span className="shrink-0 rounded-full bg-navy-deep px-1.5 py-px font-mono text-[8px] text-paper/90">
                            s/{z.sobreCod}
                          </span>
                        )}
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">{z.peso}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Modal clonar */}
      <Modal
        open={clonarAbierto}
        onClose={() => !pending && setClonarAbierto(false)}
        size="sm"
        title={`Clonar layout hacia ${sede}`}
        icon={<AlertTriangle className="h-5 w-5 shrink-0 text-aviso" strokeWidth={2} aria-hidden />}
      >
        <ModalBody className="space-y-3">
          <p className="text-sm leading-relaxed text-muted">
            Copia el layout completo de otra sede y <span className="font-semibold text-ink">reemplaza</span> el
            actual de {sede}. Esta acción se guarda de inmediato.
          </p>
          <div>
            <label htmlFor="clonar-desde" className="mb-1 block text-xs uppercase tracking-wide text-muted">
              Copiar desde
            </label>
            <select id="clonar-desde" value={clonarDe} onChange={(e) => setClonarDe(e.target.value)} className={cn(fieldCls, 'w-full')}>
              {sedes.filter((s) => s.cod !== sede).map((s) => (
                <option key={s.cod} value={s.cod}>
                  {s.nombre} ({s.cod})
                </option>
              ))}
            </select>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setClonarAbierto(false)} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
            Cancelar
          </button>
          <Button type="button" onClick={clonar} disabled={!clonarDe} pending={pending}>
            {pending ? 'Clonando…' : 'Clonar y reemplazar'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
