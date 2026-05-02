#!/usr/bin/env bash
# Remote deploy helper: applies tar bundles uploaded to /tmp and rebuilds docker compose.
set -e

DEPLOY_DIR=/www/wwwroot/huaguangAIGC-master
BACKUP_DIR=/tmp/hg-deploy-backup-$(date +%Y%m%d-%H%M%S)

echo "=== prep ==="
mkdir -p "$BACKUP_DIR"
cd "$DEPLOY_DIR"

echo "=== backup current source (excluding node_modules / uploads / .env) ==="
for d in server web admin; do
  if [ -d "$d" ]; then
    tar czf "$BACKUP_DIR/$d.tar.gz" \
      --exclude="$d/node_modules" \
      --exclude="$d/dist" \
      --exclude="$d/uploads" \
      "$d"
  fi
done
ls -lh "$BACKUP_DIR"

echo "=== sync server (preserve uploads/.env) ==="
mkdir -p "$DEPLOY_DIR/server"
cd "$DEPLOY_DIR/server"
ENV_BAK=""
if [ -f .env ]; then
  cp .env /tmp/server.env.bak
  ENV_BAK=/tmp/server.env.bak
fi
# remove old src/dist while preserving uploads and .env and node_modules
for d in src scripts test docs common public; do
  if [ -d "$d" ]; then rm -rf "$d"; fi
done
for f in package.json package-lock.json pnpm-lock.yaml tsconfig.json tsconfig.build.json nest-cli.json README.md Dockerfile .eslintrc.js .prettierrc .gitignore; do
  if [ -f "$f" ]; then rm -f "$f"; fi
done
tar xzf /tmp/server.tar.gz
if [ -n "$ENV_BAK" ]; then cp "$ENV_BAK" .env; fi

echo "=== sync web ==="
mkdir -p "$DEPLOY_DIR/web"
cd "$DEPLOY_DIR/web"
for d in src public; do
  if [ -d "$d" ]; then rm -rf "$d"; fi
done
for f in package.json package-lock.json pnpm-lock.yaml tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html nginx.conf Dockerfile .gitignore .env.development README.md; do
  if [ -f "$f" ]; then rm -f "$f"; fi
done
tar xzf /tmp/web.tar.gz

echo "=== sync admin ==="
mkdir -p "$DEPLOY_DIR/admin"
cd "$DEPLOY_DIR/admin"
for d in src public; do
  if [ -d "$d" ]; then rm -rf "$d"; fi
done
for f in package.json package-lock.json pnpm-lock.yaml tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html nginx.conf Dockerfile .gitignore .env.development README.md; do
  if [ -f "$f" ]; then rm -f "$f"; fi
done
tar xzf /tmp/admin.tar.gz

echo "=== compose up --build ==="
cd "$DEPLOY_DIR"
docker compose build server web admin
docker compose up -d server web admin

echo "=== ps ==="
docker compose ps

echo "=== done. backup at $BACKUP_DIR ==="
