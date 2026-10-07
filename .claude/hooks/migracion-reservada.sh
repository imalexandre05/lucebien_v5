#!/bin/sh
# Hook de reserva de migraciones — SCI-LB
#
# BLOQUEA escribir o editar una migración cuyo número no esté reservado y commiteado.
#
# EL PROBLEMA QUE RESUELVE. El número es la identidad de una migración. Dos ramas paralelas ven la
# misma "última", las dos escriben la siguiente, y el choque no aparece hasta el merge — cuando una
# de las dos ya está aplicada en producción. Pasó el 14-ago-2026 entre feat/mi-talla-db y
# feat/sueldos-motor, con CUATRO migraciones ya aplicadas.
#
# El guard lo detecta, pero lo detecta tarde: cuando ya escribiste la migración entera. Este hook
# lo detecta antes de la primera línea.
#
# QUÉ EXIGE, en orden:
#   1. Que el número no esté tomado por otra rama.
#   2. Que el archivo esté COMMITEADO. Reservar sin commitear no reserva nada: la siguiente
#      sección no lo ve.
#
# Sólo se mete con packages/db/migrations/*.sql. Cualquier otro archivo pasa sin que el hook
# haga nada.
#
# Entrada: JSON de PreToolUse por stdin.
# Salida:  JSON con permissionDecision "deny", o nada (silencio = permitir).

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

entrada=$(cat)

# El file_path viene con las barras invertidas de Windows escapadas (D:\\Sistemas\\...).
ruta=$(printf '%s' "$entrada" \
  | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  | sed 's|\\\\|/|g; s|\\|/|g')

[ -z "$ruta" ] && exit 0

# ¿Es una migración? Si no, este hook no tiene nada que decir.
case "$ruta" in
  *packages/db/migrations/*.sql) ;;
  *) exit 0 ;;
esac

archivo=$(basename "$ruta")
numero=$(printf '%s' "$archivo" | sed -n 's/^\([0-9][0-9][0-9][0-9]\).*/\1/p')

denegar() {
  # El motivo viaja DENTRO de un JSON, así que no puede llevar comillas dobles ni saltos de línea
  # reales: una comilla sin escapar rompe el objeto y el hook queda mudo justo cuando tenía algo
  # que decir. Se escapan por las dudas, y los mensajes de acá abajo usan comillas simples.
  motivo=$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$motivo"
  exit 0
}

if [ -z "$numero" ]; then
  denegar "El nombre de una migración empieza con cuatro dígitos: 00NN_descripcion.sql. Reservá el número con: bash tools/reservar-migracion.sh <slug>"
fi

# ── 1) ¿Otra rama ya tiene este número con otro nombre? ─────────────────────────────────────
rama_actual=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
for ref in $(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes 2>/dev/null); do
  [ "$ref" = "$rama_actual" ] && continue
  [ "$ref" = "origin/$rama_actual" ] && continue
  ajeno=$(git ls-tree --name-only "$ref" packages/db/migrations/ 2>/dev/null \
          | sed 's|.*/||' | grep "^${numero}" | head -1)
  if [ -n "$ajeno" ] && [ "$ajeno" != "$archivo" ]; then
    denegar "El número ${numero} ya es de ${ajeno} en la rama ${ref}. Dos migraciones con el mismo número chocan en el merge, cuando una ya está aplicada en produccion. Pedí uno libre con: bash tools/reservar-migracion.sh <slug>"
  fi
done

# ── 1b) Lo mismo contra el REMOTO, consultado de verdad ─────────────────────────────────────
# Las sesiones en la nube clonan sólo su rama: el bucle de arriba no ve las demás. Sin red no se
# adivina: se deniega con un mensaje claro.
remotas=$(bash -c '. tools/lib-migraciones-remotas.sh; migraciones_remotas'); rc=$?
if [ "$rc" -eq 2 ]; then
  denegar "No se pudo consultar el remoto para saber si el número ${numero} está libre en las otras ramas (sin red?). No se elige un número a ciegas. Reintentá con red."
fi
ajeno=$(printf '%s\n' "$remotas" | awk -F'\t' -v n="$numero" -v a="$archivo" -v r="origin/$rama_actual" '$1==n && $2!=a && $3!=r {print $2 " en la rama " $3; exit}')
if [ -n "$ajeno" ]; then
  denegar "El número ${numero} ya es de ${ajeno}. Dos migraciones con el mismo número chocan en el merge, cuando una ya está aplicada en produccion. Pedí uno libre con: bash tools/reservar-migracion.sh <slug>"
fi

# ── 2) ¿Está commiteada la reserva? ─────────────────────────────────────────────────────────
# Sin commit, la reserva no existe para nadie más: la siguiente sección va a elegir el mismo
# número porque no lo ve en ninguna rama.
if ! git ls-files --error-unmatch "packages/db/migrations/$archivo" >/dev/null 2>&1; then
  if [ -f "packages/db/migrations/$archivo" ]; then
    denegar "La reserva de ${archivo} todavía no está commiteada, así que ninguna otra rama la ve. Commiteala antes de escribirla: git add packages/db/migrations/${archivo} && git commit -m 'chore(migration): reserva ${numero}' && git push"
  fi
  denegar "${archivo} no está reservada. No elijas el número a mano: dos ramas paralelas eligen el mismo. Corré: bash tools/reservar-migracion.sh <slug>  — crea el archivo con el próximo número libre mirando TODAS las ramas. Después commiteá la reserva y recién ahí escribí la migración."
fi

exit 0
