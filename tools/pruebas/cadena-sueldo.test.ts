/**
 * La cadena del sueldo, de punta a punta, contra la base de verdad.
 *
 * POR QUÉ EXISTE. El motor tiene 393 pruebas unitarias y la base tiene pruebas de migración, pero
 * entre las dos hay un hueco: nadie comprueba que la entrada que arma `sueldo_entrada()` en
 * Postgres sea la que `liquidarPeriodo()` espera en TypeScript. Ese hueco es justo donde vive el
 * dinero. La base de producción tiene 0 liquidaciones y 0 pagos: el recorrido completo nunca
 * corrió con datos reales. Esta prueba lo corre.
 *
 * NO DEJA RASTRO. Monta una persona ficticia con su contrato, su horario y su asistencia en un
 * periodo del año 2099, calcula, comprueba, y borra todo al terminar — incluso si una
 * comprobación falla. No toca ni una fila de nadie real.
 *
 * Cómo se corre:
 *   bash tools/probar-cadena-sueldo.sh
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { liquidarPeriodo, type EntradaLiquidacion } from '../../packages/core/src/index';

// ── Conexión ────────────────────────────────────────────────────────────────────────────────

function leerEnv(): { url: string; llave: string } {
  let texto = '';
  try {
    texto = readFileSync('apps/erp-web/.env.local', 'utf8');
  } catch {
    texto = '';
  }
  const buscar = (clave: string) =>
    (texto.split('\n').find((l) => l.startsWith(clave + '=')) ?? '').split('=').slice(1).join('=').trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || buscar('NEXT_PUBLIC_SUPABASE_URL');
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY || buscar('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !llave) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  return { url, llave };
}

const { url: URL_BASE, llave: LLAVE } = leerEnv();

const CABECERAS = {
  apikey: LLAVE,
  Authorization: 'Bearer ' + LLAVE,
  'Content-Type': 'application/json',
};

async function insertar(tabla: string, filas: unknown[]): Promise<void> {
  const r = await fetch(URL_BASE + '/rest/v1/' + tabla, {
    method: 'POST',
    headers: CABECERAS,
    body: JSON.stringify(filas),
  });
  if (!r.ok) throw new Error('insertar ' + tabla + ': ' + r.status + ' ' + (await r.text()));
}

async function borrar(tabla: string, filtro: string): Promise<void> {
  await fetch(URL_BASE + '/rest/v1/' + tabla + '?' + filtro, { method: 'DELETE', headers: CABECERAS });
}

/**
 * Llama una RPC COMO LA LLAMA LA APLICACIÓN: con el token de una persona con sesión, no con la
 * llave de servicio. No es un detalle de estilo — `sueldo_entrada` es `security invoker` y se
 * apoya en las funciones del esquema `private`, al que la llave de servicio no tiene acceso. Si
 * esta prueba usara esa llave, probaría un camino que ninguna persona recorre.
 */
async function rpc<T>(nombre: string, argumentos: Record<string, unknown>): Promise<T> {
  const r = await fetch(URL_BASE + '/rest/v1/rpc/' + nombre, {
    method: 'POST',
    headers: { ...CABECERAS, Authorization: 'Bearer ' + tokenAdmin },
    body: JSON.stringify(argumentos),
  });
  const cuerpo = await r.text();
  if (!r.ok) throw new Error('rpc ' + nombre + ': ' + r.status + ' ' + cuerpo);
  return JSON.parse(cuerpo) as T;
}

// ── El escenario ────────────────────────────────────────────────────────────────────────────

// Una semana entera del año 2099: siete días contratados, ninguno solapado con nada real.
const DESDE = '2099-03-02'; // lunes
const HASTA = '2099-03-08'; // domingo
const DIAS = ['2099-03-02', '2099-03-03', '2099-03-04', '2099-03-05', '2099-03-06', '2099-03-07', '2099-03-08'];

// Los dos turnos reales de LuceBien: 09:00–13:00 y 13:00–20:00. Once horas por día, 77 en la semana.
const HORAS_POR_DIA = 11;
const HORAS_SEMANA = HORAS_POR_DIA * DIAS.length;
// Exactamente S/ 10 la hora, para que las cuentas se puedan leer sin calculadora.
const SUELDO_PACTADO = 770;

const PERSONA = '00000000-0000-4000-8000-0000000009de';
const ADMIN_ID = '1ad4bfa5-c4f2-4635-b93a-71643bb6d29e';
const DIA_CON_TARDANZA = '2099-03-05';

