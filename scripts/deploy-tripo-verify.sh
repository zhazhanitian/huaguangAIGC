#!/usr/bin/env bash
set +e

echo "=== /api/model/list?type=3d (host) ==="
curl -s --max-time 10 "http://127.0.0.1:3001/api/model/list?type=3d" | head -200

echo
echo
echo "=== Tripo balance from host ==="
curl -s --max-time 15 -H "Authorization: Bearer tsk_FxtT8t4LZl_eBPOErLOM9MwA0F9KgSrbLYaVDTSFm56" \
  "https://api.tripo3d.ai/v2/openapi/user/balance"

echo
echo
echo "=== Tripo balance from huaguang-server container ==="
docker exec -i huaguang-server sh -c '
if command -v wget >/dev/null 2>&1; then
  wget -qO- --header "Authorization: Bearer tsk_FxtT8t4LZl_eBPOErLOM9MwA0F9KgSrbLYaVDTSFm56" --timeout=15 https://api.tripo3d.ai/v2/openapi/user/balance
elif command -v curl >/dev/null 2>&1; then
  curl -s --max-time 15 -H "Authorization: Bearer tsk_FxtT8t4LZl_eBPOErLOM9MwA0F9KgSrbLYaVDTSFm56" https://api.tripo3d.ai/v2/openapi/user/balance
else
  echo "no http client in container, falling back to node fetch:"
  node -e "fetch(\"https://api.tripo3d.ai/v2/openapi/user/balance\",{headers:{Authorization:\"Bearer tsk_FxtT8t4LZl_eBPOErLOM9MwA0F9KgSrbLYaVDTSFm56\"}}).then(r=>r.text()).then(t=>console.log(t)).catch(e=>console.error(e.message));"
fi
'

echo
echo "=== verify done ==="
