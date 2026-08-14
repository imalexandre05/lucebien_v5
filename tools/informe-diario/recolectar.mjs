#!/usr/bin/env node
// Recolecta el trabajo realizado desde el último informe y lo entrega como JSON
// compacto. Todo el trabajo pesado (leer git, agrupar, clasificar) ocurre acá,
// para que el agente sólo tenga que redactar los textos del informe.
//
//   node recolectar.mjs                 → trabajo desde el último informe diario
//   node recolectar.mjs --tipo semanal  → trabajo desde el último informe semanal
//   node recolectar.mjs --desde <sha>   → rango explícito

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const ARCHIVO_ESTADO = join(AQUI, 'estado.json');
const SEPARADOR = ''; // separador de campos, no aparece en mensajes de commit

// Traducción de rutas del repositorio a nombres que entiende el dueño.
const MODULOS = [
  [/^packages\/db\/migrations\//, 'Base de datos (migraciones)'],
  [/^packages\/core\//, 'Lógica de negocio (núcleo)'],
  [/^packages\/adapter-lucebien\//, 'Configuración LuceBien'],
  [/^apps\/erp-web\/lib\//, 'Acceso a datos'],
  [/^apps\/erp-web\/app\/([^/]+)/, (m) => `Pantalla: ${m[1]}`],
  [/^apps\/erp-web\/components\//, 'Componentes de interfaz'],
  [/^apps\/erp-web\//, 'Aplicación web (ERP)'],
  [/^docs\//, 'Documentación'],
  [/^tools\//, 'Herramientas internas'],
  [/^(server\.js|routes\/|public\/js\/)/, 'Sistema viejo (Express)'],
];

function git(...args) {
  // stderr descartado: en Windows git avisa de conversiones de fin de línea en
  // cada archivo, y eso ensucia la salida sin aportar nada al informe.
  return execFileSync('git', args, {
    cwd: RAIZ,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function leerEstado() {
  if (!existsSync(ARCHIVO_ESTADO)) {
    return { ultimoNumeroDiario: 0, ultimoNumeroSemanal: 4 };
  }
  return JSON.parse(readFileSync(ARCHIVO_ESTADO, 'utf8'));
}

function shaValido(sha) {
  if (!sha) return false;
  try {
    git('cat-file', '-e', `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

function nombreModulo(ruta) {
  for (const [patron, nombre] of MODULOS) {
    const m = ruta.match(patron);
    if (m) return typeof nombre === 'function' ? nombre(m) : nombre;
  }
  return 'Otros';
}

// Trabajo de la sesión que todavía no entró a un commit: modificado, en el
// índice o sin seguimiento. Sin esto, una sesión que trabajó sin commitear
// produciría un informe vacío.
function trabajoSinCommitear() {
  // Sin trim(): el formato porcelain empieza con dos columnas de estado, y la
  // primera puede ser un espacio — recortarlo le comería una letra a la ruta.
  // -uall lista los archivos sueltos en vez de colapsar carpetas nuevas.
  const estado = git('status', '--porcelain', '-uall').replace(/\n+$/, '');
  if (!estado) return null;

  const archivos = estado
    .split('\n')
    .map((linea) => linea.slice(3).trim().replace(/^"|"$/g, '').replace(/\\/g, '/'))
    .filter(Boolean);

  if (!archivos.length) return null;

  let agregadas = 0;
  let quitadas = 0;
  const numstat = git('diff', '--numstat', 'HEAD').trim();
  for (const linea of numstat ? numstat.split('\n') : []) {
    const [mas, menos] = linea.split('\t');
    agregadas += Number(mas) || 0;
    quitadas += Number(menos) || 0;
  }

  const porModulo = new Map();
  for (const ruta of archivos) {
    const modulo = nombreModulo(ruta);
    porModulo.set(modulo, (porModulo.get(modulo) || 0) + 1);
  }

  return {
    archivos: archivos.length,
    lineasAgregadas: agregadas,
    lineasQuitadas: quitadas,
    modulos: [...porModulo.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, cantidad]) => ({ nombre, archivos: cantidad })),
    lista: archivos.slice(0, 40),
  };
}

function parsearArgumentos() {
  const args = process.argv.slice(2);
  const opciones = { tipo: 'diario', desde: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tipo') opciones.tipo = args[++i];
    else if (args[i] === '--desde') opciones.desde = args[++i];
  }
  return opciones;
}

function main() {
  const { tipo, desde } = parsearArgumentos();
  const estado = leerEstado();
  const semanal = tipo === 'semanal';

  const shaPrevio = desde || (semanal ? estado.ultimoShaSemanal : estado.ultimoSha);
  let rango;
  let origen;

  if (shaValido(shaPrevio)) {
    rango = [`${shaPrevio}..HEAD`];
    origen = `desde el informe anterior (${shaPrevio.slice(0, 7)})`;
  } else {
    const desdeCuando = semanal ? '7 days ago' : 'midnight';
    rango = [`--since=${desdeCuando}`];
    origen = semanal ? 'últimos 7 días' : 'desde las 00:00 de hoy';
  }

  const crudo = git(
    'log',
    ...rango,
    '--no-merges',
    `--pretty=format:%H${SEPARADOR}%ad${SEPARADOR}%s`,
    '--date=format:%Y-%m-%d %H:%M'
  ).trim();

  const commits = crudo
    ? crudo.split('\n').map((linea) => {
        const [sha, fecha, asunto] = linea.split(SEPARADOR);
        const m = asunto.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/);
        return {
          sha: sha.slice(0, 7),
          fecha,
          tipo: m ? m[1] : 'otro',
          scope: m && m[2] ? m[2] : null,
          descripcion: m ? m[3] : asunto,
        };
      })
    : [];

  const resultado = {
    tipo,
    origen,
    generadoDesde: shaValido(shaPrevio) ? shaPrevio : null,
    headActual: git('rev-parse', 'HEAD').trim(),
    numeroSugerido: (semanal ? estado.ultimoNumeroSemanal : estado.ultimoNumeroDiario) + 1,
    commits,
    totales: { commits: commits.length, archivos: 0, lineasAgregadas: 0, lineasQuitadas: 0 },
    modulos: [],
    migraciones: [],
    sinCommitear: trabajoSinCommitear(),
    sinTrabajo: false,
  };
  resultado.sinTrabajo = commits.length === 0 && !resultado.sinCommitear;
  if (resultado.sinCommitear) {
    resultado.aviso =
      'Hay trabajo sin commitear. Conviene commitearlo antes de generar el informe, ' +
      'para que quede registrado con la misma descripción que lee el dueño.';
  }

  if (commits.length) {
    const numstat = git('diff', '--numstat', ...(shaValido(shaPrevio) ? [`${shaPrevio}..HEAD`] : [`HEAD~${commits.length}..HEAD`])).trim();
    const porModulo = new Map();

    for (const linea of numstat ? numstat.split('\n') : []) {
      const [mas, menos, ruta] = linea.split('\t');
      if (!ruta) continue;
      const rutaNormal = ruta.replace(/\\/g, '/');
      resultado.totales.archivos++;
      resultado.totales.lineasAgregadas += Number(mas) || 0;
      resultado.totales.lineasQuitadas += Number(menos) || 0;

      const modulo = nombreModulo(rutaNormal);
      porModulo.set(modulo, (porModulo.get(modulo) || 0) + 1);

      const migracion = rutaNormal.match(/packages\/db\/migrations\/(\d+)[_-]?(.*)\.sql$/);
      if (migracion) {
        resultado.migraciones.push(`${migracion[1]} ${migracion[2].replace(/[_-]/g, ' ')}`.trim());
      }
    }

    resultado.modulos = [...porModulo.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, archivos]) => ({ nombre, archivos }));
    resultado.migraciones = [...new Set(resultado.migraciones)].sort();
  }

  process.stdout.write(JSON.stringify(resultado, null, 2));
}

main();
