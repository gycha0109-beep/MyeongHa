#!/usr/bin/env bash
set -euo pipefail
# Disposable CI-only separate TLS PostgreSQL 15 for the Saju nonce proof.
# Watchtower-Track: saju-bridge. Never operates on a user/Production database.
[[ "${CI:-}" == "true" && "${GITHUB_ACTIONS:-}" == "true" ]] || {
  echo "Refusing to provision outside ephemeral CI." >&2; exit 1;
}
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" \
   && "${PGDATABASE:-}" == "myeongha_saju_local_verify" ]] || {
  echo "Unexpected existing Subject DB configuration." >&2; exit 1;
}
[[ -n "${RUNNER_TEMP:-}" && -n "${GITHUB_ENV:-}" ]] || exit 1
command -v docker >/dev/null
command -v openssl >/dev/null
command -v psql >/dev/null
container='myeongha-saju-tls-nonce-ci'
directory="$RUNNER_TEMP/saju-bridge-nonce-tls"
mkdir -p "$directory"
chmod 755 "$directory"
ca="$directory/ca.crt"
wrong_ca="$directory/wrong-ca.crt"
admin_password="$(openssl rand -hex 28)"
nonce_password="$(openssl rand -hex 28)"
echo "::add-mask::$admin_password"
echo "::add-mask::$nonce_password"

openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -subj '/CN=MyeongHa Disposable Nonce CI CA' \
  -keyout "$directory/ca.key" -out "$ca" >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -subj '/CN=MyeongHa Wrong Nonce CI CA' \
  -keyout "$directory/wrong-ca.key" -out "$wrong_ca" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -sha256 \
  -subj '/CN=nonce.saju-bridge-ci.invalid' \
  -keyout "$directory/server.key" -out "$directory/server.csr" >/dev/null 2>&1
printf 'subjectAltName=DNS:nonce.saju-bridge-ci.invalid\nextendedKeyUsage=serverAuth\n' \
  > "$directory/server.ext"
openssl x509 -req -in "$directory/server.csr" \
  -CA "$ca" -CAkey "$directory/ca.key" -CAcreateserial \
  -out "$directory/server.crt" -days 1 -sha256 \
  -extfile "$directory/server.ext" >/dev/null 2>&1
# Official PostgreSQL Debian images run as UID 999. Private server key
# must be owned by postgres and inaccessible to any other user.
sudo chown 999:999 "$directory/server.key"
sudo chmod 600 "$directory/server.key"
chmod 644 "$directory/server.crt" "$ca" "$wrong_ca"
printf '127.0.0.1 nonce.saju-bridge-ci.invalid other.saju-bridge-ci.invalid\n' \
  | sudo tee -a /etc/hosts >/dev/null

docker run -d --name "$container" \
  -p 127.0.0.1:5443:5432 \
  -v "$directory:/ci-certs:ro" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD="$admin_password" \
  -e POSTGRES_DB=myeongha_saju_nonce_tls_verify \
  postgres:15 \
  -c ssl=on \
  -c ssl_cert_file=/ci-certs/server.crt \
  -c ssl_key_file=/ci-certs/server.key \
  -c ssl_min_protocol_version=TLSv1.2 >/dev/null

admin_sql() {
  PGHOST=127.0.0.1 PGPORT=5443 PGDATABASE=myeongha_saju_nonce_tls_verify \
  PGUSER=postgres PGPASSWORD="$admin_password" PGSSLMODE=require \
    psql -X -q -v ON_ERROR_STOP=1 "$@"
}

ready=0
for attempt in $(seq 1 45); do
  if admin_sql -Atqc 'select 1' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  echo 'Isolated TLS Nonce PostgreSQL did not become healthy.' >&2
  docker logs --tail 40 "$container" >&2 || true
  exit 1
fi

# Enforce TLS at the server, not just the client: plaintext host requests
# must hit an explicit HBA reject before default host rules.
docker exec -u postgres "$container" sh -c \
  "sed -i '1i hostnossl all all 0.0.0.0/0 reject' /var/lib/postgresql/data/pg_hba.conf && pg_ctl -D /var/lib/postgresql/data reload" >/dev/null
admin_sql -f supabase/migrations/1540_saju_source_proof_nonce_claim_authority_v1.sql
admin_sql -v "nonce_password=$nonce_password" -f test/db/fixtures/saju_local_tls_nonce_login.sql

# Probe with libpq verification, not only "sslmode=require".
PGHOST=nonce.saju-bridge-ci.invalid PGPORT=5443 PGDATABASE=myeongha_saju_nonce_tls_verify \
  PGUSER=myeongha_tls_nonce_ci_login PGPASSWORD="$nonce_password" \
  PGSSLMODE=verify-full PGSSLROOTCERT="$ca" \
  psql -X -Atqc 'select session_user::text' | grep -Fx myeongha_tls_nonce_ci_login

fingerprint="$(openssl x509 -in "$ca" -noout -fingerprint -sha256 \
  | sed 's/.*=//' | tr -d ':' | tr '[:upper:]' '[:lower:]')"
{
  echo "MYEONGHA_LOCAL_TLS_NONCE_PASSWORD=$nonce_password"
  echo "MYEONGHA_LOCAL_TLS_NONCE_CA_FILE=$ca"
  echo "MYEONGHA_LOCAL_TLS_NONCE_WRONG_CA_FILE=$wrong_ca"
  echo "MYEONGHA_LOCAL_TLS_NONCE_CA_FINGERPRINT=$fingerprint"
} >> "$GITHUB_ENV"
echo '[saju-bridge] Isolated Nonce PostgreSQL is TLS 1.2+ with certificate and restricted login (not operational authority).'
