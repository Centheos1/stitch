#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
NODE_BIN="$ROOT_DIR/.local-tools/node-v24.22.2-darwin-x64/bin"
PG_BIN="$ROOT_DIR/.local-tools/Postgres.app/Contents/Versions/16/bin"
DATA_DIR="$ROOT_DIR/.local-data/postgres"

if [ ! -x "$NODE_BIN/node" ] || [ ! -x "$PG_BIN/pg_ctl" ]; then
  echo "Local Node.js 24 and PostgreSQL 16 tools are missing. See README.md for setup." >&2
  exit 1
fi

export PATH="$NODE_BIN:$PATH"
export AWS_PROFILE="${AWS_PROFILE:-stitch}"
export AWS_REGION="${AWS_REGION:-ap-southeast-2}"
export TABLE_NAME="${TABLE_NAME:-stitch}"
export PORT="${PORT:-3000}"
DB_USER=$(id -un)
export DATABASE_URL="postgresql://${DB_USER}@127.0.0.1:5432/stitch_dev"

if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
  mkdir -p "$ROOT_DIR/.local-data"
  "$PG_BIN/initdb" --auth=trust --encoding=UTF8 --locale=C -D "$DATA_DIR"
fi

if ! "$PG_BIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
  "$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$ROOT_DIR/.local-data/postgres.log" \
    -o "-c listen_addresses=127.0.0.1 -c port=5432" start
fi

if ! "$PG_BIN/psql" -h 127.0.0.1 -p 5432 -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = 'stitch_dev'" | grep -q 1; then
  "$PG_BIN/createdb" -h 127.0.0.1 -p 5432 stitch_dev
fi

cd "$ROOT_DIR"
exec "$NODE_BIN/npm" run dev
