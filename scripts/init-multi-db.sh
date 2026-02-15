#!/bin/bash
# Creates additional databases needed by services (GlitchTip)
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE glitchtip' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'glitchtip')\gexec
    GRANT ALL PRIVILEGES ON DATABASE glitchtip TO $POSTGRES_USER;
EOSQL

echo "Additional databases created successfully"
