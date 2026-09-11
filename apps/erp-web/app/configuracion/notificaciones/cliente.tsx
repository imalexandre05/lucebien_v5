'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { AlertaRegla } from '../../../lib/notificaciones-repo';
import { accionActualizarAlertaRegla } from '../actions';
import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { OpcionBotones } from '../../../components/ui/opcion-botones';
import { Aviso, campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

// C-6 de la spec de notificaciones. Sólo se editan `activa` y `umbral` — nunca `destinatario_rol`
// (se muestra de sólo lectura más abajo, ver por qué en notificaciones-repo.ts).

// Las 6 reglas de control interno (migración 0107) y las 5 originales (0041/0046, "módulo
// comercial"). El agrupado es fijo — el `tipo` de cada fila ya dice a qué grupo pertenece, no hace
// falta ninguna columna nueva en la base para esto.
const CONTROL_INTERNO = [
  'declaracion_incompleta',
  'periodo_liquidable',
  'dia_con_hora_estimada',
  'dia_sin_marca',
  'extra_sin_valor',
  'falta_fecha_ingreso',
] as const;

const COMERCIAL = ['devolucion_vencida', 'devolucion_proxima', 'stock_bajo', 'caja_sin_cerrar', 'reporte_sin_evaluar'] as const;

// Traducción de los 11 `tipo` técnicos a un nombre que un administrador no técnico entienda —
// mismo criterio que ETIQUETAS_CONTEO en personal/[id]/deshacer-alta.tsx: enumeradas a mano, con
// un fallback ruidoso para lo que no se contempló, en vez de mostrar la clave cruda en silencio.
const ETIQUETAS: Record<string, string> = {
  declaracion_incompleta: 'Declaración incompleta',
  periodo_liquidable: 'Período listo para liquidar',
  dia_con_hora_estimada: 'Día con hora puesta por el sistema',
  dia_sin_marca: 'Día sin marca ni declaración',
  extra_sin_valor: 'Actividad extra sin valor',
  falta_fecha_ingreso: 'Falta fecha de ingreso',
  devolucion_vencida: 'Devolución vencida',
  devolucion_proxima: 'Devolución próxima a vencer',
  stock_bajo: 'Stock bajo',
  caja_sin_cerrar: 'Caja sin cerrar',
  reporte_sin_evaluar: 'Reporte sin evaluar',
};

function etiquetaRegla(tipo: string): string {
  return ETIQUETAS[tipo] ?? `${tipo.replaceAll('_', ' ')} (sin traducir — avisar)`;
}

function etiquetaRol(rol: string | null): string {
  if (!rol) return '—';
  return rol.replaceAll('_', ' ');
}

// Qué reglas NO tienen concepto de umbral, fijo por tipo — no se decide mirando el valor actual.
// `stock_bajo` es `null` desde la 0041 y las cuatro reglas de control interno sin umbral (0107)
// también. Si se decidiera por el valor en vez del tipo, borrar el número de una regla que SÍ usa
// umbral (ej. dejar en blanco `periodo_liquidable`) escondería el campo para siempre en el próximo
// refresco, sin forma de volver a ponerle un número.
const SIN_UMBRAL = new Set(['declaracion_incompleta', 'dia_con_hora_estimada', 'extra_sin_valor', 'falta_fecha_ingreso', 'stock_bajo']);

const SEV: Record<AlertaRegla['severidad'], { tone: 'red' | 'amber' | 'info'; label: string }> = {
  critica: { tone: 'red', label: 'Crítica' },
  warn: { tone: 'amber', label: 'Aviso' },
  info: { tone: 'info', label: 'Info' },
};

type EstadoFila = { activa: boolean; umbralTexto: string };

function aTexto(umbral: number | null): string {
  return umbral === null ? '' : String(umbral);
}

function estadoInicial(reglas: AlertaRegla[]): Record<string, EstadoFila> {
  return Object.fromEntries(reglas.map((r) => [r.tipo, { activa: r.activa, umbralTexto: aTexto(r.umbral) }]));
}

// '' → sin umbral (null). Un texto que no sea número es inválido: no se manda, se avisa y se
// revierte, en vez de guardar un NaN silencioso (ver docs/aprendizajes.md, "Confiar en Number()").
function umbralValido(texto: string): boolean {
  const t = texto.trim();
  return t === '' || (Number.isFinite(Number(t)) && Number(t) >= 0);
}
function parseUmbral(texto: string): number | null {
  const t = texto.trim();
  return t === '' ? null : Number(t);
}

function FilaRegla({
  regla,
  fila,
  guardando,
  onCambiarActiva,
  onCambiarUmbralTexto,
  onConfirmarUmbral,
}: {
  regla: AlertaRegla;
  fila: EstadoFila;
  guardando: boolean;
  onCambiarActiva: (activa: boolean) => void;
  onCambiarUmbralTexto: (texto: string) => void;
  onConfirmarUmbral: () => void;
}) {
  const sev = SEV[regla.severidad];
  return (
    <TR className={cn(!fila.activa && 'opacity-60')}>
      <TD className="pl-5">
        <div className="text-cuerpo font-medium text-navy">{etiquetaRegla(regla.tipo)}</div>
        <div className="mt-0.5 max-w-md text-apoyo leading-relaxed text-muted">{regla.descripcion}</div>
      </TD>
      <TD>
        <Badge tone={sev.tone}>{sev.label}</Badge>
      </TD>
      <TD className="text-apoyo capitalize text-muted">{etiquetaRol(regla.destinatarioRol)}</TD>
      <TD>
        {SIN_UMBRAL.has(regla.tipo) ? (
          <span className="text-apoyo text-muted">— (sin umbral)</span>
        ) : (
          <input
            type="number"
            min={0}
            step="any"
            value={fila.umbralTexto}
            disabled={guardando}
            onChange={(e) => onCambiarUmbralTexto(e.target.value)}
            onBlur={onConfirmarUmbral}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className={cn(campoCls, 'w-20 text-right tabular-nums')}
            aria-label={`Umbral de ${etiquetaRegla(regla.tipo)}`}
          />
        )}
      </TD>
      <TD className="pr-5">
        <div className="flex items-center justify-end gap-2">
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" strokeWidth={2} aria-hidden />}
          <OpcionBotones
            ariaLabel={`Activar o desactivar ${etiquetaRegla(regla.tipo)}`}
            opciones={[
              { value: 'true', label: 'Sí' },
              { value: 'false', label: 'No' },
            ]}
            value={fila.activa ? 'true' : 'false'}
            onChange={(v) => onCambiarActiva(v === 'true')}
            disabled={guardando}
          />
        </div>
      </TD>
    </TR>
  );
}

function GrupoReglas({
  titulo,
  nota,
  reglas,
  estado,
  guardandoTipo,
  onCambiarActiva,
  onCambiarUmbralTexto,
  onConfirmarUmbral,
}: {
  titulo: string;
  nota?: string;
  reglas: AlertaRegla[];
  estado: Record<string, EstadoFila>;
  guardandoTipo: string | null;
  onCambiarActiva: (tipo: string, activa: boolean) => void;
  onCambiarUmbralTexto: (tipo: string, texto: string) => void;
  onConfirmarUmbral: (tipo: string) => void;
}) {
  if (reglas.length === 0) return null;
  return (
    <Card>
      <div className="border-b border-line/60 px-5 pt-4 pb-3">
        <CardTitle>{titulo}</CardTitle>
        {nota && <p className="mt-1 text-apoyo leading-relaxed text-muted">{nota}</p>}
      </div>
      <CardContent className="overflow-x-auto px-0 pb-0">
        <Table>
          <THead>
            <TR>
              <TH className="pl-5">Regla</TH>
              <TH>Severidad</TH>
              <TH>Para</TH>
              <TH>Umbral</TH>
              <TH className="pr-5 text-right">Activa</TH>
            </TR>
          </THead>
          <TBody>
            {reglas.map((r) => (
              <FilaRegla
                key={r.tipo}
                regla={r}
                fila={estado[r.tipo] ?? { activa: r.activa, umbralTexto: aTexto(r.umbral) }}
                guardando={guardandoTipo === r.tipo}
                onCambiarActiva={(activa) => onCambiarActiva(r.tipo, activa)}
                onCambiarUmbralTexto={(texto) => onCambiarUmbralTexto(r.tipo, texto)}
                onConfirmarUmbral={() => onConfirmarUmbral(r.tipo)}
              />
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function NotificacionesReglasCliente({ reglas }: { reglas: AlertaRegla[] }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Record<string, EstadoFila>>(() => estadoInicial(reglas));
  // Última copia que SÍ confirmó el servidor — a dónde se revierte si un guardado falla, y de
  // dónde se lee el umbral vigente cuando sólo se tocó el toggle (para no mandar un umbral a
  // medio escribir que la persona todavía no soltó).
  const [confirmado, setConfirmado] = useState<Record<string, EstadoFila>>(() => estadoInicial(reglas));
  const [guardandoTipo, setGuardandoTipo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  const porTipo = useMemo(() => new Map(reglas.map((r) => [r.tipo, r])), [reglas]);
  const reglasControlInterno = CONTROL_INTERNO.map((t) => porTipo.get(t)).filter((r): r is AlertaRegla => Boolean(r));
  const reglasComercial = COMERCIAL.map((t) => porTipo.get(t)).filter((r): r is AlertaRegla => Boolean(r));

  function guardar(tipo: string, p: { activa: boolean; umbral: number | null }, revertir: () => void) {
    setError('');
    setGuardandoTipo(tipo);
    startTransition(async () => {
      const r = await accionActualizarAlertaRegla(tipo, p);
      setGuardandoTipo(null);
      if (!r.ok) {
        setError(r.error ?? `No se pudo guardar "${etiquetaRegla(tipo)}".`);
        revertir();
        return;
      }
      const confirmadoFila: EstadoFila = { activa: p.activa, umbralTexto: aTexto(p.umbral) };
      setConfirmado((c) => ({ ...c, [tipo]: confirmadoFila }));
      setEstado((e) => ({ ...e, [tipo]: confirmadoFila }));
      // Revalida /configuracion y '/' (layout) vía accionActualizarAlertaRegla → revalidarTodoLoQueLeeConfig().
      // router.refresh() trae ADEMÁS esta misma pantalla al día si otra sesión cambió algo más.
      router.refresh();
    });
  }

  function cambiarActiva(tipo: string, activa: boolean) {
    const previo = estado[tipo] ?? confirmado[tipo];
    if (previo.activa === activa) return;
    setEstado((e) => ({ ...e, [tipo]: { ...e[tipo], activa } }));
    // El umbral que viaja es el último CONFIRMADO, no un borrador sin soltar en el campo de al
    // lado: tocar el toggle nunca debe mandar por accidente un umbral que la persona todavía está
    // escribiendo.
    const umbral = parseUmbral((confirmado[tipo] ?? previo).umbralTexto);
    guardar(tipo, { activa, umbral }, () => {
      setEstado((e) => ({ ...e, [tipo]: { ...e[tipo], activa: previo.activa } }));
    });
  }

  function cambiarUmbralTexto(tipo: string, texto: string) {
    setEstado((e) => ({ ...e, [tipo]: { ...e[tipo], umbralTexto: texto } }));
  }

  function confirmarUmbral(tipo: string) {
    const actual = estado[tipo];
    const previo = confirmado[tipo] ?? actual;
    if (!actual) return;
    if (!umbralValido(actual.umbralTexto)) {
      setError(`"${etiquetaRegla(tipo)}": el umbral debe ser un número mayor o igual a 0.`);
      setEstado((e) => ({ ...e, [tipo]: { ...e[tipo], umbralTexto: previo.umbralTexto } }));
      return;
    }
    if (actual.umbralTexto.trim() === previo.umbralTexto.trim()) return; // sin cambios reales, no se manda nada
    const umbral = parseUmbral(actual.umbralTexto);
    guardar(tipo, { activa: actual.activa, umbral }, () => {
      setEstado((e) => ({ ...e, [tipo]: { ...e[tipo], umbralTexto: previo.umbralTexto } }));
    });
  }

  return (
    <div className="space-y-4">
      {error && <Aviso tono="error">{error}</Aviso>}

      <GrupoReglas
        titulo="Control interno"
        nota="Las seis reglas nuevas sobre asistencia, declaración y liquidación. Los avisos que nombran a una persona sólo los ve el administrador y esa misma persona."
        reglas={reglasControlInterno}
        estado={estado}
        guardandoTipo={guardandoTipo}
        onCambiarActiva={cambiarActiva}
        onCambiarUmbralTexto={cambiarUmbralTexto}
        onConfirmarUmbral={confirmarUmbral}
      />

      <GrupoReglas
        titulo="Módulo comercial"
        nota="Las cinco reglas originales del sistema. El módulo comercial está fuera del menú desde el 20-ago-2026, así que devolución vencida, devolución próxima, stock bajo y caja sin cerrar quedaron apagadas — se conservan por si el sistema del otro programador se conecta más adelante. «Reporte sin evaluar» sí es del control interno y sigue activa."
        reglas={reglasComercial}
        estado={estado}
        guardandoTipo={guardandoTipo}
        onCambiarActiva={cambiarActiva}
        onCambiarUmbralTexto={cambiarUmbralTexto}
        onConfirmarUmbral={confirmarUmbral}
      />
    </div>
  );
}
