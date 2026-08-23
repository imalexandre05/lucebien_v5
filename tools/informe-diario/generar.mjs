#!/usr/bin/env node
// Convierte un informe en JSON en un documento Word, usando plantilla.docx como
// contenedor: se conservan estilos, fuentes, tema, márgenes y el encabezado con
// el logo; sólo se reemplaza el cuerpo del documento.
//
//   node generar.mjs informe.json
//   node generar.mjs informe.json --salida "E:/Lucebien informes"

import PizZip from 'pizzip';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  cabeceraInforme,
  parrafo,
  titulo,
  subtitulo,
  tabla,
  vinetas,
  recuadro,
  leyendaEstados,
  celdaEstado,
  NAVY,
} from './lib/docx.mjs';
import { leerRequerimientos, movimientos, esperandoAlDueno, frasesResumen } from './lib/requerimientos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PLANTILLA = join(AQUI, 'plantilla.docx');
// Los borradores viven aparte; sólo el informe aprobado sube a la carpeta principal.
const SALIDA_POR_DEFECTO = process.env.BORRADORES_DIR || 'E:/Lucebien informes/borradores';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  const dia = DIAS[fecha.getUTCDay()];
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${d} de ${MESES[m - 1]} de ${a}`;
}

function fechaCorta(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a.slice(2)}`;
}

// Numerador de secciones: las secciones opcionales vacías no consumen número.
function numerador() {
  let n = 0;
  return () => ++n;
}

function seccionVinetas(n, encabezado, lista) {
  if (!lista || !lista.length) return '';
  return titulo(`${n()}. ${encabezado}`) + vinetas(lista);
}

// Estado de los requerimientos del dueño. Sale del registro docs/requerimientos-dueno.md,
// no del JSON del informe: así no hay dos listas que puedan contradecirse.
function seccionRequerimientos(n, informe) {
  // Sección opcional: sólo se arma si el informe la pide con `requerimientosDesde`.
  if (!informe.requerimientosDesde) return '';

  const { items, resumen, total } = leerRequerimientos();
  if (!total) return '';

  const movidos = movimientos(items, informe.requerimientosDesde);
  const bloqueados = esperandoAlDueno(items);

  // El informe trata sobre el trabajo de la sesión. Los requerimientos del dueño
  // sólo aparecen cuando alguno se movió o cuando alguno lo está esperando a él;
  // si no, la sección se omite entera para no repetir lo mismo cada día.
  if (!movidos.length && !bloqueados.length) return '';

  const partes = [titulo(`${n()}. Sus requerimientos`)];
  partes.push(parrafo(frasesResumen(resumen, total)));
  partes.push(
    parrafo(
      'Cada requerimiento suyo tiene un código fijo. Si quiere referirse a uno, basta con nombrarlo: ' +
        'por ejemplo, "el R-042 sigue mal". La lista completa con los 150 requerimientos y su estado se ' +
        'la envío cuando la pida.',
      { cursiva: true, tam: 22 }
    )
  );
  partes.push(leyendaEstados());

  if (movidos.length) {
    partes.push(subtitulo('Se movieron en esta entrega'));
    partes.push(
      tabla(
        ['Código', 'Requerimiento', 'Estado'],
        movidos.map((i) => [i.id, i.requerimiento, celdaEstado(i.estado)]),
        [1.5, 7, 2.5]
      )
    );
  }

  if (bloqueados.length) {
    partes.push(subtitulo('Frenados esperando algo de usted'));
    partes.push(
      tabla(
        ['Código', 'Requerimiento', 'Qué hace falta'],
        bloqueados.map((i) => [i.id, i.requerimiento, i.nota || 'Una decisión suya']),
        [1.5, 5.5, 4]
      )
    );
  }

  return partes.join('');
}

