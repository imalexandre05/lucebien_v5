#!/usr/bin/env bash
# Guard de los no-negociables de SCI-LB (ver CLAUDE.md).
#
# Comprueba mecánicamente las reglas que una máquina PUEDE comprobar. Las que dependen de
# criterio (¿la spec era correcta? ¿el default es razonable?) las revisa el subagente
# verificador, no esto.
#
# Línea base: tools/guard-baseline.txt lista la deuda ya existente, en formato `regla|archivo`.
# Una violación en un archivo de la línea base se reporta como deuda conocida y NO rompe el
# build; una en cualquier otro archivo sí. Así el guard entra hoy sin bloquear a nadie, pero
# ninguna violación nueva pasa. Para saldar deuda, borrá su línea del baseline.
#
# Uso:   bash tools/guard-reglas.sh
# Sale distinto de cero si hay violaciones fuera de la línea base.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BASELINE="tools/guard-baseline.txt"
nuevas=0
deuda=0

# Filtra líneas de comentario (// ... o * ...) para no marcar un comentario que MENCIONA el patrón.
sin_comentarios() { grep -vE '^[^:]+:[0-9]+: *(//|\*|/\*)'; }

en_baseline() {
  [ -f "$BASELINE" ] || return 1
  grep -qxF "$1|$2" "$BASELINE" 2>/dev/null
}

# revisar <regla> <mensaje> <arreglo> <hits...>
revisar() {
  local regla="$1" mensaje="$2" arreglo="$3" hits="$4"
  if [ -z "$hits" ]; then
    printf '  ✓ %s\n' "$mensaje"
    return
  fi
  local hubo_nuevas=0 hubo_deuda=0
  while IFS= read -r linea; do
    [ -z "$linea" ] && continue
    local archivo="${linea%%:*}"
    if en_baseline "$regla" "$archivo"; then
      printf '  · deuda conocida — %s\n' "$linea"
      hubo_deuda=1
    else
      printf '  ✗ %s\n' "$linea"
      hubo_nuevas=1
    fi
  done <<< "$hits"
  [ "$hubo_deuda" -eq 1 ] && deuda=$((deuda + 1))
  if [ "$hubo_nuevas" -eq 1 ]; then
    printf '    → %s\n' "$arreglo"
    nuevas=$((nuevas + 1))
  fi
}

echo "Guard de no-negociables — SCI-LB"
echo

# ── Regla 4: el core nunca llama new Date() ────────────────────────────────────────────────
# El core recibe la fecha de quien lo invoca (hoyPeru()). Si la llama él, el resultado depende
# de la zona horaria del proceso: en Perú (UTC−5), entre las 19:00 y medianoche, UTC ya está en
# el día siguiente.
revisar "regla4" "Regla 4 — el core no llama new Date()" \
  "Recibí la fecha del caller: hoyPeru()." \
  "$(grep -rn "new Date()" packages/core/src --include="*.ts" 2>/dev/null | grep -v "\.test\.ts" | sin_comentarios || true)"

# ── Regla 3: getAdminClient() bypassa RLS y está restringido ───────────────────────────────
permitidos="lib/auth.ts lib/reauth.ts lib/sedes-repo.ts lib/empleados-repo.ts lib/dispositivos-repo.ts lib/supabase/admin.ts"
intrusos=""
# Se miran las líneas, no los archivos, y se descartan los comentarios: un archivo que EXPLICA por
# qué NO usa el cliente admin es justamente lo que se quiere que exista. Marcarlo como violación
# enseña a no escribir esa explicación, que es lo contrario de lo que persigue el no-negociable 3.
# El descarte es sólo de líneas que arrancan con //, * o /* — una llamada real con un comentario
# al final de la línea sigue cayendo.
for archivo in $(grep -rn "getAdminClient" apps/erp-web --include="*.ts" --include="*.tsx" 2>/dev/null | sin_comentarios | cut -d: -f1 | sed 's|^apps/erp-web/||' | sort -u || true); do
  case " $permitidos " in
    *" $archivo "*) ;;
    *) intrusos="${intrusos}${archivo}:0: usa getAdminClient() sin estar en la lista permitida"$'\n' ;;
  esac
done
revisar "regla3-admin" "Regla 3 — getAdminClient() sólo en los archivos permitidos" \
  "Bypassa RLS. Agregarlo exige justificación escrita en la spec." \
  "$(printf '%s' "$intrusos")"

# ── Regla 2: el AVANCE de una prenda pasa por una RPC ──────────────────────────────────────
# Un update/delete directo sobre prenda_pasada mueve una prenda de etapa sin las validaciones
# ni los puntos de la RPC. (Los insert son entradas al pipeline, no avances: se auditan aparte
# por atomicidad — ver docs/pendientes-negocio.md.)
revisar "regla2" "Regla 2 — sin update/delete directos sobre prenda_pasada" \
  "Usá una de las RPC de pipeline-repo.ts." \
  "$(grep -rn "from('prenda_pasada')\|from(\"prenda_pasada\")" apps/erp-web --include="*.ts" 2>/dev/null | grep -E "\.update\(|\.delete\(" | sin_comentarios || true)"

