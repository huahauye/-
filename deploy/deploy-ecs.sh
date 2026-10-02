#!/bin/bash
# Idempotent deployment for the self-hosted OA agent on the Aliyun ECS box.
#
# Run on the server after uploading the source archive:
#
#   tar -xzf /root/oa-agent-src.tgz -C /opt/oa-agent   # excludes .env
#   bash /opt/oa-agent/deploy/deploy-ecs.sh
#
# The production environment file (/opt/oa-agent/.env) is never written by this
# script: it is deployment state, not source. The script only checks that it
# exists and refuses to continue without it.
set -uo pipefail

APP_DIR=/opt/oa-agent
ENV_FILE=$APP_DIR/.env
WEB_DIR=$APP_DIR/apps/web
WORKER_DIR=$APP_DIR/services/document-worker
LOG_DIR=/var/log/oa-agent

step() { echo; echo "########## $* ##########"; }

step "preconditions"
[ -f "$ENV_FILE" ] || { echo "FATAL: $ENV_FILE is missing; refusing to deploy"; exit 1; }
grep -q '^DATABASE_URL=' "$ENV_FILE" || { echo "FATAL: DATABASE_URL missing from $ENV_FILE"; exit 1; }
echo "env file: $(stat -c '%a %U:%G' "$ENV_FILE")"
echo "db host:  $(grep -E '^DATABASE_URL=' "$ENV_FILE" | sed -E 's#.*@([^/]+)/.*#\1#')"
echo "db user:  $(grep -E '^DATABASE_URL=' "$ENV_FILE" | sed -E 's#.*://([^:]+):.*#\1#')"
mkdir -p "$LOG_DIR" /var/lib/oa-agent/tmp

cd "$APP_DIR"
set -a
. "$ENV_FILE"
set +a
export NEXT_TELEMETRY_DISABLED=1 CI=true

step "node dependencies"
pnpm install --frozen-lockfile 2>&1 | tail -4

step "database migrations"
node scripts/apply-migrations.mjs 2>&1 | tail -8

# The instance has 1.6 GB of RAM. An unbounded Next build plus a crash-looping
# service is what put the box into swap thrashing, so the services are stopped
# and the build heap is capped.
step "web build (clean, memory capped)"
systemctl stop oa-web.service 2>/dev/null || true
systemctl stop oa-worker.service 2>/dev/null || true
rm -rf "$WEB_DIR/.next"
export NODE_OPTIONS="--max-old-space-size=${BUILD_HEAP_MB:-1024}"
pnpm --filter @oa/web build 2>&1 | tail -10
unset NODE_OPTIONS
[ -f "$WEB_DIR/.next/BUILD_ID" ] || { echo "FATAL: build produced no BUILD_ID"; exit 1; }
[ -f "$WEB_DIR/.next/prerender-manifest.json" ] || echo "WARN: prerender-manifest.json missing"

step "worker python environment"
if [ ! -x "$WORKER_DIR/.venv/bin/python" ]; then
  python3 -m venv "$WORKER_DIR/.venv"
fi
"$WORKER_DIR/.venv/bin/pip" install -q --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/ 2>&1 | tail -2
"$WORKER_DIR/.venv/bin/pip" install -q -r "$WORKER_DIR/requirements.lock" -i https://mirrors.aliyun.com/pypi/simple/ 2>&1 | tail -3
"$WORKER_DIR/.venv/bin/python" -c "import fitz, fastapi, psycopg, boto3, docx, magic; print('worker deps ok')"

step "systemd units and nginx"
install -m 644 deploy/oa-web.service /etc/systemd/system/oa-web.service
install -m 644 deploy/oa-worker.service /etc/systemd/system/oa-worker.service
systemctl daemon-reload
systemctl enable oa-web.service oa-worker.service >/dev/null 2>&1
install -m 644 deploy/nginx-oa-agent.conf /etc/nginx/sites-available/oa-agent.conf
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/oa-agent.conf /etc/nginx/sites-enabled/oa-agent.conf
nginx -t 2>&1 | tail -2

step "restart services"
systemctl restart oa-worker.service
systemctl restart oa-web.service
systemctl reload nginx
sleep 8

step "health"
echo "worker: $(systemctl is-active oa-worker.service)  web: $(systemctl is-active oa-web.service)  nginx: $(systemctl is-active nginx)"
curl -s -m 10 -o /dev/null -w "worker   /healthz            -> %{http_code}\n" http://127.0.0.1:8080/healthz
curl -s -m 20 -o /dev/null -w "web      /login              -> %{http_code}\n" http://127.0.0.1:3000/login
curl -s -m 20 -o /dev/null -w "nginx    /login              -> %{http_code}\n" http://127.0.0.1/login
curl -s -m 20 -o /dev/null -w "nginx    /api/auth/login     -> %{http_code}\n" -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1/api/auth/login
echo
echo "=== web log ==="
tail -6 "$LOG_DIR/web.log" 2>/dev/null
echo "=== worker log ==="
tail -4 "$LOG_DIR/worker.log" 2>/dev/null
