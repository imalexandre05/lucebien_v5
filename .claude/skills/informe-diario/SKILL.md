---
name: informe-diario
description: Use when Alexander asks for the daily or weekly progress report for the LuceBien owner ("informe diario", "informe de avances", "genera el informe", "envía el informe"). Collects the work done since the last report from git, writes a short executive report in Word using the established template, and — only after Alexander approves — converts it to PDF, copies it to the shared Google Drive folder and emails it to the owner.
---

# Informe de avances para el dueño

Genera el informe que lee el dueño de LuceBien. Él no es técnico: el informe existe para que
entienda qué se avanzó, pueda **verificarlo por su cuenta** y tenga dónde opinar.

Dos modos:

- **Diario** (por defecto): el trabajo hecho desde el último informe diario.
- **Semanal** (`/informe-diario semanal`): consolidado con la estructura de 8 secciones de los
  informes 2, 3 y 4, que es la que el dueño ya conoce.

## Reglas

1. **Nunca enviar sin aprobación explícita de Alexander.** El flujo se detiene siempre en el
   borrador. `enviar.mjs` sólo se ejecuta cuando él confirma que está conforme.
2. **Escribir para el dueño, no para un programador.** Nada de "RPC", "migración", "commit",
   "endpoint" o "RLS" fuera del anexo técnico. En lugar de "se agregó la RPC de envío", escribir
   "la tienda ya puede mandar prendas a lavar desde el sistema".
3. **Corto y fácil.** Un informe que no se lee no sirve para que el dueño opine. Frases cortas,
   un dato por frase, cifras concretas. Los límites están en el paso 2 y `generar.mjs` avisa
   cuando se pasan. Ante la duda, cortar: lo que no cambia una decisión suya, sobra.
4. **No repetir el informe anterior.** `recolectar.mjs` devuelve en `anterior` todo lo que el
   dueño ya leyó. Nada de eso se vuelve a contar. Lo que sigue abierto se nombra en una línea;
   lo que cambió sí se cuenta, diciendo **qué** cambió respecto de lo anterior.
5. **No inventar.** Si un commit no permite saber qué cambió para la operación, revisar ese
   archivo puntual — no el repositorio entero. Si aun así no queda claro, preguntarle a Alexander
   antes de escribirlo.
6. **Gastar pocos tokens.** El JSON de `recolectar.mjs` alcanza para el 90% del informe. No leer
   código salvo que un commit sea ambiguo.
7. **La sección "Cómo revisarlo" es obligatoria y concreta.** Ruta exacta del menú y qué debería
   ver. Si la entrega no tocó ninguna pantalla, decirlo con todas las letras para que no la
   busque, y darle algo que sí pueda verificar: una cifra contra su Excel, una lista contra sus
   propios pedidos.
8. **Si no hubo trabajo, no inventar un informe.** Avisarle a Alexander y detenerse.
9. **Un requerimiento pasa a `listo` sólo con verificación.** El registro `docs/requerimientos-dueno.md` es
   la fuente de verdad del estado; cambiarlo exige haber mirado el código o la base, nunca otro
   documento. Es el no-negociable 7 de `CLAUDE.md` aplicado a lo que el dueño lee.

## Paso 1 — Recolectar

```bash
node tools/informe-diario/recolectar.mjs                 # diario
node tools/informe-diario/recolectar.mjs --tipo semanal  # semanal
```

Devuelve los commits de la sesión, los módulos tocados, las migraciones, los totales, el trabajo
que todavía no entró a un commit (`sinCommitear`), la ruta donde guardar el JSON nuevo
(`archivoASalvar`) y **`anterior`**: lo que el dueño ya leyó en el informe pasado. El informe
cubre **la sesión de trabajo**, no el día calendario: el corte va desde el último informe
publicado hasta ahora.

- Si viene `aviso`, hay trabajo sin commitear: proponerle a Alexander commitearlo antes de
  generar el informe, para que la descripción que lee el dueño quede también en el historial.
- Si `sinTrabajo` es `true`, no hay nada que informar. Avisar y detenerse.
- **Leer `anterior` antes de redactar.** Sus listas (`yaContado`, `yaPedidoQueRevise`,
  `decisionesYaPlanteadas`, `pendientesYaListados`, `riesgosYaAvisados`) son lo que **no** va en
  este informe. Un pendiente que sigue abierto se menciona en una línea, no se vuelve a explicar.
  Una decisión ya planteada se repite sólo si sigue bloqueando algo, y en ese caso se dice desde
  cuándo espera.

## Paso 1b — Requerimientos del dueño (secundario)

El informe trata sobre **el trabajo de esta sesión**. El registro de requerimientos es un
complemento: su sección aparece en el documento sólo si algo se movió en esta entrega o si algo
lo está esperando al dueño. Si no, se omite sola. No hace falta forzarla.

Si el trabajo de la sesión resolvió, destrabó o dejó a medias alguno de los requerimientos de
`docs/requerimientos-dueno.md`, actualizar ahí su `Estado` y su fecha de `Actualizado`. Estados:
`listo`, `curso`, `problema`, `apoyo`, `pendiente`, `revisar` — descritos en la cabecera de ese
archivo. `pendiente` es "se miró y falta"; `revisar` es "nadie lo miró todavía": no confundirlos.

Para consultarlo sin leer el archivo entero:

```bash
node tools/informe-diario/requerimientos.mjs                    # resumen por estado
node tools/informe-diario/requerimientos.mjs --estado apoyo     # los frenados esperando al dueño
node tools/informe-diario/requerimientos.mjs --desde 2026-08-12 # los que se movieron
```