let acuerdoId = '';
let tokenAdmin = '';

/**
 * Entra como el administrador de prueba y devuelve su token.
 *
 * Las credenciales llegan por variable de entorno: son de una cuenta que existe de verdad en la
 * base y no tienen por qué estar escritas en el repositorio.
 */
async function entrarComoAdmin(): Promise<string> {
  const usuario = process.env.E2E_ADMIN_COD || '9901';
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      'Falta E2E_ADMIN_PASSWORD. Esta prueba llama a la RPC con la sesión de una persona, ' +
        'igual que la aplicación, y necesita la contraseña de la cuenta de prueba.',
    );
  }
  const r = await fetch(URL_BASE + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: LLAVE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: usuario + '@lucebien.local', password }),
  });
  if (!r.ok) throw new Error('no pude entrar como administrador: ' + r.status + ' ' + (await r.text()));
  return ((await r.json()) as { access_token: string }).access_token;
}
let entrada: EntradaLiquidacion & { acuerdoId: string; empleadoId: string };

async function limpiar() {
  if (acuerdoId) {
    await borrar('sueldo_liquidaciones', 'acuerdo_id=eq.' + acuerdoId);
    await borrar('sueldo_acuerdo_turnos', 'acuerdo_id=eq.' + acuerdoId);
  }
  await borrar('sueldo_movimientos', 'empleado_id=eq.' + PERSONA);
  await borrar('sueldo_ventas', 'empleado_id=eq.' + PERSONA);
  await borrar('asistencias', 'empleado_id=eq.' + PERSONA);
  await borrar('sueldo_acuerdos', 'empleado_id=eq.' + PERSONA);
  await borrar('empleados', 'id=eq.' + PERSONA);
}

beforeAll(async () => {
  tokenAdmin = await entrarComoAdmin();

  // Por si una corrida anterior se cortó a la mitad y dejó el escenario montado.
  await limpiar();

  await insertar('empleados', [
    {
      id: PERSONA,
      cod: '9999',
      nombre: 'Persona de prueba del motor',
      iniciales: 'PM',
      rol: 'ventas_junior',
      sede_cod: 'AL',
      activo: true,
      estado: 'activo',
      fecha_ingreso: DESDE,
    },
  ]);

  const creado = await fetch(URL_BASE + '/rest/v1/sueldo_acuerdos?select=id', {
    method: 'POST',
    headers: { ...CABECERAS, Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        empleado_id: PERSONA,
        fecha_inicio: DESDE,
        fecha_fin: HASTA,
        modalidad: 'semanal',
        sueldo_pactado: SUELDO_PACTADO,
        estado: 'vigente',
        creado_por: ADMIN_ID,
      },
    ]),
  }).then(async (r) => {
    if (!r.ok) throw new Error('acuerdo: ' + r.status + ' ' + (await r.text()));
    return (await r.json()) as { id: string }[];
  });
  acuerdoId = creado[0].id;

  // Horario: los siete días de la semana, los dos turnos cada uno.
  await insertar(
    'sueldo_acuerdo_turnos',
    // dia_semana va de 1 (lunes) a 7 (domingo); el periodo arranca un lunes, así que el índice
    // del arreglo más uno da el día que corresponde.
    DIAS.flatMap((_, i) => [
      { acuerdo_id: acuerdoId, dia_semana: i + 1, hora_inicio: '09:00', hora_fin: '13:00' },
      { acuerdo_id: acuerdoId, dia_semana: i + 1, hora_inicio: '13:00', hora_fin: '20:00' },
    ]),
  );

  // Asistencia: seis días puntuales y uno con veinte minutos de tardanza.
  await insertar(
    'asistencias',
    DIAS.map((fecha) => ({
      empleado_id: PERSONA,
      fecha,
      condicion: 'trabajado',
      hora_entrada: fecha === DIA_CON_TARDANZA ? '09:20' : '09:00',
      hora_salida: '20:00',
      fuente: 'manual',
    })),
  );

  // Migración 0093 (liquidación por tramos): sueldo_entrada ahora recibe el rango a liquidar en
  // vez de derivarlo siempre del acuerdo completo. Acá el acuerdo ES de una sola semana, así que
  // el tramo natural a pedir es exactamente DESDE..HASTA — igual que el comportamiento de antes.
  entrada = await rpc('sueldo_entrada', { p_acuerdo: acuerdoId, p_desde: DESDE, p_hasta: HASTA });
}, 120_000);

afterAll(async () => {
  await limpiar();
});

