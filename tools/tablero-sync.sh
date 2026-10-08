#!/usr/bin/env bash
# Mueve las tarjetas del tablero SCI-LB (GitHub Projects) según el estado de un PR.
#
# EL PROBLEMA QUE RESUELVE. El tablero lleva una tarea por issue de `lucebien-tablero`, y el
# trabajo vive en PR de este repositorio. Mover a mano cada tarjeta cuando su PR cambia de estado
# no se hace, y el tablero deja de decir la verdad.
#
# CÓMO SABE QUÉ TARJETA MOVER. Busca en la descripción del PR referencias a tareas, con cualquiera
# de estas formas (sirven todas, también las líneas `Closes ...` de GitHub):
#     Tablero: imalexandre05/lucebien-tablero#20
#     Closes imalexandre05/lucebien-tablero#20
#     https://github.com/imalexandre05/lucebien-tablero/issues/20
#
# QUÉ COLUMNA PONE (por defecto; se cambian con las variables de abajo):
#     borrador   -> En Progreso
#     listo      -> En revisión
#     mergeado   -> Hecho
#     cerrado    -> no toca nada (un PR cerrado sin merge no dice si la tarea terminó)
# Una tarjeta que ya está en «Hecho» no se saca de ahí, salvo que el PR esté mergeado.
#
# ENTRADA (variables de entorno):
#     PR_BODY      descripción del PR
#     PR_ESTADO    borrador | listo | mergeado | cerrado
#     GH_TOKEN     token con permiso `project` (y `repo`, porque lucebien-tablero es privado)
#     DRY_RUN=1    sólo muestra qué tareas y qué columna detectó; no llama a la API
#
# Sin GH_TOKEN termina en silencio y con éxito: así el workflow no se pone rojo antes de que
# exista el secreto.

set -euo pipefail

PROPIETARIO="${TABLERO_PROPIETARIO:-imalexandre05}"
REPO_TAREAS="${TABLERO_REPO:-lucebien-tablero}"
PROYECTO="${TABLERO_PROYECTO:-2}"
CAMPO="${TABLERO_CAMPO:-Status}"
COL_BORRADOR="${TABLERO_COL_BORRADOR:-En Progreso}"
COL_LISTO="${TABLERO_COL_LISTO:-En revisión}"
COL_MERGEADO="${TABLERO_COL_MERGEADO:-Hecho}"

PR_BODY="${PR_BODY:-}"
PR_ESTADO="${PR_ESTADO:-}"
DRY_RUN="${DRY_RUN:-0}"

aviso() { printf '%s\n' "$*"; }

# ── 1) Qué columna corresponde al estado del PR ─────────────────────────────────────────────
case "$PR_ESTADO" in
  borrador) destino="$COL_BORRADOR" ;;
  listo)    destino="$COL_LISTO" ;;
  mergeado) destino="$COL_MERGEADO" ;;
  cerrado)  aviso "PR cerrado sin merge: no se mueve ninguna tarjeta."; exit 0 ;;
  *)        aviso "PR_ESTADO desconocido ('$PR_ESTADO'). Esperaba borrador, listo, mergeado o cerrado."; exit 1 ;;
esac

# ── 2) Qué tareas menciona la descripción ───────────────────────────────────────────────────
# Dos patrones: `lucebien-tablero#N` y `lucebien-tablero/issues/N`. Sin repetidos, en orden.
tareas=$(printf '%s\n' "$PR_BODY" \
  | grep -oE "${REPO_TAREAS}(#|/issues/)[0-9]+" \
  | grep -oE '[0-9]+$' | sort -un || true)

if [ -z "$tareas" ]; then
  aviso "La descripción del PR no menciona ninguna tarea de ${REPO_TAREAS}. Nada que mover."
  exit 0
fi

aviso "Estado del PR: $PR_ESTADO -> columna «$destino»"
aviso "Tareas mencionadas: $(printf '%s' "$tareas" | tr '\n' ' ')"

if [ "$DRY_RUN" = "1" ]; then
  aviso "DRY_RUN: no se llama a la API."
  exit 0
fi

if [ -z "${GH_TOKEN:-}" ]; then
  aviso "No hay GH_TOKEN (falta el secreto PROJECT_TOKEN del repositorio). No se mueve nada."
  exit 0
fi

command -v gh >/dev/null 2>&1 || { aviso "Falta la CLI gh."; exit 1; }
command -v jq >/dev/null 2>&1 || { aviso "Falta jq."; exit 1; }

