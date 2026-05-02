#!/usr/bin/env bash
set +e

echo "=== container mapi-pricing ==="
docker exec huaguang-server sh -c "grep -R 'PTS_PER_POINT\\|ptsToPoints\\|1 积分' -n /app/dist/common/mapi-pricing.js /app/dist/common/mapi-pricing.d.ts 2>/dev/null || true"

echo "=== api image rawMetadata/deductPoints ==="
TMP=/tmp/model-list-image.json
curl -s http://127.0.0.1:3001/api/model/list?type=image > "$TMP"
node <<'NODE'
const fs = require('fs');
const s = fs.readFileSync('/tmp/model-list-image.json', 'utf8');
const j = JSON.parse(s);
const list = j.data || [];
for (const x of list) {
  console.log(`${x.modelName}\tdeduct=${x.deductPoints}\tsource=${x.source}\traw=${!!x.rawMetadata}\tprice=${String(x.rawMetadata || '').includes('appPriceModelList')}`);
}
NODE

echo "=== api text rawMetadata/deductPoints ==="
TMP=/tmp/model-list-text.json
curl -s http://127.0.0.1:3001/api/model/list?type=text > "$TMP"
node <<'NODE'
const fs = require('fs');
const s = fs.readFileSync('/tmp/model-list-text.json', 'utf8');
const j = JSON.parse(s);
const list = j.data || [];
for (const x of list) {
  console.log(`${x.modelName}\tdeduct=${x.deductPoints}\tsource=${x.source}\traw=${!!x.rawMetadata}\tprice=${String(x.rawMetadata || '').includes('appPriceModelList')}`);
}
NODE

echo "=== api video rawMetadata/deductPoints ==="
TMP=/tmp/model-list-video.json
curl -s http://127.0.0.1:3001/api/model/list?type=video > "$TMP"
node <<'NODE'
const fs = require('fs');
const s = fs.readFileSync('/tmp/model-list-video.json', 'utf8');
const j = JSON.parse(s);
const list = j.data || [];
for (const x of list) {
  console.log(`${x.modelName}\tdeduct=${x.deductPoints}\tsource=${x.source}\traw=${!!x.rawMetadata}\tprice=${String(x.rawMetadata || '').includes('appPriceModelList')}`);
}
NODE

echo "=== DB rawMetadata counts ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc <<'SQL'
SELECT source,type,COUNT(*) total,
  SUM(rawMetadata IS NOT NULL AND rawMetadata LIKE '%appPriceModelList%') with_price,
  SUM(deductPoints) sum_deduct
FROM ai_models
WHERE source='mapi'
GROUP BY source,type;

SELECT modelName,type,isActive,isPublic,deductPoints,
  (rawMetadata IS NOT NULL AND rawMetadata LIKE '%appPriceModelList%') AS has_price
FROM ai_models
WHERE source='mapi'
ORDER BY type, modelName;
SQL

exit 0
cat <<'OLD'
let s = '';
process.stdin.on('data', d => s += d);
process.stdin.on('end', () => {
  const j = JSON.parse(s);
  const list = j.data || [];
  for (const x of list) {
    console.log(`${x.modelName}\tdeduct=${x.deductPoints}\tsource=${x.source}\traw=${!!x.rawMetadata}\tprice=${String(x.rawMetadata || '').includes('appPriceModelList')}`);
  }
});
NODE

echo "=== api video rawMetadata/deductPoints ==="
curl -s http://127.0.0.1:3001/api/model/list?type=video | node <<'NODE'
let s = '';
process.stdin.on('data', d => s += d);
process.stdin.on('end', () => {
  const j = JSON.parse(s);
  const list = j.data || [];
  for (const x of list) {
    console.log(`${x.modelName}\tdeduct=${x.deductPoints}\tsource=${x.source}\traw=${!!x.rawMetadata}\tprice=${String(x.rawMetadata || '').includes('appPriceModelList')}`);
  }
});
NODE

echo "=== DB rawMetadata counts ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e "
SELECT source,type,COUNT(*) total,
  SUM(rawMetadata IS NOT NULL AND rawMetadata LIKE '%appPriceModelList%') with_price,
  SUM(deductPoints) sum_deduct
FROM ai_models
WHERE source='mapi'
GROUP BY source,type;
"
OLD
