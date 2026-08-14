# Informes de avance para el dueño

Genera, convierte a PDF, archiva y envía los informes que lee el dueño de LuceBien.
El agente lo usa a través de la skill `.claude/skills/informe-diario/SKILL.md`; esta carpeta
documenta las piezas para operarlas a mano si hace falta.

## Piezas

| Archivo | Qué hace |
|---|---|
| `recolectar.mjs` | Lee git desde el último informe y devuelve un JSON compacto: commits, módulos, migraciones, totales |
| `requerimientos.mjs` | Consulta `docs/requerimientos-dueno.md`: resumen por estado, frenados, movimientos |
| `lib/requerimientos.mjs` | Lector del registro de requerimientos del dueño |
| `generar.mjs` | Convierte el JSON del informe en `.docx` usando `plantilla.docx` como contenedor |
| `lib/docx.mjs` | Constructores de WordprocessingML (párrafos, tablas, viñetas) con el formato de la plantilla |
| `a-pdf.ps1` | Convierte `.docx` a `.pdf` con Microsoft Word |
| `enviar.mjs` | Copia el PDF a la carpeta de trabajo y a Drive, lo manda por correo y anota el punto de corte |
| `plantilla.docx` | Plantilla aprobada: estilos, fuentes, tema, márgenes y encabezado con el logo |
| `estado.json` | Último número de informe y último commit publicado, por tipo |
| `ejemplo-diario.json` | Informe de ejemplo, útil como referencia de tono |

## Uso manual

```bash
node tools/informe-diario/recolectar.mjs
# redactar tools/informe-diario/informe.json
node tools/informe-diario/generar.mjs tools/informe-diario/informe.json
node tools/informe-diario/enviar.mjs tools/informe-diario/informe.json --simular
node tools/informe-diario/enviar.mjs tools/informe-diario/informe.json
```

## Numeración

- **Diarios:** correlativo propio desde `001`, archivo `INFORME DE AVANCES 001 (diario).pdf`.
- **Semanales:** continúan el correlativo histórico (el último fue el 4), archivo
  `INFORME DE AVANCES 05 (erp).pdf`.

El número avanza sólo cuando el informe se envía de verdad. Regenerar un borrador las veces
que haga falta no consume número.

## Rutas

| Qué | Dónde |
|---|---|
| Borradores | `E:\Lucebien informes\borradores\` |
| Informes publicados | `E:\Lucebien informes\` |
| Carpeta del dueño (Drive Desktop) | `H:\Mi unidad\...\INFORMES DE ALEX\` |

Todas configurables en `.env`.

## Credenciales

`.env` (no versionado) guarda la cuenta remitente y una **contraseña de aplicación** de Google
—16 letras generadas en myaccount.google.com/apppasswords—, no la contraseña real de la cuenta.
Se puede revocar desde esa misma página sin afectar nada más. `.env.example` tiene la plantilla.

## Si algo falla

| Síntoma | Causa habitual |
|---|---|
| `sinTrabajo: true` | No hay commits desde el último informe. El trabajo sin commitear no aparece |
| Aborta por la carpeta de Drive | Google Drive para escritorio cerrado o sin sincronizar |
| Falla la conversión a PDF | Word ocupado con un cuadro de diálogo abierto; cerrarlo y reintentar |
| Rechazo de Gmail al enviar | Contraseña de aplicación revocada o mal copiada |
