'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { Modal } from '../../components/ui/modal';
import { Button } from '../../components/ui/button';
import { Input, Label, Aviso, campoCls } from '../../components/ui/form';
import { cn } from '../../lib/cn';
import {
  cambiarOperador,
  formatoCuentaRegresiva,
  msParaExpirar,
  nuevoOperador,
  operadorVigente,
  registrarActividad,
  type OperadorActivo,
} from '../../lib/operador-activo';
import { cerrarOperador, modoCodigo, validarCodigo } from './actions';

// Código personal en equipos compartidos (spec codigo-personal §5; operador-pc-compartida R3/R4).
//
// El operador vive SÓLO en memoria de la pestaña: ni localStorage ni cookie. Está en un almacén de
// módulo (no en el estado de cada pantalla) para que sobreviva a la navegación entre Kanban,
// Registrar, Envíos y Reportes sin pedir el código otra vez; recargar o cerrar la pestaña lo borra.
// El código se teclea,
// (usuario + PIN) viaja una vez a `validarCodigo` (que lo valida la base y cuenta los intentos) y aquí se guarda
// únicamente el token que devuelve. Si el equipo no es compartido, `conOperador` ejecuta la acción
// tal cual y no se muestra nada.
let almacen: OperadorActivo | null = null;
const oyentes = new Set<() => void>();
function fijar(op: OperadorActivo | null) {
  almacen = op;
  oyentes.forEach((f) => f());
}
function suscribir(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

// Modo del código (0179): 'cod' = una sola casilla «Tu código» con el código de empleado (default);
// 'pin' = diálogo con usuario + PIN. Se pregunta una vez a la base y se recuerda mientras viva la
// pestaña. Mientras llega la respuesta se muestra el modo por defecto.
let modoCache: 'cod' | 'pin' | null = null;
function useModo(activo: boolean): 'cod' | 'pin' {
  const [modo, setModo] = useState<'cod' | 'pin'>(modoCache ?? 'cod');
  useEffect(() => {
    if (!activo || modoCache) return;
    let vivo = true;
    modoCodigo()
      .then((m) => {
        modoCache = m;
        if (vivo) setModo(m);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [activo]);
  return modo;
}

export function useOperador(compartido: boolean) {
  const operador = useSyncExternalStore(suscribir, () => almacen, () => null);
  const modo = useModo(compartido);
  const [pendiente, setPendiente] = useState<((token?: string) => void) | null>(null);

  // Al cumplirse la ventana sin actividad, el chip vuelve a «Ingresar código».
  useEffect(() => {
    if (!operador) return;
    const t = setTimeout(() => fijar(operadorVigente(almacen, Date.now())), msParaExpirar(operador, Date.now()) + 50);
    return () => clearTimeout(t);
  }, [operador]);

  // Ejecuta `accion` con el token del operador vigente; si no hay, pide el código primero.
  const conOperador = useCallback(
    (accion: (token?: string) => void) => {
      if (!compartido) return accion();
      const vigente = operadorVigente(almacen, Date.now());
      if (vigente) return accion(vigente.token);
      fijar(null);
      setPendiente(() => accion);
    },
    [compartido],
  );

  // Renueva la ventana de inactividad de la pantalla. Se llama SÓLO cuando la acción salió bien: la
  // base renueva la suya (`tocar_operador`) en el mismo caso, y las dos cuentas deben coincidir.
  const renovar = useCallback(() => {
    const vigente = operadorVigente(almacen, Date.now());
    if (vigente) fijar(registrarActividad(vigente, Date.now()));
  }, []);

  // «cambiar»: además de olvidar al operador en pantalla, se REVOCA su token en la base.
  const cambiar = useCallback(() => {
    const token = almacen?.token;
    fijar(cambiarOperador());
    if (token) void cerrarOperador(token);
  }, []);

  // Si el servidor rechaza por operador vencido (p. ej. la base lo venció antes que la pestaña).
  const operadorRechazado = useCallback(() => fijar(null), []);

  const alValidar = (op: OperadorActivo) => {
    fijar(op);
    const accion = pendiente;
    setPendiente(null);
    accion?.(op.token);
  };

  const chip = !compartido ? null : modo === 'cod' ? (
    <PanelCodigo operador={operador} esperando={pendiente !== null} onValidado={alValidar} onCambiar={cambiar} />
  ) : (
    <ChipOperador
      operador={operador}
      onIngresar={() => setPendiente(() => () => undefined)}
      onCambiar={cambiar}
    />
  );

  const dialogo = compartido && modo === 'pin' ? (
    <DialogoCodigo
      abierto={pendiente !== null}
      onCerrar={() => setPendiente(null)}
      onValidado={alValidar}
    />
  ) : null;

  return { conOperador, operadorRechazado, renovar, chip, dialogo, operador };
}

// Modo 'cod': la casilla «Tu código» está SIEMPRE a la vista, arriba. Sin operador pide el código de
// empleado; con operador muestra quién opera, la cuenta regresiva y «Cambiar operador». El código no
// es secreto (decisión del dueño), pero igual se enmascara y no se guarda en ningún lado: sólo se
// conserva el token que devuelve la base.
function PanelCodigo({
  operador,
  esperando,
  onValidado,
  onCambiar,
}: {
  operador: OperadorActivo | null;
  esperando: boolean;
  onValidado: (op: OperadorActivo) => void;
  onCambiar: () => void;
}) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [ahora, setAhora] = useState(() => Date.now());
  const campo = useRef<HTMLInputElement>(null);

  // Un tic por segundo sólo mientras hay alguien operando.
  useEffect(() => {
    if (!operador) return;
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [operador]);

  // Sin operador la casilla toma el foco; también cuando una acción se quedó esperando el código.
  useEffect(() => {
    if (!operador) campo.current?.focus();
  }, [operador, esperando]);

  const entrar = () =>
    start(async () => {
      setError(null);
      try {
        const r = await validarCodigo('', codigo);
        if (r.ok) {
          setCodigo('');
          onValidado(nuevoOperador({ token: r.token, nombre: r.nombre, ventanaMin: r.ventanaMin }, Date.now()));
          return;
        }
        setCodigo('');
        setError(mensajeFallo(r));
        campo.current?.focus();
      } catch {
        setError('No se pudo validar el código. Inténtalo de nuevo.');
      }
    });

  if (operador) {
    return (
      <div
        role="status"
        className="mb-3 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-r-chico border border-line bg-paper px-3 py-1.5 text-apoyo"
      >
        <UserRound className="h-4 w-4 text-muted" strokeWidth={2} />
        <span className="text-muted">Operando:</span>
        <span className="font-medium text-navy">{operador.nombre}</span>
        <span aria-hidden className="text-muted">·</span>
        <span className="tabular-nums text-muted">se cierra en {formatoCuentaRegresiva(msParaExpirar(operador, ahora))}</span>
        <button
          type="button"
          onClick={onCambiar}
          className="toque inline-flex items-center gap-1 px-1 font-medium text-navy underline-offset-2 hover:text-gold hover:underline"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} /> Cambiar operador
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (codigo.trim() && !pending) entrar();
      }}
      className="mb-3 shrink-0 rounded-r-chico border border-line bg-paper px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <UserRound className="h-4 w-4 text-muted" strokeWidth={2} />
        <Label htmlFor="codigo-empleado" className="mb-0">
          Tu código
        </Label>
        <input
          id="codigo-empleado"
          ref={campo}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          data-lpignore="true"
          spellCheck={false}
          maxLength={12}
          placeholder="4 dígitos"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\s/g, ''))}
          aria-invalid={error ? true : undefined}
          className={cn(campoCls, 'w-32 tabular-nums')}
        />
        <Button type="submit" pending={pending} disabled={!codigo.trim()}>
          Entrar
        </Button>
        {esperando && !error && <span className="text-apoyo text-muted">Ingresa tu código para continuar.</span>}
      </div>
      {error && (
        <div className="mt-2">
          <Aviso tono="error">{error}</Aviso>
        </div>
      )}
    </form>
  );
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
  // Un tic por segundo sólo mientras hay alguien operando.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!operador) return;
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [operador]);

  return (
    <div
      role="status"
      className="mb-3 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-r-chico border border-line bg-paper px-3 py-1.5 text-apoyo"
    >
      <UserRound className="h-4 w-4 text-muted" strokeWidth={2} />
      {operador ? (
        <>
          <span className="text-muted">Operando:</span>
          <span className="font-medium text-navy">{operador.nombre}</span>
          <span aria-hidden className="text-muted">·</span>
          <span className="tabular-nums text-muted">se cierra en {formatoCuentaRegresiva(msParaExpirar(operador, ahora))}</span>
        </>
      ) : (
        <span className="text-muted">Nadie operando</span>
      )}
      <button
        type="button"
        onClick={operador ? onCambiar : onIngresar}
        className="toque inline-flex items-center gap-1 px-1 font-medium text-navy underline-offset-2 hover:text-gold hover:underline"
      >
        {operador ? (
          <>
            <LogOut className="h-4 w-4" strokeWidth={2} /> Cambiar operador / Salir
          </>
        ) : (
          'Ingresar código'
        )}
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
    <Modal open={abierto} onClose={onCerrar} title="¿Quién opera?" subtitle="Ingresa tu código personal: usuario y PIN" size="sm">
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
  if (r.motivo === 'codigo_repetido') {
    return 'Ese código lo tienen dos personas activas. Avisa al administrador para que lo corrija.';
  }
  if (r.motivo === 'equipo_no_compartido') {
    return 'Este equipo no está marcado como compartido. Pídele al administrador que lo active en Dispositivos.';
  }
  if (r.bloqueadoMin) {
    return `Demasiados intentos, espera ${r.bloqueadoMin} ${r.bloqueadoMin === 1 ? 'minuto' : 'minutos'}.`;
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
  if (r.motivo === 'codigo_no_encontrado') return `Código no encontrado.${quedan}`;
  return `Usuario o PIN incorrectos.${quedan}`;
}