Un requerimiento nuevo que el dueño mande por correo o por WhatsApp se agrega al final de su zona con
el siguiente número libre. `generar.mjs` lee este registro solo: no hay que copiar nada de él
dentro del JSON del informe.

`requerimientosDesde` filtra qué movimientos se listan. Usar la fecha de **hoy**: los cambios de
estado de esta sesión son los que valen. Poner una fecha vieja vuelca los 150 al documento.

## Paso 2 — Redactar el JSON del informe

Guardarlo en la ruta que indicó `archivoASalvar` (`tools/informe-diario/informe-003.json` y
siguientes). Un archivo por informe, numerado: el informe siguiente lo lee para no repetirse.
`numero` sale de `numeroSugerido`; `fecha` es la de hoy en formato `AAAA-MM-DD`.

```jsonc
{
  "tipo": "diario",
  "numero": 3,
  "fecha": "2026-08-15",
  "alcance": "una línea: qué frente se tocó",
  "estado": "Publicado en la nube · en uso interno",
  "requerimientosDesde": "2026-08-15",         // hoy: sólo lo que se movió en esta entrega
  "resumen": ["párrafo 1", "párrafo 2"],       // 1-2 párrafos, hasta 120 palabras cada uno
  "enUnaLinea": "el avance del día en una frase que entienda cualquiera",
  "hecho": [                                    // lo del día, en lenguaje de negocio
    { "modulo": "…", "cambio": "…", "estado": "✅ Nuevo | ✅ Corregido | ✅ Ampliado | 🔄 En curso" }
  ],
  "revisar": [                                  // obligatorio
    { "que": "…", "donde": "Menú → … → …", "esperado": "qué debería ver" }
  ],
  "decisiones": ["reglas de negocio pendientes de confirmar"],  // opcional
  "pendientes": [
    { "pendiente": "…", "depende": "De mí | De la empresa", "cuando": "…" }
  ],
  "riesgos": ["sólo si algo no salió o quedó a medias"],        // opcional, se omite si vacío
  "anexo": ["2-4 líneas técnicas: migraciones, pruebas, totales"]
}
```

**Cuánto escribir** (`generar.mjs` avisa por consola si se pasa, y genera igual):

| Campo | Tope | Criterio de corte |
|---|---|---|
| `resumen` | 2 párrafos, 120 palabras cada uno | Qué cambió para la operación y qué número lo prueba |
| `hecho` | 6 filas | Lo más importante primero. `cambio` en una o dos oraciones |
| `revisar` | 3 puntos | Los que él puede verificar hoy, no los que "podría" |
| `decisiones` | 5 puntos | Sólo lo que bloquea algo. Lo demás espera al informe siguiente |
| `pendientes` | 5 filas | Los que tienen fecha o dueño claro |
| `riesgos` | 3 puntos | Sólo lo que puede costarle plata o tiempo |

Para el **semanal**: `"tipo": "semanal"`, agregar `"desde"` y `"hasta"` (`AAAA-MM-DD`), y
reemplazar `hecho`/`revisar`/`decisiones`/`pendientes` por `estadoGeneral` (`[{area, situacion}]`),
`modulos` (`[{grupo, filas:[{seccion, detalle}]}]`) y las listas `diseno`, `datos`, `seguridad`,
`despliegue`, `proximos`. El semanal es un consolidado: los topes de arriba no lo alcanzan.
`ejemplo-diario.json` sirve de referencia de tono.

Los pendientes que arrastra el proyecto salen de `docs/pendientes-negocio.md`: incluir los que
sigan abiertos **y que el dueño no haya visto ya** en el informe anterior.

## Paso 3 — Generar el borrador

```bash
node tools/informe-diario/generar.mjs tools/informe-diario/informe-003.json
```

Deja el `.docx` en `E:\Lucebien informes\borradores\`. Si avisa que quedó largo, recortar y
volver a generar antes de mostrárselo a Alexander. Después:

1. Mostrarle un resumen corto en el chat: número, alcance, "en una línea", las filas de "Lo que
   se hizo hoy" y los "Puntos donde necesito su decisión".
2. Darle la ruta del archivo para que lo abra.
3. **Esperar.** No continuar hasta que apruebe.

Si el `.docx` está abierto en Word, `generar.mjs` corta con `EBUSY`: pedirle que lo cierre.

## Paso 4 — Publicar (sólo con el visto bueno)

```bash
node tools/informe-diario/enviar.mjs tools/informe-diario/informe-003.json --simular  # ensayo
node tools/informe-diario/enviar.mjs tools/informe-diario/informe-003.json            # de verdad
```

Convierte a PDF, copia a `E:\Lucebien informes\` y a la carpeta de Drive, envía el correo al
dueño con copia a Alexander, y anota el punto de corte para que el próximo informe arranque
donde terminó éste.

El correo lleva el primer párrafo del resumen, la frase "en una línea" y hasta tres puntos de
decisión; si hay más, avisa cuántos quedaron en el PDF. **No le pide al dueño que responda
CONFORME ni que apruebe nada**: el informe se envía para que lea y opine, no para que firme.

Si la carpeta de Drive no está montada, el script aborta sin enviar nada: hay que abrir Google
Drive para escritorio y reintentar.

## Al terminar

Si aparecieron reglas de negocio sin definir, anotarlas en `docs/pendientes-negocio.md` — es la
regla 5 de CLAUDE.md y evita que el mismo hueco se vuelva a inventar en la próxima sesión.

El JSON del informe **se queda en disco**. Es lo que lee `recolectar.mjs` la próxima vez para
saber qué no repetir. No borrarlo.
