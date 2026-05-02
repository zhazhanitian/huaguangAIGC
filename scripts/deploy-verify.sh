#!/usr/bin/env bash
# Post-deploy verification: containers, server logs, DB sanity, service endpoints.
set +e

echo "=== docker ps (huaguang-*) ==="
docker ps --filter name=huaguang- --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo
echo "=== last 40 lines of server log ==="
docker logs --tail 40 huaguang-server 2>&1

echo
echo "=== last 10 lines of web log ==="
docker logs --tail 10 huaguang-web 2>&1

echo
echo "=== last 10 lines of admin log ==="
docker logs --tail 10 huaguang-admin 2>&1

echo
echo "=== mysql sanity ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e "SELECT VERSION(); SHOW TABLES;" 2>&1 | head -50

echo
echo "=== ai_models summary ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e \
  "SELECT type, COUNT(*) AS total, SUM(isActive) AS active, SUM(isPublic) AS public FROM ai_models GROUP BY type;"

echo
echo "=== users count ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e "SELECT COUNT(*) AS users FROM users;"

echo
echo "=== task tables row counts ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e \
  "SELECT 'draw_tasks' AS t, COUNT(*) FROM draw_tasks UNION ALL SELECT 'video_tasks', COUNT(*) FROM video_tasks UNION ALL SELECT 'music_tasks', COUNT(*) FROM music_tasks UNION ALL SELECT 'model3d_tasks', COUNT(*) FROM model3d_tasks;" 2>&1

echo
echo "=== probe local endpoints ==="
for u in \
  "http://127.0.0.1:3001/api/docs" \
  "http://127.0.0.1:3001/api/model/list?type=image" \
  "http://127.0.0.1:3001/api/auth/profile" \
  "http://127.0.0.1:3002/" \
  "http://127.0.0.1:3003/"; do
  s=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$u")
  echo "  $s  $u"
done

echo
echo "=== port summary ==="
ss -ltn 2>/dev/null | grep -E ':(3001|3002|3003|3308|6380)\b' || netstat -ltn 2>/dev/null | grep -E ':(3001|3002|3003|3308|6380)\b'

echo
echo "=== verify done ==="
