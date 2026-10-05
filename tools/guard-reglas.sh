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

# ── Regla 2 (puntos e historial): sólo las RPC escriben `pipeline_puntos` y `prenda_historial` ──
# Desde la 0113 `authenticated` ya no tiene insert/update/delete sobre esas dos tablas (los puntos
# alimentan reportes → nota → pago; el historial es la evidencia). Un `.insert()` desde el ERP
# fallaría con 42501 en producción: el guard lo atrapa antes. Se mira la cadena entera, no la
# línea, porque `.from('pipeline_puntos')` y `.insert(...)` casi siempre van en líneas distintas.
revisar "regla2-puntos" "Regla 2 — sin escrituras directas sobre pipeline_puntos ni prenda_historial" \
  "Escribe a través de una RPC del pipeline (pipeline-repo.ts) o de private.pipeline_registrar_punto / prenda_historial_registrar." \
  "$(grep -rlE "from\(['\"](pipeline_puntos|prenda_historial)['\"]\)" apps/erp-web --include="*.ts" --include="*.tsx" 2>/dev/null \
     | while IFS= read -r f; do
         perl -0777 -ne 'while (/from\(\s*[\x27"](pipeline_puntos|prenda_historial)[\x27"]\s*\)((?:(?!from\().){0,400}?)\.(insert|update|delete|upsert)\(/sg) { my $antes = substr($_, 0, $-[0]); my $n = 1 + ($antes =~ tr/\n//); print "$ARGV:$n: escritura directa sobre $1 (.$3)\n"; }' "$f"
       done || true)"

# ── Regla 3: RLS sin filtro real ───────────────────────────────────────────────────────────
revisar "regla3-rls" "Regla 3 — sin políticas RLS abiertas sin justificar" \
  "Si es intencional, anotá '-- guard-ok' con el motivo en la misma línea." \
  "$(grep -rn "using *( *true *)" packages/db/migrations --include="*.sql" 2>/dev/null | grep -vi "service_role\|guard-ok" || true)"

# ── Regla 3 (código personal): ninguna lectura NUEVA de `empleados.cod` desde apps/erp-web ───
# El código personal (spec codigo-personal §4) se compara sólo en la base, dentro de
# pipeline_validar_codigo. Si el ERP lo leyera, volvería a viajar a un servidor/navegador donde el
# viejo sistema lo tenía mal (H-05 de la auditoría: los códigos de todos viajaban al cliente). Las
# lecturas que ya existían (login, reautenticación, alta de empleado) están en el baseline.
revisar "cod-personal" "Regla 3 — sin lecturas nuevas de empleados.cod en el ERP" \
  "El código se valida en la base (pipeline_validar_codigo); no lo leas desde la app." \
  "$(grep -rnE "from\('empleados'\).*select\([^)]*\bcod\b" apps/erp-web --include="*.ts" --include="*.tsx" 2>/dev/null | sin_comentarios || true)"

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

# ── Segunda pasada visual (docs/superpowers/specs/2026-09-06-sistema-visual-sci-lb-design.md,
#    sección 9): siete reglas nuevas, las siete con línea base congelada. Las 72 pantallas usan
#    `text-sm`/`rounded-lg` en todas partes — sin línea base el guard queda en rojo permanente
#    el primer día y alguien lo apaga, y entonces no protege nada. Con línea base, la deuda
#    conocida se tolera y NO PUEDE CRECER, y cada pantalla que se migra se descuenta del
#    baseline — el mismo mecanismo que ya usa la regla `campo` de arriba.

# -- Tipografia: los nueve tokens con nombre, no la escala de Tailwind -----------------------
hits_tipografia=$(
  { grep -rnE "(^|[^a-zA-Z0-9-])text-(xs|sm|base|lg|xl|2xl|3xl)([^a-zA-Z0-9-]|$)" \
      apps/erp-web/app apps/erp-web/components --include="*.tsx" 2>/dev/null;
    grep -rn "text-\[" \
      apps/erp-web/app apps/erp-web/components --include="*.tsx" 2>/dev/null; } \
    | sin_comentarios | sort -u || true
)
revisar "tipografia" "Diseno -- tipografia sale de los nueve tokens con nombre" \
  "Usa text-cifra/titulo/seccion/sub/cuerpo/dato/apoyo/rotulo/micro (spec sección 3.4)." \
  "$hits_tipografia"

# -- Radio: tres tamaños más la pastilla, no rounded-md/lg/xl/full de Tailwind ----------------
hits_radio=$(grep -rnE "(^|[^a-zA-Z0-9-])rounded(-[a-zA-Z0-9]+)?" \
  apps/erp-web/app apps/erp-web/components --include="*.tsx" 2>/dev/null \
  | grep -vE "rounded-r-(chico|medio|grande|pastilla)" | sin_comentarios || true)
revisar "radio" "Diseno -- radio sale de r-chico/r-medio/r-grande/r-pastilla" \
  "Usa rounded-r-chico (8px) / r-medio (14px) / r-grande (22px) / r-pastilla (999px)." \
  "$hits_radio"

# -- Elevacion: elev-0..3, con sombra teñida del acento, no la escala plana de Tailwind -------
hits_elevacion=$(grep -rnE "(^|[^a-zA-Z0-9-])shadow(-(sm|md|lg|xl|2xl|inner|none))?([^a-zA-Z0-9-]|$)" \
  apps/erp-web/app apps/erp-web/components --include="*.tsx" 2>/dev/null | sin_comentarios || true)
revisar "elevacion" "Diseno -- elevacion sale de elev-0/1/2/3" \
  "Usa shadow-elev-0..3. shadow-card/shadow-lift siguen vivas (27 archivos), esas no son violación." \
  "$hits_elevacion"

# -- Foco: un solo anillo, dorado siempre -----------------------------------------------------
hits_foco=$(grep -rnE "focus-visible:ring-|focus:ring-" \
  apps/erp-web/app apps/erp-web/components --include="*.tsx" 2>/dev/null \
  | grep -v "anillo" | sin_comentarios || true)
revisar "foco" "Diseno -- foco sale de la clase .anillo" \
  "Agregá la clase 'anillo' y sacá el ring-* escrito a mano (globals.css la define)." \
  "$hits_foco"

# -- Carga: page.tsx asíncrona sin loading.tsx hermano ----------------------------------------
# Proxy mecánico de "consulta datos": la página exporta una función async por defecto. No
# detecta el caso raro de una página async que NO consulta nada — ahí el arreglo es agregar un
# loading.tsx igual (barato) o bajar la línea del baseline con una nota.
sin_loading=""
while IFS= read -r pagina; do
  [ -z "$pagina" ] && continue
  dir=$(dirname "$pagina")
  if grep -q "^export default async function" "$pagina" 2>/dev/null && [ ! -f "$dir/loading.tsx" ]; then
    sin_loading="${sin_loading}${pagina}:0: pagina async sin loading.tsx hermano"$'\n'
  fi
done <<< "$(find apps/erp-web/app -name "page.tsx" 2>/dev/null | sort)"
revisar "carga" "Diseno -- toda ruta con datos tiene su loading.tsx" \
  "Agregá loading.tsx junto al page.tsx (SkeletonPagina si no tiene silueta propia)." \
  "$(printf '%s' "$sin_loading")"

# -- Movimiento: el catálogo cerrado de globals.css/tailwind.config.ts, nada suelto -----------
# Tres formas de romperla: un @keyframes fuera de los dos archivos de tokens, una duración
# literal en vez del token (--dur-*), o la curva de rebote dentro de un modal/drawer -- un
# modal que rebota al abrirse convierte una decisión irreversible en un juguete.
hits_keyframes=$(grep -rn "@keyframes" apps/erp-web \
  --include="*.tsx" --include="*.ts" --include="*.css" --exclude-dir=.next --exclude-dir=node_modules 2>/dev/null \
  | grep -v "app/globals.css" | sin_comentarios || true)
hits_duracion=$(grep -rnE "animation(Duration)?: *['\"]?[0-9]+m?s|transition-duration: *[0-9]+m?s" \
  apps/erp-web/app apps/erp-web/components --include="*.tsx" 2>/dev/null | sin_comentarios || true)
hits_rebote_modal=$(grep -rln "curva-rebote\|ease-rebote" apps/erp-web/components/ui/modal.tsx 2>/dev/null \
  | sed 's/$/:0: usa la curva de rebote dentro de un modal -- nunca, spec §3.9/' || true)
hits_movimiento=$(printf '%s\n%s\n%s' "$hits_keyframes" "$hits_duracion" "$hits_rebote_modal" | grep -v "^$" || true)
revisar "movimiento" "Diseno -- movimiento sale del catalogo de globals.css/tailwind.config.ts" \
  "Registrá la pieza como keyframe/animation en los dos archivos de tokens, no la escribas suelta." \
  "$hits_movimiento"

# -- Acento: el grupo de módulo sale de lib/modulo-grupo.ts, nunca a mano en una pantalla -----
# Sólo mira las nueve clases `m-{grupo}` -- NO las familias cat-* sueltas, que siguen teniendo
# usos legítimos y ya sancionados fuera del acento de módulo (el color por persona de Avatar,
# las zonas del editor de layout). Prohibir esas rompería trabajo que la spec nunca quiso tocar.
hits_acento=$(grep -rnE "(^|[^a-zA-Z0-9-])m-(inicio|sueldos|pipeline|solicitudes|inventario|lavanderia|personas|desempeno|sistema)([^a-zA-Z0-9-]|$)" \
  apps/erp-web/app apps/erp-web/components --include="*.tsx" 2>/dev/null \
  | grep -v "components/shell/modulo-acento.tsx" | sin_comentarios || true)
revisar "acento" "Diseno -- el acento de modulo sale de ModuloAcento, no a mano" \
  "Agregá la ruta a lib/modulo-grupo.ts. El grupo lo pone ModuloAcento una sola vez, en el shell." \
  "$hits_acento"

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
# shellcheck source=tools/lib-migraciones-remotas.sh
source "$(dirname "$0")/lib-migraciones-remotas.sh"
listar_migraciones() {
  ls packages/db/migrations 2>/dev/null | grep -E '^[0-9]{4}.*\.sql$' \
    | awk '{printf "%s\t%s\t%s\n", substr($0,1,4), $0, "esta rama"}'
  # Ramas del remoto consultadas de verdad (el clon de una sesión en la nube sólo conoce la suya).
  # En el guard la falta de red no rompe: se avisa y se sigue con lo que el clon conoce.
  if remotas=$(migraciones_remotas); then
    printf '%s\n' "$remotas" | grep -E '^[0-9]{4}'
  elif [ $? -eq 2 ]; then
    echo "AVISO: sin red, el guard compara migraciones sólo con las ramas que el clon conoce." >&2
  fi
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
