# Migraciones pendientes — listas para pegar

Cada archivo se abre, se copia **entero**, se pega en el editor SQL de Supabase y se le da Run.

**Dónde:** [supabase.com/dashboard](https://supabase.com/dashboard) → proyecto `scilb` → **SQL
Editor** (barra izquierda) → **New query** → pegar → **Run** (o Ctrl+Enter).

## El orden

| # | Archivo | Qué hace | ¿Deja algo escrito? |
|---|---|---|---|
| 1 | `1-probar-0079.sql` | Prueba la corrección del huellero contra los datos reales | **No.** Termina en rojo a propósito |
| 2 | `2-aplicar-0079.sql` | Aplica la corrección | Sí: reemplaza una función y agrega una fila de config |
| 3 | `3-rederivar-huellero.sql` | Recupera los días perdidos | **Sí, escribe asistencias.** Va bloque por bloque |
| 4 | `4-probar-0077-y-0076.sql` | Prueba la 0077 **y la 0076 juntas**. Su caso 1 falla a propósito mientras la 0076 no esté aplicada — ver el encabezado del archivo | No |
| 5 | `5-aplicar-0077.sql` | La aplica. **No cambia ningún monto** | Sí |
| 6 | `6-probar-0078.sql` | Prueba que las pausas dejen de pagarse | No |
| 7 | `7-aplicar-0078.sql` | La aplica. **Baja lo que cobra quien tenga huecos reales** | Sí |
| 8 | `8-aplicar-0076-CUIDADO.sql` | La meta de la semana larga. **Mueve hasta S/76,40 por persona por mes** | Sí. Leer el encabezado antes |

**El caso 1 del archivo 4 va a decir `FALLA` hasta que apliques la 0076.** Es el archivo de
prueba compartido de las dos migraciones, y ese caso comprueba justamente la que dejaste para el
final. Los casos 2 al 6 son los de la 0077.

El 7 tiene que ir **después** del 5: la 0078 rehace una restricción que necesita el parámetro que
agrega la 0077.

## Lo que hay que mirar en cada prueba

Las pruebas terminan con un error rojo **a propósito**: así Postgres deshace todo y no queda nada
escrito. En el texto del error buscá la palabra `RESULTADO`:

```
ERROR: RESULTADO 1=ok 2=ok 3=ok 4=ok 5=ok 6=ok 7=ok 8=ok 9=ok
```

Si alguno dice `FALLA`, parás ahí y copiás la línea entera.

## Cómo volver atrás

- **La 0079** reemplaza una función: se vuelve ejecutando la versión anterior, que está en
  `packages/db/migrations/0075_huellero_asistencias.sql`, líneas 258 a 485.
- **La 0076** es un solo valor: `update config set valor = 'true' where clave = 'sueldo_meta_semanal_fija';`
- **El paso 3** deja una copia (`asistencias_respaldo_20260821`) antes de tocar nada.

> Los archivos de acá son **copias** de `packages/db/migrations/` y `packages/db/pruebas/`, unidas
> para poder pegarlas de una. El original sigue siendo el del repo: si hay que corregir algo, se
> corrige allá y se vuelve a generar esto.
