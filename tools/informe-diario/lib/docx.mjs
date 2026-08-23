// Constructores de WordprocessingML.
//
// La plantilla (plantilla.docx) aporta estilos, fuentes, tema, encabezado con el
// logo y márgenes. Este módulo sólo genera el cuerpo del documento, respetando
// el formato que ya usa la plantilla: Arial 12, azul marino 002060, tablas con
// estilo "Tablaconcuadrcula" y viñetas del numId 2.

export const FUENTE = 'Arial';
export const NAVY = '002060';
export const DORADO = 'BF8F00';
export const SOMBRA_CABECERA = 'D5DCE4';
export const ANCHO_TABLA = 8384; // twips: coincide con la grilla de la plantilla

export function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function rPr({ negrita, cursiva, color, tam = 24 } = {}) {
  return (
    '<w:rPr>' +
    `<w:rFonts w:ascii="${FUENTE}" w:hAnsi="${FUENTE}" w:cs="${FUENTE}"/>` +
    (negrita ? '<w:b/><w:bCs/>' : '') +
    (cursiva ? '<w:i/><w:iCs/>' : '') +
    (color ? `<w:color w:val="${color}"/>` : '') +
    `<w:sz w:val="${tam}"/><w:szCs w:val="${tam}"/>` +
    '</w:rPr>'
  );
}

// Un run de texto. Los saltos de línea del texto se convierten en <w:br/>.
function run(texto, opciones = {}) {
  const partes = String(texto ?? '').split('\n');
  return partes
    .map((parte, i) => {
      const salto = i > 0 ? '<w:br/>' : '';
      return `<w:r>${rPr(opciones)}${salto}<w:t xml:space="preserve">${esc(parte)}</w:t></w:r>`;
    })
    .join('');
}

// `contenido` puede ser un string o una lista de tramos [{ texto, negrita, ... }],
// para permitir "Alcance: texto" con la etiqueta en negrita.
function runsDe(contenido, opcionesBase = {}) {
  if (Array.isArray(contenido)) {
    return contenido.map((t) => run(t.texto, { ...opcionesBase, ...t })).join('');
  }
  return run(contenido, opcionesBase);
}

export function parrafo(contenido, opciones = {}) {
  const { alineacion, espacioAntes = 0, espacioDespues = 120, sangria } = opciones;
  const pPr =
    '<w:pPr>' +
    (sangria ? `<w:ind w:left="${sangria}"/>` : '') +
    `<w:spacing w:before="${espacioAntes}" w:after="${espacioDespues}"/>` +
    (alineacion ? `<w:jc w:val="${alineacion}"/>` : '<w:jc w:val="both"/>') +
    '</w:pPr>';
  return `<w:p>${pPr}${runsDe(contenido, opciones)}</w:p>`;
}

export function titulo(texto) {
  return parrafo(texto, {
    negrita: true,
    color: NAVY,
    tam: 26,
    alineacion: 'left',
    espacioAntes: 280,
    espacioDespues: 140,
  });
}

export function subtitulo(texto) {
  return parrafo(texto, {
    negrita: true,
    color: NAVY,
    alineacion: 'left',
    espacioAntes: 180,
    espacioDespues: 80,
  });
}

export function vineta(contenido, opciones = {}) {
  const pPr =
    '<w:pPr>' +
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>' +
    '<w:spacing w:before="0" w:after="80"/>' +
    '<w:jc w:val="both"/>' +
    '</w:pPr>';
  return `<w:p>${pPr}${runsDe(contenido, opciones)}</w:p>`;
}

export function vinetas(lista, opciones = {}) {
  return (lista || []).map((item) => vineta(item, opciones)).join('');
}

// Estados de los pedidos del dueño. Reemplazan al resaltador de los documentos
// antiguos: la etiqueta va escrita, y el color sólo la acompaña — así el informe
// se sigue entendiendo impreso en blanco y negro.
export const ESTADOS = {
  listo: { etiqueta: 'Listo', relleno: 'E3F0E3' },
  curso: { etiqueta: 'En curso', relleno: 'E7ECF5' },
  problema: { etiqueta: 'Con problema', relleno: 'FDF3D6' },
  apoyo: { etiqueta: 'Necesito su apoyo', relleno: 'F8DEDE' },
  pendiente: { etiqueta: 'Falta hacerlo', relleno: 'FFFFFF' },
  revisar: { etiqueta: 'Sin evaluar', relleno: 'F2F2F2' },
};

export function celdaEstado(clave) {
  const estado = ESTADOS[clave] || ESTADOS.revisar;
  return { texto: estado.etiqueta, relleno: estado.relleno };
}

function celda(contenido, ancho, opciones = {}) {
  const { opcionesTexto = {} } = opciones;
  // Una celda puede venir como texto plano o como { texto, relleno }.
  let relleno = opciones.relleno;
  if (contenido && typeof contenido === 'object' && !Array.isArray(contenido)) {
    relleno = contenido.relleno || relleno;
    contenido = contenido.texto;
  }
  const tcPr =
    '<w:tcPr>' +
    `<w:tcW w:w="${ancho}" w:type="dxa"/>` +
    (relleno ? `<w:shd w:val="clear" w:color="auto" w:fill="${relleno}"/>` : '') +
    '<w:vAlign w:val="center"/>' +
    '</w:tcPr>';
  const cuerpo = parrafo(contenido, {
    alineacion: 'left',
    espacioDespues: 40,
    tam: 22,
    ...opcionesTexto,
  });
  return `<w:tc>${tcPr}${cuerpo}</w:tc>`;
}

