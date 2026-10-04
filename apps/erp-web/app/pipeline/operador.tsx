'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { UserRound } from 'lucide-react';
import { Modal } from '../../components/ui/modal';
import { Button } from '../../components/ui/button';
import { Input, Label, Aviso } from '../../components/ui/form';
import {
  cambiarOperador,
  msParaExpirar,
  nuevoOperador,
  operadorVigente,
  registrarActividad,
  type OperadorActivo,
} from '../../lib/operador-activo';
import { validarCodigo } from './actions';

// Código personal en equipos compartidos (spec codigo-personal §5).
//
// El operador vive SÓLO en memoria de la pestaña: ni localStorage ni cookie. El código se teclea,
// viaja una vez a `validarCodigo` (que lo valida la base y cuenta los intentos) y aquí se guarda
// únicamente el token que devuelve. Si el equipo no es compartido, `conOperador` ejecuta la acción
// tal cual y no se muestra nada.
export function useOperador(compartido: boolean) {
  const [operador, setOperador] = useState<OperadorActivo | null>(null);
  const ref = useRef<OperadorActivo | null>(null);
  const [pendiente, setPendiente] = useState<((token?: string) => void) | null>(null);

  const fijar = useCallback((op: OperadorActivo | null) => {
    ref.current = op;
    setOperador(op);
  }, []);

  // Al cumplirse la ventana sin actividad, el chip vuelve a «Ingresar código».
  useEffect(() => {
    if (!operador) return;
    const t = setTimeout(() => fijar(operadorVigente(ref.current, Date.now())), msParaExpirar(operador, Date.now()) + 50);
    return () => clearTimeout(t);
  }, [operador, fijar]);

  // Ejecuta `accion` con el token del operador vigente; si no hay, pide el código primero.
  const conOperador = useCallback(
    (accion: (token?: string) => void) => {
      if (!compartido) return accion();
      const vigente = operadorVigente(ref.current, Date.now());
      if (vigente) {
        fijar(registrarActividad(vigente, Date.now()));
        return accion(vigente.token);
      }
      fijar(null);
      setPendiente(() => accion);
    },
    [compartido, fijar],
  );

  // Si el servidor rechaza por operador vencido (p. ej. la base lo venció antes que la pestaña).
  const operadorRechazado = useCallback(() => fijar(null), [fijar]);

  const chip = compartido ? (
    <ChipOperador
      operador={operador}
      onIngresar={() => setPendiente(() => () => undefined)}
      onCambiar={() => fijar(cambiarOperador())}
    />
  ) : null;

  const dialogo = compartido ? (
    <DialogoCodigo
      abierto={pendiente !== null}
      onCerrar={() => setPendiente(null)}
      onValidado={(op) => {
        fijar(op);
        const accion = pendiente;
        setPendiente(null);
        accion?.(op.token);
      }}
    />
  ) : null;

  return { conOperador, operadorRechazado, chip, dialogo, operador };
}

function ChipOperador({
  operador,
  onIngresar,
  onCambiar,
}: {
  operador: OperadorActivo | null;
  onIngresar: () => void;
  onCambiar: () => void;
}) {
  return (
    <div className="mb-3 flex shrink-0 items-center gap-2 rounded-r-chico border border-line bg-paper px-3 py-1.5 text-apoyo">
      <UserRound className="h-4 w-4 text-muted" strokeWidth={2} />
      <span className="text-muted">Operando:</span>
      <span className="font-medium text-navy">{operador ? operador.nombre : '—'}</span>
      <span aria-hidden className="text-muted">·</span>
      <button
        type="button"
        onClick={operador ? onCambiar : onIngresar}
        className="font-medium text-navy underline-offset-2 hover:text-gold hover:underline"
      >
        {operador ? 'cambiar' : 'Ingresar código'}
      </button>
    </div>
  );
}

function DialogoCodigo({
  abierto,
  onCerrar,
  onValidado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onValidado: (op: OperadorActivo) => void;
}) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (abierto) {
      setCodigo('');
      setError(null);
    }
  }, [abierto]);

  const confirmar = () =>
    start(async () => {
      setError(null);
      try {
        const r = await validarCodigo(codigo);
        if (r.ok) {
          setCodigo('');
          onValidado(nuevoOperador({ token: r.token, nombre: r.nombre, ventanaMin: r.ventanaMin }, Date.now()));
          return;
        }
        setCodigo('');
        setError(
          r.bloqueadoMin
            ? `Demasiados intentos. Espera ${r.bloqueadoMin} ${r.bloqueadoMin === 1 ? 'minuto' : 'minutos'}.`
            : 'Código incorrecto.',
        );
      } catch {
        setError('No se pudo validar el código. Inténtalo de nuevo.');
      }
    });

  return (
    <Modal open={abierto} onClose={onCerrar} title="¿Quién opera?" subtitle="Ingresa tu código personal" size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (codigo.trim() && !pending) confirmar();
        }}
        className="space-y-3"
      >
        <div>
          <Label htmlFor="codigo-personal">Código</Label>
          <Input
            id="codigo-personal"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            maxLength={12}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            // Enmascarado por CSS y no con type="password": Chrome ofrece guardar las contraseñas y, en
            // una PC compartida, el código de una persona se autocompletaría para la siguiente.
            className="tabular-nums [-webkit-text-security:disc]"
          />
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" pending={pending} disabled={!codigo.trim()}>
            Confirmar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
