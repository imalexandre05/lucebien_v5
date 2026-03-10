// ═══════════════════════════════════════════════════════
// LUCEBIEN · public/js/data.js — Constantes frontend
// ═══════════════════════════════════════════════════════
const SEDES = {
  ST: { label:'Stan 101-102', short:'Stan',    icon:'🏪', tipo:'tienda',  abrev:'ST' },
  LB: { label:'LuceBien',     short:'LuceBien',icon:'👔', tipo:'tienda',  abrev:'LB' },
  AL: { label:'Almacén',      short:'Almacén', icon:'🏭', tipo:'almacen', abrev:'AL' },
  TR: { label:'Trece',        short:'Trece',   icon:'🏬', tipo:'tienda',  abrev:'TR' },
};

const ACTIVIDADES = {
  standard:[
    {cod:'AS01',nombre:'Revisión y control de prendas para entrega', cat:'PO',peso:5},
    {cod:'AS02',nombre:'Control de devoluciones vencidas',            cat:'PO',peso:5},
    {cod:'AS03',nombre:'Revisión de prendas a confeccionar',          cat:'PO',peso:5},
    {cod:'AT01',nombre:'Alistado de trajes',                          cat:'PO',peso:5},
    {cod:'AT02',nombre:'Control del cuaderno de préstamos',           cat:'PO',peso:5},
    {cod:'AT03',nombre:'Planchado de ternos',                         cat:'PO',peso:5},
    {cod:'AT04',nombre:'Planchado y doblado de camisas',              cat:'PO',peso:5},
    {cod:'AT05',nombre:'Refacción de trajes y corbatas',              cat:'PO',peso:5},
    {cod:'OL01',nombre:'Limpieza del piso',                           cat:'IND',peso:5},
    {cod:'OL02',nombre:'Limpieza de muebles y mostradores',           cat:'IND',peso:3},
    {cod:'OL03',nombre:'Limpieza de mamparas y espejos',              cat:'IND',peso:3},
    {cod:'OL04',nombre:'Limpieza y orden de accesorios',              cat:'IND',peso:1},
    {cod:'OL05',nombre:'Limpieza de plancha',                         cat:'IND',peso:1},
    {cod:'OL06',nombre:'Limpieza del área de trabajo al cierre',      cat:'IND',peso:5},
    {cod:'BS01',nombre:'Actualización de garantías',                  cat:'SO',peso:5},
    {cod:'BS02',nombre:'Actualización de documentos',                 cat:'SO',peso:3},
    {cod:'BS03',nombre:'Control de lista de lavandería',              cat:'SO',peso:1},
    {cod:'BS04',nombre:'Control de lista de refacciones',             cat:'SO',peso:1},
    {cod:'BS05',nombre:'Cierre de caja',                              cat:'SO',peso:3},
    {cod:'BT01',nombre:'Cambio de maniquíes',                         cat:'SO',peso:5},
    {cod:'BT02',nombre:'Orden de prendas en exhibición',              cat:'SO',peso:5},
    {cod:'BT03',nombre:'Codificación y etiquetado de prendas',        cat:'SO',peso:5},
  ],
  AL:[
    {cod:'AM01',nombre:'Recepción y registro de prendas recibidas',  cat:'ALM',peso:5},
    {cod:'AM02',nombre:'Clasificación de prendas por estado',         cat:'ALM',peso:5},
    {cod:'AM03',nombre:'Proceso de lavado y limpieza de prendas',     cat:'ALM',peso:8},
    {cod:'AM04',nombre:'Refacción y reparación de prendas',           cat:'ALM',peso:8},
    {cod:'AM05',nombre:'Control de calidad post-proceso',             cat:'ALM',peso:5},
    {cod:'AM06',nombre:'Cambio de precios en sistema Tuxedo',         cat:'ALM',peso:5},
    {cod:'AM07',nombre:'Preparación y despacho de ternos a tiendas',  cat:'ALM',peso:5},
    {cod:'AM08',nombre:'Registro de envíos completados',              cat:'ALM',peso:3},
    {cod:'AM09',nombre:'Orden y limpieza del almacén',                cat:'IND',peso:5},
    {cod:'AM10',nombre:'Inventario de prendas en proceso',            cat:'ALM',peso:5},
  ]
};

const CAT = {
  labels: {PO:'Primer Orden',IND:'Indispensable',SO:'2° Orden',ALM:'Almacén',EXT:'Extra'},
  cls:    {PO:'cat-po',IND:'cat-ind',SO:'cat-so',ALM:'cat-alm',EXT:'cat-ext'},
};

