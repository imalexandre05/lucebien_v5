'use client';

import { Fragment, useRef, useState, useTransition } from 'react';
import {
  Plus,
  Minus,
  X,
  Send,
  Shirt,
  Package,
  Users,
  Check,
  AlertTriangle,
  ClipboardCheck,
} from 'lucide-react';
import { accionEnviarLavanderia, accionValidarRetorno } from './actions';
import { useOperador } from '../pipeline/operador';
import type { ListaLavanderia, ItemEnvio } from '../../lib/lavanderia-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge, type Tone } from '../../components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { EmptyState } from '../../components/ui/empty-state';
import { PersonaPicker } from '../../components/ui/persona-picker';
import { Aviso, campoCls, Label, LabelGrupo, Select, Textarea } from '../../components/ui/form';
import { OpcionBotones } from '../../components/ui/opcion-botones';
import {
  familiasColorPrenda,
  hexColorPrenda,
  tallasPrendaAdulto,
  tallasPrendaNino,
  tiposPrenda,
} from '@scilb/adapter-lucebien';
import { cn } from '../../lib/cn';

// Mismo vocabulario que /pipeline/registrar: las dos pantallas leen la MISMA lista del adapter,
// en vez de tener cada una su copia.
const OPC_TIPO = tiposPrenda.map((t) => ({ value: t, label: t }));

// 'Otros' no es un color: es la salida cuando la tela no está en la lista. Se dibuja como un disco
// partido en cuatro para que no se confunda con un gris más.
const PUNTO_OTROS =
  'conic-gradient(#b7bac0 0deg 90deg, #d9c9a8 90deg 180deg, #4a6484 180deg 270deg, #6e1b2b 270deg 360deg)';

// La talla es opcional, así que «Sin talla» es una opción más y no un hueco que hay que adivinar
// cómo dejar vacío. Adulto y niño van separados: mezcladas, las dieciocho tallas obligan a leer la
// fila entera para encontrar la que se busca.
const OPC_SIN_TALLA = [{ value: '', label: 'Sin talla' }];
const OPC_TALLA_ADULTO = tallasPrendaAdulto.map((t) => ({ value: t, label: t }));
const OPC_TALLA_NINO = tallasPrendaNino.map((t) => ({ value: t, label: t }));

const OPC_DESTINO = [
  { value: 'recepcion', label: 'Lavandería' },
  { value: 'compostura', label: 'Compostura' },
];

const OPC_ENVIO = [
  { value: 'LAV', label: 'Envío general' },
  { value: 'REF', label: 'Refacción' },
];

const COLOR_INICIAL = 'Negro';

type Persona = { id: string; nombre: string; rol?: string; sedeCod?: string | null };

const ACCESORIOS: { key: keyof Generales; label: string }[] = [
  { key: 'camisas', label: 'Camisas' },
  { key: 'corbatas', label: 'Corbatas' },
  { key: 'michis', label: 'Michis' },
  { key: 'corbatones', label: 'Corbatones' },
  { key: 'portaTernos', label: 'Porta-ternos' },
  { key: 'zapatos', label: 'Zapatos' },
];

type Generales = { camisas: number; corbatas: number; michis: number; corbatones: number; portaTernos: number; zapatos: number };
const GENERALES_VACIO: Generales = { camisas: 0, corbatas: 0, michis: 0, corbatones: 0, portaTernos: 0, zapatos: 0 };

// CÓMO VOLVIÓ CADA PRENDA. Las dos únicas respuestas que entiende la base: lavanderia_validar_retorno
// (migración 0066) guarda este texto en lista_items.estado_retorno y marca la lista como
// 'Devuelto-Observado' en cuanto una sola prenda no volvió 'bien'.
const OPC_RETORNO = [
  { value: 'bien', label: 'Bien' },
  { value: 'problema', label: 'Con problema' },
];

const ESTADO_TONE: Record<string, Tone> = {
  'En proceso': 'amber',
  Validado: 'green',
  'Devuelto-Observado': 'red',
};

