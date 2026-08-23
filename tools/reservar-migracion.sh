#!/usr/bin/env bash
# Reserva el próximo número de migración de SCI-LB.
#
# EL PROBLEMA QUE RESUELVE. Las migraciones van numeradas y se aplican en orden. Cuando dos
# personas (o dos agentes) trabajan en paralelo, las dos miran `packages/db/migrations/`, las dos
# ven que la última es la 0069, y las dos escriben una 0070. El choque no aparece hasta el merge,
# cuando una de las dos ya está aplicada en producción y la otra tiene que renumerarse entera.
#
# Ya pasó una versión chica de esto el 14-ago-2026: la spec de sueldos decía 0067 y ese número se
# lo había llevado la migración de aislamiento.
#
# CÓMO LO RESUELVE. No mira sólo el directorio de trabajo: mira TODAS las ramas, locales y
# remotas. Si otra rama ya reservó la 0070, esta reserva la 0071 aunque en tu copia no exista.
#
# Uso:
#   bash tools/reservar-migracion.sh sueldos_pantallas
#   bash tools/reservar-migracion.sh --ver          # sólo informa, no crea nada
#
# Crea el archivo con su encabezado y lo deja listo para editar. COMMITEÁ Y PUSHEÁ la reserva
# antes de escribir la migración: es lo que hace que la siguiente persona vea tu número.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

DIR="packages/db/migrations"
SOLO_VER=0
SLUG="${1:-}"

if [ "$SLUG" = "--ver" ]; then SOLO_VER=1; SLUG=""; fi

# ── Todos los números que existen en cualquier parte del repositorio ────────────────────────
# 1) El directorio de trabajo (incluye lo que todavía no commiteaste).
numeros=$(ls "$DIR" 2>/dev/null | grep -oE '^[0-9]{4}' || true)

# 2) Cada rama local y remota. `git ls-tree` no necesita hacer checkout de nada.
for ref in $(git for-each-ref --format='%(refname)' refs/heads refs/remotes 2>/dev/null); do
  otros=$(git ls-tree --name-only "$ref" "$DIR/" 2>/dev/null \
          | sed "s|^$DIR/||" | grep -oE '^[0-9]{4}' || true)
  numeros=$(printf '%s\n%s' "$numeros" "$otros")
done

ultimo=$(printf '%s\n' "$numeros" | grep -E '^[0-9]{4}$' | sort -n | tail -1)
ultimo=${ultimo:-0000}
siguiente=$(printf '%04d' $((10#$ultimo + 1)))

# ── Dónde está tomado cada número, para que el aviso sea útil ───────────────────────────────
if [ -f "$DIR/${ultimo}"*.sql ] 2>/dev/null || ls "$DIR/${ultimo}"* >/dev/null 2>&1; then
  donde="en tu copia de trabajo"
else
  donde="en otra rama (todavía no está en tu copia)"
fi

echo "Migraciones de SCI-LB"
echo "  última reservada: ${ultimo} — ${donde}"
echo "  próxima libre:    ${siguiente}"

if [ "$SOLO_VER" -eq 1 ]; then exit 0; fi

if [ -z "$SLUG" ]; then
  echo
  echo "Falta el nombre. Uso: bash tools/reservar-migracion.sh <slug_en_minusculas>"
  exit 1
fi

if ! printf '%s' "$SLUG" | grep -qE '^[a-z0-9_]+$'; then
  echo
  echo "El nombre va en minúsculas, números y guiones bajos: '$SLUG' no sirve."
  exit 1
fi

ARCHIVO="$DIR/${siguiente}_${SLUG}.sql"
if [ -e "$ARCHIVO" ]; then
  echo "Ya existe $ARCHIVO. Nada que hacer."
  exit 1
fi

cat > "$ARCHIVO" <<PLANTILLA
-- ${siguiente}_${SLUG}.sql — <qué hace, en una línea>
--
-- Implementa <docs/superpowers/specs/.../SPEC-....md §N>.
--
-- Idempotente: se puede reaplicar sin fallar. Cada \`create\` lleva su \`if not exists\` y cada
-- restricción que no lo soporta va envuelta en un \`do \$\$ ... \$\$\` que consulta pg_constraint.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema \`private\` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA \`private.app_es_almacen()\` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25).
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. Con RLS activa y sólo
--     select, las escrituras fallan en silencio.
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5).

PLANTILLA

echo
echo "Reservada: $ARCHIVO"
echo
echo "Commiteá la reserva antes de escribirla, así el resto ve tu número:"
echo "  git add $ARCHIVO && git commit -m \"chore(migration): reserva ${siguiente} para ${SLUG}\""
