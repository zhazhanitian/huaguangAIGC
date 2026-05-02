#!/usr/bin/env bash
set -euo pipefail

LOGIN_JSON=$(curl -s -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13930340685","password":"Password123"}')

TOKEN=$(node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); console.log((j.data&&j.data.access_token)||j.access_token||"")})' <<< "$LOGIN_JSON")
echo "token_len=${#TOKEN}"

for path in colleges grades majors classes; do
  echo "=== $path ==="
  curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:3001/api/academic/$path" | head -c 1500
  echo
done