export function EnvioLavanderiaCliente({
  sede,
  empleados,
  listasIniciales,
  compartido = false,
}: {
  sede: string;
  empleados: Persona[];
  listasIniciales: ListaLavanderia[];
  compartido?: boolean;
}) {
  const { conOperador, operadorRechazado, renovar, chip, dialogo } = useOperador(compartido);
  const [tipo, setTipo] = useState<'LAV' | 'REF'>('LAV');
  const [items, setItems] = useState<ItemEnvio[]>([]);
  const [codigo, setCodigo] = useState('');
  const [itemTipo, setItemTipo] = useState<string>(tiposPrenda[0]);
  const [itemColor, setItemColor] = useState(COLOR_INICIAL);
  const [itemTalla, setItemTalla] = useState('');
  const [itemObs, setItemObs] = useState('');
  const [tipoOtro, setTipoOtro] = useState('');
  const [destinoItem, setDestinoItem] = useState<'recepcion' | 'compostura'>('recepcion');
  const [generales, setGenerales] = useState<Generales>(GENERALES_VACIO);
  const [respInv, setRespInv] = useState<string[]>([]);
  const [respTraslado, setRespTraslado] = useState<string[]>([]);
  const [listas, setListas] = useState(listasIniciales);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  // Revisión del retorno: qué lista está abierta, cómo volvió cada prenda de esa lista, la nota que
  // queda como sustento del reclamo, y el error propio del panel —lejos del aviso del formulario de
  // envío, que está a dos pantallas de scroll de acá.
  const [revisando, setRevisando] = useState<string | null>(null);
  const [retornoItems, setRetornoItems] = useState<Record<string, 'bien' | 'problema'>>({});
  const [obsRetorno, setObsRetorno] = useState('');
  const [errorRetorno, setErrorRetorno] = useState('');
  const [pending, startTransition] = useTransition();
  const codigoRef = useRef<HTMLInputElement>(null);

  const nombrePorId = (id: string) => empleados.find((e) => e.id === id)?.nombre ?? '';

  /**
   * Elegir a un encargado para el traslado también lo pone como responsable de inventario.
   *
   * En la tienda es la misma persona: el encargado responde por lo que sale del inventario, así
   * que pedirlo dos veces es hacer trabajo de escribano. Sólo se autocompleta si el campo está
   * vacío —nunca pisa una elección hecha a mano— y se puede cambiar después.
   */
  function elegirTraslado(ids: string[]) {
    setRespTraslado(ids);
    const persona = empleados.find((e) => e.id === ids[0]);
    const esEncargado = persona?.rol?.startsWith('encargado') ?? false;
    if (esEncargado && respInv.length === 0) setRespInv(ids);
  }

  // En un envío de refacción TODAS las prendas van a compostura: la regla es del envío, no de cada
  // prenda (RPC lavanderia_enviar, migración 0066). Se muestra elegido y bloqueado en vez de
  // esconderse, para que quien carga vea a dónde va lo que está mandando.
  const destinoEfectivo: 'recepcion' | 'compostura' = tipo === 'REF' ? 'compostura' : destinoItem;

  // Qué falta para poder agregar la prenda. Se calcula de verdad —no un solo caso— porque el botón
  // apagado sin explicación se lee como que el sistema falló.
  const motivoNoAgregar = !codigo.trim()
    ? 'Escribe el código de la prenda para poder agregarla.'
    : itemTipo === 'Otros' && !tipoOtro.trim()
      ? 'Escribe qué prenda es: «Otros» sin descripción se pierde en el pipeline.'
      : null;

  function agregarItem() {
    if (motivoNoAgregar) return;
    setItems((p) => [
      ...p,
      {
        cod: codigo.trim().toUpperCase(),
        // «Otros» viaja con el nombre que le puso quien la recibe, no con la palabra «Otros»:
        // una prenda que nadie puede nombrar entra al pipeline y ahí se pierde.
        tipo: itemTipo === 'Otros' ? tipoOtro.trim() : itemTipo,
        color: itemColor,
        talla: itemTalla,
        obs: itemObs.trim(),
        motivo: '',
        destino: destinoEfectivo,
      },
    ]);
    // Se limpia lo que cambia de una prenda a la otra y se conserva lo que suele repetirse en una
    // ráfaga —tipo y color—: quien carga veinte sacos negros no vuelve a elegirlos veinte veces.
    setCodigo('');
    setItemTalla('');
    setItemObs('');
    setTipoOtro('');
    setDestinoItem('recepcion');
    codigoRef.current?.focus();
  }
  function quitarItem(i: number) {
    setItems((p) => p.filter((_, j) => j !== i));
  }
  function cambiarGeneral(key: keyof Generales, delta: number) {
    setGenerales((p) => ({ ...p, [key]: Math.max(0, p[key] + delta) }));
  }

  const totalGenerales = Object.values(generales).reduce((s, v) => s + v, 0);

  // UNA LISTA NECESITA AL MENOS UNA PRENDA CON CÓDIGO (decisión de Alexander, 21-ago-2026).
  // Antes se podía mandar una lista de puros accesorios; ahora no: el código es lo que después
  // permite reclamar una prenda, y un envío sin ninguno no se puede seguir.
  const puedeEnviar = items.length > 0 && !pending;

  // Por qué está gris el botón. Mismo criterio que el formulario del turno: un control apagado sin
  // explicación se lee como que el sistema falló, y quien manda esta lista suele estar de pie con
  // el teléfono en el mostrador, sin nadie a quien preguntarle.
  const motivoBloqueo =
    pending || puedeEnviar
      ? null
      : totalGenerales > 0
        ? 'Agrega al menos una prenda con su código: una lista de puros accesorios no se puede enviar.'
        : 'Agrega al menos una prenda con su código.';

  function enviar() {
    setError('');
    setOk('');
    conOperador((token) => enviarConCodigo(token));
  }

  function enviarConCodigo(token?: string) {
    startTransition(async () => {
      const r = await accionEnviarLavanderia({
        sede,
        tipo,
        respInv: nombrePorId(respInv[0] ?? ''),
        respTraslado: nombrePorId(respTraslado[0] ?? ''),
        generales: tipo === 'LAV' ? generales : GENERALES_VACIO,
        items,
      }, token);
      if (!r.ok) {
        if (r.error?.startsWith('CODIGO:')) operadorRechazado();
        setError(r.error ?? 'No se pudo enviar la lista');
        return;
      }
      renovar();
      setOk(`Lista ${r.id} enviada — ${items.length} prenda(s), ${totalGenerales} accesorio(s).`);
      setItems([]);
      setGenerales(GENERALES_VACIO);
    });
  }

  /**
   * Abre la revisión de una lista que volvió de lavandería.
   *
   * TODAS LAS PRENDAS ARRANCAN EN «BIEN». No es una regla inventada acá: es exactamente como la base
   * ya lee un ítem sin estado —`coalesce(estado_retorno, 'bien')` en lavanderia_validar_retorno,
   * migración 0066— y es el caso común. Lo que cambia es que ahora marcar «problema» es posible: el
   * único control que existía validaba la lista entera como «todo bien» y no había forma de dejar
   * constancia de una prenda que volvió manchada, rota o directamente no volvió.
   */
  function abrirRevision(l: ListaLavanderia) {
    setRevisando(l.id);
    setErrorRetorno('');
    setObsRetorno(l.obsRetorno ?? '');
    setRetornoItems(
      Object.fromEntries(l.items.map((i) => [i.id, i.estadoRetorno === 'problema' ? 'problema' : 'bien'])),
    );
  }

  function cerrarRevision() {
    setRevisando(null);
    setErrorRetorno('');
  }

  function estadoDeItem(id: string): 'bien' | 'problema' {
    return retornoItems[id] ?? 'bien';
  }

  function marcarItem(id: string, estado: 'bien' | 'problema') {
    setRetornoItems((p) => ({ ...p, [id]: estado }));
  }

  function validar(l: ListaLavanderia) {
    const itemsEstado = l.items.map((i) => ({ id: i.id, estado: estadoDeItem(i.id) }));
    const hayProblema = itemsEstado.some((i) => i.estado === 'problema');
    const obs = obsRetorno.trim();
    setErrorRetorno('');
    conOperador((token) => validarConCodigo(l, itemsEstado, hayProblema, obs, token));
  }

  function validarConCodigo(
    l: ListaLavanderia,
    itemsEstado: { id: string; estado: 'bien' | 'problema' }[],
    hayProblema: boolean,
    obs: string,
    token?: string,
  ) {
    startTransition(async () => {
      const r = await accionValidarRetorno({ id: l.id, items: itemsEstado, obsRetorno: obs }, token);
      if (r.error?.startsWith('CODIGO:')) operadorRechazado();
      if (!r.ok) {
        // Antes un fallo acá no se veía: la fila se quedaba igual y quien validaba no tenía cómo
        // saber si había pasado algo o si el sistema estaba pensando.
        setErrorRetorno(r.error ?? 'No se pudo validar el retorno');
        return;
      }
      renovar();
      setListas((p) =>
        p.map((x) =>
          x.id === l.id
            ? {
                ...x,
                estado: hayProblema ? 'Devuelto-Observado' : 'Validado',
                validadoTienda: true,
                // La RPC hace `coalesce(p_obs_retorno, obs_retorno)`: una nota vacía no borra la que
                // ya estaba. La copia local sigue esa misma regla para no mostrar otra cosa.
                obsRetorno: obs || x.obsRetorno,
                items: x.items.map((i) => ({ ...i, estadoRetorno: estadoDeItem(i.id) })),
              }
            : x,
        ),
      );
      setRevisando(null);
    });
  }

  const fieldCls = campoCls;

  return (
    <div className="space-y-5">
      {chip}
      {dialogo}
      {/* Todo el envío en un grupo propio: es lo que hace que la barra pegada abajo deje de
          estar pegada al llegar al historial, que es otra cosa y no se manda. */}
      <div className="space-y-5">
        {/* LA ESTRUCTURA ES LA DEL SISTEMA VIEJO, A PROPÓSITO (21-ago-2026).
          *
          * Registrar prenda → Accesorios (conteo) → Responsables → barra de envío abajo. El equipo ya
          * llenaba esa secuencia todos los días; cambiarla no enseña nada nuevo, sólo obliga a
          * reaprender dónde estaba cada cosa. Lo que cambia es la piel —tokens, botones tocables,
          * puntos de color— no el orden en que se piensa el trabajo.
          */}

        {/* El tipo de envío es la única decisión de nivel lista, y cambia lo que muestran las
            tarjetas de abajo. Por eso va arriba de todas y no adentro de una. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-r-medio border border-line bg-white px-4 py-3 shadow-card">
          <div className="min-w-0">
            <LabelGrupo>Tipo de envío</LabelGrupo>
            <p className="text-apoyo text-muted">
              {tipo === 'LAV'
                ? 'Prendas codificadas y accesorios a granel. Cada prenda elige su destino.'
                : 'Sólo prendas codificadas, y van todas a Compostura: sin accesorios a granel.'}
            </p>
          </div>
          <OpcionBotones
            tamano="grande"
            opciones={OPC_ENVIO}
            value={tipo}
            onChange={(v) => setTipo(v as 'LAV' | 'REF')}
            ariaLabel="Tipo de envío"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <Shirt className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Registrar prenda
            </CardTitle>
            <Badge tone={items.length > 0 ? 'navy' : 'gray'}>{items.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cod-prenda">Código de prenda</Label>
                <input
                  id="cod-prenda"
                  ref={codigoRef}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && agregarItem()}
                  placeholder="EJ: LB-100"
                  autoFocus
                  className={cn(fieldCls, 'w-full tabular-nums uppercase')}
                />
              </div>
              <div>
                <LabelGrupo>Destino</LabelGrupo>
                <OpcionBotones
                  layout="grilla"
                  tamano="grande"
                  className="grid-cols-2"
                  opciones={OPC_DESTINO}
                  value={destinoEfectivo}
                  onChange={(v) => setDestinoItem(v as 'recepcion' | 'compostura')}
                  disabled={tipo === 'REF'}
                  ariaLabel="Destino de la prenda"
                />
                {tipo === 'REF' && (
                  <p className="mt-1 text-apoyo text-muted">
                    En un envío de refacción todas las prendas van a Compostura.
                  </p>
                )}
              </div>
            </div>

            <div>
              <LabelGrupo>Tipo de prenda</LabelGrupo>
              <OpcionBotones
                layout="grilla"
                tamano="grande"
                className="grid-cols-2 sm:grid-cols-4 lg:grid-cols-7"
                opciones={OPC_TIPO}
                value={itemTipo}
                onChange={setItemTipo}
                ariaLabel="Tipo de prenda"
              />
              {itemTipo === 'Otros' && (
                <div className="mt-2">
                  <Label htmlFor="tipo-otro" required>
                    ¿Qué prenda es?
                  </Label>
                  <input
                    id="tipo-otro"
                    value={tipoOtro}
                    onChange={(e) => setTipoOtro(e.target.value)}
                    placeholder="Abrigo, tirantes, faja…"
                    className={cn(fieldCls, 'w-full sm:max-w-sm')}
                  />
                </div>
              )}
            </div>

            {/* EL COLOR ES UN MENÚ, NO BOTONES, y es la excepción a propósito.
              *
              * Diecisiete colores en botones ocupaban cuatro filas y empujaban todo lo demás fuera de la
              * pantalla del teléfono. El menú se despliega sobre lo que ya hay y no mueve nada.
              *
              * Lo que sí se conserva es el punto: el color elegido se ve al lado del nombre, que era el
              * problema de fondo — «Azul acero» y «Azul presidente» leídos no se distinguen. Dentro del
              * menú van agrupados por familia. */}
            <div className="sm:max-w-sm">
              <Label htmlFor="color-prenda">Color</Label>
              <div className="relative">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 rounded-r-pastilla border border-ink/20"
                  style={{ background: hexColorPrenda[itemColor] ?? PUNTO_OTROS }}
                />
                <Select
                  id="color-prenda"
                  value={itemColor}
                  onChange={(e) => setItemColor(e.target.value)}
                  className="pl-10"
                >
                  {familiasColorPrenda.map((fam) => (
                    <optgroup key={fam.nombre} label={fam.nombre}>
                      {fam.colores.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <LabelGrupo>Talla</LabelGrupo>
              <div className="space-y-2">
                <OpcionBotones
                  layout="grilla"
                  tamano="grande"
                  className="w-fit grid-cols-1"
                  opciones={OPC_SIN_TALLA}
                  value={itemTalla}
                  onChange={setItemTalla}
                  ariaLabel="Prenda sin talla"
                />
                <div>
                  <span className="mb-1 block text-rotulo font-semibold uppercase text-muted">
                    Adulto
                  </span>
                  <OpcionBotones
                    layout="grilla"
                    tamano="grande"
                    className="grid-cols-4 sm:grid-cols-8"
                    opciones={OPC_TALLA_ADULTO}
                    value={itemTalla}
                    onChange={setItemTalla}
                    ariaLabel="Talla de adulto"
                  />
                </div>
                <div>
                  <span className="mb-1 block text-rotulo font-semibold uppercase text-muted">
                    Niño
                  </span>
                  <OpcionBotones
                    layout="grilla"
                    tamano="grande"
                    className="grid-cols-5 sm:grid-cols-10"
                    opciones={OPC_TALLA_NINO}
                    value={itemTalla}
                    onChange={setItemTalla}
                    ariaLabel="Talla de niño"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="obs-prenda">Observaciones</Label>
              <input
                id="obs-prenda"
                value={itemObs}
                onChange={(e) => setItemObs(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && agregarItem()}
                placeholder="Opcional: mancha en la solapa, botón flojo, ruedo descosido…"
                className={cn(fieldCls, 'w-full')}
              />
            </div>

            <div>
              <Button
                type="button"
                onClick={agregarItem}
                disabled={motivoNoAgregar != null}
                aria-describedby="motivo-agregar"
                className="w-full justify-center sm:w-auto"
              >
                <Plus className="h-4 w-4" strokeWidth={2} /> Agregar prenda
              </Button>
              <p id="motivo-agregar" className="mt-1 text-apoyo text-muted">
                {motivoNoAgregar ?? 'También se agrega con Enter.'}
              </p>
            </div>

            {items.length > 0 && (
              <ul className="divide-y divide-line rounded-r-chico border border-line">
                {items.map((it, i) => (
                  <li key={it.cod + '-' + i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-cuerpo">
                    <span className="tabular-nums font-medium text-navy">{it.cod}</span>
                    <span className="text-muted">
                      {it.tipo} · {it.color}
                      {it.talla ? ' · ' + it.talla : ''}
                    </span>
                    {it.destino === 'compostura' && <Badge tone="red">Compostura</Badge>}
                    {it.obs && <span className="w-full text-apoyo text-muted sm:w-auto">«{it.obs}»</span>}
                    <button
                      type="button"
                      onClick={() => quitarItem(i)}
                      className="toque ml-auto text-muted transition-colors hover:text-error"
                      aria-label={'Quitar ' + it.cod + ' de la lista'}
                    >
                      <X className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Accesorios a granel — sólo en el envío general */}
        {tipo === 'LAV' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5">
                <Package className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Accesorios (conteo)
              </CardTitle>
              <Badge tone={totalGenerales > 0 ? 'navy' : 'gray'}>{totalGenerales}</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ACCESORIOS.map((a) => (
                  <div
                    key={a.key}
                    className={cn(
                      // UN ACCESORIO CONTADO SE ENCIENDE. Seis casillas idénticas en cero se leen
                      // todas igual, y quien carga no tiene cómo ver de un vistazo qué ya contó y
                      // qué no. El que tiene al menos uno se marca en oro.
                      'flex items-center justify-between rounded-r-chico border px-3 py-2 transition-colors duration-150',
                      generales[a.key] > 0 ? 'border-gold bg-gold/10' : 'border-line',
                    )}
                  >
                    <span className={cn('text-cuerpo text-navy', generales[a.key] > 0 && 'font-semibold')}>
                      {a.label}
                    </span>
                    <div className="inline-flex items-center gap-0.5 rounded-r-chico border border-line">
                      <button
                        type="button"
                        onClick={() => cambiarGeneral(a.key, -1)}
                        aria-label={'Menos ' + a.label}
                        className="flex h-10 w-10 items-center justify-center text-muted transition-colors hover:bg-paper active:scale-[0.97]"
                      >
                        <Minus className="h-4 w-4" strokeWidth={2} />
                      </button>
                      <span
                        className={cn(
                          'w-8 text-center text-dato font-semibold tabular-nums',
                          generales[a.key] > 0 ? 'text-gold-deep' : 'text-muted',
                        )}
                      >
                        {generales[a.key]}
                      </span>
                      <button
                        type="button"
                        onClick={() => cambiarGeneral(a.key, 1)}
                        aria-label={'Más ' + a.label}
                        className="flex h-10 w-10 items-center justify-center text-muted transition-colors hover:bg-paper active:scale-[0.97]"
                      >
                        <Plus className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Responsables — mismo pseudo-FK por nombre que el resto del sistema (CLAUDE.md) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Responsables
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <LabelGrupo>Responsable de inventario</LabelGrupo>
              <PersonaPicker empleados={empleados} selected={respInv} onChange={setRespInv} single placeholder="Buscar…" />
            </div>
            <div>
              <LabelGrupo>Responsable de entrega y traslado</LabelGrupo>
              <PersonaPicker empleados={empleados} selected={respTraslado} onChange={elegirTraslado} single placeholder="Buscar…" />
            </div>
          </CardContent>
        </Card>

        {/* LA BARRA DE ENVÍO VA PEGADA ABAJO, como en el sistema viejo.
          *
          * La pantalla es larga y se llena de arriba hacia abajo; con el botón al final del
          * documento, quien carga quince prendas tiene que bajar hasta el fondo para mandar y volver
          * a subir para seguir. Pegada, el total de lo que se va a mandar y el botón están siempre a
          * la vista — que es además la única forma de darse cuenta de que uno se olvidó de los
          * accesorios. */}
        <div className="sticky bottom-0 z-20 space-y-2 rounded-r-grande border border-line bg-superficie/95 px-4 py-3 shadow-elev-2 backdrop-blur">
          {error && <Aviso tono="error" className="text-cuerpo">{error}</Aviso>}
          {/* El acierto también se anuncia. Antes era un párrafo mudo: con lector de pantalla la
              lista se enviaba y no pasaba nada audible, que es indistinguible de que fallara. */}
          {ok && <Aviso tono="exito" className="text-cuerpo">{ok}</Aviso>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-apoyo">
              <span className="text-dato font-semibold text-navy">{items.length}</span>{' '}
              {items.length === 1 ? 'prenda' : 'prendas'} en lista
              {tipo === 'LAV' && (
                <>
                  {' · '}
                  <span className="text-dato font-semibold text-navy">{totalGenerales}</span>{' '}
                  {totalGenerales === 1 ? 'accesorio' : 'accesorios'}
                </>
              )}
            </span>
            <div className="flex flex-col items-stretch gap-1 sm:items-end">
              <Button
                type="button"
                size="grande"
                onClick={enviar}
                disabled={!puedeEnviar}
                pending={pending}
                aria-describedby={motivoBloqueo ? 'motivo-envio-lav' : undefined}
                className="justify-center"
              >
                {!pending && <Send className="h-4 w-4" strokeWidth={2} />}
                {pending ? 'Enviando…' : tipo === 'REF' ? 'Enviar a compostura' : 'Enviar a lavandería'}
              </Button>
              {motivoBloqueo && (
                <span id="motivo-envio-lav" className="text-micro font-medium text-aviso-deep">
                  {motivoBloqueo}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <Package className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Historial de envíos
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {listas.length === 0 ? (
            <EmptyState icon={Package} titulo="Sin envíos todavía">
              Cuando envíes una lista a lavandería, aparecerá acá.
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Lista</TH>
                  <TH>Tipo</TH>
                  <TH>Fecha</TH>
                  <TH className="text-right">Ítems</TH>
                  <TH>Estado</TH>
                  <TH className="pr-5" />
                </TR>
              </THead>
              <TBody>
                {listas.map((l) => {
                  const abierta = revisando === l.id;
                  const conProblema = abierta
                    ? l.items.filter((i) => estadoDeItem(i.id) === 'problema').length
                    : 0;
                  return (
                    <Fragment key={l.id}>
                      <TR>
                        <TD className="pl-5 tabular-nums text-dato">{l.id.slice(0, 8)}</TD>
                        <TD>{l.tipo === 'LAV' ? 'General' : 'Refacción'}</TD>
                        <TD className="tabular-nums text-dato text-muted">{l.fecha.slice(0, 10)}</TD>
                        <TD className="text-right tabular-nums">{l.items.length}</TD>
                        <TD>
                          <Badge tone={ESTADO_TONE[l.estado] ?? 'gray'}>{l.estado}</Badge>
                        </TD>
                        <TD className="pr-5 text-right">
                          {/* EL RETORNO SE REVISA, NO SE FIRMA A CIEGAS. Este botón antes validaba la
                              lista entera como «todo bien» de una sola vez: era la única salida para
                              destrabar la fila, así que una prenda manchada o perdida se declaraba
                              buena y desaparecía el único registro reclamable a la lavandería. Ahora
                              despliega el detalle y cada prenda se responde por separado. */}
                          {l.estado === 'En proceso' && (
                            <Button
                              type="button"
                              variant="outline"
                              className="px-3 py-1.5 text-apoyo"
                              disabled={pending}
                              aria-expanded={abierta}
                              aria-controls={abierta ? 'revision-' + l.id : undefined}
                              onClick={() => (abierta ? cerrarRevision() : abrirRevision(l))}
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={2} />
                              {abierta ? 'Cerrar revisión' : 'Revisar retorno'}
                            </Button>
                          )}
                          {l.estado === 'Devuelto-Observado' && (
                            <span className="inline-flex flex-col items-end gap-0.5 text-apoyo text-error-deep">
                              <span className="inline-flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} /> Con observación
                              </span>
                              {/* La nota se muestra en la fila y no sólo en la base: es el sustento del
                                  reclamo, y guardada donde nadie la ve no sirve de nada. */}
                              {l.obsRetorno && (
                                <span className="max-w-[18rem] text-right font-normal leading-snug text-muted">
                                  «{l.obsRetorno}»
                                </span>
                              )}
                            </span>
                          )}
                        </TD>
                      </TR>

                      {abierta && (
                        <TR className="hover:bg-transparent">
                          <TD colSpan={6} id={'revision-' + l.id} className="bg-paper/70 px-5 py-4">
                            <div className="space-y-4">
                              <div>
                                <LabelGrupo>Cómo volvió cada prenda</LabelGrupo>
                                <p className="text-apoyo text-muted">
                                  Marca «Con problema» la prenda que volvió mal o que no volvió. Con una sola
                                  marcada, la lista queda como «Devuelto-Observado» y no como validada.
                                </p>
                              </div>

                              {/* Una lista sin prendas no debería existir —enviar exige al menos una— pero
                                  las que quedaron de antes sí pueden estar así, y un recuadro vacío se lee
                                  como que la pantalla se rompió. */}
                              {l.items.length === 0 && (
                                <p className="rounded-r-chico border border-dashed border-line px-3 py-2.5 text-cuerpo text-muted">
                                  Esta lista no tiene prendas registradas: sólo se puede dar por validada.
                                </p>
                              )}

                              <ul className="divide-y divide-line rounded-r-chico border border-line empty:hidden">
                                {l.items.map((i) => (
                                  <li
                                    key={i.id}
                                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-cuerpo"
                                  >
                                    <span className="tabular-nums font-medium text-navy">{i.cod}</span>
                                    <span className="text-muted">
                                      {[i.tipo, i.color, i.talla].filter(Boolean).join(' · ')}
                                    </span>
                                    {/* La observación con la que SALIÓ la prenda: sin ella, quien revisa no
                                        puede saber si la mancha es nueva o si ya iba así. */}
                                    {i.obs && (
                                      <span className="w-full text-apoyo text-muted sm:w-auto">«{i.obs}»</span>
                                    )}
                                    <OpcionBotones
                                      className="ml-auto"
                                      opciones={OPC_RETORNO}
                                      value={estadoDeItem(i.id)}
                                      onChange={(v) => marcarItem(i.id, v === 'problema' ? 'problema' : 'bien')}
                                      disabled={pending}
                                      ariaLabel={'Cómo volvió ' + i.cod}
                                    />
                                  </li>
                                ))}
                              </ul>

                              <div>
                                <Label htmlFor={'obs-retorno-' + l.id}>Observación del retorno</Label>
                                <Textarea
                                  id={'obs-retorno-' + l.id}
                                  value={obsRetorno}
                                  onChange={(e) => setObsRetorno(e.target.value)}
                                  disabled={pending}
                                  placeholder="Qué pasó y con cuál prenda: «LB-100 volvió con la solapa manchada», «LB-104 no volvió»."
                                />
                              </div>

                              {/* NO BLOQUEA. Si la observación debe ser obligatoria cuando hay una prenda con
                                  problema es una regla de negocio que todavía no está decidida: acá sólo se
                                  avisa, para no dejar a la encargada sin forma de cerrar la lista. */}
                              {conProblema > 0 && !obsRetorno.trim() && (
                                <Aviso tono="aviso">
                                  Hay{' '}
                                  {conProblema === 1
                                    ? 'una prenda marcada con problema'
                                    : conProblema + ' prendas marcadas con problema'}{' '}
                                  y ninguna descripción. Sin decir qué pasó, el reclamo a la lavandería queda
                                  sin sustento.
                                </Aviso>
                              )}

                              {errorRetorno && <Aviso tono="error">{errorRetorno}</Aviso>}

                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="text-cuerpo text-muted">
                                  {conProblema === 0
                                    ? 'Todas las prendas volvieron bien.'
                                    : conProblema === 1
                                      ? '1 prenda con problema.'
                                      : conProblema + ' prendas con problema.'}
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="px-3 py-2"
                                    disabled={pending}
                                    onClick={cerrarRevision}
                                  >
                                    Cancelar
                                  </Button>
                                  <Button
                                    type="button"
                                    className="px-3 py-2"
                                    pending={pending}
                                    onClick={() => validar(l)}
                                  >
                                    {!pending && <Check className="h-4 w-4" strokeWidth={2} />}
                                    {conProblema > 0 ? 'Registrar con observación' : 'Validar retorno'}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </TD>
                        </TR>
                      )}
                    </Fragment>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