function cuerpoDiario(informe) {
  const n = numerador();
  const partes = [];

  partes.push(
    cabeceraInforme({
      titulo: `INFORME DE AVANCES ${String(informe.numero).padStart(3, '0')}`,
      subtitulo: 'SCI-LB (Plataforma Digital ERP LuceBien)',
      datos: [
        ['Alcance', informe.alcance],
        ['Estado', informe.estado],
        ['Fecha', fechaLarga(informe.fecha)],
      ],
    })
  );

  partes.push(titulo(`${n()}. Resumen ejecutivo`));
  for (const p of informe.resumen || []) partes.push(parrafo(p));
  if (informe.enUnaLinea) {
    partes.push(
      parrafo([
        { texto: 'En una línea: ', negrita: true, color: NAVY },
        { texto: informe.enUnaLinea },
      ])
    );
  }

  partes.push(titulo(`${n()}. Lo que se hizo hoy`));
  partes.push(
    tabla(
      ['Módulo o sección', 'Qué cambia para la operación', 'Estado'],
      (informe.hecho || []).map((f) => [f.modulo, f.cambio, f.estado]),
      [3, 6, 2.5]
    )
  );

  partes.push(titulo(`${n()}. Cómo revisarlo`));
  partes.push(
    parrafo(
      'Puede verificar cada punto entrando al sistema. Si algo no se comporta como dice esta tabla, es un error y conviene avisarlo.',
      { cursiva: true, tam: 22 }
    )
  );
  partes.push(
    tabla(
      ['Qué revisar', 'Dónde entrar', 'Qué debería ver'],
      (informe.revisar || []).map((f) => [f.que, f.donde, f.esperado]),
      [3, 3.5, 5]
    )
  );

  partes.push(seccionRequerimientos(n, informe));

  if (informe.decisiones && informe.decisiones.length) {
    partes.push(titulo(`${n()}. Puntos donde necesito su decisión`));
    partes.push(
      parrafo(
        'Son reglas del negocio que el sistema necesita fijar. Mientras no se confirmen, quedan con un valor de arranque marcado como pendiente.',
        { cursiva: true, tam: 22 }
      )
    );
    partes.push(vinetas(informe.decisiones));
  }

  if (informe.pendientes && informe.pendientes.length) {
    partes.push(titulo(`${n()}. Pendientes`));
    partes.push(
      tabla(
        ['Pendiente', 'De quién depende', 'Para cuándo'],
        informe.pendientes.map((f) => [f.pendiente, f.depende, f.cuando || '—']),
        [5.5, 3, 3]
      )
    );
  }

  partes.push(seccionVinetas(n, 'Riesgos o lo que no salió', informe.riesgos));
  partes.push(seccionVinetas(n, 'Anexo técnico', informe.anexo));

  partes.push(pieConforme(informe));
  return partes.join('');
}

function cuerpoSemanal(informe) {
  const n = numerador();
  const partes = [];

  partes.push(
    cabeceraInforme({
      titulo: `INFORME DE AVANCES ${String(informe.numero).padStart(2, '0')}`,
      subtitulo: 'SCI-LB (Plataforma Digital ERP LuceBien)',
      datos: [
        ['Alcance', informe.alcance],
        ['Estado', informe.estado],
        ['Fecha', `Del ${fechaCorta(informe.desde)} al ${fechaCorta(informe.hasta)}`],
      ],
    })
  );

  partes.push(titulo(`${n()}. Resumen ejecutivo`));
  for (const p of informe.resumen || []) partes.push(parrafo(p));
  if (informe.enUnaLinea) {
    partes.push(
      parrafo([
        { texto: 'En una línea: ', negrita: true, color: NAVY },
        { texto: informe.enUnaLinea },
      ])
    );
  }

  partes.push(titulo(`${n()}. Estado general`));
  partes.push(
    tabla(
      ['Área', 'Estado'],
      (informe.estadoGeneral || []).map((f) => [f.area, f.situacion]),
      [7, 4]
    )
  );

  partes.push(titulo(`${n()}. Módulos entregados`));
  for (const grupo of informe.modulos || []) {
    partes.push(subtitulo(grupo.grupo));
    partes.push(
      tabla(
        ['Sección', 'Qué hace y cómo probarla'],
        (grupo.filas || []).map((f) => [f.seccion, f.detalle]),
        [3.5, 7.5]
      )
    );
  }

  partes.push(seccionRequerimientos(n, informe));

  partes.push(seccionVinetas(n, 'Diseño y experiencia de uso', informe.diseno));
  partes.push(seccionVinetas(n, 'Datos y configuración', informe.datos));
  partes.push(seccionVinetas(n, 'Seguridad', informe.seguridad));
  partes.push(seccionVinetas(n, 'Despliegue (nube)', informe.despliegue));
  partes.push(seccionVinetas(n, 'Próximos pasos', informe.proximos));

  partes.push(titulo('Anexo técnico'));
  partes.push(vinetas(informe.anexo || []));

  partes.push(pieConforme(informe));
  return partes.join('');
}

