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
import { cerrarOperador, validarCodigo } from './actions';

// Código personal en equipos compartidos (spec codigo-personal §5).
//
// El operador vive SÓLO en memoria de la pestaña: ni localStorage ni cookie. El código se teclea,
// (usuario + PIN) viaja una vez a `validarCodigo` (que lo valida la base y cuenta los intentos) y aquí se guarda
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
      if (vigente) return accion(vigente.token);
      fijar(null);
      setPendiente(() => accion);
    },
    [compartido, fijar],
  );

  // Renueva la ventana de inactividad de la pantalla. Se llama SÓLO cuando la acción salió bien: la
  // base renueva la suya (`tocar_operador`) en el mismo caso, y las dos cuentas deben coincidir.
  const renovar = useCallback(() => {
    const vigente = operadorVigente(ref.current, Date.now());
    if (vigente) fijar(registrarActividad(vigente, Date.now()));
  }, [fijar]);

  // «cambiar»: además de olvidar al operador en pantalla, se REVOCA su token en la base.
  const cambiar = useCallback(() => {
    const token = ref.current?.token;
    fijar(cambiarOperador());
    if (token) void cerrarOperador(token);
  }, [fijar]);

  // Si el servidor rechaza por operador vencido (p. ej. la base lo venció antes que la pestaña).
  const operadorRechazado = useCallback(() => fijar(null), [fijar]);

  const chip = compartido ? (
    <ChipOperador
      operador={operador}
      onIngresar={() => setPendiente(() => () => undefined)}
      onCambiar={cambiar}
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

  return { conOperador, operadorRechazado, renovar, chip, dialogo, operador };
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
        className="toque inline-flex items-center px-1 font-medium text-navy underline-offset-2 hover:text-gold hover:underline"
      >
        {operador ? 'cambiar' : 'Ingresar PIN'}
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
  const [usuario, setUsuario] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (abierto) {
      setUsuario('');
      setPin('');
      setError(null);
    }
  }, [abierto]);

  const confirmar = () =>
    start(async () => {
      setError(null);
      try {
        const r = await validarCodigo(usuario, pin);
        if (r.ok) {
          setUsuario('');
          setPin('');
          onValidado(nuevoOperador({ token: r.token, nombre: r.nombre, ventanaMin: r.ventanaMin }, Date.now()));
          return;
        }
        setPin('');
        setError(mensajeFallo(r));
      } catch {
        setError('No se pudo validar el código. Inténtalo de nuevo.');
      }
    });

  return (
    <Modal open={abierto} onClose={onCerrar} title="¿Quién opera?" subtitle="Ingresa tu usuario y tu PIN personal" size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (usuario.trim() && pin.trim() && !pending) confirmar();
        }}
        className="space-y-3"
      >
        <div>
          <Label htmlFor="codigo-usuario">Usuario</Label>
          <Input
            id="codigo-usuario"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            maxLength={12}
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            className="tabular-nums"
          />
        </div>
        <div>
          <Label htmlFor="codigo-pin">PIN</Label>
          <Input
            id="codigo-pin"
            // type="password" enmascara en todos los navegadores (el -webkit-text-security de antes
            // no enmascaraba en Firefox). autoComplete="new-password" evita que el navegador
            // autocomplete el PIN de una persona para la siguiente en la PC compartida.
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            data-lpignore="true"
            maxLength={12}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="tabular-nums"
          />
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
        <p className="text-micro text-muted">
          ¿Aún no tienes PIN? Defínelo desde tu propia sesión, en «Mi desempeño».
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" pending={pending} disabled={!usuario.trim() || !pin.trim()}>
            Confirmar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function mensajeFallo(r: { bloqueadoMin?: number; intentosRestantes?: number; motivo?: string }): string {
  if (r.motivo === 'equipo_no_compartido') {
    return 'Este equipo no está marcado como compartido. Pídele al administrador que lo active en Dispositivos.';
  }
  if (r.bloqueadoMin) {
    return `Demasiados intentos. Espera ${r.bloqueadoMin} ${r.bloqueadoMin === 1 ? 'minuto' : 'minutos'}.`;
  }
  const quedan =
    typeof r.intentosRestantes === 'number'
      ? r.intentosRestantes === 0
        ? ' No quedan intentos: espera unos minutos.'
        : ` ${r.intentosRestantes === 1 ? 'Queda 1 intento' : `Quedan ${r.intentosRestantes} intentos`}.`
      : '';
  if (r.motivo === 'sin_pin') {
    return `Esa persona aún no definió su PIN. Puede hacerlo desde su sesión, en «Mi desempeño».${quedan}`;
  }
  return `Usuario o PIN incorrectos.${quedan}`;
}
