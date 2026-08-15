#!/usr/bin/env bash
# Corre la prueba de una migración contra la base.
#
# EL PROBLEMA QUE RESUELVE. Las migraciones se verificaban a mano, escribiendo el escenario en el
# chat y mirando el resultado. Funcionaba —así se encontraron los diez defectos del congelado de
# sueldos— pero la verificación no quedaba en ningún lado: si alguien rompe un trigger dentro de
# tres meses, nadie se entera.
#
# Ahora cada prueba es un archivo en packages/db/pruebas/ que se puede volver a correr.
#
# CÓMO ESTÁN ESCRITAS. Cada prueba monta su escenario y termina lanzando una excepción con el
# resultado. Eso aborta la transacción, así que **no deja ni una fila**. El "error" final ES la
# salida esperada: se lee la línea RESULTADO.
#
# Uso:
#   bash tools/probar-migracion.sh 0072      # una
#   bash tools/probar-migracion.sh           # todas
#
# Necesita psql y SUPABASE_DB_URL. Si no los hay, imprime el archivo para correrlo por el MCP de
# Supabase, que es como se corrieron la primera vez.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

DIR="packages/db/pruebas"
FILTRO="${1:-}"

archivos=$(ls "$DIR"/*.prueba.sql 2>/dev/null | { [ -n "$FILTRO" ] && grep "/$FILTRO" || cat; })

if [ -z "$archivos" ]; then
  echo "No encontré ninguna prueba${FILTRO:+ para $FILTRO} en $DIR/"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1 || [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "Sin psql o sin SUPABASE_DB_URL — no puedo correrlas desde acá."
  echo
  echo "Corré cada una por el MCP de Supabase (execute_sql, proyecto scilb) con el contenido de:"
  printf '  %s\n' $archivos
  echo
  echo "La salida esperada es un error P0001 que empieza con 'RESULTADO'. Todo 'ok' = pasa;"
  echo "cualquier 'FALLA' = una promesa de la migración que no se cumple."
  exit 2
fi

fallos=0
for archivo in $archivos; do
  nombre=$(basename "$archivo" .prueba.sql)
  printf '\n\033[1m%s\033[0m\n' "$nombre"

  salida=$(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=0 -f "$archivo" 2>&1)
  resultado=$(printf '%s' "$salida" | grep -o 'RESULTADO.*' | head -1)

  if [ -z "$resultado" ]; then
    echo "  ✗ la prueba no llegó al final. Salida cruda:"
    printf '%s\n' "$salida" | tail -5 | sed 's/^/    /'
    fallos=$((fallos + 1))
    continue
  fi

  printf '  %s\n' "$resultado"
  if printf '%s' "$resultado" | grep -q 'FALLA'; then
    echo "  ✗ hay promesas que no se cumplen"
    fallos=$((fallos + 1))
  else
    echo "  ✓ pasa"
  fi
done

echo
if [ "$fallos" -gt 0 ]; then
  echo "✗ $fallos prueba(s) con fallas."
  exit 1
fi
echo "✓ Todas pasan. Ninguna dejó filas: cada una aborta su propia transacción."