function pieConforme(informe) {
  const etiqueta = informe.tipo === 'semanal' ? 'informe' : 'informe diario';
  return (
    parrafo('', { espacioAntes: 200, espacioDespues: 0 }) +
    recuadro(
      '¿Conforme con lo avanzado?\n' +
        `Responda este correo con una de estas tres palabras: CONFORME · CON OBSERVACIONES (detallando cuáles) · REUNIÓN. ` +
        `Cualquier observación sobre este ${etiqueta} se atiende antes de seguir con lo siguiente.`
    )
  );
}

function main() {
  const args = process.argv.slice(2);
  const rutaJson = args[0];
  if (!rutaJson) {
    console.error('Uso: node generar.mjs <informe.json> [--salida <carpeta>]');
    process.exit(1);
  }
  const iSalida = args.indexOf('--salida');
  const carpetaSalida = iSalida >= 0 ? args[iSalida + 1] : SALIDA_POR_DEFECTO;

  const informe = JSON.parse(readFileSync(rutaJson, 'utf8'));
  const cuerpo = informe.tipo === 'semanal' ? cuerpoSemanal(informe) : cuerpoDiario(informe);

  const zip = new PizZip(readFileSync(PLANTILLA));
  const original = zip.file('word/document.xml').asText();

  // Se conserva la cabecera XML, la apertura de <w:body> y el <w:sectPr> final,
  // que es donde viven el tamaño de página, los márgenes y el encabezado con logo.
  const inicio = original.slice(0, original.indexOf('<w:body>') + '<w:body>'.length);
  const sectPr = original.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
  if (!sectPr) throw new Error('La plantilla no tiene <w:sectPr>: no se puede conservar el formato de página.');

  zip.file('word/document.xml', `${inicio}${cuerpo}${sectPr[0]}</w:body></w:document>`);

  if (!existsSync(carpetaSalida)) mkdirSync(carpetaSalida, { recursive: true });
  const numero =
    informe.tipo === 'semanal'
      ? String(informe.numero).padStart(2, '0')
      : String(informe.numero).padStart(3, '0');
  const sufijo = informe.tipo === 'semanal' ? '(erp)' : '(diario)';
  const nombre = `INFORME DE AVANCES ${numero} ${sufijo}.docx`;
  const destino = join(carpetaSalida, nombre);

  writeFileSync(destino, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  avisarSiEsLargo(informe);
  process.stdout.write(destino);
}

// El informe se genera igual: esto no recorta nada, sólo avisa. Un informe largo
// no se lee, y uno que el dueño no lee no sirve para que opine. Los límites salen
// de los informes que sí funcionaron.
function avisarSiEsLargo(informe) {
  if (informe.tipo === 'semanal') return; // el semanal es un consolidado, se espera largo

  const limites = [
    ['resumen', (informe.resumen || []).length, 2, 'párrafos'],
    ['hecho', (informe.hecho || []).length, 6, 'filas'],
    ['revisar', (informe.revisar || []).length, 3, 'puntos'],
    ['decisiones', (informe.decisiones || []).length, 5, 'puntos'],
    ['pendientes', (informe.pendientes || []).length, 5, 'filas'],
    ['riesgos', (informe.riesgos || []).length, 3, 'puntos'],
  ];

  const excedidos = limites.filter(([, cantidad, tope]) => cantidad > tope);

  const palabrasResumen = (informe.resumen || [])
    .map((p) => p.split(/\s+/).length)
    .filter((n) => n > 120);

  if (!excedidos.length && !palabrasResumen.length) return;

  process.stderr.write('\nEl informe quedó más largo de lo que conviene:\n');
  for (const [campo, cantidad, tope, unidad] of excedidos) {
    process.stderr.write(`  ${campo}: ${cantidad} ${unidad} (conviene hasta ${tope})\n`);
  }
  for (const n of palabrasResumen) {
    process.stderr.write(`  un párrafo del resumen tiene ${n} palabras (conviene hasta 120)\n`);
  }
  process.stderr.write('Se generó igual. Recortar lo que no cambie una decisión del dueño.\n\n');
}

main();
