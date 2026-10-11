#!/usr/bin/env bash
# Aplica migraciones pendientes a la base de Supabase, en orden, cada una atómica y registrada.
#
# EL PROBLEMA QUE RESUELVE. Aplicar una migración con el MCP de Supabase obliga a pegar el SQL
# entero en la conversación: la 0112 son 999 líneas, y las 15 de la release del 7-oct-2026 pasan
# de 4.000. Cuesta contexto, y a veces ni llega: `apply_migration` venció por tiempo y devolvió
# `cancelled` cuatro veces seguidas, dejando la 0111 a medias (funciones auxiliares creadas, el
# cuerpo de `sueldo_liquidacion_cerrar` sin cambiar y nada registrado). Ver docs/aprendizajes.md.
#
# Este script lee los archivos del disco y los manda por la API de gestión de Supabase
# (`POST /v1/projects/{ref}/database/query`). Cada migración corre en UNA transacción junto con su
# fila en `supabase_migrations.schema_migrations`: o queda aplicada y registrada, o no queda nada.
# Se detiene en el primer error. Lo ya registrado se salta, así que se puede volver a correr.
#
# Por defecto NO aplica nada: lista lo que aplicaría. Hay que pasar --ejecutar.
#
# Uso:
#   bash tools/aplicar-migraciones.sh --desde 0111 --excluir 0123            # simulacro
#   bash tools/aplicar-migraciones.sh --desde 0111 --excluir 0123 --ejecutar # aplica
#
# Opciones:
#   --desde NNNN       primera migración a considerar. OBLIGATORIO con --ejecutar: varias migraciones
#                      viejas están registradas con otro nombre (p. ej. `reportes_rls`) y sin --desde
#                      se reaplicarían, incluidas las de pg_cron (0022, 0042)
#   --hasta NNNN       última a considerar
#   --excluir A,B      números que no se aplican (p. ej. 0123, que es del día del cambio de claves)
#   --dir RUTA         carpeta con los .sql (por defecto packages/db/migrations)
#   --proyecto REF     proyecto de Supabase (por defecto, el de SUPABASE_URL)
#   --ejecutar         aplica de verdad
#
# Necesita: curl, jq y SUPABASE_ACCESS_TOKEN. Antes de aplicar en producción: backup.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

DESDE=""; HASTA=""; EXCLUIR=""; DIR="packages/db/migrations"; REF=""; EJECUTAR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --desde)    DESDE="$2"; shift 2 ;;
    --hasta)    HASTA="$2"; shift 2 ;;
    --excluir)  EXCLUIR="$2"; shift 2 ;;
    --dir)      DIR="$2"; shift 2 ;;
    --proyecto) REF="$2"; shift 2 ;;
    --ejecutar) EJECUTAR=1; shift ;;
    -h|--help)  sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done

for c in curl jq; do
  command -v "$c" >/dev/null 2>&1 || { echo "Falta $c." >&2; exit 2; }
done
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || { echo "Falta SUPABASE_ACCESS_TOKEN." >&2; exit 2; }
[ -n "$REF" ] || REF=$(printf '%s' "${SUPABASE_URL:-}" | sed -E 's#https://([^.]+)\..*#\1#')
[ -n "$REF" ] || { echo "No sé qué proyecto: pasa --proyecto REF." >&2; exit 2; }
[ -d "$DIR" ] || { echo "No existe la carpeta $DIR." >&2; exit 2; }

API="https://api.supabase.com/v1/projects/$REF/database/query"

# Ejecuta SQL (texto) y deja la respuesta en $RESP; devuelve 0 si la API respondió 2xx.
sql() {
  local cuerpo codigo
  cuerpo=$(jq -n --arg q "$1" '{query: $q}')
  codigo=$(curl -sS -m 600 -o /tmp/aplicar-mig.resp -w '%{http_code}' -X POST "$API" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' \
    --data-binary "$cuerpo") || { RESP="sin respuesta de la API"; return 1; }
  RESP=$(cat /tmp/aplicar-mig.resp); rm -f /tmp/aplicar-mig.resp
  [ "${codigo:0:1}" = "2" ]
}

sql "select name from supabase_migrations.schema_migrations" || { echo "No pude leer el registro: $RESP" >&2; exit 1; }
REGISTRADAS=$(printf '%s' "$RESP" | jq -r '.[].name')

echo "Proyecto: $REF   Carpeta: $DIR   Modo: $([ $EJECUTAR = 1 ] && echo APLICAR || echo simulacro)"

pendientes=()
for f in $(ls "$DIR"/[0-9][0-9][0-9][0-9]_*.sql 2>/dev/null | sort); do
  base=$(basename "$f" .sql); num=${base:0:4}
  [ -n "$DESDE" ] && [[ "$num" < "$DESDE" ]] && continue
  [ -n "$HASTA" ] && [[ "$num" > "$HASTA" ]] && continue
  case ",$EXCLUIR," in *",$num,"*) echo "  excluida   $base"; continue ;; esac
  printf '%s\n' "$REGISTRADAS" | grep -qx "$base" && { echo "  ya aplicada $base"; continue; }
  pendientes+=("$f")
done

if [ "$EJECUTAR" = 1 ] && [ -z "$DESDE" ]; then
  echo "Con --ejecutar hay que indicar --desde NNNN. Sin él, el registro no reconoce las migraciones" >&2
  echo "viejas que se aplicaron con otro nombre y se reaplicarían (incluidas 0022 y 0042, de pg_cron)." >&2
  exit 2
fi

echo "A aplicar: ${#pendientes[@]}"
for f in "${pendientes[@]}"; do echo "  -> $(basename "$f")"; done
[ "$EJECUTAR" = 1 ] || { echo "Simulacro: no se aplicó nada. Agrega --ejecutar."; exit 0; }
[ "${#pendientes[@]}" -gt 0 ] || exit 0

for f in "${pendientes[@]}"; do
  base=$(basename "$f" .sql)
  contenido=$(cat "$f")
  tag="mig$(date +%s%N)"
  case "$contenido" in *"$tag"*) echo "Etiqueta de comillas en uso en $base" >&2; exit 1 ;; esac
  echo -n "Aplicando $base ... "
  if sql "begin;
$contenido
;
insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISS'), '$base', array[\$$tag\$$contenido\$$tag\$]);
commit;"; then
    sql "select 1 from supabase_migrations.schema_migrations where name = '$base'" \
      && [ "$(printf '%s' "$RESP" | jq 'length')" = "1" ] \
      && echo "ok (registrada)" \
      || { echo "APLICADA PERO SIN REGISTRO: revisa $base" >&2; exit 1; }
  else
    echo "ERROR"
    printf '%s\n' "$RESP" | jq -r '.message // .' >&2
    echo "Se detiene aquí. $base no quedó registrada; las siguientes no se tocaron." >&2
    exit 1
  fi
  sleep 1   # `version` es la marca de tiempo al segundo y es clave primaria
done
echo "Listo: ${#pendientes[@]} migración(es) aplicadas."
