#!/usr/bin/env node
// Publica un informe ya aprobado: lo convierte a PDF, lo copia a la carpeta de
// trabajo y a la de Google Drive, lo envía por correo al dueño y anota el estado
// para que el siguiente informe arranque donde terminó éste.
//
//   node enviar.mjs informe.json              → convierte, copia y envía
//   node enviar.mjs informe.json --simular    → hace todo menos enviar el correo
//
// Nunca se ejecuta solo: corre únicamente cuando Alexander aprueba el borrador.

import nodemailer from 'nodemailer';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const ARCHIVO_ESTADO = join(AQUI, 'estado.json');

function cargarEnv() {
  const ruta = join(AQUI, '.env');
  if (!existsSync(ruta)) {
    throw new Error('Falta tools/informe-diario/.env — copiá .env.example y completá los datos.');
  }
  const env = {};
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const i = limpia.indexOf('=');
    if (i < 0) continue;
    env[limpia.slice(0, i).trim()] = limpia.slice(i + 1).trim();
  }
  return env;
}

function nombreBase(informe) {
  const numero =
    informe.tipo === 'semanal'
      ? String(informe.numero).padStart(2, '0')
      : String(informe.numero).padStart(3, '0');
  const sufijo = informe.tipo === 'semanal' ? '(erp)' : '(diario)';
  return `INFORME DE AVANCES ${numero} ${sufijo}`;
}

function aPdf(docx, pdf) {
  execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(AQUI, 'a-pdf.ps1'), '-Entrada', docx, '-Salida', pdf],
    { encoding: 'utf8' }
  );
}

function cuerpoCorreo(informe, base) {
  const lineas = [];
  lineas.push('<p>Buen día,</p>');
  lineas.push(`<p>Adjunto el ${informe.tipo === 'semanal' ? 'informe' : 'informe diario'} de avances del sistema.</p>`);
  for (const p of (informe.resumen || []).slice(0, 1)) {
    lineas.push(`<p>${p}</p>`);
  }
  if (informe.enUnaLinea) {
    lineas.push(`<p><b>En una línea:</b> ${informe.enUnaLinea}</p>`);
  }
  // Sólo los tres primeros puntos de decisión: el correo es el resumen, la lista
  // completa vive en el PDF. Cuando se recorta, se dice — no se oculta el resto.
  if (informe.decisiones && informe.decisiones.length) {
    const primeros = informe.decisiones.slice(0, 3);
    lineas.push('<p><b>Puntos donde necesito su decisión:</b></p><ul>');
    for (const d of primeros) lineas.push(`<li>${d}</li>`);
    lineas.push('</ul>');
    if (informe.decisiones.length > primeros.length) {
      lineas.push(
        `<p>Hay ${informe.decisiones.length - primeros.length} punto(s) más en esa sección del PDF.</p>`
      );
    }
  }
  lineas.push(
    '<p>En el punto <b>“Cómo revisarlo”</b> del PDF están los pasos exactos para verificar cada avance.</p>'
  );
  lineas.push('<p>Saludos,<br>Alexander</p>');
  lineas.push(
    `<p style="color:#888;font-size:12px">Este informe también queda en la carpeta compartida de Drive como “${base}.pdf”.</p>`
  );
  return lineas.join('\n');
}

function actualizarEstado(informe) {
  const estado = existsSync(ARCHIVO_ESTADO)
    ? JSON.parse(readFileSync(ARCHIVO_ESTADO, 'utf8'))
    : { ultimoNumeroDiario: 0, ultimoNumeroSemanal: 4 };
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: RAIZ, encoding: 'utf8' }).trim();

  if (informe.tipo === 'semanal') {
    estado.ultimoNumeroSemanal = informe.numero;
    estado.ultimoShaSemanal = head;
    estado.ultimaFechaSemanal = informe.hasta || informe.fecha;
  } else {
    estado.ultimoNumeroDiario = informe.numero;
    estado.ultimoSha = head;
    estado.ultimaFecha = informe.fecha;
  }
  writeFileSync(ARCHIVO_ESTADO, `${JSON.stringify(estado, null, 2)}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const rutaJson = args[0];
  const simular = args.includes('--simular');
  if (!rutaJson) {
    console.error('Uso: node enviar.mjs <informe.json> [--simular]');
    process.exit(1);
  }

  const env = cargarEnv();
  const informe = JSON.parse(readFileSync(rutaJson, 'utf8'));
  const base = nombreBase(informe);

  const borradores = env.BORRADORES_DIR || 'E:/Lucebien informes/borradores';
  const informes = env.INFORMES_DIR || 'E:/Lucebien informes';
  const drive = env.DRIVE_DIR;

  const docx = join(borradores, `${base}.docx`);
  const pdf = join(borradores, `${base}.pdf`);

  if (!existsSync(docx)) {
    throw new Error(`No existe el borrador ${docx}. Generalo primero con generar.mjs.`);
  }
  if (!drive) throw new Error('Falta DRIVE_DIR en .env.');
  if (!existsSync(drive)) {
    throw new Error(
      `No se ve la carpeta de Drive:\n  ${drive}\nAbrí Google Drive para escritorio y esperá a que sincronice antes de reintentar.`
    );
  }

  console.log('Convirtiendo a PDF…');
  aPdf(docx, pdf);

  const asunto =
    informe.tipo === 'semanal'
      ? `LuceBien ERP — Informe de avances ${String(informe.numero).padStart(2, '0')}`
      : `LuceBien ERP — Informe diario ${formatearFecha(informe.fecha)} — Informe ${String(informe.numero).padStart(3, '0')}`;

  if (simular) {
    // El ensayo no copia a Drive, no envía correo y no mueve el punto de corte:
    // sólo muestra qué haría, para poder revisar el PDF antes de publicarlo.
    console.log('\n--- SIMULACIÓN: no se copió a Drive, no se envió correo ---');
    console.log(`Para:    ${env.DESTINATARIO}`);
    console.log(`Copia:   ${env.CC || '(sin copia)'}`);
    console.log(`Asunto:  ${asunto}`);
    console.log(`Adjunto: ${base}.pdf`);
    console.log(`PDF:     ${pdf}`);
    console.log(`Drive:   ${drive} (verificada, sin escribir)`);
    return;
  }

  if (!existsSync(informes)) mkdirSync(informes, { recursive: true });
  copyFileSync(docx, join(informes, `${base}.docx`));
  copyFileSync(pdf, join(informes, `${base}.pdf`));
  copyFileSync(pdf, join(drive, `${base}.pdf`));
  console.log(`Copiado a la carpeta de trabajo y a Drive: ${base}.pdf`);

  const transporte = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: env.SMTP_USER, pass: (env.SMTP_PASS || '').replace(/\s+/g, '') },
  });

  await transporte.sendMail({
    from: `"Alexander Flores" <${env.SMTP_USER}>`,
    to: env.DESTINATARIO,
    cc: env.CC || undefined,
    subject: asunto,
    html: cuerpoCorreo(informe, base),
    attachments: [{ filename: `${base}.pdf`, path: pdf }],
  });

  console.log(`Correo enviado a ${env.DESTINATARIO}.`);
  actualizarEstado(informe);
  console.log('Estado actualizado: el próximo informe arranca desde este punto.');
}

function formatearFecha(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

main().catch((error) => {
  console.error(`\nNo se pudo publicar el informe:\n${error.message}`);
  process.exit(1);
});