# ── Regla 3: RLS sin filtro real ───────────────────────────────────────────────────────────
revisar "regla3-rls" "Regla 3 — sin políticas RLS abiertas sin justificar" \
  "Si es intencional, anotá '-- guard-ok' con el motivo en la misma línea." \
  "$(grep -rn "using *( *true *)" packages/db/migrations --include="*.sql" 2>/dev/null | grep -vi "service_role\|guard-ok" || true)"

# ── Regla 3: toda tabla con RLS necesita policy de LECTURA y de ESCRITURA ──────────────────
# Con RLS activa y sólo `select`, las escrituras fallan con 42501 y los borrados quitan cero
# filas — EN SILENCIO: la pantalla dice que guardó y no guardó nada. Le pasó a `empleado_tiendas`
# durante meses en producción, hasta la 0067.
#
# DOS FORMAS DE ESCRIBIR LA MISMA POLICY. La mayoría de las migraciones la escribe literal
# (`create policy x on tabla for all ...`). La 0075 la crea en un bucle con `execute format(...)`
# sobre un `array[...]` de tablas, y ahí el nombre de la tabla nunca aparece pegado a
# `create policy`. Buscar sólo el texto literal marcaba esas cuatro tablas como desprotegidas
# teniendo la policy puesta.
#
# Cuatro rojos permanentes son peores que ninguna regla: enseñan a ignorarla, y ésta existe
# porque `empleado_tiendas` estuvo meses fallando en silencio en producción.
#
# Se acepta la forma dinámica sólo si el MISMO archivo nombra la tabla y crea una policy dinámica
# de escritura (`create policy %I ... for all|insert|update|delete`). No alcanza con que el archivo
# tenga un `format` cualquiera.
tiene_policy_escritura() {
  local tabla="$1"
  grep -rliE "create policy +[a-z_]+ +on +${tabla} +for +(all|insert|update|delete)" \
    packages/db/migrations --include="*.sql" >/dev/null 2>&1 && return 0
  for archivo in $(grep -rl "'${tabla}'" packages/db/migrations --include="*.sql" 2>/dev/null); do
    grep -qiE "create policy +%I[a-z_]* +on +%I +for +(all|insert|update|delete)" "$archivo" && return 0
  done
  return 1
}

sin_escritura=""
for tabla in $(grep -rhoiE "alter table +[a-z_]+ +enable row level security" packages/db/migrations \
                 --include="*.sql" 2>/dev/null | awk '{print $3}' | sort -u); do
  if ! tiene_policy_escritura "$tabla"; then
    sin_escritura="${sin_escritura}${tabla}:0: tiene RLS activa y ninguna policy de escritura"$'\n'
  fi
done
revisar "regla3-rls-escritura" "Regla 3 — toda tabla con RLS tiene policy de escritura" \
  "Agregá la policy de insert/update/delete, o justificá la excepción en el baseline." \
  "$(printf '%s' "$sin_escritura")"

# -- Diseno: la paleta por defecto de Tailwind no se usa ------------------------------------
# Los verdes y ambares de Tailwind son frios al lado del navy y del oro, y sin tokens cada pantalla
# elige el suyo: el 20-ago-2026 habia tres verdes distintos diciendo lo mismo en 67 archivos.
# El sistema tiene semanticos (exito/aviso/error/info), categoricos (cat-*) y neutros.
# Ver docs/sistema-de-diseno.md seccion 2.
#
# EL PATRON NO LLEVA \b, Y NO ES DESCUIDO. Escrito desde un script, esa secuencia se convirtio una
# vez en un caracter de retroceso: el patron dejo de coincidir con nada y la regla paso en verde sin
# mirar un solo archivo. Se exige en cambio que antes del nombre NO haya una letra, que es lo que
# hace falta de verdad: sin eso, "slate-" encuentra el "-slate-" de "translate-".
PALETA_TW="emerald|amber|red|rose|slate|sky|violet|indigo|purple|teal|lime|orange|fuchsia|cyan|yellow|green|blue|pink|stone|zinc|neutral|gray"
hits_diseno=$(grep -rnE "(^|[^a-zA-Z])($PALETA_TW)-[0-9]{2,3}" \
  apps/erp-web/app apps/erp-web/components --include="*.tsx" 2>/dev/null | sin_comentarios || true)
revisar "diseno" "Diseno -- sin colores por defecto de Tailwind" \
  "Usa un token: exito/aviso/error/info para estado, cat-* para identidad, paper/line/muted/ink para gris." \
  "$hits_diseno"

# -- Diseno: sin tipografia monoespaciada ----------------------------------------------------
# Los codigos y los numeros iban en font-mono. La familia ni siquiera estaba cargada, asi que el
# navegador caia en la monoespaciada del sistema y el ERP se veia como una terminal. Se saco entera
# el 21-ago-2026 (decision de Alexander): los numeros se alinean con tabular-nums, que es lo unico
# que hacia falta. La familia mono ya no existe en tailwind.config.ts.
hits_mono=$(grep -rn "font-mono" \
  apps/erp-web/app apps/erp-web/components apps/erp-web/lib \
  --include="*.tsx" --include="*.ts" 2>/dev/null | sin_comentarios || true)
