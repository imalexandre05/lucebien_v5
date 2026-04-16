// ═══════════════════════════════════════════════════════
// LUCEBIEN · public/js/data.js v5.4 — Constantes frontend
// Actividades actualizadas según PDF oficial marzo 2026
// ═══════════════════════════════════════════════════════

// Fecha local (YYYY-MM-DD) — NO usar toISOString() que devuelve UTC.
// En Perú (UTC-5), cualquier llamada después de las 7pm local daría el día siguiente en UTC.
function hoyLocal(){
  var d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

const SEDES = {
  ST: { label:'Stan 101-102', short:'Stan',    icon:'🏪', tipo:'tienda',  abrev:'ST' },
  LB: { label:'LuceBien',     short:'LuceBien',icon:'👔', tipo:'tienda',  abrev:'LB' },
  AL: { label:'Almacén',      short:'Almacén', icon:'🏭', tipo:'almacen', abrev:'AL' },
  TR: { label:'Trece',        short:'Trece',   icon:'🏬', tipo:'tienda',  abrev:'TR' },
};

// Fallback hardcoded (se sobreescribe por API si admin las editó)
const ACTIVIDADES = {
  standard:[
    {cod:'AS01',nombre:'Revisión, control y despeje en Cobros Pendientes',cat:'PO',peso:5},
    {cod:'AS02',nombre:'Revisión, control y despeje en Alquileres Por Entregar',cat:'PO',peso:5},
    {cod:'AS03',nombre:'Revisión, control y despeje en Ventas Por Entregar y Confecciones',cat:'PO',peso:5},
    {cod:'AS04',nombre:'Revisión, control y despeje en Devoluciones',cat:'PO',peso:5},
    {cod:'AT01',nombre:'Alistado de trajes pendientes',cat:'PO',peso:5},
    {cod:'AT02',nombre:'Control de Lista de Préstamos',cat:'PO',peso:5},
    {cod:'OL01',nombre:'Limpieza del piso (barrer y trapear)',cat:'IND',peso:5},
    {cod:'OL02',nombre:'Limpieza y desempolvado de ternos en soportes y maniquíes',cat:'IND',peso:3},
    {cod:'OL03',nombre:'Limpieza de muebles y mostradores',cat:'IND',peso:3},
    {cod:'OL04',nombre:'Limpieza de mamparas y espejos',cat:'IND',peso:3},
    {cod:'OL05',nombre:'Limpieza y orden de accesorios',cat:'IND',peso:1},
    {cod:'OL06',nombre:'Llenado de tanque/botella de agua',cat:'IND',peso:1},
    {cod:'OL07',nombre:'Limpieza de plancha y tanque de agua',cat:'IND',peso:1},
    {cod:'OL08',nombre:'Limpieza del área de trabajo al cierre',cat:'IND',peso:5},
    {cod:'OL09',nombre:'Barrer y baldear calle/vereda',cat:'IND',peso:5},
    {cod:'BS01',nombre:'Actualización de garantías',cat:'SO',peso:5},
    {cod:'BS02',nombre:'Actualización de documentos',cat:'SO',peso:3},
    {cod:'BS03',nombre:'Cierre de caja y envío de foto',cat:'SO',peso:3},
    {cod:'BT01',nombre:'Cambio de maniquíes',cat:'SO',peso:5},
    {cod:'BT02',nombre:'Orden de prendas en exhibición',cat:'SO',peso:5},
    {cod:'BT03',nombre:'Codificación y etiquetado de prendas',cat:'SO',peso:5},
    {cod:'BT04',nombre:'Verificación y cambiado de bolsas de ternos nuevos',cat:'SO',peso:5},
  ],
  AL:[
    {cod:'OL01',nombre:'Limpieza del piso (barrer y trapear)',cat:'IND',peso:5},
    {cod:'OL03',nombre:'Limpieza de muebles y mostradores',cat:'IND',peso:3},
    {cod:'OL07',nombre:'Limpieza de plancha y tanque de agua',cat:'IND',peso:1},
  ]
};

const CAT = {
  labels: {PO:'Primer Orden',IND:'Indispensable',SO:'2° Orden',EXT:'Extra'},
  cls:    {PO:'cat-po',IND:'cat-ind',SO:'cat-so',EXT:'cat-ext'},
  order:  {PO:1,SO:2,IND:3,EXT:4},
};

const COLORES_PRENDA = ['Negro','Azul noche','Azul Barcelona','Azul eléctrico','Azul acero','Azul presidente','Verde petróleo','Celeste','Celeste bb','Plomo','Plomo rata','Beige','Camello','Vino','Blanco','Gris','Otros'];
const TIPOS_PRENDA   = ['Terno completo','Saco','Pantalón','Camisa','Corbata','Chaleco','Blazer','Falda'];
const OBS_PRENDA     = ['Mancha visible','Rotura en costura','Botón faltante','Requiere planchado especial','Decoloración','Suciedad general','Ojal dañado','Cremallera rota','Mal codificada','Precio incorrecto en sistema','Otros'];
const MOTIVOS_REF    = ['Costura rota','Ojalar pantalón','Ojalar saco','Hacer pantalón a saco solo','Precio excesivo — cambiar en Tuxedo','Mal codificada — recodificar','Forro dañado','Botones a reemplazar','Ajuste de talla','Otros'];
const TIPOS_INCIDENCIA = ['Hurto o robo de prenda','Prenda entregada en mal estado al cliente','Accidente dentro del local','Conflicto grave con cliente','Faltante de caja significativo','Pérdida o extravío de documento','Falla en sistema de caja','Daño en infraestructura','Incumplimiento de normas de seguridad','Otro'];

const TALLAS_HTML = `
  <optgroup label="Niños"><option>0</option><option>2</option><option>4</option><option>6</option><option>8</option><option>10</option><option>12</option><option>14</option><option>16</option><option>18</option></optgroup>
  <optgroup label="Adultos"><option>26</option><option>XS</option><option>S</option><option>M</option><option>L</option><option>XL</option><option>2XL</option><option>4XL</option></optgroup>`;

const COMPETENCIAS = [
  {id:'C1',nombre:'Resolución de Problemas',rubrica:['Más de 3 sin resolver','3 sin resolver','2 sin resolver','1 sin resolver','Todos resueltos']},
  {id:'C2',nombre:'Trabajo en Equipo',rubrica:['Más de 3 conflictos','3 conflictos','2 conflictos','1 conflicto','Sin conflictos']},
  {id:'C3',nombre:'Buena Comunicación',rubrica:['Más de 3 malas coord.','3 malas coord.','2 malas coord.','1 mala coord.','Sin malas coord.']},
  {id:'C4',nombre:'Manejo de Clientes',rubrica:['Más de 3 conflictos','3 conflictos','2 conflictos','1 conflicto','Sin percances']},
  {id:'C5',nombre:'Cumplimiento de Metas',rubrica:['Faltó +S/300','Faltó S/200-300','Faltó S/100-200','Faltó S/1-100','Cumplió meta']},
  {id:'C6',nombre:'Relación con Clientes',rubrica:['< 7.0','7.0–7.5','7.5–8.0','8.0–8.5','8.5–10']},
  {id:'C7',nombre:'Habilidades Técnicas',rubrica:['Todas mal','3 a medias','1 correcta','2 correctas','Plancha+basta+examen>15']},
  {id:'C8',nombre:'Habilidad de Adaptación',rubrica:['No se adapta','Casi nada','Pocas intenciones','Tiene intención','Buena actitud']},
];
const VALORES_NOMBRES = ['Integridad','Respeto','Honestidad','Amabilidad','Buena relación con compañeros','Actitud para el trabajo'];
const VALORES_KEYS    = ['integridad','respeto','honestidad','amabilidad','relacion','actitud'];
const LIKERT_LABELS   = ['Nunca','Raramente','A veces','Frecuentemente','Siempre'];

const PESOS = {
  checklistOperaciones: 0.15,
  competencias:         0.25,
  valores:              0.25,
  conocimientos:        0.15,
  tardanzas:            0.10,
  incidencias:          0.10,
};

const STATE = {
  sede: null, user: null,
  fr01: { bloqueado:false, enviado:false, reportId:null, actividadesRealizadas:[], trabajadoresTurno:[], extras:[], incidencias:[] },
  lavList:[], refList:[],
  pendingActs:[], sessionReportes:[],
  pendingConfirmFn:null,
  listasCache:[], empleadosCache:[], incidenciasCache:[],
  alertasTimer: null,
  _currentActs: null,
  _extras_puntos: [],
  _extras_remuneradas: [],
};

function getActsBySede(sede) { return sede === 'AL' ? ACTIVIDADES.AL : ACTIVIDADES.standard; }
