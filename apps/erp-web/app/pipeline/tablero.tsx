'use client';

import { useEffect, useMemo, useState, useOptimistic, useTransition } from 'react';
import {
  Inbox,
  Droplets,
  Link2,
  Wrench,
  Scissors,
  Shirt,
  BadgeCheck,
  PackageCheck,
  Truck,
  ArrowRight,
  Send,
  Undo2,
  Search,
  Split,
  Combine,
  Check,
  Zap,
  Trophy,
  X,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import type { PrendaPasada } from '@scilb/core';
import { TRANSICIONES } from '@scilb/core';
import type { RankingItem } from '../../lib/pipeline-repo';
import { cn } from '../../lib/cn';
import { OpcionBotones } from '../../components/ui/opcion-botones';
import { BandaModulo } from '../../components/ui/banda-modulo';
import { useOperador } from './operador';
import {
  avanzarPrenda,
  enviarTandaPrendas,
  rechazarPrenda,
  deshacerPrenda,
  avanzarTandaPrendas,
  dividirPrenda,
  deshacerDivisionPrenda,
} from './actions';

// Color real de la prenda → punto de color en la tarjeta (del sistema viejo).
const COL_MAP: Record<string, string> = {
  Negro: '#1a1a1a',
  'Azul noche': '#1e2a4a',
  'Azul Barcelona': '#004d98',
  'Azul eléctrico': '#0066ff',
  'Azul acero': '#4682b4',
  'Azul presidente': '#1e3a5f',
  'Verde petróleo': '#006666',
  Celeste: '#87ceeb',
  'Celeste bb': '#b0e0e6',
  Plomo: '#808080',
  'Plomo rata': '#6b6b6b',
  Beige: '#d4b896',
  Camello: '#c19a6b',
  Vino: '#722f37',
  Blanco: '#f5f5f5',
  Gris: '#999999',
  Otros: '#aaaaaa',
};

// LOS COLORES DE LAS NUEVE ETAPAS.
//
// Van como hexadecimal y no como clase porque se usan con opacidad calculada en un `style`
// (`${tint}14`), que Tailwind no puede generar: cada columna necesita su propio tinte al 8%.
//
// Eso los deja FUERA del alcance del guard de diseño, que sólo ve nombres de clase. Por eso
// importa que salgan de la misma paleta a mano: hasta el 20-ago-2026 eran siete azules, violetas
// y naranjas por defecto de Tailwind escritos en hexadecimal, es decir la paleta que el sistema
// dejó de usar, colada por la única puerta que el guard no mira.
//
// El orden cuenta una historia y los colores la acompañan: llega sin trabajar (neutro), pasa por
// el agua, el hilo y el taller, se aprueba, se dora, y sale. Las dos parejas de trabajo parecido
// —refacción con compostura, lavado con planchado— comparten familia a propósito.
//
// UNA EXCEPCIÓN, Y ES DELIBERADA: control de calidad usa el verde de `exito`. En el resto del
// sistema el verde significa "correcto", y acá significa exactamente eso — la prenda pasó.
type Col = { k: string; n: string; icon: LucideIcon; tint: string };
const COLUMNAS: Col[] = [
  { k: 'recepcion', n: 'Recepción', icon: Inbox, tint: '#807a6c' },        // muted
  { k: 'lavado', n: 'Lavado', icon: Droplets, tint: '#2f7f88' },           // cat-mar
  { k: 'empatado', n: 'Empatado', icon: Link2, tint: '#6f5aa8' },          // cat-lila
  { k: 'refaccion', n: 'Refacción', icon: Wrench, tint: '#b5643f' },       // cat-arcilla
  { k: 'compostura', n: 'Compostura', icon: Scissors, tint: '#8a462a' },   // cat-arcilla-deep
  { k: 'planchado', n: 'Planchado', icon: Shirt, tint: '#1e5a61' },        // cat-mar-deep
  { k: 'control_calidad', n: 'Control calidad', icon: BadgeCheck, tint: '#2d9e6b' }, // exito
  { k: 'listo', n: 'Listo p/ envío', icon: PackageCheck, tint: '#b8a515' },// gold
  { k: 'enviado', n: 'Enviadas', icon: Truck, tint: '#2e3e6e' },           // navy
];
const NOMBRE: Record<string, string> = Object.fromEntries(COLUMNAS.map((c) => [c.k, c.n]));

// Pestañas del módulo (como el viejo), todas activas.
const TABS: { k: string; label: string; href?: string; pronto?: boolean }[] = [
  { k: 'kanban', label: 'Kanban', href: '/pipeline' },
  { k: 'registrar', label: 'Registrar', href: '/pipeline/registrar' },
  { k: 'envios', label: 'Envíos a tienda', href: '/pipeline/envios' },
  { k: 'accesorios', label: 'Accesorios', href: '/pipeline/accesorios' },
  { k: 'metricas', label: 'Métricas', href: '/pipeline/metricas' },
];

// Tono del pill de tipo de lavado. Es una categoría, no un estado: el lavado en seco no es una
// advertencia. Por eso los tres salen de los categóricos y del neutro, y ninguno del semántico.
const tipoLavadoCls = (t: string): string => {
  const v = t.toLowerCase();
  if (v.includes('seco')) return 'bg-cat-arcilla-soft text-cat-arcilla-deep';
  if (v.includes('espec')) return 'bg-cat-lila-soft text-cat-lila-deep';
  return 'bg-paper text-muted';
};

type Handlers = {
  avanzar: (id: string, destino: string, etapaActual: string) => void;
  avanzarTanda: (ids: string[], destino: string) => void;
  enviarTanda: (ids: string[], sede: string) => void;
  rechazar: (id: string, destino: string) => void;
  dividir: (id: string) => void;
  // Tarea 6: recibe el id de la MADRE (resuelto por el tablero vía madrePorHijo), no el de la
  // tarjeta -S/-P que dispara el botón.
  deshacerDivision: (madreId: string) => void;
};
type Toast = { msg: string; tono: 'ok' | 'gold' | 'warn'; undo?: () => void };

export function TableroPipeline({
  pasadas,
  ranking = [],
  operario = '',
  tiendas = ['LB', 'ST', 'TR'],
  compartido = false,
}: {
  pasadas: PrendaPasada[];
  ranking?: RankingItem[];
  operario?: string;
  tiendas?: string[];
  // Equipo marcado como compartido (/dispositivos): cada movimiento pide el código personal de
  // quien lo hace y se le atribuye a esa persona (spec codigo-personal).
  compartido?: boolean;
}) {
  const [, startTransition] = useTransition();
  const { conOperador, operadorRechazado, chip: chipOperador, dialogo: dialogoOperador } = useOperador(compartido);
  // Actualización optimista: la prenda se mueve al instante; el servidor confirma después.
  const [optimistas, aplicar] = useOptimistic(pasadas, (state: PrendaPasada[], m: { id: string; etapa: string }) =>
    state.map((p) => (p.id === m.id ? { ...p, etapa: m.etapa as PrendaPasada['etapa'] } : p)),
  );
  const [sesionPts, setSesionPts] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [q, setQ] = useState('');
  const [sedeF, setSedeF] = useState('');
  const [tipoF, setTipoF] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selEtapa, setSelEtapa] = useState<string | null>(null);
  const [sedeEnvio, setSedeEnvio] = useState(tiendas[0] ?? 'LB');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 5000 : 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const limpiarSel = () => {
    setSel(new Set());
    setSelEtapa(null);
  };

  // Si el servidor rechaza una acción: sólo un error `CODIGO:` (operador vencido en la base antes
  // que en la pestaña) limpia al operador y pide el código otra vez. Cualquier otro error
  // (transición inválida, prenda ya dividida, red) se muestra como lo que es y deja al operador
  // donde estaba. Next enmascara el texto de los errores en producción: en ese caso sale el aviso
  // genérico y la ventana de la pestaña (misma duración que la de la base) pide el código sola.
  const falla = (e: unknown) => {
    const msg = e instanceof Error ? e.message : '';
    if (msg.startsWith('CODIGO:')) {
      operadorRechazado();
      setToast({ msg: 'Operador vencido. Ingresa tu código de nuevo.', tono: 'warn' });
    } else {
      setToast({ msg: 'No se pudo completar la acción. Actualiza el tablero e inténtalo de nuevo.', tono: 'warn' });
    }
  };

  // «Deshacer» usa el token CON EL QUE SE AVANZÓ la prenda, no el de quien esté operando cuando se
  // pulsa: pipeline_deshacer le borra el último punto al actor, y si fuera otro se le quitaría el
  // punto a quien no corresponde (o no se quitaría ninguno y el original cobraría dos veces).
  const deshacer = (id: string, etapaAnterior: string, pts: number, token?: string) =>
    startTransition(async () => {
      aplicar({ id, etapa: etapaAnterior });
      if (pts) setSesionPts((s) => Math.round((s - pts) * 10) / 10);
      setToast(null);
      try {
        await deshacerPrenda(id, etapaAnterior, token);
      } catch (e) {
        falla(e);
      }
    });

  const h: Handlers = {
    avanzar: (id, destino, etapaActual) =>
      conOperador((token) =>
        startTransition(async () => {
          aplicar({ id, etapa: destino });
          try {
            const pts = await avanzarPrenda(id, destino, token);
            if (pts) setSesionPts((s) => Math.round((s + pts) * 10) / 10);
            setToast({
              msg: `${NOMBRE[destino] ?? destino} · +${pts ?? 0} pts`,
              tono: 'ok',
              undo: () => deshacer(id, etapaActual, pts ?? 0, token),
            });
          } catch (e) {
            falla(e);
          }
        }),
      ),
    enviarTanda: (ids, sede) =>
      conOperador((token) =>
        startTransition(async () => {
          ids.forEach((id) => aplicar({ id, etapa: 'enviado' }));
          try {
            await enviarTandaPrendas(ids, sede, token);
            setToast({ msg: `${ids.length} prendas enviadas a ${sede}`, tono: 'gold' });
          } catch (e) {
            falla(e);
          }
        }),
      ),
    rechazar: (id, destino) =>
      conOperador((token) =>
        startTransition(async () => {
          aplicar({ id, etapa: destino });
          try {
            await rechazarPrenda(id, destino, token);
            setToast({ msg: `Devuelto a ${NOMBRE[destino] ?? destino}`, tono: 'warn' });
          } catch (e) {
            falla(e);
          }
        }),
      ),
    avanzarTanda: (ids, destino) =>
      conOperador((token) =>
        startTransition(async () => {
          ids.forEach((id) => aplicar({ id, etapa: destino }));
          try {
            const pts = await avanzarTandaPrendas(ids, destino, token);
            if (pts) setSesionPts((s) => Math.round((s + pts) * 10) / 10);
            setToast({ msg: `${ids.length} prendas → ${NOMBRE[destino] ?? destino} · +${pts ?? 0} pts`, tono: 'ok' });
          } catch (e) {
            falla(e);
          }
        }),
      ),
    dividir: (id) =>
      conOperador((token) =>
        startTransition(async () => {
          try {
            await dividirPrenda(id, token);
            setToast({ msg: 'Terno dividido en saco + pantalón', tono: 'gold' });
          } catch (e) {
            falla(e);
          }
        }),
      ),
    // Sin actualización optimista (mismo criterio que dividir): borra 2 tarjetas y resucita la
    // madre en su etapa original, un cambio estructural que conviene dejarle a la revalidación
    // del servidor en vez de simularlo a mano. Si el RPC rechaza (p. ej. una pieza ya avanzó), el
    // mensaje real del RPC llega tal cual al toast — no uno genérico.
    deshacerDivision: (madreId) =>
      conOperador((token) =>
        startTransition(async () => {
          const error = await deshacerDivisionPrenda(madreId, token);
          if (error?.startsWith('CODIGO:')) return falla(new Error(error));
          setToast(
            error
              ? { msg: error, tono: 'warn' }
              : { msg: 'División deshecha: vuelve al tablero como una sola prenda', tono: 'gold' },
          );
        }),
      ),
  };

  // Selección por columna (como el viejo: la barra dice "N en {etapa}"). Cruzar de etapa reinicia.
  const toggleSel = (id: string, etapa: string) => {
    setSel((prev) => {
      const cruzaEtapa = selEtapa && selEtapa !== etapa;
      const base = cruzaEtapa ? new Set<string>() : new Set(prev);
      if (base.has(id)) base.delete(id);
      else base.add(id);
      setSelEtapa(base.size ? etapa : null);
      return base;
    });
  };

  // Seleccionar/deseleccionar toda la columna de un clic (el avance en sí vive SOLO en la
  // barra superior, no hay botones por tarjeta ni por columna).
  const toggleColumna = (ids: string[], etapa: string) => {
    setSel((prev) => {
      const yaCompleta = selEtapa === etapa && ids.every((id) => prev.has(id));
      if (yaCompleta) {
        setSelEtapa(null);
        return new Set();
      }
      setSelEtapa(etapa);
      return new Set(ids);
    });
  };

  // Filtros: sede y tipo de lavado dinámicos (de la data, sin inventar valores).
  const sedes = useMemo(
    () => Array.from(new Set(optimistas.map((p) => p.sedeOrigenCod).filter(Boolean))).sort(),
    [optimistas],
  );
  const tipos = useMemo(
    () => Array.from(new Set(optimistas.map((p) => p.tipoLavado).filter((x): x is string => Boolean(x)))).sort(),
    [optimistas],
  );

  // Tarea 6: mapa hijo→madre para ofrecer "Deshacer división" en las tarjetas -S/-P. Las madres
  // (etapa 'dividido') SÍ están en `optimistas` — listarPasadas no filtra por etapa — pero ninguna
  // columna del kanban las pinta (COLUMNAS no tiene 'dividido'); solo se leen acá para el vínculo.
  const madrePorHijo = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of optimistas) {
      if (!p.dividida || !p.divididaEn) continue;
      for (const hijoId of p.divididaEn.split(',')) {
        const id = hijoId.trim();
        if (id) m.set(id, p.id);
      }
    }
    return m;
  }, [optimistas]);

  const ql = q.trim().toLowerCase();
  const visibles = optimistas.filter((p) => {
    if (sedeF && p.sedeOrigenCod !== sedeF) return false;
    if (tipoF && p.tipoLavado !== tipoF) return false;
    if (ql && !`${p.codigo} ${p.tipo ?? ''} ${p.color ?? ''}`.toLowerCase().includes(ql)) return false;
    return true;
  });

  const enProceso = optimistas.filter((p) => p.etapa !== 'enviado').length;
  const enviados = optimistas.filter((p) => p.etapa === 'enviado').length;

  const destsSel = selEtapa ? ((TRANSICIONES as Record<string, readonly string[]>)[selEtapa] ?? []) : [];

  return (
    // Alto = viewport menos topbar (h-14) y el padding vertical del <main> (py-6/sm:py-8):
    // el tablero NUNCA crece más que la pantalla — solo el carril de columnas hace scroll
    // (y cada columna, internamente), nunca la página entera. `relative` es el ancla de la
    // barra de avance (tarea 5), que se posiciona `absolute` sobre este contenedor.
    <div className="relative flex h-[calc(100vh-6.5rem)] flex-col overflow-hidden sm:h-[calc(100vh-7.5rem)]">
      {/* ── Banda de cabecera: arquetipo B (spec §5) ── */}
      <div className="mb-4 shrink-0">
        <BandaModulo
          titulo="Prendas recibidas"
          subtitulo="Almacén Central"
          icono={Shirt}
          accion={
            <div className="flex items-center gap-5 text-paper">
              <span className="inline-flex items-center gap-1.5 rounded-r-pastilla bg-paper/15 px-3 py-1 text-micro font-medium">
                <span className="h-1.5 w-1.5 rounded-r-pastilla bg-exito" /> En vivo
              </span>
              <div className="text-right">
                <div className="text-micro uppercase tracking-wide text-paper/60">Sesión</div>
                <div className="inline-flex items-center gap-1 text-lg font-display font-bold tabular-nums text-gold">
                  <Zap className="h-4 w-4" strokeWidth={2.5} /> {sesionPts}
                </div>
              </div>
              {operario && (
                <div className="text-right">
                  <div className="text-micro uppercase tracking-wide text-paper/60">Operario</div>
                  <div className="text-apoyo font-medium">{operario}</div>
                </div>
              )}
            </div>
          }
        />
      </div>

      {chipOperador}
      {dialogoOperador}

      {/* ── Pestañas ── */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-1 border-b border-line">
        {TABS.map((t) =>
          t.href ? (
            <NavLink key={t.k} href={t.href} activo={t.k === 'kanban'}>
              {t.label}
            </NavLink>
          ) : (
            <button
              key={t.k}
              type="button"
              disabled
              className="relative -mb-px cursor-not-allowed border-b-2 border-transparent px-3 py-2 text-cuerpo text-muted/70"
              title="Próximamente"
            >
              {t.label}
              <span className="ml-1 rounded-r-pastilla bg-line/70 px-1 text-[9px] uppercase text-muted">pronto</span>
            </button>
          ),
        )}
        <div className="ml-auto flex items-center gap-2 pb-1.5">
          <span className="rounded-r-pastilla bg-navy/5 px-2.5 py-1 text-apoyo font-medium text-navy">{enProceso} en proceso</span>
          <span className="rounded-r-pastilla bg-exito/10 px-2.5 py-1 text-apoyo font-medium text-exito-deep">{enviados} enviados</span>
        </div>
      </div>

      {/* ── Filtros + búsqueda ── */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-rotulo font-semibold uppercase text-muted">Filtros</span>
        <Chip on={!sedeF} onClick={() => setSedeF('')}>Todas</Chip>
        {sedes.map((s) => (
          <Chip key={s} on={sedeF === s} onClick={() => setSedeF(s)}>{s}</Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <Chip on={!tipoF} onClick={() => setTipoF('')}>Todos</Chip>
        {tipos.map((t) => (
          <Chip key={t} on={tipoF === t} onClick={() => setTipoF(t)}>{t}</Chip>
        ))}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código, color o tipo…"
            className="w-64 rounded-r-chico border border-line bg-white py-1.5 pl-8 pr-3 text-cuerpo text-navy placeholder:text-muted focus:border-navy focus:outline-none"
          />
        </div>
      </div>

      {/* ── Barra de avance: ÚNICO lugar del tablero con botones para pasar de etapa (nada de
          esto vive en las tarjetas). Tarea 5: `absolute` sobre el contenedor `relative` del
          tablero (flota igual que el toast) en vez de ser un ítem más del flex-col — así
          aparece/desaparece sin correr el alto del carril de columnas ni de "Ranking del día". ── */}
      {sel.size > 0 && selEtapa && (
        <div className="absolute inset-x-3 bottom-3 z-40 flex flex-wrap items-center gap-2.5 rounded-r-medio border-2 border-navy bg-white px-4 py-3 shadow-lift">
          <span className="text-cuerpo font-semibold text-navy">
            <span className="tabular-nums text-base">{sel.size}</span> en {NOMBRE[selEtapa] ?? selEtapa}
          </span>
          {selEtapa === 'listo' ? (
            <>
              <select
                value={sedeEnvio}
                onChange={(e) => setSedeEnvio(e.target.value)}
                aria-label="Sede destino"
                className="rounded-r-chico border border-line bg-white px-2 py-2 text-cuerpo text-navy"
              >
                {tiendas.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  h.enviarTanda([...sel], sedeEnvio);
                  limpiarSel();
                }}
                className="inline-flex items-center gap-1.5 rounded-r-pastilla bg-gold px-4 py-2 text-cuerpo font-semibold text-navy transition hover:brightness-95 active:scale-[.98]"
              >
                <Send className="h-4 w-4" strokeWidth={2.5} /> Enviar a {sedeEnvio}
              </button>
            </>
          ) : (
            destsSel.map((d) => (
              <button
                key={d}
                onClick={() => {
                  h.avanzarTanda([...sel], d);
                  limpiarSel();
                }}
                className="inline-flex items-center gap-1.5 rounded-r-pastilla bg-navy px-4 py-2 text-cuerpo font-semibold text-white transition hover:bg-[#26345c] active:scale-[.98]"
              >
                {NOMBRE[d] ?? d} <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </button>
            ))
          )}
          <button onClick={limpiarSel} className="ml-auto inline-flex items-center gap-1 text-apoyo text-muted hover:text-navy">
            <X className="h-3.5 w-3.5" strokeWidth={2.5} /> Limpiar selección
          </button>
        </div>
      )}

      {/* ── Ranking del día ── */}
      {ranking.length > 0 && (
        <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2 rounded-r-chico border border-line bg-white p-3">
          <span className="inline-flex items-center gap-1.5 text-apoyo font-medium text-muted">
            <Trophy className="h-4 w-4 text-gold" strokeWidth={2} /> Puntos de hoy
          </span>
          {ranking.map((r, i) => (
            <span key={r.nombre} className="inline-flex items-center gap-1.5 rounded-r-pastilla bg-navy/5 px-2.5 py-1 text-apoyo">
              <span className="tabular-nums text-micro text-muted">#{i + 1}</span>
              <span className="font-medium text-navy">{r.nombre}</span>
              <span className="tabular-nums font-bold text-gold-deep">{r.total}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Tablero: columnas a una pantalla, scroll interno (no una página kilométrica). El
          carril ocupa TODO el espacio que quede (flex-1 min-h-0) — nunca hace crecer la página,
          cada columna llena ese alto exacto y solo su LISTA de tarjetas hace scroll interno. ── */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-3">
        {COLUMNAS.map((col) => {
          const items = visibles.filter((p) => p.etapa === col.k);
          const Icon = col.icon;
          return (
            <div key={col.k} className="flex h-full w-56 shrink-0 flex-col">
              <div className="mb-2 flex shrink-0 items-center gap-2 rounded-r-chico px-3 py-2" style={{ background: `${col.tint}14` }}>
                <Icon className="h-4 w-4 shrink-0" style={{ color: col.tint }} strokeWidth={2} />
                <span className="text-cuerpo font-medium" style={{ color: col.tint }}>
                  {col.n}
                </span>
                <span
                  className="ml-auto rounded-r-pastilla bg-white px-2 py-0.5 tabular-nums text-dato font-semibold"
                  style={{ color: col.tint }}
                >
                  {items.length}
                </span>
              </div>
              {items.length >= 2 && (TRANSICIONES[col.k as keyof typeof TRANSICIONES]?.length || col.k === 'listo') && (
                <button
                  onClick={() => toggleColumna(items.map((i) => i.id), col.k)}
                  className={cn(
                    'mb-2 inline-flex w-full shrink-0 items-center justify-center gap-1 rounded-r-pastilla border px-2 py-1 text-micro font-medium transition',
                    selEtapa === col.k && items.every((i) => sel.has(i.id))
                      ? 'border-navy bg-navy text-white'
                      : 'border-navy/15 bg-navy/5 text-navy hover:bg-navy/10',
                  )}
                >
                  <Check className="h-3 w-3" strokeWidth={2.5} /> Seleccionar todas ({items.length})
                </button>
              )}
              <div className="-mr-1 min-h-0 flex-1 space-y-2 overflow-y-auto pb-1 pr-1">
                {items.map((p) => (
                  <Tarjeta
                    key={p.id}
                    p={p}
                    h={h}
                    seleccionado={sel.has(p.id)}
                    onSel={() => toggleSel(p.id, p.etapa)}
                    madreId={madrePorHijo.get(p.id)}
                  />
                ))}
                {items.length === 0 && (
                  <div className="rounded-r-chico border border-dashed border-line py-5 text-center text-apoyo text-muted">
                    {ql || sedeF || tipoF ? 'sin coincidencias' : '— vacío —'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div
          key={toast.msg}
          className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 animate-fade items-center gap-3 rounded-r-pastilla px-4 py-2.5 text-cuerpo font-semibold shadow-lift ${
            toast.tono === 'gold'
              ? 'bg-gold text-navy'
              : toast.tono === 'warn'
                ? 'bg-aviso text-white'
                : 'bg-navy text-white'
          }`}
          role="status"
        >
          <span className="inline-flex items-center gap-1.5">
            {toast.tono === 'warn' ? (
              <Undo2 className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
            {toast.msg}
          </span>
          {toast.undo && (
            <button
              onClick={toast.undo}
              className="toque inline-flex items-center gap-1 rounded-r-pastilla bg-white/20 px-2 py-0.5 text-apoyo font-medium transition hover:bg-white/30"
            >
              <Undo2 className="h-3 w-3" strokeWidth={2.5} /> Deshacer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NavLink({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-current={activo ? 'page' : undefined}
      className={cn(
        'relative -mb-px border-b-2 px-3 py-2 text-cuerpo transition-colors',
        activo ? 'border-navy font-semibold text-navy' : 'border-transparent text-muted/70 hover:text-navy',
      )}
    >
      {children}
    </a>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-r-pastilla px-3 py-1 text-apoyo font-medium transition-colors',
        on ? 'bg-navy text-paper' : 'border border-line bg-white text-navy hover:border-gold',
      )}
    >
      {children}
    </button>
  );
}

function Tarjeta({
  p,
  h,
  seleccionado,
  onSel,
  madreId,
}: {
  p: PrendaPasada;
  h: Handlers;
  seleccionado: boolean;
  onSel: () => void;
  // Tarea 6: presente solo en tarjetas -S/-P hijas de una división activa (ver madrePorHijo en
  // TableroPipeline). Dispara deshacerDivision con el id de la MADRE, no el de esta tarjeta.
  madreId?: string;
}) {
  const meta = [p.tipo, p.color, p.talla ? `T.${p.talla}` : ''].filter(Boolean).join(' · ');
  const esTerno = (p.tipo ?? '').toLowerCase().includes('terno');
  return (
    // Tarea 4: el cuerpo entero selecciona (antes solo el checkbox). Los controles que hacen
    // otra cosa (dividir/deshacer división/rechazar/confirmar en envíos) paran la propagación
    // del click para no seleccionar de rebote; el checkbox se queda como afordancia visual y
    // sigue funcionando igual (también para el usuario, que ya lo tiene ubicado).
    <div
      role="checkbox"
      aria-checked={seleccionado}
      tabIndex={0}
      onClick={onSel}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSel();
        }
      }}
      className={cn(
        'cursor-pointer rounded-r-medio border bg-white p-2 shadow-card transition hover:shadow-lift',
        seleccionado ? 'border-navy ring-2 ring-navy/30' : 'border-line',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="h-3 w-3 shrink-0 rounded-r-pastilla border border-black/10"
          style={{ background: COL_MAP[p.color ?? ''] ?? '#cbd5e1' }}
          title={p.color ?? ''}
        />
        <span className="truncate tabular-nums text-dato font-semibold text-navy">{p.codigo}</span>
        {esTerno && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              h.dividir(p.id);
            }}
            aria-label="Dividir en saco + pantalón"
            title="Dividir en saco + pantalón"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-r-pastilla text-line transition-colors hover:bg-navy/5 hover:text-navy"
          >
            <Split className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
        {madreId && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              h.deshacerDivision(madreId);
            }}
            aria-label="Deshacer división"
            title="Deshacer división (vuelve a ser una sola prenda)"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-r-pastilla text-line transition-colors hover:bg-navy/5 hover:text-navy"
          >
            <Combine className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSel();
          }}
          aria-label="Seleccionar"
          className={cn(
            'ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-r-pastilla border transition-colors',
            seleccionado ? 'border-navy bg-navy text-white' : 'border-line text-transparent hover:border-navy',
          )}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="rounded-r-pastilla bg-navy/5 px-1.5 py-0.5 tabular-nums text-micro text-navy">{p.sedeOrigenCod}</span>
        {Boolean(meta) && <span className="truncate text-micro leading-tight text-muted">{meta}</span>}
      </div>
      {(Boolean(p.tipoLavado) || Boolean(p.necesitaCompostura) || Boolean(p.aprobada)) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {Boolean(p.tipoLavado) && (
            <span className={cn('rounded-r-pastilla px-1.5 py-0.5 text-micro font-medium', tipoLavadoCls(p.tipoLavado ?? ''))}>
              {p.tipoLavado}
            </span>
          )}
          {Boolean(p.necesitaCompostura) && (
            <span className="rounded-r-pastilla bg-aviso-soft px-1.5 py-0.5 text-micro font-medium text-aviso-deep">compostura</span>
          )}
          {Boolean(p.aprobada) && (
            <span className="inline-flex items-center gap-0.5 rounded-r-pastilla bg-exito-soft px-1.5 py-0.5 text-micro font-medium text-exito-deep">
              <Check className="h-2.5 w-2.5" strokeWidth={3} /> ok
            </span>
          )}
        </div>
      )}
      {Boolean(p.obsCalidad) && (
        <div className="mt-1 flex items-start gap-1 rounded-r-chico bg-error-soft px-2 py-1 text-micro text-error-deep">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" strokeWidth={2.5} /> {p.obsCalidad}
        </div>
      )}

      {p.etapa === 'control_calidad' && <Rechazar p={p} h={h} />}
      {/* La confirmación es de la tienda receptora: vive en /pipeline/envios, no en el kanban del almacén. */}
      {p.etapa === 'enviado' && (
        <a
          href="/pipeline/envios"
          onClick={(e) => e.stopPropagation()}
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-r-pastilla border border-line px-2 py-1 text-micro font-medium text-muted transition hover:border-gold hover:text-navy"
        >
          Confirmar en Envíos <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
        </a>
      )}
    </div>
  );
}

function Rechazar({ p, h }: { p: PrendaPasada; h: Handlers }) {
  const [destino, setDestino] = useState('planchado');
  return (
    // stopPropagation en el contenedor (tarea 4): el select y el botón Rechazar están dentro de
    // la tarjeta ahora clicable entera; sin esto, abrir el desplegable o rechazar también
    // seleccionaría/deseleccionaría la tarjeta de rebote.
    <div className="mt-1.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <select
        value={destino}
        onChange={(e) => setDestino(e.target.value)}
        className="rounded-r-pastilla border border-line bg-white px-1.5 py-1 text-apoyo text-navy"
        aria-label="Devolver a la etapa"
      >
        <option value="recepcion">Recepción</option>
        <option value="lavado">Lavado</option>
        <option value="empatado">Empatado</option>
        <option value="refaccion">Refacción</option>
        <option value="compostura">Compostura</option>
        <option value="planchado">Planchado</option>
      </select>
      <button
        onClick={() => h.rechazar(p.id, destino)}
        className="inline-flex flex-1 items-center justify-center gap-1 rounded-r-pastilla border border-error-line bg-error-soft px-2 py-1.5 text-apoyo font-medium text-error-deep transition hover:bg-error-soft active:scale-[.98]"
      >
        <Undo2 className="h-3.5 w-3.5" strokeWidth={2.5} /> Rechazar
      </button>
    </div>
  );
}

