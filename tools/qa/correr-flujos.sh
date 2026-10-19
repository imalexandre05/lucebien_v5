#!/usr/bin/env bash
# Corre tools/qa/flujos-por-rol.prueba.sql sobre el Postgres local (ver tools/postgres-local.sh).
cd "$(dirname "$0")/../.." || exit 1
DIR="${PGLOCAL_DIR:-/tmp/pglocal}"; PORT="${PGLOCAL_PORT:-5544}"
su postgres -c "/usr/lib/postgresql/16/bin/psql -X -q -h $DIR -p $PORT -d scilb_local -f tools/qa/flujos-por-rol.prueba.sql" 2>&1 \
  | grep -E "RESULTADO|ERROR" | sed 's/; /;\n/g'