# ── 3) El proyecto, su campo de estado y las columnas disponibles ───────────────────────────
proyecto=$(gh api graphql \
  -f query='query($owner:String!,$num:Int!,$campo:String!){
    user(login:$owner){ projectV2(number:$num){ id
      field(name:$campo){ ... on ProjectV2SingleSelectField { id options { id name } } } } } }' \
  -f owner="$PROPIETARIO" -F num="$PROYECTO" -f campo="$CAMPO")

id_proyecto=$(jq -r '.data.user.projectV2.id // empty' <<<"$proyecto")
id_campo=$(jq -r '.data.user.projectV2.field.id // empty' <<<"$proyecto")
if [ -z "$id_proyecto" ] || [ -z "$id_campo" ]; then
  aviso "No encontré el proyecto #$PROYECTO de $PROPIETARIO o su campo «$CAMPO». ¿El token tiene permiso 'project'?"
  exit 1
fi

# Comparación sin distinguir mayúsculas: «En Progreso» y «En progreso» son la misma columna.
id_opcion=$(jq -r --arg d "$destino" \
  '.data.user.projectV2.field.options[] | select(.name|ascii_downcase == ($d|ascii_downcase)) | .id' \
  <<<"$proyecto" | head -1)
if [ -z "$id_opcion" ]; then
  aviso "El campo «$CAMPO» no tiene una columna llamada «$destino». Las que hay:"
  jq -r '.data.user.projectV2.field.options[].name | "  - " + .' <<<"$proyecto"
  exit 1
fi

# ── 4) Mover cada tarjeta ───────────────────────────────────────────────────────────────────
fallos=0
for n in $tareas; do
  tarea=$(gh api graphql \
    -f query='query($owner:String!,$repo:String!,$n:Int!,$campo:String!){
      repository(owner:$owner,name:$repo){ issue(number:$n){ id
        projectItems(first:20){ nodes{ id project{ id }
          fieldValueByName(name:$campo){ ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } }' \
    -f owner="$PROPIETARIO" -f repo="$REPO_TAREAS" -F n="$n" -f campo="$CAMPO" 2>&1) || {
      aviso "#$n: no pude leer la tarea. $tarea"; fallos=$((fallos + 1)); continue; }

  id_issue=$(jq -r '.data.repository.issue.id // empty' <<<"$tarea")
  if [ -z "$id_issue" ]; then
    aviso "#$n: la tarea no existe en ${PROPIETARIO}/${REPO_TAREAS}."
    fallos=$((fallos + 1)); continue
  fi

  item=$(jq -r --arg p "$id_proyecto" \
    '.data.repository.issue.projectItems.nodes[] | select(.project.id == $p) | .id' <<<"$tarea" | head -1)
  actual=$(jq -r --arg p "$id_proyecto" \
    '.data.repository.issue.projectItems.nodes[] | select(.project.id == $p) | .fieldValueByName.name // ""' \
    <<<"$tarea" | head -1)

  # Si la tarea aún no está en el tablero, se agrega.
  if [ -z "$item" ]; then
    item=$(gh api graphql \
      -f query='mutation($p:ID!,$c:ID!){ addProjectV2ItemById(input:{projectId:$p,contentId:$c}){ item { id } } }' \
      -f p="$id_proyecto" -f c="$id_issue" --jq '.data.addProjectV2ItemById.item.id')
    aviso "#$n: no estaba en el tablero; la agregué."
    actual=""
  fi

  if [ "${actual,,}" = "${destino,,}" ]; then
    aviso "#$n: ya está en «$destino»."; continue
  fi
  if [ "${actual,,}" = "${COL_MERGEADO,,}" ] && [ "$PR_ESTADO" != "mergeado" ]; then
    aviso "#$n: ya está en «$actual»; no la saco de ahí."; continue
  fi

  gh api graphql \
    -f query='mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){
      updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,
        value:{singleSelectOptionId:$o}}){ projectV2Item { id } } }' \
    -f p="$id_proyecto" -f i="$item" -f f="$id_campo" -f o="$id_opcion" >/dev/null \
    && aviso "#$n: «${actual:-sin estado}» -> «$destino»." \
    || { aviso "#$n: falló el cambio de columna."; fallos=$((fallos + 1)); }
done

[ "$fallos" -eq 0 ] || exit 1
