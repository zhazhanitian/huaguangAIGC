#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/www/wwwroot/huaguangAIGC-master"
ENV_FILE="$PROJECT_DIR/server/.env"

cd "$PROJECT_DIR/server"
cp .env ".env.bak-before-mapi-$(date +%Y%m%d-%H%M%S)"

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

if ! grep -q '^# Planisp MAPI' "$ENV_FILE"; then
  printf '\n# Planisp MAPI (OpenAI compatible gateway)\n' >> "$ENV_FILE"
fi

upsert_env "MAPI_ENABLED" "true"
upsert_env "MAPI_API_KEY" "sk-z719wdkxrkymppz9sxyxuf5gso2xpvsn"
upsert_env "MAPI_BASE_URL" "https://kapi.planisp.com/Mapi/v3"

echo "=== .env MAPI ==="
grep -n '^MAPI_' "$ENV_FILE"

cd "$PROJECT_DIR"
docker compose up -d --force-recreate serve
sleep 8

echo "=== container env ==="
docker exec huaguang-server sh -c 'env | grep -E "^MAPI_" | sort'

echo "=== server health ==="
curl -s -o /dev/null -w 'api_docs=%{http_code}\n' http://127.0.0.1:3001/api/docs
