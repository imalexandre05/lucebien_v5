#!/usr/bin/env bash
# Postgres 16 local que imita lo mínimo de Supabase, para correr las migraciones y sus pruebas
# (packages/db/pruebas/*.prueba.sql) cuando no hay una base de verdad a mano.
#
# QUÉ IMITA. Los roles anon / authenticated / service_role; el esquema `auth` con auth.uid() y
# auth.role() leídos de `request.jwt.claims` (igual que las pruebas, que lo fijan con set_config);
# los esquemas `extensions`, `storage`, `realtime` y `cron` como stubs, para que las migraciones
# que los mencionan no rompan. NO imita RLS de storage, realtime ni pg_cron de verdad: una
# migración que dependa de eso falla y se informa, no se oculta.
#
# CÓMO SE USA.
#   bash tools/postgres-local.sh aplicar [hasta]    # levanta el clúster y aplica 0001..hasta (ej. 0111)
#   bash tools/postgres-local.sh probar 0111 0093   # corre esas pruebas y muestra la línea RESULTADO
#   bash tools/postgres-local.sh psql               # consola
#   bash tools/postgres-local.sh parar              # apaga y borra el clúster
#
# Variables: PGLOCAL_DIR (default /tmp/pglocal), PGLOCAL_PORT (default 5544).
# Necesita los binarios de PostgreSQL 16 (/usr/lib/postgresql/16/bin) y poder correr como el
# usuario `postgres` (o ser root, que es el caso de las sesiones en la nube).

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BIN=/usr/lib/postgresql/16/bin
DIR="${PGLOCAL_DIR:-/tmp/pglocal}"
PORT="${PGLOCAL_PORT:-5544}"
DB=scilb_local

como_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
psql_pg() { como_pg "$BIN/psql -X -q -h $DIR -p $PORT -d $DB $*"; }

levantar() {
  if [ ! -x "$BIN/postgres" ]; then echo "✗ no encontré $BIN/postgres"; exit 1; fi
  if [ ! -d "$DIR/d" ]; then
    mkdir -p "$DIR"; [ "$(id -u)" = 0 ] && chown postgres "$DIR"
    como_pg "$BIN/initdb -D $DIR/d -A trust >/dev/null"
  fi
  como_pg "$BIN/pg_ctl -D $DIR/d status >/dev/null 2>&1" || \
    como_pg "$BIN/pg_ctl -D $DIR/d -o '-p $PORT -k $DIR' -l $DIR/log start >/dev/null"
  sleep 2
  como_pg "$BIN/psql -X -q -h $DIR -p $PORT -d postgres -tc \"select 1 from pg_database where datname='$DB'\"" | grep -q 1 || \
    como_pg "$BIN/createdb -h $DIR -p $PORT $DB"
}

bootstrap() {
  psql_pg <<'SQL' >/dev/null
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as
  $f$ select nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role' $f$;
create or replace function auth.jwt() returns jsonb language sql stable as
  $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $f$;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, encrypted_password text, created_at timestamptz default now());
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $f$ select string_to_array(name, '/') $f$;
create schema if not exists realtime;
do $$ begin if not exists (select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if; end $$;
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create or replace function cron.schedule(a text, b text, c text default null) returns bigint language sql as
  $f$ insert into cron.job(jobname, schedule, command) values (case when c is null then null else a end, case when c is null then a else b end, coalesce(c, b)) returning jobid $f$;
create or replace function cron.unschedule(a text) returns boolean language sql as $f$ select true $f$;
create or replace function cron.unschedule(a bigint) returns boolean language sql as $f$ select true $f$;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
SQL
}

aplicar() {
  local hasta="${1:-9999}" fallos=0 n
  levantar; bootstrap
  for f in $(ls packages/db/migrations/*.sql | sort); do
    n=$(basename "$f" | cut -c1-4)
    [ "$n" -gt "$((10#$hasta))" ] 2>/dev/null && break
    salida=$(como_pg "$BIN/psql -X -q -h $DIR -p $PORT -d $DB -v ON_ERROR_STOP=1 -f $PWD/$f" 2>&1)
    if [ $? -ne 0 ]; then
      fallos=$((fallos+1)); echo "✗ $(basename "$f"): $(printf '%s' "$salida" | grep -m1 -i 'error')"
    fi
  done
  # Semilla mínima: las pruebas necesitan al menos una persona con rol admin (hacen set_config del jwt).
  psql_pg -c "insert into empleados(cod, nombre, iniciales, rol) values ('ADM-LOCAL', 'Admin Local', 'AL', 'admin') on conflict (cod) do nothing" >/dev/null 2>&1
  echo "Migraciones aplicadas hasta $hasta; $fallos con error (lo que falla suele depender de piezas de Supabase que no se imitan)."
}

probar() {
  levantar
  local fallos=0 p
  for p in "$@"; do
    for f in packages/db/pruebas/${p}_*.prueba.sql; do
      [ -e "$f" ] || { echo "✗ no hay prueba para $p"; fallos=$((fallos+1)); continue; }
      salida=$(como_pg "$BIN/psql -X -h $DIR -p $PORT -d $DB -v ON_ERROR_STOP=0 -f $PWD/$f" 2>&1)
      res=$(printf '%s' "$salida" | grep -o 'RESULTADO.*' | head -1)
      printf '\n%s\n  %s\n' "$(basename "$f" .prueba.sql)" "${res:-(la prueba no llegó al final)}"
      [ -z "$res" ] && printf '%s\n' "$salida" | tail -5 | sed 's/^/    /'
      if [ -z "$res" ] || printf '%s' "$res" | grep -q 'FALLA'; then fallos=$((fallos+1)); fi
    done
  done
  [ "$fallos" -eq 0 ] && echo "✓ pasan" || { echo "✗ $fallos con fallas"; return 1; }
}

case "${1:-}" in
  aplicar) shift; aplicar "$@" ;;
  probar)  shift; probar "$@" ;;
  psql)    levantar; como_pg "$BIN/psql -h $DIR -p $PORT -d $DB" ;;
  parar)   como_pg "$BIN/pg_ctl -D $DIR/d stop >/dev/null 2>&1"; rm -rf "$DIR"; echo "clúster borrado" ;;
  *) sed -n '2,24p' "$0"; exit 1 ;;
esac
