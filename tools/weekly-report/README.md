# Weekly Report — Informe semanal automatizado

Genera y envía el reporte semanal de avances al cliente conforme a la **Cláusula Quinta** del Contrato de Locación de Servicios.

## ¿Qué hace?

1. Calcula en qué semana del cronograma de 96 semanas estamos (`cronograma.json`).
2. Lee los commits de los últimos 7 días.
3. Llama a Claude API con un prompt que traduce los commits a lenguaje de negocio.
4. Guarda el reporte en `reports/YYYY-MM-DD_semana-NN.md`.
5. Envía un **DRAFT al autor** (`REPORT_REVIEWER`) para revisión humana.
6. El autor **reenvía manualmente** a `lucebien7s@gmail.com` desde su Gmail si el draft está OK.

> ⚠️ **Importante:** el script NUNCA envía directo al cliente. Esto protege contra errores o alucinaciones de IA en el reporte. Toda comunicación con el cliente pasa por revisión humana.

## Ejecución manual

```bash
node tools/weekly-report/generate-report.mjs
```

Para probar sin enviar email:

```bash
REPORT_DRY_RUN=true node tools/weekly-report/generate-report.mjs
```

## Ejecución automática

Configurado en `.github/workflows/weekly-report.yml` para ejecutarse cada **viernes 21:00 UTC** (= 16:00 hora Perú).

## Variables de entorno

Ver `.env.example` en la raíz del repo. Las que se requieren:

| Variable | Descripción |
|---|---|
| `ANTHROPIC_API_KEY` | Key del plan Claude (pagado por EL COMITENTE per Cl. 11ma) |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Correo emisor del bot (ej. `imalexandre05@gmail.com`) |
| `SMTP_PASS` | App password de Gmail (NO contraseña normal) — generar en https://myaccount.google.com/apppasswords |
| `REPORT_REVIEWER` | Tu correo donde llega el draft para revisión (`imalexandre05@gmail.com`) |
| `REPORT_DRY_RUN` | `true` para generar sin enviar |

En GitHub Actions, agrégalas como **Repository Secrets** en `Settings → Secrets and variables → Actions`.

## Personalización del reporte

Edita `prompt-template.md` para cambiar tono, estructura o reglas de redacción.

Edita `cronograma.json` si las semanas del contrato cambian o se renegocian.

## Dependencia

Solo `nodemailer` para envío de email:

```bash
npm install nodemailer
```
