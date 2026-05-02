#!/usr/bin/env bash
set -euo pipefail

echo "=== login admin ==="
LOGIN_JSON=$(curl -s -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13930340685","password":"Password123"}')
TOKEN=$(node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); console.log((j.data&&j.data.access_token)||j.access_token||"")})' <<< "$LOGIN_JSON")
echo "token_len=${#TOKEN}"

echo "=== before summary ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e "
SELECT source,type,COUNT(*) total,SUM(isActive) active,SUM(isPublic) public
FROM ai_models
GROUP BY source,type
ORDER BY source,type;
"

echo "=== sync mapi ==="
curl -s -X POST http://127.0.0.1:3001/api/model/admin/sync-mapi \
  -H "Authorization: Bearer $TOKEN"
echo

echo "=== after summary ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e "
SELECT source,type,COUNT(*) total,SUM(isActive) active,SUM(isPublic) public
FROM ai_models
GROUP BY source,type
ORDER BY source,type;

SELECT modelName,type,source,isActive,isPublic,updatedAt
FROM ai_models
WHERE source='mapi'
ORDER BY updatedAt DESC
LIMIT 50;
"

echo "=== public API type counts ==="
for t in text image video music 3d; do
  echo "-- $t --"
  curl -s "http://127.0.0.1:3001/api/model/list?type=$t" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); const a=j.data||j; console.log(Array.isArray(a)?a.length:"not-array"); if(Array.isArray(a)) console.log(a.map(x=>x.modelName).slice(0,20).join(","));})'
done
