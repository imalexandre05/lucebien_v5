// ═══════════════════════════════════════════════════════════════════════════════════════════
// Lectura del terminal Hikvision por ISAPI.
//
// Portado de tools/diagnostico-huellero/Probar-Huellero.ps1, que ya funciona contra el equipo
// real (DS-K1T321MFWX, firmware V3.9.1). Cada rareza que se resolvió allá está resuelta acá:
// autenticación digest, certificado autofirmado, respuestas en XML o en JSON, paginación de a
// 30 y troceo por mes.
//
// Sin dependencias externas: node:https y node:crypto alcanzan. Una librería de digest auth
// menos es una librería menos que actualizar en una PC de almacén a la que nadie entra.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

const md5 = (texto) => crypto.createHash('md5').update(texto, 'utf8').digest('hex');

// ── Fechas ─────────────────────────────────────────────────────────────────────────────────
// El equipo quiere hora Perú con offset explícito. Perú no tiene horario de verano, así que
// UTC−5 es fijo todo el año y alcanza con correr el instante cinco horas y leerlo en UTC.
// Nunca se manda una fecha sin offset: el equipo la interpretaría en su propia zona.
const MS_HORA = 3600 * 1000;
const OFFSET_PERU_MS = -5 * MS_HORA;

export function aTextoPeru(fecha) {
  const p = new Date(fecha.getTime() + OFFSET_PERU_MS);
  const dd = (n, ancho = 2) => String(n).padStart(ancho, '0');
  return (
    `${p.getUTCFullYear()}-${dd(p.getUTCMonth() + 1)}-${dd(p.getUTCDate())}` +
    `T${dd(p.getUTCHours())}:${dd(p.getUTCMinutes())}:${dd(p.getUTCSeconds())}-05:00`
  );
}

// Suma meses sobre el calendario Perú, no sobre el instante UTC: así los tramos caen en el
// primero de cada mes en hora local y no a las 19:00 del día anterior.
function sumarMeses(fecha, meses) {
  const p = new Date(fecha.getTime() + OFFSET_PERU_MS);
  p.setUTCMonth(p.getUTCMonth() + meses);
  return new Date(p.getTime() - OFFSET_PERU_MS);
}

// ── Digest ─────────────────────────────────────────────────────────────────────────────────
function interpretarDesafio(cabecera) {
  const cuerpo = cabecera.replace(/^\s*Digest\s+/i, '');
  const desafio = {};
  // Los valores pueden venir entre comillas o sin ellas según el firmware.
  const rx = /(\w+)\s*=\s*(?:"([^"]*)"|([^,\s]+))/g;
  let m;
  while ((m = rx.exec(cuerpo)) !== null) desafio[m[1].toLowerCase()] = m[2] ?? m[3];
  return desafio;
}

function armarAutorizacion({ desafio, usuario, clave, metodo, uri, nc }) {
  const cnonce = crypto.randomBytes(8).toString('hex');
  const ncTexto = String(nc).padStart(8, '0');
  const qop = (desafio.qop || '').split(',').map((x) => x.trim()).includes('auth') ? 'auth' : '';

  let ha1 = md5(`${usuario}:${desafio.realm}:${clave}`);
  if ((desafio.algorithm || '').toLowerCase() === 'md5-sess') {
    ha1 = md5(`${ha1}:${desafio.nonce}:${cnonce}`);
  }
  const ha2 = md5(`${metodo}:${uri}`);

  const respuesta = qop
    ? md5(`${ha1}:${desafio.nonce}:${ncTexto}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${desafio.nonce}:${ha2}`);

  const partes = [
    `username="${usuario}"`,
    `realm="${desafio.realm}"`,
    `nonce="${desafio.nonce}"`,
    `uri="${uri}"`,
    `response="${respuesta}"`,
  ];
  if (desafio.opaque) partes.push(`opaque="${desafio.opaque}"`);
  if (desafio.algorithm) partes.push(`algorithm=${desafio.algorithm}`);
  if (qop) partes.push(`qop=${qop}`, `nc=${ncTexto}`, `cnonce="${cnonce}"`);
  return `Digest ${partes.join(', ')}`;
}

