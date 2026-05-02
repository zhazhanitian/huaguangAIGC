#!/usr/bin/env bash
set +e

echo "=== DNS resolve api.tripo3d.ai ==="
getent hosts api.tripo3d.ai || echo "no result"

echo
echo "=== curl -v balance from host (verbose, max 12s) ==="
curl -v --max-time 12 -H "Authorization: Bearer tsk_FxtT8t4LZl_eBPOErLOM9MwA0F9KgSrbLYaVDTSFm56" \
  "https://api.tripo3d.ai/v2/openapi/user/balance" 2>&1 | head -40

echo
echo "=== curl http_code only ==="
curl -s -o /dev/null -w "HTTP=%{http_code} time=%{time_total}s remote_ip=%{remote_ip}\n" --max-time 15 \
  -H "Authorization: Bearer tsk_FxtT8t4LZl_eBPOErLOM9MwA0F9KgSrbLYaVDTSFm56" \
  "https://api.tripo3d.ai/v2/openapi/user/balance"

echo
echo "=== from huaguang-server container with node fetch (15s timeout) ==="
docker exec -i huaguang-server node -e "
const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), 15000);
fetch('https://api.tripo3d.ai/v2/openapi/user/balance', {
  headers: { Authorization: 'Bearer tsk_FxtT8t4LZl_eBPOErLOM9MwA0F9KgSrbLYaVDTSFm56' },
  signal: ctrl.signal,
}).then(r => r.text().then(t => console.log('HTTP=' + r.status + ' body=' + t.slice(0, 300))))
  .catch(e => console.error('ERR=' + e.name + ': ' + e.message));
"

echo
echo "=== check if huaguang-server container has any proxy env ==="
docker exec -i huaguang-server sh -c 'env | grep -i proxy || echo "no proxy env"'
