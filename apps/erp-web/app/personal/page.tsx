import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Award, BarChart3, CalendarCheck, Coins, FileSignature, Plus, ShoppingBag, UserPlus, Wallet, type LucideIcon } from 'lucide-react';
import { puede, type MatrizPermisos } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { tieneReauth } from '../../lib/reauth';
import { leerPeriodo } from '../../lib/periodo';
import { SECCIONES } from '../../lib/colaboradores-secciones';
import { listarColaboradores, estadoDelPeriodo } from '../../lib/colaboradores-repo';
import { PageHeader } from '../../components/shell/page-header';
import { ReauthGate } from '../../components/ui/reauth-gate';
import { Card, CardContent } from '../../components/ui/card';
import { buttonVariants } from '../../components/ui/button';
import { ListaColaboradores } from './cliente';

// El módulo único que pidió reemplazar ocho entradas sueltas del menú (Evaluaciones, Pagos,
// Asistencias, Valores, Contratos, Declarar asistencia, Liquidaciones, Adelantos).
//
// EL CAMBIO DE FONDO NO ES VISUAL. El ERP estaba organizado por TABLA y quien administra piensa
// por PERSONA: "¿qué pasa con Mary este mes?". Antes esa pregunta se contestaba abriendo cinco
// pantallas y filtrando en cada una. Acá se contesta en una.
//
// GATE. No se inventa un permiso nuevo: alcanza con poder ver cualquiera de los módulos que el
// menú ya mostraba por separado, y cada sección de adentro conserva el suyo (ver
// lib/colaboradores-secciones.ts). Reautenticación como en /evaluaciones y /pagos: acá se cruza
// nota, asistencia y sueldo de terceros, que es lo más sensible del sistema.

// HERRAMIENTAS DEL PERÍODO (Tarea 2 de la fusión R1-R4): el hub /sueldos (F1, cinco tarjetas
// grandes explicando el recorrido) queda absorbido acá como una fila compacta arriba de la lista
// — la lista de personas sigue siendo la protagonista. /sueldos ahora redirige para acá.
//
// GATE REAL, no el de la matriz. Las cinco pantallas de /sueldos/* no llaman
// puede(matriz, rol, 'sueldos', ...): cada una hardcodea `rol === 'admin' || rol === 'dueno'`
// (ver p.ej. app/sueldos/asistencia/page.tsx). 'sueldos' sí existe como módulo configurable en
// /configuracion/permisos —decide si "Personal" aparece en el menú (sidebar.tsx)— pero un rol
// no-admin con 'sueldos' tildado ahí igual choca con esa pared al entrar a cualquiera de esas
// cinco. Gatear el enlace con puede() le mostraría una herramienta que no puede usar; por eso acá
// se replica el gate real (esAdmin), no el de la matriz. Evaluaciones sí usa puede() porque
// /evaluaciones lo hace de verdad (ver app/evaluaciones/page.tsx).
type Herramienta = { href: string; icono: LucideIcon; label: string; gate: 'admin' | 'evaluaciones' };

// Orden según spec §2.2: Declarar asistencia · Ventas y metas · Adelantos y descuentos · Liquidar
// el periodo · Evaluaciones del mes · Contratos. El plan de R1 (Tarea 2) lo había dejado con los
// dos últimos invertidos.
const HERRAMIENTAS: Herramienta[] = [
  { href: '/personal/candidatos', icono: UserPlus, label: 'Candidatos', gate: 'admin' },
  { href: '/sueldos/asistencia', icono: CalendarCheck, label: 'Declarar asistencia', gate: 'admin' },
  { href: '/sueldos/ventas', icono: ShoppingBag, label: 'Ventas y metas', gate: 'admin' },
  { href: '/sueldos/movimientos', icono: Wallet, label: 'Adelantos y descuentos', gate: 'admin' },
  { href: '/sueldos/liquidaciones', icono: Coins, label: 'Liquidar el periodo', gate: 'admin' },
  { href: '/evaluaciones', icono: Award, label: 'Evaluaciones del mes', gate: 'evaluaciones' },
  { href: '/sueldos/acuerdos', icono: FileSignature, label: 'Contratos', gate: 'admin' },
  { href: '/personal/dashboard', icono: BarChart3, label: 'Dashboard de personal', gate: 'admin' },
];

