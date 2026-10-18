'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Calculator, Check, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Aviso, Input, Label } from '../ui/form';
import { HorasDelPago } from './horas-del-pago';
import { detalleHoras } from '../../lib/horas-del-pago';
import { fraseDeError } from '../../lib/errores-cierre';
import { rangoCorto } from '../../lib/periodo';
import {
  accionCalcular,
  accionConfirmarYCerrar,
  accionCorregirYCerrar,
  type Preview,
} from '../../app/sueldos/liquidaciones/actions';

// Cerrar un pago en un solo paso: ver el cálculo y «Confirmar y cerrar» (decisión del dueño n.º 7).
// El cálculo lo hace siempre el servidor; este componente sólo muestra y confirma. Sirve para tres
// casos: un pago por cerrar, un rango suelto y la corrección de un pago ya cerrado.

const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const GRUPOS: [string, string][] = [
  ['ingreso', 'Suma'],
  ['descuento', 'Resta'],
  ['ajuste', 'Ajustes'],
  ['final', 'Total'],
];

export function ResultadoCalculo({ preview }: { preview: Preview }) {
  const liq = preview.liquidacion;
  const horas = detalleHoras({
    modo: liq.modo,
    asistencia: liq.asistencia,
    referencia: liq.base.referencia,
    dias: liq.dias,
    lineas: liq.lineas,
  });
  return (
    <div className="space-y-3">
      {horas && <HorasDelPago h={horas} />}
      <div className="overflow-x-auto rounded-r-chico border border-line bg-white">
        <table className="w-full text-cuerpo">
          <tbody>
            {GRUPOS.map(([g, titulo]) => {
              const lineas = liq.lineas.filter((l) => l.grupo === g);
              if (lineas.length === 0) return null;
              return (
                <GrupoLineas key={g} titulo={titulo} lineas={lineas} />
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-cuerpo font-medium text-navy tabular-nums">
        Total a pagar: {soles(liq.total)}
      </p>
      {liq.advertencias.length > 0 && (
        <div role="status" className="rounded-r-chico bg-aviso/10 px-3 py-2">
          {liq.advertencias.map((a) => (
            <p key={a} className="flex gap-2 text-cuerpo text-aviso-deep">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {a}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function GrupoLineas({
  titulo,
  lineas,
}: {
  titulo: string;
  lineas: { concepto: string; detalle: string; monto: number }[];
}) {
  return (
    <>
      <tr>
        <td colSpan={2} className="bg-paper px-3 py-1.5 text-rotulo font-medium uppercase text-muted">
          {titulo}
        </td>
      </tr>
      {lineas.map((l, i) => (
        <tr key={`${l.concepto}-${i}`} className="border-t border-line">
          <td className="px-3 py-2">
            <span className="text-navy">{l.concepto}</span>
            {l.detalle && <span className="block text-apoyo text-muted">{l.detalle}</span>}
          </td>
          <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${l.monto < 0 ? 'text-error-deep' : ''}`}>
            {soles(l.monto)}
          </td>
        </tr>
      ))}
    </>
  );
}

export function CierreDePago({
  acuerdoId,
  desde,
  hasta,
  modo = 'cerrar',
  liquidacionId,
  etiquetaVer = 'Ver el cálculo',
}: {
  acuerdoId: string;
  desde: string;
  hasta: string;
  /** `cerrar`: un pago por cerrar. `corregir`: rehacer uno ya cerrado (pide el motivo). */
  modo?: 'cerrar' | 'corregir';
  /** Sólo con `corregir`: la liquidación cerrada que se corrige. */
  liquidacionId?: string;
  etiquetaVer?: string;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [abierto, setAbierto] = useState(modo === 'cerrar');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const corrigiendo = modo === 'corregir';

  const ver = () => {
    setError(null);
    setPreview(null);
    empezar(async () => {
      const r = await accionCalcular(acuerdoId, desde, hasta);
      if (r.ok && r.datos) setPreview(r.datos);
      else setError(fraseDeError(r));
    });
  };

  const confirmar = () => {
    setError(null);
    empezar(async () => {
      const r =
        corrigiendo && liquidacionId
          ? await accionCorregirYCerrar(liquidacionId, motivo)
          : await accionConfirmarYCerrar(acuerdoId, desde, hasta);
      if (r.ok) {
        setPreview(null);
        setMotivo('');
        if (corrigiendo) setAbierto(false);
        router.refresh();
      } else {
        setError(fraseDeError(r));
        // La corrección puede haber anulado el pago aunque el cierre fallara: se refresca para verlo.
        if (corrigiendo) router.refresh();
      }
    });
  };

  if (!abierto) {
    return (
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <RefreshCw className="h-4 w-4" /> Corregir
      </Button>
    );
  }

  const motivoListo = !corrigiendo || motivo.trim().length > 0;

  return (
    <div className="space-y-3">
      {corrigiendo && (
        <div>
          <Label htmlFor={`motivo-${liquidacionId}`} required>
            ¿Qué hay que corregir?
          </Label>
          <Input
            id={`motivo-${liquidacionId}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Cuéntanos qué estaba mal en este pago…"
          />
          <p className="mt-1 text-apoyo text-muted">
            Lo ya abonado se conserva. El pago de {rangoCorto(desde, hasta)} se vuelve a calcular con los datos de hoy.
          </p>
        </div>
      )}

      {error && <Aviso tono="error">{error}</Aviso>}

      {!preview ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={ver} pending={pendiente} disabled={!motivoListo}>
            <Calculator className="h-4 w-4" /> {corrigiendo ? 'Ver el cálculo nuevo' : etiquetaVer}
          </Button>
          {corrigiendo && (
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
          )}
        </div>
      ) : (
        <>
          <ResultadoCalculo preview={preview} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirmar} pending={pendiente} disabled={!motivoListo}>
              <Check className="h-4 w-4" /> {corrigiendo ? 'Confirmar corrección' : 'Confirmar y cerrar'}
            </Button>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={pendiente}>
              Volver
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