describe('la cadena del sueldo, de la base al motor', () => {
  test('la base entrega la entrada que el motor espera', () => {
    expect(entrada.fechaInicio).toBe(DESDE);
    expect(entrada.fechaFin).toBe(HASTA);
    expect(Number(entrada.sueldoPactado)).toBe(SUELDO_PACTADO);
    expect(entrada.horario.length, 'catorce turnos: dos por día').toBe(14);
    expect(entrada.asistencia.length, 'siete días declarados').toBe(7);
  });

  test('el motor calcula el periodo sin cortar', () => {
    const liq = liquidarPeriodo(entrada);

    expect(liq.base.horasContratadas).toBe(HORAS_SEMANA);
    expect(liq.base.diasContratados).toBe(7);
    expect(liq.base.valorPorHora).toBeCloseTo(SUELDO_PACTADO / HORAS_SEMANA, 6);
    expect(liq.asistencia.diasTrabajados).toBe(7);
    expect(liq.asistencia.faltas).toBe(0);
  });

  test('la tardanza del jueves llega hasta el motor y todavía no cuesta plata', () => {
    const liq = liquidarPeriodo(entrada);

    // Veinte minutos con diez de tolerancia: una tardanza contada.
    expect(liq.asistencia.tardanzas).toBe(1);

    // Pero las tres primeras del periodo no penalizan (sueldo_tardanzas_libres = 3), así que
    // todavía no descuenta nada. "Injustificadas" en el motor significa "penalizables": es el
    // resto después de restar las libres y las justificadas.
    expect(liq.asistencia.tardanzasInjustificadas).toBe(0);

    // El desglose puede nombrar la tardanza igual (es información que el colaborador merece ver),
    // pero el monto tiene que ser cero: lo que se comprueba acá es la plata, no el texto.
    const linea = liq.lineas.find((l) => l.concepto.toLowerCase().includes('tardanza'));
    expect(linea ? linea.monto : 0).toBe(0);
  });

  test('la cuarta tardanza sí descuenta, y descuenta lo que dice la configuración', () => {
    // Mismo periodo, misma persona: se le suman tres tardanzas más a la entrada que trajo la base.
    // Es la frontera que decide si a alguien se le descuenta plata o no, y conviene probarla con
    // la forma exacta que tiene el dato en producción, no con una inventada.
    // El día puede venir partido en tramos (así lo escribe el huellero desde la 0079) y, cuando
    // vienen, los tramos mandan sobre el par de horas: hay que correr también el primero, o la
    // tardanza no existiría para el motor.
    const tarde = <T extends (typeof entrada.asistencia)[number]>(a: T): T => ({
      ...a,
      horaIngreso: '09:20',
      tramos: a.tramos?.length ? [{ ...a.tramos[0], ingreso: '09:20' }, ...a.tramos.slice(1)] : a.tramos,
    });
    const conCuatro = {
      ...entrada,
      asistencia: entrada.asistencia.map((a, i) => (i < 4 ? tarde(a) : a)),
    };
    const liq = liquidarPeriodo(conCuatro);

    expect(liq.asistencia.tardanzas).toBe(4);
    expect(liq.asistencia.tardanzasInjustificadas).toBe(1);

    const linea = liq.lineas.find((l) => l.concepto.toLowerCase().includes('tardanza'));
    expect(linea, 'debería haber una línea de tardanzas en el desglose').toBeTruthy();
    // Una tardanza penalizable × S/5 (sueldo_penalidad_tardanza), como descuento.
    expect(Math.abs(linea!.monto)).toBeCloseTo(5, 2);
  });

  test('el total es exactamente la suma de sus líneas', () => {
    const liq = liquidarPeriodo(entrada);
    const suma = liq.lineas.filter((l) => l.grupo !== 'final').reduce((n, l) => n + l.monto, 0);
    expect(
      Math.abs(suma - liq.total),
      'las líneas suman ' + suma.toFixed(2) + ' y el total dice ' + liq.total.toFixed(2),
    ).toBeLessThan(0.005);
  });

  test('ninguna cifra sale NaN ni infinita', () => {
    const liq = liquidarPeriodo(entrada);
    for (const linea of liq.lineas) {
      expect(Number.isFinite(linea.monto), 'la línea "' + linea.concepto + '" no es un número').toBe(true);
    }
    expect(Number.isFinite(liq.total)).toBe(true);
    expect(Number.isFinite(liq.base.valorPorHora)).toBe(true);
  });
});
