#!/usr/bin/env bash
set -euo pipefail

PHONE="13930340685"
PASSWORD="Password123"

LOGIN_JSON=$(curl -s -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"${PHONE}\",\"password\":\"${PASSWORD}\"}")
TOKEN=$(node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); console.log((j.data&&j.data.access_token)||j.access_token||"")})' <<< "$LOGIN_JSON")
echo "token_len=${#TOKEN}"

echo "=== env ==="
docker exec huaguang-server sh -c 'env | grep -E "^MAPI_" | sort'

post_json() {
  local path="$1"
  local body="$2"
  echo "=== POST $path ==="
  curl -s -X POST "http://127.0.0.1:3001/api${path}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "$body"
  echo
}

post_json "/draw/task" '{"taskType":"text2img","provider":"nano-banana-2","prompt":"mapi enabled probe image","params":{"n":1,"size":"1:1"}}'
post_json "/video/create" '{"taskType":"text2video","provider":"Hailuo-2.3","prompt":"mapi enabled probe video","params":{"duration":5,"ratio":"16:9"}}'
post_json "/chat/group" '{"title":"mapi-enabled-probe"}' > /tmp/mapi-chat-group.out
cat /tmp/mapi-chat-group.out
echo
GROUP_ID=$(node -e 'let s=require("fs").readFileSync("/tmp/mapi-chat-group.out","utf8"); const j=JSON.parse(s); console.log((j.data&&j.data.id)||j.id||"")')
if [ -n "$GROUP_ID" ]; then
  post_json "/chat/send" "{\"groupId\":\"${GROUP_ID}\",\"content\":\"ping\",\"model\":\"kimi-k2.5\"}"
  curl -s -X DELETE "http://127.0.0.1:3001/api/chat/group/${GROUP_ID}" -H "Authorization: Bearer ${TOKEN}" >/dev/null || true
fi

echo "=== recent task statuses ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e "
SELECT 'draw' module, id, provider, status, errorMessage FROM draw_tasks ORDER BY createdAt DESC LIMIT 3;
SELECT 'video' module, id, provider, status, errorMessage FROM video_tasks ORDER BY createdAt DESC LIMIT 3;
"