// ── XML o JSON ─────────────────────────────────────────────────────────────────────────────
// El equipo contesta XML en /ISAPI/System/deviceInfo y JSON en AcsEvent. Se aceptan los dos en
// vez de asumir uno: asumir cuesta una caída el día que un firmware cambie de opinión.
// Parser mínimo a propósito — el XML de Hikvision es plano, sin CDATA ni namespaces.
function xmlAObjeto(xml) {
  const limpio = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const raiz = {};
  const pila = [raiz];
  const rx = /<\s*([\w:.-]+)([^>]*?)(\/?)>|<\s*\/\s*([\w:.-]+)\s*>|([^<]+)/g;
  let m;

  while ((m = rx.exec(limpio)) !== null) {
    const [, apertura, , autocierre, cierre, texto] = m;
    const actual = pila[pila.length - 1];

    if (apertura) {
      const hijo = {};
      // Una etiqueta repetida se vuelve arreglo. Es lo que pasa con InfoList y UserInfo, que
      // vienen una vez cuando hay un solo registro y N veces cuando hay varios.
      if (actual[apertura] === undefined) actual[apertura] = hijo;
      else if (Array.isArray(actual[apertura])) actual[apertura].push(hijo);
      else actual[apertura] = [actual[apertura], hijo];
      if (!autocierre) pila.push(hijo);
    } else if (cierre) {
      const nodo = pila.pop();
      // Nodo hoja: se colapsa a su texto para que se lea igual que el JSON equivalente.
      if (nodo && nodo['#texto'] !== undefined && Object.keys(nodo).length === 1) {
        const padre = pila[pila.length - 1];
        const valor = nodo['#texto'];
        if (Array.isArray(padre[cierre])) padre[cierre][padre[cierre].length - 1] = valor;
        else padre[cierre] = valor;
      }
    } else if (texto && texto.trim()) {
      actual['#texto'] = (actual['#texto'] || '') + texto.trim();
    }
  }
  return raiz;
}

export function interpretarRespuesta(texto, etiqueta = 'respuesta') {
  const limpio = (texto || '').trim();
  if (!limpio) throw new Error(`El equipo devolvió una ${etiqueta} vacía.`);
  if (limpio.startsWith('{') || limpio.startsWith('[')) return JSON.parse(limpio);
  if (limpio.startsWith('<')) return xmlAObjeto(limpio);
  throw new Error(
    `El equipo devolvió una ${etiqueta} que no es XML ni JSON: ${limpio.slice(0, 120)}`,
  );
}

