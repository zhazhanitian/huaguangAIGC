#!/usr/bin/env bash
set -euo pipefail

for t in text image video; do
  echo "===$t==="
  TMP="/tmp/model-list-$t.json"
  curl -s "http://127.0.0.1:3001/api/model/list?type=$t" > "$TMP"
  node - "$TMP" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const x of (j.data || [])) {
  console.log(`${x.modelName}\t${x.deductPoints}\t${x.source}`);
}
NODE
done
