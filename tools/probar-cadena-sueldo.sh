#!/usr/bin/env bash
# Corre la cadena del sueldo de punta a punta contra la base.
#
# QUÉ COMPRUEBA. Que la entrada que arma `sueldo_entrada()` en Postgres sea exactamente la que
# `liquidarPeriodo()` espera en TypeScript, y que el total salga de sus líneas. Los tests
# unitarios prueban el motor con datos inventados; las pruebas de migración prueban la base sola.
# Nadie comprobaba las dos juntas — y ahí es donde vive el dinero.
#
# NO DEJA RASTRO. Monta una persona ficticia en un periodo del año 2099 y borra todo al terminar,
# incluso si una comprobación falla.
#
# Necesita:
#   apps/erp-web/.env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
#   E2E_ADMIN_PASSWORD con la contraseña de la cuenta de prueba (la RPC se llama con sesión de
#   persona, no con la llave de servicio: es `security invoker`)
#
# Uso:
#   E2E_ADMIN_PASSWORD=... bash tools/probar-cadena-sueldo.sh

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

if [ -z "${E2E_ADMIN_PASSWORD:-}" ]; then
  echo "  ✗ falta E2E_ADMIN_PASSWORD (contraseña de la cuenta de prueba con rol admin)"
  echo "    Sin ella la prueba no puede llamar a la RPC como la llama la aplicación."
  exit 1
fi

VITEST=$(ls -d node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs 2>/dev/null | head -1)
if [ -z "$VITEST" ]; then
  echo "  ✗ no encontré vitest. Corré: pnpm install"
  exit 1
fi

node "$VITEST" run tools/pruebas --root .