revisar "mono" "Diseno -- sin tipografia monoespaciada" \
  "Usa tabular-nums para que los numeros no bailen. No hay familia mono en el sistema." \
  "$hits_mono"

# -- Diseno: el estilo de campo no se vuelve a escribir a mano -------------------------------
# Veintisiete pantallas declaraban su propio fieldCls y otras dieciseis lo escriben en linea. Cada
# copia se queda sin lo que se le agregue al sistema: es la razon por la que el estado de error de
# los campos no tenia consumidores. Va campoCls de components/ui/form.
#
# La deuda existente esta en el baseline; lo que esta regla impide es que CREZCA. Ver
# docs/sistema-de-diseno.md.
hits_campo=$(grep -rn "rounded-md border border-line bg-white" \
  apps/erp-web/app apps/erp-web/components --include="*.tsx" 2>/dev/null \
  | grep -v "apps/erp-web/components/ui/" | sin_comentarios || true)
revisar "campo" "Diseno -- el estilo de campo sale de campoCls" \
  "Usa campoCls de components/ui/form, con cn() para lo que de verdad cambie." \
  "$hits_campo"

# ── Números de migración únicos, MIRANDO TODAS LAS RAMAS ───────────────────────────────────
# El número es la identidad de una migración. Mirar sólo el directorio de trabajo no alcanza: dos
# ramas paralelas ven la misma "última" y las dos escriben la siguiente. El choque no aparece
# hasta el merge, cuando una ya está aplicada en producción.
#
# Pasó de verdad el 14-ago-2026 entre feat/mi-talla-db y feat/sueldos-motor, con las cuatro
# migraciones ya aplicadas. Por eso esto compara contra cada rama, local y remota.
#
# Prevención: bash tools/reservar-migracion.sh <slug>
# Una sola pasada: se junta `número<TAB>nombre<TAB>dónde` de la copia de trabajo y de cada rama, y
# después awk marca los números que tienen más de un nombre distinto. Con ~30 ramas y ~70
# migraciones, hacerlo con grep anidados tarda minutos en Windows; así son segundos.
listar_migraciones() {
  ls packages/db/migrations 2>/dev/null | grep -E '^[0-9]{4}.*\.sql$' \
    | awk '{printf "%s\t%s\t%s\n", substr($0,1,4), $0, "esta rama"}'
  for ref in $(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes 2>/dev/null); do
    git ls-tree --name-only "$ref" packages/db/migrations/ 2>/dev/null \
      | sed 's|.*/||' | grep -E '^[0-9]{4}.*\.sql$' \
      | awk -v r="$ref" '{printf "%s\t%s\t%s\n", substr($0,1,4), $0, r}'
  done
}

choques=$(listar_migraciones | sort -u | awk -F'\t' '
  { if ($1 in nombre && nombre[$1] != $2)
      choque[$1] = nombre[$1] " (" donde[$1] ") contra " $2 " (" $3 ")";
    nombre[$1] = $2; donde[$1] = $3 }
  END { for (n in choque) printf "packages/db/migrations/%s:0: el número %s está tomado dos veces: %s\n", n, n, choque[n] }
' | sort)

revisar "migraciones-unicas" "Migraciones — números únicos en todas las ramas" \
  "Renumerá con bash tools/reservar-migracion.sh la que se aplicó ÚLTIMA, no la primera." \
  "$choques"

# ── Regla 6 (Zone Guard): spec y código nunca en el mismo commit ───────────────────────────
if [ "${CI:-}" = "true" ] && [ -n "${GITHUB_BASE_REF:-}" ]; then
  git fetch --quiet origin "$GITHUB_BASE_REF" 2>/dev/null || true
  mezclados=""
  for sha in $(git rev-list "origin/$GITHUB_BASE_REF..HEAD" 2>/dev/null || true); do
    archivos=$(git show --name-only --format="" "$sha" 2>/dev/null)
    if printf '%s\n' "$archivos" | grep -q "^docs/superpowers/specs/" \
       && printf '%s\n' "$archivos" | grep -qE "^(packages|apps)/.*\.(ts|tsx|sql)$"; then
      mezclados="${mezclados}$(git log -1 --format=%h%x20%s "$sha"):0: mezcla spec y código"$'\n'
    fi
  done
  revisar "regla6" "Regla 6 (Zone Guard) — ningún commit mezcla spec y código" \
    "Separalos: primero la spec, confirmada; después el código." \
    "$(printf '%s' "$mezclados")"
else
  printf '  – Regla 6 (Zone Guard) — se comprueba sólo en CI sobre un pull request\n'
fi

echo
[ "$deuda" -gt 0 ] && echo "Deuda conocida en $deuda regla(s) — está en $BASELINE, no rompe el build."
if [ "$nuevas" -gt 0 ]; then
  echo "$nuevas regla(s) con violaciones NUEVAS. Ver CLAUDE.md."
  exit 1
fi
echo "Sin violaciones nuevas."