const comoLista = (valor) => (valor === undefined || valor === null ? [] : Array.isArray(valor) ? valor : [valor]);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Cliente
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function crearClienteIsapi({
  ip,
  usuario = 'admin',
  clave,
  usarHttp = false,
  puerto = null,
  tiempoEsperaMs = 60000,
  topeEventos = 60000,
}) {
  if (!ip) throw new Error('Falta la dirección IP del equipo.');
  if (!clave) throw new Error('Falta la contraseña del equipo.');

  const protocolo = usarHttp ? http : https;
  const puertoReal = Number(puerto) || (usarHttp ? 80 : 443);
  let desafio = null; // se reusa entre pedidos: sin esto, cada pedido gasta un 401 de más
  let nc = 0;

  function pedirCrudo(ruta, { metodo, cuerpo, autorizacion }) {
    return new Promise((resolver, rechazar) => {
      const opciones = {
        host: ip,
        port: puertoReal,
        path: ruta,
        method: metodo,
        timeout: tiempoEsperaMs,
        headers: { 'User-Agent': 'LuceBien-Colector/1.0' },
        // El equipo usa certificado autofirmado y no hay CA que lo valide. Es una IP fija de la
        // LAN del almacén: la alternativa sería instalar el certificado en cada PC, y el dato
        // que viaja son marcas de asistencia dentro de la propia red.
        rejectUnauthorized: false,
      };
      if (autorizacion) opciones.headers.Authorization = autorizacion;
      if (cuerpo) {
        opciones.headers['Content-Type'] = 'application/json';
        opciones.headers['Content-Length'] = Buffer.byteLength(cuerpo);
      }

      const peticion = protocolo.request(opciones, (respuesta) => {
        const trozos = [];
        respuesta.on('data', (t) => trozos.push(t));
        respuesta.on('end', () => {
          // El equipo no siempre declara UTF-8. Forzarlo convierte "CÉSAR" en "CÃSAR" cuando en
          // realidad mandó Latin-1: se respeta lo declarado y se cae a UTF-8 sólo si no dice nada.
          const tipo = respuesta.headers['content-type'] || '';
          const juego = (tipo.match(/charset=([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
          let texto;
          try {
            texto = new TextDecoder(juego).decode(Buffer.concat(trozos));
          } catch {
            texto = Buffer.concat(trozos).toString('utf8');
          }
          resolver({
            estado: respuesta.statusCode,
            cabeceras: respuesta.headers,
            texto,
          });
        });
      });

      peticion.on('timeout', () => peticion.destroy(new Error(`Sin respuesta del equipo ${ip} en ${tiempoEsperaMs} ms.`)));
      peticion.on('error', rechazar);
      if (cuerpo) peticion.write(cuerpo);
      peticion.end();
    });
  }

  async function pedirTexto(ruta, { metodo = 'GET', cuerpo = null } = {}) {
    for (let intento = 0; intento < 2; intento++) {
      const autorizacion = desafio
        ? armarAutorizacion({ desafio, usuario, clave, metodo, uri: ruta, nc: ++nc })
        : null;

      const r = await pedirCrudo(ruta, { metodo, cuerpo, autorizacion });

      if (r.estado === 401) {
        const cabecera = r.cabeceras['www-authenticate'];
        if (!cabecera || !/digest/i.test(cabecera)) {
          throw new Error('HTTP 401 — el equipo no aceptó la clave (no ofrece autenticación digest).');
        }
        // Nonce nuevo o vencido: se rearma el desafío y se reintenta una sola vez.
        desafio = interpretarDesafio(cabecera);
        nc = 0;
        continue;
      }

      if (r.estado >= 400) {
        // El cuerpo del error trae el detalle real de Hikvision. Sin esto sólo se ve "500".
        throw new Error(`HTTP ${r.estado} — ${r.texto.slice(0, 300)}`);
      }
      return r.texto;
    }
    throw new Error('HTTP 401 — la clave del equipo no fue aceptada. Tras varios intentos fallidos el equipo bloquea el acceso unos minutos.');
  }

  // ── Identificación del equipo, para el log de arranque ───────────────────────────────────
  async function leerInfo() {
    const datos = interpretarRespuesta(await pedirTexto('/ISAPI/System/deviceInfo'), 'deviceInfo');
    const d = datos.DeviceInfo || {};
    return { modelo: d.model, serie: d.serialNumber, firmware: d.firmwareVersion };
  }

  // ── Una página de eventos ────────────────────────────────────────────────────────────────
  async function leerTramo({ inicio, fin, etiqueta, conFiltro = true }) {
    const acumulado = [];
    let posicion = 0;
    let total = null;

    for (;;) {
      const condicion = {
        searchID: `lb-${etiqueta}`,
        searchResultPosition: posicion,
        // El equipo devuelve como máximo 30 por página aunque se le pidan 100, así que pedir más
        // no acelera nada y confunde al leer el log.
        maxResults: 30,
        startTime: aTextoPeru(inicio),
        endTime: aTextoPeru(fin),
      };
      if (conFiltro) {
        condicion.major = 5;   // control de acceso
        condicion.minor = 38;  // autenticación por huella
      }

      const texto = await pedirTexto('/ISAPI/AccessControl/AcsEvent?format=json', {
        metodo: 'POST',
        cuerpo: JSON.stringify({ AcsEventCond: condicion }),
      });
      const bloque = interpretarRespuesta(texto, 'AcsEvent').AcsEvent || {};
      const lista = comoLista(bloque.InfoList).filter(Boolean);
      const estado = String(bloque.responseStatusStrg ?? '');
      if (total === null && bloque.totalMatches !== undefined) total = Number(bloque.totalMatches);

      for (const e of lista) {
        acumulado.push({
          employee_no: String(e.employeeNoString ?? e.employeeNo ?? ''),
          marcada_en: normalizarFecha(String(e.time ?? '')),
          evento_serial: Number(e.serialNo),
          nombre_equipo: e.name ? String(e.name) : null,
        });
      }

      const devueltos = lista.length;
      if (devueltos === 0) break;

      // Avanzar por lo DEVUELTO, no por lo pedido. Avanzar de 100 en 100 cuando el equipo
      // devuelve 30 saltea 70 registros por página: así se perdió el 70% de las marcas la
      // primera vez que se leyó el histórico.
      posicion += devueltos;

      let hayMas = estado === 'MORE';
      if (!hayMas && total && posicion < total) hayMas = true;
      if (!hayMas || posicion >= topeEventos) break;
    }

    return acumulado;
  }

  // ── El rango completo, troceado por mes ──────────────────────────────────────────────────
  //
  // Devuelve { marcas, error } en vez de tirar la excepción hacia arriba: si el mes 6 falla, las
  // marcas de los cinco meses anteriores YA están leídas y hay que poder subirlas igual. Perder
  // una lectura completa por un error posterior ya pasó una vez y costó ocho meses de datos.
  async function leerMarcas({ desde, hasta, registrar = () => {} }) {
    const vistos = new Set();
    const marcas = [];
    let cursor = new Date(desde.getTime());
    let i = 0;

    try {
      while (cursor < hasta) {
        let finTramo = sumarMeses(cursor, 1);
        if (finTramo > hasta) finTramo = hasta;
        i++;

        const tramo = await leerTramo({ inicio: cursor, fin: finTramo, etiqueta: `t${i}` });

        // Los extremos de cada tramo repiten el evento que cae justo en el límite. El serial
        // identifica al evento — mismo criterio que el índice único de la base.
        for (const m of tramo) {
          if (!Number.isFinite(m.evento_serial) || vistos.has(m.evento_serial)) continue;
          vistos.add(m.evento_serial);
          marcas.push(m);
        }

        if (i > 1 || tramo.length > 0) {
          registrar(`   tramo ${aTextoPeru(cursor).slice(0, 10)} → ${tramo.length} leídas (acumulado ${marcas.length})`);
        }
        cursor = finTramo;
      }
      return { marcas, error: null };
    } catch (error) {
      return { marcas, error };
    }
  }

  return { pedirTexto, leerInfo, leerMarcas };
}

// El equipo manda "2026-08-15T08:00:26-05:00". Si algún firmware lo mandara sin offset, se le
// pone el de Perú: mandarlo sin offset a la base lo haría interpretar en UTC y correría la marca
// cinco horas, que es medio turno.
function normalizarFecha(texto) {
  const t = texto.trim();
  if (!t) return t;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(t)) return t;
  return `${t}-05:00`;
}
