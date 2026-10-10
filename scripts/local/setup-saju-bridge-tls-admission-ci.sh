#!/usr/bin/env bash
set -euo pipefail
# Disposable CI-only third PostgreSQL TLS cluster for Permit V2 admission.
# Watchtower-Track: saju-bridge. This is NOT an operational admission.
[[ "${CI:-}" == "true" && "${GITHUB_ACTIONS:-}" == "true" ]] || {
  echo 'Refusing to provision Admission outside ephemeral GitHub CI.' >&2; exit 1;
}
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" \
   && "${PGDATABASE:-}" == "myeongha_saju_local_verify" \
   && "${PGUSER:-}" == "postgres" && -n "${PGPASSWORD:-}" ]] || {
  echo 'Unexpected existing Subject CI database.' >&2; exit 1;
}
[[ -n "${RUNNER_TEMP:-}" && -n "${GITHUB_ENV:-}" ]] || exit 1
for command in docker openssl psql; do command -v "$command" >/dev/null; done

container='myeongha-saju-tls-admission-ci'
directory="$RUNNER_TEMP/saju-bridge-admission-tls"
mkdir -p "$directory"
chmod 755 "$directory"
ca="$directory/ca.crt"
wrong_ca="$directory/wrong-ca.crt"
admin_password="$(openssl rand -hex 28)"
admission_password="$(openssl rand -hex 28)"
echo "::add-mask::$admin_password"
echo "::add-mask::$admission_password"

openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -subj '/CN=MyeongHa Disposable Admission CI CA' \
  -keyout "$directory/ca.key" -out "$ca" >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -subj '/CN=MyeongHa Wrong Admission CI CA' \
  -keyout "$directory/wrong-ca.key" -out "$wrong_ca" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -sha256 \
  -subj '/CN=admission.saju-bridge-ci.invalid' \
  -keyout "$directory/server.key" -out "$directory/server.csr" >/dev/null 2>&1
printf 'subjectAltName=DNS:admission.saju-bridge-ci.invalid\nextendedKeyUsage=serverAuth\n' \
  > "$directory/server.ext"
openssl x509 -req -in "$directory/server.csr" \
  -CA "$ca" -CAkey "$directory/ca.key" -CAcreateserial \
  -out "$directory/server.crt" -days 1 -sha256 \
  -extfile "$directory/server.ext" >/dev/null 2>&1
sudo chown 999:999 "$directory/server.key"
sudo chmod 600 "$directory/server.key"
chmod 644 "$directory/server.crt" "$ca" "$wrong_ca"
printf '127.0.0.1 admission.saju-bridge-ci.invalid other-admission.saju-bridge-ci.invalid\n' \
  | sudo tee -a /etc/hosts >/dev/null

docker run -d --name "$container" \
  -p 127.0.0.1:5445:5432 \
  -v "$directory:/ci-certs:ro" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD="$admin_password" \
  -e POSTGRES_DB=myeongha_saju_admission_tls_verify \
  postgres:15 \
  -c ssl=on -c ssl_cert_file=/ci-certs/server.crt \
  -c ssl_key_file=/ci-certs/server.key \
  -c ssl_min_protocol_version=TLSv1.2 >/dev/null

admin_sql() {
  PGHOST=admission.saju-bridge-ci.invalid PGPORT=5445 \
  PGDATABASE=myeongha_saju_admission_tls_verify \
  PGUSER=postgres PGPASSWORD="$admin_password" \
  PGSSLMODE=verify-full PGSSLROOTCERT="$ca" \
    psql -X -q -v ON_ERROR_STOP=1 "$@"
}

ready=0
for attempt in $(seq 1 45); do
  if admin_sql -Atqc 'select 1' >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  echo 'Disposable Admission PostgreSQL TLS peer is unhealthy.' >&2
  docker logs --tail 40 "$container" >&2 || true
  exit 1
fi

# Enforce PostgreSQL server-side TLS, not merely client SSL settings.
docker exec -u postgres "$container" sh -c \
  "sed -i '1i hostnossl all all 0.0.0.0/0 reject' /var/lib/postgresql/data/pg_hba.conf && pg_ctl -D /var/lib/postgresql/data reload" >/dev/null

# Already-governed Permit V2 schema is CI-only, NOT a product migration.
admin_sql -f test/db/fixtures/saju_staging_operator_admission_schema_8c2b2d302.sql
admin_sql -v "admission_password=$admission_password" \
  -f test/db/fixtures/saju_local_tls_admission_login.sql

PGHOST=admission.saju-bridge-ci.invalid PGPORT=5445 \
  PGDATABASE=myeongha_saju_admission_tls_verify \
  PGUSER=myeongha_tls_admission_ci_login PGPASSWORD="$admission_password" \
  PGSSLMODE=verify-full PGSSLROOTCERT="$ca" \
  psql -X -Atqc 'select session_user::text' | grep -Fx myeongha_tls_admission_ci_login

fingerprint="$(openssl x509 -in "$ca" -noout -fingerprint -sha256 \
  | sed 's/.*=//' | tr -d ':' | tr '[:upper:]' '[:lower:]')"
{
  echo "MYEONGHA_LOCAL_TLS_ADMISSION_ADMIN_PASSWORD=$admin_password"
  echo "MYEONGHA_LOCAL_TLS_ADMISSION_PASSWORD=$admission_password"
  echo "MYEONGHA_LOCAL_TLS_ADMISSION_CA_FILE=$ca"
  echo "MYEONGHA_LOCAL_TLS_ADMISSION_WRONG_CA_FILE=$wrong_ca"
  echo "MYEONGHA_LOCAL_TLS_ADMISSION_CA_FINGERPRINT=$fingerprint"
} >> "$GITHUB_ENV"
echo '[saju-bridge] Independent Admission TLS peer, CA and restricted Permit V2 role ready (not operational).'
