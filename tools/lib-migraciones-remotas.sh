#!/usr/bin/env bash
# Biblioteca (se hace `source`, no se ejecuta): lista las migraciones de TODAS las ramas del
# remoto `origin`, sin depender de lo que el clon local conozca.
#
# EL PROBLEMA. Las sesiones en la nube clonan SÓLO su rama (shallow, single-branch). Ahí
# `git for-each-ref refs/remotes` devuelve una sola rama, y el número "libre" que sale de mirar
# ramas locales es el mismo que eligió otra sesión. Pasó el 05-oct-2026: dos sesiones tomaron
# 0112 y 0113, que ya estaban usados.
#
# CÓMO. `git ls-remote --heads origin` dice qué ramas existen (y falla si no hay red). Después un
# solo `git fetch --depth=1 --filter=blob:none` trae el último commit de cada una a refs
# temporales (sin blobs: sólo se necesitan los nombres de archivo, que viven en los árboles), se
# listan con `git ls-tree` y se borran los refs temporales.
#
# Salida de `migraciones_remotas`: líneas `NNNN<TAB>nombre.sql<TAB>origin/rama`.
# Código de retorno: 0 bien · 3 no hay remoto `origin` configurado · 2 sin red o fetch fallido.

SCILB_MIG_DIR="${SCILB_MIG_DIR:-packages/db/migrations}"
SCILB_TMP_REFS="refs/scilb-tmp"

migraciones_remotas() {
  git remote get-url origin >/dev/null 2>&1 || return 3

  local ramas
  if ! ramas=$(timeout 60 git ls-remote --heads origin 2>/dev/null); then
    echo "No se pudo consultar el remoto 'origin' (git ls-remote falló): sin red o sin permiso." >&2
    return 2
  fi
  [ -z "$ramas" ] && return 0

  # Un solo fetch para todas las ramas. Si el servidor no soporta --filter se reintenta sin él.
  local refspec="+refs/heads/*:${SCILB_TMP_REFS}/*"
  if ! timeout 180 git fetch --quiet --depth=1 --no-tags --filter=blob:none origin "$refspec" 2>/dev/null \
     && ! timeout 180 git fetch --quiet --depth=1 --no-tags origin "$refspec" 2>/dev/null; then
    echo "No se pudieron traer las ramas del remoto 'origin' (git fetch falló)." >&2
    return 2
  fi

  local ref nombre
  while read -r ref; do
    nombre=${ref#"${SCILB_TMP_REFS}/"}
    git ls-tree --name-only "$ref" "$SCILB_MIG_DIR/" 2>/dev/null \
      | sed 's|.*/||' | grep -E '^[0-9]{4}.*\.sql$' \
      | awk -v r="origin/$nombre" '{printf "%s\t%s\t%s\n", substr($0,1,4), $0, r}'
    git update-ref -d "$ref"
  done < <(git for-each-ref --format='%(refname)' "$SCILB_TMP_REFS")
  return 0
}
