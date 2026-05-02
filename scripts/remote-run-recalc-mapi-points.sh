#!/usr/bin/env bash
set -euo pipefail

docker cp /tmp/remote-recalc-mapi-deduct-points.js huaguang-server:/tmp/remote-recalc-mapi-deduct-points.js
docker exec huaguang-server node /tmp/remote-recalc-mapi-deduct-points.js
