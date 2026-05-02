#!/usr/bin/env bash
set -euo pipefail

MODELS="'kling-3.0','nano-banana-pro','MiniMax-M2.5','glm-5'"

echo "=== before ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e "
SELECT id, modelName, type, source, provider, isActive, isPublic
FROM ai_models
WHERE modelName IN (${MODELS})
ORDER BY modelName;
"

echo "=== enable mapi models only ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e "
UPDATE ai_models
SET isActive=1, isPublic=1
WHERE modelName IN (${MODELS})
  AND (source='mapi' OR provider='mapi');
SELECT ROW_COUNT() AS affected;
"

echo "=== after ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e "
SELECT id, modelName, type, source, provider, isActive, isPublic
FROM ai_models
WHERE modelName IN (${MODELS})
ORDER BY modelName;
"

echo "=== public API checks ==="
for t in text image video; do
  echo "-- $t --"
  curl -s "http://127.0.0.1:3001/api/model/list?type=${t}" | node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  const list = j.data || j;
  console.log((Array.isArray(list) ? list : []).map(x => x.modelName).join(","));
});
'
done
