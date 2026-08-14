// Lee docs/requerimientos-dueno.md, que es la fuente de verdad del estado de los
// requerimientos del dueño, y lo devuelve como datos. Así el informe no tiene que
// repetir la lista: la deriva del registro.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const REGISTRO = join(AQUI, '..', '..', '..', 'docs', 'requerimientos-dueno.md');

const ORDEN_ESTADOS = ['apoyo', 'problema', 'curso', 'listo', 'pendiente', 'revisar'];

export function leerRequerimientos(ruta = REGISTRO) {
  if (!existsSync(ruta)) return { items: [], resumen: {}, total: 0 };

  const items = [];
  let zona = 'Sin zona';

  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const encabezado = linea.match(/^##\s+(.+?)\s*$/);
    if (encabezado) {
      zona = encabezado[1];
      continue;
    }
    if (!linea.startsWith('| R-')) continue;

    const campos = linea.split('|').slice(1, -1).map((c) => c.trim());
    const [id, requerimiento, estado, actualizado, nota] = campos;
    items.push({ id, zona, requerimiento, estado, actualizado, nota: nota || '' });
  }

  const resumen = {};
  for (const clave of ORDEN_ESTADOS) resumen[clave] = 0;
  for (const item of items) {
    resumen[item.estado] = (resumen[item.estado] || 0) + 1;
  }

  return { items, resumen, total: items.length };
}

// Requerimientos que cambiaron de estado en esta entrega: los actualizados desde la
// fecha de corte y que ya no están sólo registrados.
// Los que esperan al dueño quedan fuera: tienen su propia tabla y repetirlos
// haría parecer que el mismo requerimiento aparece dos veces.
export function movimientos(items, desde) {
  if (!desde) return [];
  return items
    .filter((i) => i.estado !== 'revisar' && i.estado !== 'apoyo' && i.actualizado >= desde)
    .sort((a, b) => ORDEN_ESTADOS.indexOf(a.estado) - ORDEN_ESTADOS.indexOf(b.estado));
}

// Requerimientos frenados esperando algo del dueño.
export function esperandoAlDueno(items) {
  return items.filter((i) => i.estado === 'apoyo');
}

export function frasesResumen(resumen, total) {
  // Cada estado lleva su forma en singular y en plural, para que la frase no
  // termine diciendo "1 listos".
  const FORMAS = {
    listo: ['listo', 'listos'],
    curso: ['en curso', 'en curso'],
    problema: ['con problema', 'con problemas'],
    apoyo: ['esperando su apoyo', 'esperando su apoyo'],
    pendiente: ['sin hacer todavía', 'sin hacer todavía'],
    revisar: ['sin evaluar', 'sin evaluar'],
  };
  const partes = [];
  for (const clave of ['listo', 'curso', 'problema', 'apoyo', 'pendiente', 'revisar']) {
    const cantidad = resumen[clave];
    if (!cantidad) continue;
    partes.push(`${cantidad} ${FORMAS[clave][cantidad === 1 ? 0 : 1]}`);
  }
  return `De sus ${total} requerimientos registrados: ${partes.join(', ')}.`;
}