/**
 * Tabla con fila de cabecera sombreada.
 * @param {string[]} cabeceras
 * @param {Array<Array<string>>} filas
 * @param {number[]} proporciones pesos relativos de cada columna
 */
export function tabla(cabeceras, filas, proporciones) {
  const pesos = proporciones || cabeceras.map(() => 1);
  const total = pesos.reduce((a, b) => a + b, 0);
  const anchos = pesos.map((p) => Math.round((p / total) * ANCHO_TABLA));

  const tblPr =
    '<w:tblPr>' +
    '<w:tblStyle w:val="Tablaconcuadrcula"/>' +
    `<w:tblW w:w="${ANCHO_TABLA}" w:type="dxa"/>` +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`)
      .join('') +
    '</w:tblBorders>' +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
    '</w:tblPr>';

  const grid = `<w:tblGrid>${anchos.map((a) => `<w:gridCol w:w="${a}"/>`).join('')}</w:tblGrid>`;

  const filaCabecera =
    '<w:tr><w:trPr><w:tblHeader/></w:trPr>' +
    cabeceras
      .map((c, i) =>
        celda(c, anchos[i], {
          relleno: SOMBRA_CABECERA,
          opcionesTexto: { negrita: true, color: NAVY, tam: 22 },
        })
      )
      .join('') +
    '</w:tr>';

  const cuerpo = (filas || [])
    .map(
      (fila) =>
        '<w:tr>' +
        fila.map((valor, i) => celda(valor, anchos[i])).join('') +
        '</w:tr>'
    )
    .join('');

  return `<w:tbl>${tblPr}${grid}${filaCabecera}${cuerpo}</w:tbl>` + parrafo('', { espacioDespues: 0 });
}

// Leyenda de estados: una fila con las cinco etiquetas y su color.
export function leyendaEstados() {
  const claves = Object.keys(ESTADOS);
  const pesos = claves.map(() => 1);
  const total = pesos.length;
  const anchos = pesos.map(() => Math.round(ANCHO_TABLA / total));

  const tblPr =
    '<w:tblPr>' +
    '<w:tblStyle w:val="Tablaconcuadrcula"/>' +
    `<w:tblW w:w="${ANCHO_TABLA}" w:type="dxa"/>` +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`)
      .join('') +
    '</w:tblBorders>' +
    '</w:tblPr>';
  const grid = `<w:tblGrid>${anchos.map((a) => `<w:gridCol w:w="${a}"/>`).join('')}</w:tblGrid>`;
  const fila =
    '<w:tr>' +
    claves
      .map((clave, i) =>
        celda(ESTADOS[clave].etiqueta, anchos[i], {
          relleno: ESTADOS[clave].relleno,
          opcionesTexto: { tam: 18, alineacion: 'center', negrita: true },
        })
      )
      .join('') +
    '</w:tr>';
  return `<w:tbl>${tblPr}${grid}${fila}</w:tbl>` + parrafo('', { espacioDespues: 0 });
}

// Recuadro de una sola celda, para el pie de "¿Conforme?".
export function recuadro(contenido, relleno = SOMBRA_CABECERA) {
  const tblPr =
    '<w:tblPr>' +
    '<w:tblStyle w:val="Tablaconcuadrcula"/>' +
    `<w:tblW w:w="${ANCHO_TABLA}" w:type="dxa"/>` +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right']
      .map((b) => `<w:${b} w:val="single" w:sz="8" w:space="0" w:color="${NAVY}"/>`)
      .join('') +
    '<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
    '<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
    '</w:tblBorders>' +
    '</w:tblPr>';
  const grid = `<w:tblGrid><w:gridCol w:w="${ANCHO_TABLA}"/></w:tblGrid>`;
  const fila =
    '<w:tr>' +
    celda(contenido, ANCHO_TABLA, { relleno, opcionesTexto: { tam: 22 } }) +
    '</w:tr>';
  return `<w:tbl>${tblPr}${grid}${fila}</w:tbl>` + parrafo('', { espacioDespues: 0 });
}

// Cabecera del informe: título centrado + línea de datos.
export function cabeceraInforme({ titulo: tituloTexto, subtitulo: sub, datos }) {
  const partes = [];
  partes.push(
    parrafo(tituloTexto, {
      alineacion: 'center',
      tam: 24,
      espacioDespues: 0,
    })
  );
  partes.push(
    parrafo(sub, {
      alineacion: 'center',
      negrita: true,
      color: NAVY,
      tam: 24,
      espacioDespues: 200,
    })
  );
  for (const [etiqueta, valor] of datos) {
    partes.push(
      parrafo(
        [
          { texto: `${etiqueta}: `, negrita: true, color: NAVY },
          { texto: valor },
        ],
        { alineacion: 'left', tam: 22, espacioDespues: 60 }
      )
    );
  }
  return partes.join('');
}
