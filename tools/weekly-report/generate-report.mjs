#!/usr/bin/env node
/**
 * generate-report.mjs — Informe semanal automatizado LuceBien
 *
 * Lee commits de la última semana, calcula la semana del cronograma contractual,
 * pide a Claude API que redacte un reporte profesional, lo envía por correo a
 * EL COMITENTE y lo guarda en /reports/YYYY-MM-DD.md
 *
 * Diseñado para ejecutarse vía GitHub Actions cada viernes 21:00 UTC (= 16:00 Perú),
 * o manualmente: node tools/weekly-report/generate-report.mjs
 *
 * Variables de entorno requeridas (ver .env.example):
 *   ANTHROPIC_API_KEY    — del Claude 5x MAX (pagado por EL COMITENTE per Cl. 11ma)
 *   SMTP_HOST            — ej: smtp.gmail.com
 *   SMTP_PORT            — ej: 587
 *   SMTP_USER            — tu correo de envío (imalexandre05@gmail.com)
 *   SMTP_PASS            — app password de Gmail (NO tu contraseña normal)
 *   REPORT_TO            — destino: lucebien7s@gmail.com
 *   REPORT_CC            — copia: tu propio correo para tener histórico
 *   REPORT_DRY_RUN       — "true" para no enviar email (solo generar archivo)
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const CRONOGRAMA_PATH = join(__dirname, 'cronograma.json');
const PROMPT_TEMPLATE_PATH = join(__dirname, 'prompt-template.md');
const REPORTS_DIR = join(REPO_ROOT, 'reports');

// ───────────────────────────────────────────────────────────────────────────
// 1. Configuración y validación
// ───────────────────────────────────────────────────────────────────────────

// IMPORTANTE: este script genera un DRAFT del reporte y se lo envía SOLO al
// autor (Alexander) para revisión. El envío al cliente final (Jordan) es
// MANUAL — Alexander reenvía desde su Gmail tras revisar el contenido.
// Esto protege contra reportes con errores de IA enviados sin supervisión.
const env = {
  apiKey: process.env.ANTHROPIC_API_KEY,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  // REPORT_REVIEWER: correo del autor que revisa antes de enviar al cliente
  reviewer: process.env.REPORT_REVIEWER || process.env.SMTP_USER,
  dryRun: process.env.REPORT_DRY_RUN === 'true'
};

if (!env.apiKey) {
  console.error('❌ Falta ANTHROPIC_API_KEY. Aborto.');
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Calcular semana del cronograma contractual
// ───────────────────────────────────────────────────────────────────────────

const cronograma = JSON.parse(readFileSync(CRONOGRAMA_PATH, 'utf8'));
const fechaInicio = new Date(cronograma._meta.fechaInicio + 'T00:00:00');
const ahora = new Date();
const diasTranscurridos = Math.floor((ahora - fechaInicio) / (1000 * 60 * 60 * 24));
const semanaActual = Math.max(1, Math.min(96, Math.floor(diasTranscurridos / 7) + 1));
const semanaSiguiente = Math.min(96, semanaActual + 1);

const semanaInfo = cronograma.semanas.find(s => s.n === semanaActual);
const semanaSigInfo = cronograma.semanas.find(s => s.n === semanaSiguiente);
const faseInfo = cronograma.fases.find(f => f.id === semanaInfo.fase);

console.log(`📅 Semana del cronograma: ${semanaActual} de 96 (${((semanaActual / 96) * 100).toFixed(1)}%)`);
console.log(`📌 Fase ${faseInfo.id} — ${faseInfo.nombre}`);
console.log(`🎯 Objetivo: ${semanaInfo.titulo}`);

// ───────────────────────────────────────────────────────────────────────────
// 3. Leer commits de la semana
// ───────────────────────────────────────────────────────────────────────────

const desde = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
const hasta = ahora.toISOString();

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch (e) {
    console.error(`⚠️  git ${cmd} falló:`, e.message);
    return '';
  }
}

const commitsRaw = git(
  `log --since="${desde}" --until="${hasta}" --pretty=format:"%h|%ad|%s" --date=short --no-merges`
);
const commits = commitsRaw
  ? commitsRaw.split('\n').map(line => {
      const [hash, fecha, ...rest] = line.split('|');
      return { hash, fecha, mensaje: rest.join('|') };
    })
  : [];

const shortstat = git(`log --since="${desde}" --until="${hasta}" --shortstat --pretty=format: --no-merges`);
const stats = { files: 0, insertions: 0, deletions: 0 };
shortstat.split('\n').forEach(line => {
  const f = line.match(/(\d+) files? changed/);
  const i = line.match(/(\d+) insertions?\(\+\)/);
  const d = line.match(/(\d+) deletions?\(-\)/);
  if (f) stats.files += parseInt(f[1], 10);
  if (i) stats.insertions += parseInt(i[1], 10);
  if (d) stats.deletions += parseInt(d[1], 10);
});

console.log(`📊 ${commits.length} commits, ${stats.files} archivos, +${stats.insertions}/-${stats.deletions}`);

if (commits.length === 0) {
  console.warn('⚠️  Sin commits esta semana. Generando reporte placeholder.');
}

// ───────────────────────────────────────────────────────────────────────────
// 4. Construir prompt para Claude
// ───────────────────────────────────────────────────────────────────────────

const commitsBloque = commits.length
  ? commits.map(c => `- [${c.hash}] (${c.fecha}) ${c.mensaje}`).join('\n')
  : '(Sin commits registrados esta semana — semana de planificación, investigación o trabajo no-versionado)';

const template = readFileSync(PROMPT_TEMPLATE_PATH, 'utf8');
const prompt = template
  .replaceAll('{{SEMANA_NUMERO}}', String(semanaActual))
  .replaceAll('{{SEMANA_NUMERO_SIGUIENTE}}', String(semanaSiguiente))
  .replaceAll('{{PORCENTAJE_AVANCE}}', ((semanaActual / 96) * 100).toFixed(1))
  .replaceAll('{{FASE_NUMERO}}', String(faseInfo.id))
  .replaceAll('{{FASE_NOMBRE}}', faseInfo.nombre)
  .replaceAll('{{MES_NUMERO}}', String(semanaInfo.mes))
  .replaceAll('{{SEMANA_TITULO}}', semanaInfo.titulo)
  .replaceAll('{{SEMANA_SIGUIENTE_TITULO}}', semanaSigInfo?.titulo || '(cierre del proyecto)')
  .replaceAll('{{FECHA_INICIO}}', desde.slice(0, 10))
  .replaceAll('{{FECHA_FIN}}', hasta.slice(0, 10))
  .replaceAll('{{COMMITS_BLOQUE}}', commitsBloque)
  .replaceAll('{{COMMITS_COUNT}}', String(commits.length))
  .replaceAll('{{ARCHIVOS_COUNT}}', String(stats.files))
  .replaceAll('{{LINEAS_AGREGADAS}}', String(stats.insertions))
  .replaceAll('{{LINEAS_ELIMINADAS}}', String(stats.deletions))
  .replaceAll('{{PRS_CERRADAS}}', '—')
  .replaceAll('{{ISSUES_RESUELTAS}}', '—');

// ───────────────────────────────────────────────────────────────────────────
// 5. Llamar a Claude API (con prompt caching del template)
// ───────────────────────────────────────────────────────────────────────────

console.log('🤖 Llamando a Claude API...');

const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': env.apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }]
  })
});

if (!claudeResp.ok) {
  console.error('❌ Claude API error:', claudeResp.status, await claudeResp.text());
  process.exit(2);
}

const claudeData = await claudeResp.json();
const reporteTexto = claudeData.content?.[0]?.text || '(Sin contenido generado)';

console.log('✅ Reporte generado.\n');
console.log('─'.repeat(60));
console.log(reporteTexto);
console.log('─'.repeat(60));

// ───────────────────────────────────────────────────────────────────────────
// 6. Guardar copia en /reports/
// ───────────────────────────────────────────────────────────────────────────

if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
const fechaIso = ahora.toISOString().slice(0, 10);
const reportFile = join(REPORTS_DIR, `${fechaIso}_semana-${String(semanaActual).padStart(2, '0')}.md`);

const fullDoc = `# Reporte Semanal LuceBien — Semana ${semanaActual} de 96

**Fecha:** ${fechaIso}
**Fase:** ${faseInfo.id} — ${faseInfo.nombre}
**Objetivo de la semana:** ${semanaInfo.titulo}
**Avance acumulado:** ${((semanaActual / 96) * 100).toFixed(1)}%

---

${reporteTexto}

---

## Anexo técnico (uso interno)

- Commits: ${commits.length}
- Archivos modificados: ${stats.files}
- Líneas: +${stats.insertions} / −${stats.deletions}
- Rango: ${desde.slice(0, 10)} a ${hasta.slice(0, 10)}

### Commits incluidos
${commits.map(c => `- \`${c.hash}\` (${c.fecha}) — ${c.mensaje}`).join('\n')}

---

*Reporte generado automáticamente conforme a Cláusula Quinta del Contrato de Locación de Servicios.*
`;

writeFileSync(reportFile, fullDoc, 'utf8');
console.log(`💾 Guardado en: ${reportFile}`);

// ───────────────────────────────────────────────────────────────────────────
// 7. Enviar por correo
// ───────────────────────────────────────────────────────────────────────────

if (env.dryRun) {
  console.log('🧪 DRY RUN — email NO enviado.');
  process.exit(0);
}

if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
  console.warn('⚠️  SMTP no configurado. Reporte generado pero no enviado.');
  process.exit(0);
}

// Carga nodemailer dinámicamente para no obligar a instalarlo si solo se genera
let nodemailer;
try {
  nodemailer = (await import('nodemailer')).default;
} catch {
  console.error('❌ nodemailer no instalado. Ejecuta: npm install nodemailer');
  process.exit(3);
}

const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpPort === 465,
  auth: { user: env.smtpUser, pass: env.smtpPass }
});

const asunto = `[DRAFT — REVISAR] Reporte Semanal LuceBien — Semana ${semanaActual}/96 (${fechaIso})`;
const cuerpoHtml = `
<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 0 auto; color: #1a2332;">
  <div style="background:#fff8e1;border:1px solid #f0c674;padding:12px 16px;border-radius:6px;margin-bottom:20px;">
    <strong>⚠️ Este es un DRAFT generado automáticamente.</strong><br>
    Revisalo antes de reenviarlo al cliente. Si está OK, hacé "Reenviar" desde Gmail a <code>lucebien7s@gmail.com</code>. Si necesitás ajustar, editá el archivo <code>reports/${fechaIso}_semana-${String(semanaActual).padStart(2, '0')}.md</code> en el repo y volvé a generar.
  </div>
  <h2 style="border-bottom: 2px solid #2e3e6e; padding-bottom: 8px;">Reporte Semanal LuceBien</h2>
  <p style="color: #5a6577; margin: 4px 0;">
    <strong>Semana ${semanaActual} de 96</strong> · Fase ${faseInfo.id} — ${faseInfo.nombre}<br>
    <strong>Objetivo:</strong> ${semanaInfo.titulo}<br>
    <strong>Avance acumulado:</strong> ${((semanaActual / 96) * 100).toFixed(1)}%
  </p>
  <hr style="border: none; border-top: 1px solid #e0e4ea;">
  <div style="white-space: pre-wrap; line-height: 1.6;">${reporteTexto.replace(/\n/g, '<br>')}</div>
  <hr style="border: none; border-top: 1px solid #e0e4ea; margin-top: 24px;">
  <p style="color: #8a94a6; font-size: 12px;">
    Repositorio: <a href="https://github.com/imalexandre05/lucebien_v5">github.com/imalexandre05/lucebien_v5</a><br>
    Reporte generado automáticamente desde el historial de Git para revisión humana antes de envío.
  </p>
</div>
`.trim();

// Email solo al REVISOR (autor), no al cliente. El reenvío al cliente es manual.
await transporter.sendMail({
  from: `"Reporte Bot LuceBien" <${env.smtpUser}>`,
  to: env.reviewer,
  subject: asunto,
  text: `DRAFT — REVISAR ANTES DE REENVIAR A CLIENTE\n\n${reporteTexto}`,
  html: cuerpoHtml
});

console.log(`📧 Draft enviado a ${env.reviewer} para revisión humana.`);
console.log(`👉 Próximo paso: revisar el correo y reenviar a lucebien7s@gmail.com si está OK.`);
console.log('🏁 Generación completada.');
