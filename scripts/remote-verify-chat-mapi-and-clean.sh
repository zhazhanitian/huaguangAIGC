#!/usr/bin/env bash
set +e

PHONE="13930340685"
PASSWORD="Password123"

LOGIN_JSON=$(curl -s -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"${PHONE}\",\"password\":\"${PASSWORD}\"}")
TOKEN=$(node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); console.log((j.data&&j.data.access_token)||j.access_token||"")})' <<< "$LOGIN_JSON")
echo "token_len=${#TOKEN}"

echo "=== chat group ==="
GROUP_JSON=$(curl -s -X POST http://127.0.0.1:3001/api/chat/group \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"title":"mapi-chat-probe"}')
echo "$GROUP_JSON"
GROUP_ID=$(node -e 'let s=process.argv[1]; const j=JSON.parse(s); console.log((j.data&&j.data.id)||j.id||"")' "$GROUP_JSON")
echo "group_id=$GROUP_ID"

if [ -n "$GROUP_ID" ]; then
  echo "=== chat send kimi-k2.5 ==="
  curl -s -X POST http://127.0.0.1:3001/api/chat/send \
    -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "{\"groupId\":\"${GROUP_ID}\",\"content\":\"ping\",\"model\":\"kimi-k2.5\"}"
  echo
  curl -s -X DELETE "http://127.0.0.1:3001/api/chat/group/${GROUP_ID}" -H "Authorization: Bearer ${TOKEN}" >/dev/null
fi

echo "=== cleanup probe draw/video tasks ==="
curl -s -X DELETE http://127.0.0.1:3001/api/draw/task/8a9d8f06-1efd-456a-9ffe-2ab1d12d78ac -H "Authorization: Bearer ${TOKEN}" >/dev/null
curl -s -X DELETE http://127.0.0.1:3001/api/video/task/5a5bb52b-5f32-45e7-a057-8347d207ca3e -H "Authorization: Bearer ${TOKEN}" >/dev/null

echo "=== recent logs for MAPI disabled message ==="
docker logs --tail 200 huaguang-server 2>&1 | grep -E "未启用 MAPI|MAPI_ENABLED|MAPI 图片|MAPI 视频|Chat 预扣" || true
