#!/usr/bin/env bash
set -euo pipefail
# Disposable CI-only Subject PostgreSQL TLS peer; never connects to Production.
# Watchtower-Track: saju-bridge
[[ "${CI:-}" == "true" && "${GITHUB_ACTIONS:-}" == "true" ]] || {
  echo 'Refusing to provision a Subject DB outside ephemeral CI.' >&2; exit 1;
}
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" &&
   "${PGDATABASE:-}" == "myeongha_saju_local_verify" &&
   "${PGUSER:-}" == "postgres" && -n "${PGPASSWORD:-}" ]] || {
  echo 'Unexpected source Subject DB configuration.' >&2; exit 1;
}
[[ -n "${RUNNER_TEMP:-}" && -n "${GITHUB_ENV:-}" ]] || exit 1
for command in docker openssl psql; do command -v "$command" >/dev/null; done
directory="$RUNNER_TEMP/saju-bridge-subject-tls"
container='myeongha-saju-tls-subject-ci'
mkdir -p "$directory"
chmod 755 "$directory"
ca="$directory/ca.crt"
wrong_ca="$directory/wrong-ca.crt"
admin_password="$(openssl rand -hex 28)"
subject_password="$(openssl rand -hex 28)"
echo "::add-mask::$admin_password"
echo "::add-mask::$subject_password"

openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -subj '/CN=MyeongHa Disposable Subject CI CA' \
  -keyout "$directory/ca.key" -out "$ca" >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -subj '/CN=MyeongHa Wrong Subject CI CA' \
  -keyout "$directory/wrong-ca.key" -out "$wrong_ca" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -sha256 \
  -subj '/CN=subject.saju-bridge-ci.invalid' \
  -keyout "$directory/server.key" -out "$directory/server.csr" >/dev/null 2>&1
printf 'subjectAltName=DNS:subject.saju-bridge-ci.invalid\nextendedKeyUsage=serverAuth\n' > "$directory/server.ext"
openssl x509 -req -in "$directory/server.csr" \
  -CA "$ca" -CAkey "$directory/ca.key" -CAcreateserial \
  -out "$directory/server.crt" -days 1 -sha256 \
  -extfile "$directory/server.ext" >/dev/null 2>&1
sudo chown 999:999 "$directory/server.key"
sudo chmod 600 "$directory/server.key"
chmod 644 "$directory/server.crt" "$ca" "$wrong_ca"
printf '127.0.0.1 subject.saju-bridge-ci.invalid other-subject.saju-bridge-ci.invalid\n' \
  | sudo tee -a /etc/hosts >/dev/null

docker run -d --name "$container" \
  -p 127.0.0.1:5444:5432 \
  -v "$directory:/ci-certs:ro" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD="$admin_password" \
  -e POSTGRES_DB=myeongha_saju_subject_tls_verify \
  postgres:15 \
  -c ssl=on -c ssl_cert_file=/ci-certs/server.crt \
  -c ssl_key_file=/ci-certs/server.key \
  -c ssl_min_protocol_version=TLSv1.2 >/dev/null

admin_sql() {
  PGHOST=subject.saju-bridge-ci.invalid PGPORT=5444 \
  PGDATABASE=myeongha_saju_subject_tls_verify \
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
  echo 'Disposable Subject TLS PostgreSQL was not healthy.' >&2
  docker logs --tail 40 "$container" >&2 || true
  exit 1
fi
docker exec -u postgres "$container" sh -c \
  "sed -i '1i hostnossl all all 0.0.0.0/0 reject' /var/lib/postgresql/data/pg_hba.conf && pg_ctl -D /var/lib/postgresql/data reload" >/dev/null

admin_sql -f test/db/bootstrap_supabase_auth_stub.sql
for migration in supabase/migrations/*.sql; do
  admin_sql -f "$migration" >/dev/null
done
admin_sql -f test/db/fixtures/saju_local_subject_birth_proof_e2e.sql
admin_sql -v "subject_password=$subject_password" \
  -f test/db/fixtures/saju_local_tls_subject_login.sql

PGHOST=subject.saju-bridge-ci.invalid PGPORT=5444 \
  PGDATABASE=myeongha_saju_subject_tls_verify \
  PGUSER=myeongha_runtime PGPASSWORD="$subject_password" \
  PGSSLMODE=verify-full PGSSLROOTCERT="$ca" \
  psql -X -Atqc 'select session_user::text' | grep -Fx myeongha_runtime

fingerprint="$(openssl x509 -in "$ca" -noout -fingerprint -sha256 \
  | sed 's/.*=//' | tr -d ':' | tr '[:upper:]' '[:lower:]')"
{
  echo "MYEONGHA_LOCAL_TLS_SUBJECT_ADMIN_PASSWORD=$admin_password"
  echo "MYEONGHA_LOCAL_TLS_SUBJECT_PASSWORD=$subject_password"
  echo "MYEONGHA_LOCAL_TLS_SUBJECT_CA_FILE=$ca"
  echo "MYEONGHA_LOCAL_TLS_SUBJECT_WRONG_CA_FILE=$wrong_ca"
  echo "MYEONGHA_LOCAL_TLS_SUBJECT_CA_FINGERPRINT=$fingerprint"
} >> "$GITHUB_ENV"
echo '[saju-bridge] Independent Subject PostgreSQL TLS peer, CA, restricted login: ready (NOT operational authority).'