const COLORES_PRENDA = ['Negro','Azul noche','Azul Barcelona','Azul eléctrico','Azul acero','Azul presidente','Verde petróleo','Celeste','Celeste bb','Plomo','Plomo rata','Beige','Camello','Vino','Blanco','Gris','Otros'];
const TIPOS_PRENDA   = ['Terno completo','Saco','Pantalón','Camisa','Corbata','Chaleco','Blazer','Falda'];
const OBS_PRENDA     = ['Mancha visible','Rotura en costura','Botón faltante','Requiere planchado especial','Decoloración','Suciedad general','Ojal dañado','Cremallera rota','Mal codificada','Precio incorrecto en sistema','Otros'];
const MOTIVOS_REF    = ['Costura rota','Ojalar pantalón','Ojalar saco','Hacer pantalón a saco solo','Precio excesivo — cambiar en Tuxedo','Mal codificada — recodificar','Forro dañado','Botones a reemplazar','Ajuste de talla','Otros'];
const TIPOS_INCIDENCIA = ['Hurto o robo de prenda','Prenda entregada en mal estado al cliente','Accidente dentro del local','Conflicto grave con cliente','Faltante de caja significativo','Pérdida o extravío de documento','Falla en sistema de caja','Daño en infraestructura','Incumplimiento de normas de seguridad','Otro'];

const TALLAS_HTML = `
  <optgroup label="Niños"><option>0</option><option>2</option><option>4</option><option>6</option><option>8</option><option>10</option><option>12</option><option>14</option><option>16</option><option>18</option></optgroup>
  <optgroup label="Adultos"><option>2XS</option><option>XS</option><option>S</option><option>M</option><option>L</option><option>XL</option><option>2XL</option><option>4XL</option></optgroup>`;

// Competencias (rúbrica para evaluación mensual)
const COMPETENCIAS = [
  {id:'C1',nombre:'Resolución de Problemas',    rubrica:['Más de 3 problemas sin resolver','3 problemas sin resolver','2 problemas sin resolver','1 problema sin resolver','Todos los problemas resueltos correctamente']},
  {id:'C2',nombre:'Trabajo en Equipo',           rubrica:['Más de 3 conflictos con colegas','3 conflictos leves','2 conflictos leves','1 conflicto leve','Sin conflictos — apoya y coordina']},
  {id:'C3',nombre:'Buena Comunicación',          rubrica:['Más de 3 malas coordinaciones','3 malas coordinaciones','2 malas coordinaciones','1 mala coordinación','Sin malas coordinaciones']},
  {id:'C4',nombre:'Manejo de Clientes',          rubrica:['Más de 3 conflictos con clientes','3 conflictos','2 conflictos','1 conflicto','Sin percances con ningún cliente']},
  {id:'C5',nombre:'Cumplimiento de Metas',       rubrica:['Faltó más de S/300','Faltó S/200–300','Faltó S/100–200','Faltó S/1–100','Cumplió su meta de ventas']},
  {id:'C6',nombre:'Relación con Clientes',       rubrica:['< 7.0 puntaje','7.0–7.5','7.5–8.0','8.0–8.5','8.5–10']},
  {id:'C7',nombre:'Habilidades Técnicas',        rubrica:['Las hace todas muy mal','Las 3 a medias','Solo 1 correctamente','2 correctamente','Plancha, basta y examen > 15']},
  {id:'C8',nombre:'Habilidad de Adaptación',     rubrica:['No se adapta — quejas constantes','Casi ninguna intención','Pocas intenciones','Tiene intención','Buena actitud ante los cambios']},
];
const VALORES_NOMBRES = ['Integridad','Respeto','Honestidad','Amabilidad','Buena relación con compañeros','Actitud para el trabajo'];
const VALORES_KEYS    = ['integridad','respeto','honestidad','amabilidad','relacion','actitud'];
const LIKERT_LABELS   = ['Nunca','Raramente','A veces','Frecuentemente','Siempre']; // 1–5

// Pesos para nota final /20
const PESOS = {
  checklistOperaciones: 0.15,  // puntaje promedio de reportes evaluados
  competencias:         0.25,  // evaluación jefe
  valores:              0.25,  // evaluación 360
  conocimientos:        0.15,  // exámenes (se pone manual)
  tardanzas:            0.10,  // descuento nota tardanzas
  incidencias:          0.10,  // descuento nota incidencias
};

// STATE global
const STATE = {
  sede: null, user: null,
  fr01: { bloqueado:false, enviado:false, reportId:null, actividadesRealizadas:[], trabajadoresTurno:[], extras:[], incidencias:[] },
  lavList:[], refList:[],
  pendingActs:[], sessionReportes:[],
  pendingConfirmFn:null,
  listasCache:[], empleadosCache:[], incidenciasCache:[],
  alertasTimer: null,
};

function getActsBySede(sede) { return sede === 'AL' ? ACTIVIDADES.AL : ACTIVIDADES.standard; }
