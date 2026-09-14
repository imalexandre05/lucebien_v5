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
  empleado_id   uuid  → empleados(id) on delete restrict  -- corregido tras el verificador: NO cascade.
                                                            -- Este sistema no borra empleados de verdad
                                                            -- (se suspende); si algún día se agrega un
                                                            -- borrado real, tiene que fallar ruidoso acá
                                                            -- y obligar a decidir qué hacer con los
                                                            -- documentos, no llevárselos en silencio.
  nombre_archivo text
  tipo_mime     text   check (∈ {jpeg, png, webp, pdf})
  tamano_bytes  bigint check (0 < x <= 10 MB)
  storage_path  text unique check (empieza con '{empleado_id}/')
  subido_por    uuid  → empleados(id) on delete set null, default auth.uid() — nunca lo fija el cliente
  subido_en     timestamptz default now() — nunca lo fija el cliente
```

Los tres `check` y el `default`/columnas-fuera-del-grant de `subido_por`/`subido_en` se agregaron
tras la revisión del verificador (ver `docs/aprendizajes.md`): sin ellos, quien pasara la policy de
admin podía declarar un PDF de 20 MB como `image/jpeg` de 1 KB, o fecharlo y atribuirlo a mano.

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

**Corrección del 08-sep-2026 tras el verificador:** la primera versión de esta spec citaba esto
como "el mismo criterio que Mi Talla", pero `docs/superpowers/specs/2026-08-13-mi-talla-design.md`
no dice nada sobre el orden de escritura, y el código de Mi Talla vive en otro repo (LB-Web) sin
ninguna migración `.sql` propia commiteada en ningún lado citable — no había nada de qué copiar
literalmente. La razón es la de acá abajo, sola, no una que ya estuviera escrita en otro lado
(no-negociable 7: no se verifica un documento contra otro documento).

Al subir, la fila de metadatos se inserta **antes** que el archivo llegue a Storage. Si la subida
falla después, queda una fila huérfana **visible** (se puede listar, se ve que algo no se
completó) en vez de un archivo huérfano en Storage que ninguna consulta a la base puede encontrar.

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
borrar metadatos (leyendo el resultado como administrador de la base, nunca en el rol restringido
— confundir "no lo veo" con "se borró" fue el primer error de esta prueba, que el verificador
encontró antes de aplicar), que un no-admin no puede ninguna de las dos cosas (por policy y por
privilegio de columna), que los tres `check` nuevos (tipo, tamaño, prefijo del path) rechazan lo
que prometen, que `on delete restrict` frena borrar a un empleado con documentos, y que el bucket
y sus tres policies de `storage.objects` quedaron con la configuración exacta de la spec — no sólo
que existan, también que su expresión mencione el bucket y el guard.

**Pendiente, a propósito:** no hay forma de simular una subida de archivo real desde SQL puro
(Storage recibe el binario por la API REST). La subida real queda por probar a mano contra `scilb`
desde la pantalla una vez que exista el código de la Server Action — no se afirma hecho hasta que
lo esté (no-negociable 7: la primera versión de esta línea decía "se probó a mano" sin haber
ocurrido, porque ni la tabla ni el bucket existían todavía en ese momento).

**Aviso para quien escriba la Server Action:** usar `getServerClient()` (respeta RLS), nunca
`getAdminClient()` — el cliente admin bypassa las dos capas de RLS de esta spec (`empleado_documentos`
y `storage.objects`) y las dejaría decorativas, además de sumar un séptimo archivo a la lista
restringida del no-negociable 3.
