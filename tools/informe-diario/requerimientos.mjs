#!/usr/bin/env node
// Consulta el registro de requerimientos del dueño.
//
//   node requerimientos.mjs                    → resumen por estado
//   node requerimientos.mjs --estado apoyo     → los que esperan algo del dueño
//   node requerimientos.mjs --desde 2026-08-12 → los que se movieron desde esa fecha
//   node requerimientos.mjs --json             → todo, en JSON

import { leerRequerimientos, movimientos, frasesResumen } from './lib/requerimientos.mjs';

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : null;
};

const { items, resumen, total } = leerRequerimientos();

if (args.includes('--json')) {
  process.stdout.write(JSON.stringify({ items, resumen, total }, null, 2));
} else if (opcion('--desde')) {
  const lista = movimientos(items, opcion('--desde'));
  process.stdout.write(
    lista.map((i) => `${i.id}  ${i.estado.padEnd(9)}  ${i.requerimiento}`).join('\n')
  );
} else if (opcion('--estado')) {
  const estado = opcion('--estado');
  const lista = items.filter((i) => i.estado === estado);
  process.stdout.write(lista.map((i) => `${i.id}  ${i.zona}  ${i.requerimiento}`).join('\n'));
} else {
  process.stdout.write(frasesResumen(resumen, total));
}
process.stdout.write('\n');
