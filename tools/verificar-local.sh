#!/usr/bin/env bash
# Corre en tu PC lo mismo que corre CI, antes de commitear.
#
# EL PROBLEMA QUE RESUELVE. `pnpm --filter erp-web exec tsc` falla en esta máquina con
# "Command tsc not found", y no es un problema de instalación: el `node_modules/` de la raíz está
# VERSIONADO en git (1084 archivos, las dependencias del sistema Express viejo, commiteadas antes
# de que existiera el .gitignore). Ese directorio le tapa a pnpm el lugar donde enlaza los
# binarios, así que `.bin/` queda vacío aunque el paquete esté instalado.
#
# CI no lo sufre porque hace `rm -rf node_modules` antes de instalar. En local no se puede hacer
# eso: ese directorio es el que usa el sistema viejo, que es el que la gente usa hoy.
#
# La salida es buscar el binario donde pnpm lo dejó de verdad. Feo, pero deja que un agente
# trabajando en paralelo se verifique a sí mismo antes de commitear en vez de descubrir el error
# en CI media hora después.
#
# Uso:
#   bash tools/verificar-local.sh           # guard + typecheck + tests
#   bash tools/verificar-local.sh --rapido  # sólo guard + tests (saltea el typecheck, que tarda)

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

RAPIDO=0
[ "${1:-}" = "--rapido" ] && RAPIDO=1
fallos=0

# Busca un binario de node_modules probando, en orden: el .bin del paquete, el .bin de la raíz, y
# el almacén de pnpm. Devuelve la ruta al .js ejecutable, no al lanzador .cmd.
buscar_bin() {
  local paquete="$1" relativo="$2" ruta
  for ruta in \
    "node_modules/$paquete/$relativo" \
    "node_modules/.pnpm/node_modules/$paquete/$relativo"; do
    [ -f "$ruta" ] && { printf '%s' "$ruta"; return 0; }
  done
  ruta=$(ls -d node_modules/.pnpm/"${paquete//\//+}"@*/node_modules/"$paquete/$relativo" 2>/dev/null | head -1)
  [ -n "$ruta" ] && { printf '%s' "$ruta"; return 0; }
  return 1
}

titulo() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ── 1) Los no-negociables que una máquina puede comprobar ───────────────────────────────────
titulo "1/3 · Guard de no-negociables"
if bash tools/guard-reglas.sh; then :; else fallos=$((fallos + 1)); fi

# ── 2) Typecheck del ERP nuevo (arrastra core y adapter por los imports) ────────────────────
if [ "$RAPIDO" -eq 0 ]; then
  titulo "2/3 · Typecheck (erp-web + core + adapter)"
  if TSC=$(buscar_bin typescript bin/tsc); then
    if (cd apps/erp-web && node "../../$TSC" --noEmit); then
      echo "  ✓ sin errores de tipos"
    else
      echo "  ✗ hay errores de tipos"
      fallos=$((fallos + 1))
    fi
  else
    echo "  ! no encontré typescript. Corré: pnpm install --force"
    fallos=$((fallos + 1))
  fi
else
  titulo "2/3 · Typecheck — SALTEADO (--rapido)"
fi

# ── 3) Los tests de la lógica de negocio ────────────────────────────────────────────────────
titulo "3/4 · Tests de @scilb/core"
if VITEST=$(buscar_bin vitest vitest.mjs); then
  if (cd packages/core && node "../../$VITEST" run --reporter=dot); then
    echo "  ✓ tests en verde"
  else
    echo "  ✗ hay tests rojos"
    fallos=$((fallos + 1))
  fi
else
  echo "  ! no encontré vitest. Corré: pnpm install --force"
  fallos=$((fallos + 1))
fi

# ---- 4) Los tests de los repos de la app -------------------------------------------------
#
# `apps/erp-web` no tiene vitest propio: se le presta el de packages/core. El paso existe porque
# el 6-sep-2026 aparecio `apps/erp-web/lib/__tests__/sueldos-repo.corregir.test.ts`, con 4 tests
# que pasaban y que NO corria nadie -ni este script ni CI- porque el paso 3 entra a packages/core
# y ahi se queda. Un test verde que nunca se ejecuta es peor que no tenerlo: da la confianza sin
# el respaldo.
#
# Se limita a `lib/__tests__/` a proposito: `apps/erp-web/e2e/` son specs de Playwright y vitest
# no las puede correr. Si algun dia hay tests en otra carpeta de la app, se suman aca.
titulo "4/4 - Tests de los repos de erp-web"
if ls apps/erp-web/lib/__tests__/*.test.ts >/dev/null 2>&1; then
  if VITEST=$(buscar_bin vitest vitest.mjs); then
    if node "$VITEST" run --root apps/erp-web --reporter=dot lib/__tests__; then
      echo "  OK tests en verde"
    else
      echo "  X hay tests rojos"
      fallos=$((fallos + 1))
    fi
  else
    echo "  ! no encontre vitest. Corre: pnpm install --force"
    fallos=$((fallos + 1))
  fi
else
  echo "  . no hay tests de repos todavia - nada que correr"
fi

echo
if [ "$fallos" -gt 0 ]; then
  echo "✗ $fallos de 4 fallaron. No commitees todavía."
  exit 1
fi
echo "✓ Los cuatro pasaron. Esto es lo mismo que va a correr CI."