export default async function ColaboradoresPage(
  props: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';
  // Mismo criterio que accesoColaboradores(): una sección soloAdmin no cuenta para decidir si el
  // módulo entero es visible, porque adentro su pantalla la bloquea igual para quien no sea
  // admin/dueño (colaboradores-secciones.ts). Antes se miraba MODULOS_DEL_MODULO, que no
  // distinguía soloAdmin: un rol con sólo 'pagos'/'sueldos'/'empleados' entraba a esta lista y
  // después chocaba con un callejón sin salida en cada persona (hotfix R1.1).
  const visibles = SECCIONES.some(
    (s) => (esAdmin || !s.soloAdmin) && puede(matriz, sesion.usuario.rol, s.modulo, 'ver', sesion.usuario.rolCod),
  );
  if (!visibles) redirect('/reportes/nuevo');

  if (!(await tieneReauth(sesion.usuario.id))) {
    return (
      <div>
        <PageHeader title="Personal" subtitle="Verificación requerida" />
        <ReauthGate mensaje="Este módulo cruza asistencia, evaluación y sueldo de todo el equipo." />
      </div>
    );
  }

  const puedeEvaluaciones = puede(matriz, sesion.usuario.rol, 'evaluaciones', 'ver', sesion.usuario.rolCod);
  const herramientas = HERRAMIENTAS.filter((h) => (h.gate === 'admin' ? esAdmin : puedeEvaluaciones));

  const periodo = leerPeriodo(searchParams);
  // Los suspendidos se piden SÓLO para admin/dueño, y no por prolijidad: la única razón para
  // verlos es entrar a su expediente a reactivarlos (pestaña Datos) o a terminar de pagarles lo
  // que se les debe (pestaña Liquidación y pago), y las dos pestañas son soloAdmin
  // (colaboradores-secciones.ts). Sin esto, suspender era una puerta de una sola dirección: se
  // llega al expediente sólo desde esta lista, y la lista los recortaba. Para el resto de los
  // roles la consulta queda exactamente igual que antes.
  const colaboradores = await listarColaboradores(esAdmin);
  const activos = colaboradores.filter((c) => c.activo).length;
  const estado = await estadoDelPeriodo(
    colaboradores.map((c) => c.id),
    periodo,
  );

  return (
    <div>
      {/* Alta encadenada (R2): mismo gate que las herramientas de admin — hasta acá no había
          ningún camino de UI para registrar a alguien nuevo (el modal viejo de /empleados quedó
          como código muerto detrás del redirect de R1). */}
      <PageHeader
        title="Personal"
        subtitle={`${activos} activos · elige a quién mirar y en qué período`}
        action={
          esAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/personal/usuarios" className={buttonVariants({ variant: 'outline' })}>
                Usuarios y códigos
              </Link>
              <Link href="/personal/nuevo" className={buttonVariants({ variant: 'primary' })}>
                <Plus className="h-4 w-4" strokeWidth={2} /> Nueva persona
              </Link>
            </div>
          ) : undefined
        }
      />

      {herramientas.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-rotulo font-semibold uppercase text-muted">
            Herramientas del período
          </p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {herramientas.map((h, i) => {
              const Icono = h.icono;
              return (
                <Link key={h.href} href={h.href} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                  <Card interactive className="h-full">
                    <CardContent className="flex flex-col items-center gap-2 p-3 text-center">
                      <span className="rounded-r-chico bg-navy/5 p-2 text-navy">
                        <Icono className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="text-apoyo font-medium text-navy">{h.label}</span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <ListaColaboradores
        colaboradores={colaboradores}
        estado={Object.fromEntries(estado)}
        periodo={periodo}
      />
    </div>
  );
}
