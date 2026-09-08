# SPEC — C-3: adjuntar documentos a un colaborador (DNI, CV, imágenes)

> **Zona de rigor:** nivel 3 (migración + Storage + datos de personas — no-negociable 3).
>
> Implementa **C-3** de [la hoja de ruta del 25-ago](../2026-08-25-reunion-admin-hoja-de-ruta.md):
> *«y también se pueda adjuntar imágenes, CVs, DNIs»*.

## 1. Decisiones confirmadas con Alexander el 08-sep-2026

Tres preguntas de política de seguridad que no correspondía inventar en silencio (no-negociable 5
aplicado acá a seguridad, no a plata):

| Pregunta | Respuesta |
|---|---|
| ¿Quién ve los adjuntos de una persona? | Sólo admin/dueño — ni siquiera la propia persona desde su sesión |
| ¿Quién puede borrar un adjunto? | Sólo admin/dueño |
| Límite de tamaño y tipo | 10 MB, imágenes (jpeg/png/webp) + PDF |

## 2. Dónde vive

Dentro de `/personal/[id]/datos` (`app/personal/[id]/datos/page.tsx`), que **ya** es una pantalla
100% admin/dueño (`if (!esAdmin) return <EmptyState.../>` antes de renderizar nada) — no hace
falta ningún gate nuevo, el que ya existe cubre exactamente lo que Alexander pidió. Se agrega como
una tarjeta más dentro de `DatosCliente`, no como una pestaña nueva: es una extensión del mismo
expediente, no un flujo separado.

## 3. Esquema

```
empleado_documentos
  id            uuid pk
  empleado_id   uuid  → empleados(id) on delete cascade   -- si se borra a alguien, sus adjuntos también
  nombre_archivo text
  tipo_mime     text
  tamano_bytes  bigint
  storage_path  text unique                                -- '{empleado_id}/{uuid}.{ext}'
  subido_por    uuid  → empleados(id) on delete set null
  subido_en     timestamptz
```

Sin columna de "categoría" (DNI/CV/foto): no se pidió clasificarlos, sólo poder adjuntarlos — el
nombre del archivo ya lo dice. Inventar una taxonomía fija es exactamente lo que el no-negociable 5
pide evitar cuando nadie la pidió.

Bucket de Storage `empleado-documentos`, **privado** (`public = false`), con
`file_size_limit = 10485760` (10 MB) y `allowed_mime_types` restringido a
`image/jpeg, image/png, image/webp, application/pdf` — el límite se aplica en tres capas: el
`<input accept>` en el cliente (UX), el `file_size_limit`/`allowed_mime_types` del bucket (Storage
lo rechaza aunque el cliente mienta), y una comprobación server-side en la Server Action antes de
subir (mensaje de error legible en vez del error crudo de Storage).

## 4. RLS — sólo admin/dueño, en las dos capas

`empleado_documentos` (tabla): policy única de admin para `select`/`insert`/`delete` — no hace falta
`update`, un adjunto no se edita, se reemplaza (subir uno nuevo, borrar el viejo).

`storage.objects` para `bucket_id = 'empleado-documentos'`: misma condición
(`private.app_es_admin()`), en las tres operaciones que se usan (`select` para descargar/previsualizar,
`insert` para subir, `delete` para borrar).

## 5. Orden de escritura — metadatos antes que archivo, y al revés para borrar

Mismo criterio que Mi Talla (Fase de medición corporal, `mt_medicion_imagen`): al subir, la fila de
metadatos se inserta **antes** que el archivo llegue a Storage. Si la subida falla después, queda
una fila huérfana **visible** (se puede listar, se ve que algo no se completó) en vez de un archivo
huérfano en Storage que ninguna consulta a la base puede encontrar.

Al borrar es al revés **a propósito**, por el mismo principio aplicado en la dirección contraria:
se borra el archivo de Storage primero y la fila de metadatos después. Si el borrado de la fila
fallara, quedaría una fila apuntando a un archivo que ya no existe — visible y corregible — en vez
de un archivo sin ningún rastro en la base.

## 6. Qué NO hace esta versión

- No hay previsualización de imágenes embebida ni lector de PDF — sólo nombre, tamaño, fecha y un
  enlace de descarga (URL firmada, expira). Antes de invertir en un visor había que tener el
  guardado funcionando y probado.
- No hay versionado de adjuntos: subir uno nuevo no reemplaza automáticamente uno viejo del mismo
  "tipo" (no existe el concepto de tipo, ver §3) — cada subida es una fila nueva, y borrar una vieja
  es una acción separada y explícita del administrador.

## 7. Cómo se prueba

`packages/db/pruebas/0105_empleado_documentos.prueba.sql`: comprueba que un admin puede insertar y
borrar metadatos, que un no-admin no puede ninguna de las dos cosas, y que el bucket quedó creado
con `public = false`, el `file_size_limit` y los `allowed_mime_types` correctos. Las políticas de
`storage.objects` se comprueban por lectura de `pg_policies` (no hay forma de simular una subida de
archivo real desde SQL puro) — la subida real se probó a mano contra `scilb` desde la pantalla.
