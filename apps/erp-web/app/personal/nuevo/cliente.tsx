'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RolDerivado } from '../../../lib/roles-repo';
import type { Sede } from '../../../lib/sedes-repo';
import { CamposPerfil, opcionesRol } from '../../empleados/cliente';
import { accionCrearEmpleado } from '../../empleados/actions';
import { accionVincularCandidato } from '../candidatos/actions';
import { Card, CardContent } from '../../../components/ui/card';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Aviso, campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';
import { hoyPeru } from '../../../lib/fechas';

// Paso 1 de la alta encadenada (R2): los mismos campos que tenía el modal «Nuevo colaborador» de
// EmpleadosCliente —CamposPerfil (nombre, rol, sede, tiendas, fecha de ingreso, notas) más una
// contraseña inicial—, ahora como página en vez de modal. SIN salario: el alta nunca lo capturó
// (spec §2.4: "nunca lo tuvo").
//
// Al crear, esta pantalla NO muestra el código interno una sola vez como sí hacía el modal viejo:
// la cadena sigue derecho al contrato, que es el punto entero de esta pantalla. El `cod` sigue
// disponible para soporte desde la base si hiciera falta.
export function NuevaPersonaCliente({
  sedes,
  rolesDerivados,
  precarga,
}: {
  sedes: Sede[];
  rolesDerivados: RolDerivado[];
  /** Candidato que pasa a alta (ticket 14): datos ya cargados y aviso opcional. */
  precarga?: { id: string; nombre: string; sedeCod: string | null; notas: string; aviso: string | null } | null;
}) {
  const router = useRouter();
  const opciones = useMemo(() => opcionesRol(rolesDerivados), [rolesDerivados]);

  const [nombre, setNombre] = useState(precarga?.nombre ?? '');
  const [rolValor, setRolValor] = useState<string>('ventas_junior');
  const sedeInicial = sedes.find((s) => s.cod === precarga?.sedeCod)?.cod ?? sedes[0]?.cod ?? '';
  const [sedePrimaria, setSedePrimaria] = useState(sedeInicial);
  const [tiendas, setTiendas] = useState<string[]>(sedeInicial ? [sedeInicial] : []);
  // F4 (validador de flujo 23-ago-2026): quien se está registrando casi siempre empieza el mismo
  // día del alta. Default a hoy, no obligatorio: el campo sigue editable para el caso real de
  // cargar a alguien que ya venía trabajando.
  const [fechaIngreso, setFechaIngreso] = useState(hoyPeru());
  const [notas, setNotas] = useState(precarga?.notas ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function crear() {
    setError('');
    if (!nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!sedePrimaria) {
      setError('Elige una sede primaria');
      return;
    }
    // Las reglas de la contraseña (largo mínimo editable, sin el nombre…) las aplica el servidor y
    // devuelve el mensaje con qué corregir: aquí sólo se evita mandarla vacía.
    if (!password) {
      setError('Escribe una contraseña inicial: la persona la cambiará al entrar por primera vez.');
      return;
    }
    const opcion = opciones.find((o) => o.valor === rolValor);
    if (!opcion) {
      setError('Elige un rol');
      return;
    }
    startTransition(async () => {
      const r = await accionCrearEmpleado({
        nombre,
        rolBase: opcion.rolBase,
        rolCod: opcion.rolCod,
        sedeCod: sedePrimaria,
        tiendas,
        fechaIngreso: fechaIngreso || null,
        notas,
        password,
      });
      if (!r.ok || !r.id) {
        setError(r.error ?? 'No se pudo crear a la persona.');
        return;
      }
      // Ticket 14: si venía de un candidato, queda vinculado (contratado). Si falla, el alta ya
      // está hecha: no se bloquea la cadena, el candidato se puede vincular a mano luego.
      if (precarga) await accionVincularCandidato(precarga.id, r.id);
      // Paso 2 de la cadena: el contrato, con el editor ya abierto (AcuerdosCliente +
      // abrirNuevoAlMontar) y la fecha de ingreso precompletada (F1.5).
      router.push(`/personal/${r.id}/contrato?continuar=alta`);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        {precarga?.aviso && <Aviso tono="aviso">{precarga.aviso}</Aviso>}
        <CamposPerfil
          nombre={nombre}
          setNombre={setNombre}
          rolValor={rolValor}
          setRolValor={setRolValor}
          sedePrimaria={sedePrimaria}
          setSedePrimaria={setSedePrimaria}
          tiendas={tiendas}
          setTiendas={setTiendas}
          fechaIngreso={fechaIngreso}
          setFechaIngreso={setFechaIngreso}
          notas={notas}
          setNotas={setNotas}
          sedes={sedes}
          opciones={opciones}
        />

        <div>
          <label className="mb-1 block text-rotulo uppercase text-muted">Contraseña inicial</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Temporal: al entrar, la persona la cambia"
            className={cn(campoCls, 'w-full')}
          />
        </div>

        {error && (
          <Aviso tono="error" className="text-cuerpo">
            {error}
          </Aviso>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-line/60 pt-4">
          <Link href="/personal" className={buttonVariants({ variant: 'ghost' })}>
            Cancelar
          </Link>
          <Button type="button" onClick={crear} pending={pending}>
            {pending ? 'Creando…' : 'Guardar y seguir al contrato'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
