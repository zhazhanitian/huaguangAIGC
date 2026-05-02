#!/usr/bin/env bash
set -euo pipefail

RESTORE_DB="huaguang_restore_a"
BACKUP="/root/huaguang_aigc_A.sql.gz"

echo "=== inspect backup ==="
ls -lh "$BACKUP"
set +o pipefail
gzip -dc "$BACKUP" | head -40 || true
set -o pipefail

echo "=== recreate temp db: $RESTORE_DB ==="
docker exec -i huaguang-mysql mysql -uroot -proot -e "DROP DATABASE IF EXISTS ${RESTORE_DB}; CREATE DATABASE ${RESTORE_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "=== import backup into temp db ==="
gzip -dc "$BACKUP" | docker exec -i huaguang-mysql mysql -uroot -proot "$RESTORE_DB"

echo "=== table counts: current vs restore ==="
docker exec -i huaguang-mysql mysql -uroot -proot -e "
SELECT 'users' table_name,
  (SELECT COUNT(*) FROM huaguang_aigc.users) current_cnt,
  (SELECT COUNT(*) FROM ${RESTORE_DB}.users) restore_cnt
UNION ALL SELECT 'colleges', (SELECT COUNT(*) FROM huaguang_aigc.colleges), (SELECT COUNT(*) FROM ${RESTORE_DB}.colleges)
UNION ALL SELECT 'grades', (SELECT COUNT(*) FROM huaguang_aigc.grades), (SELECT COUNT(*) FROM ${RESTORE_DB}.grades)
UNION ALL SELECT 'majors', (SELECT COUNT(*) FROM huaguang_aigc.majors), (SELECT COUNT(*) FROM ${RESTORE_DB}.majors)
UNION ALL SELECT 'classes', (SELECT COUNT(*) FROM huaguang_aigc.classes), (SELECT COUNT(*) FROM ${RESTORE_DB}.classes)
UNION ALL SELECT 'invitations', (SELECT COUNT(*) FROM huaguang_aigc.invitations), (SELECT COUNT(*) FROM ${RESTORE_DB}.invitations);
"

echo "=== missing in current by id ==="
docker exec -i huaguang-mysql mysql -uroot -proot -e "
SELECT 'users' table_name, COUNT(*) missing_cnt FROM ${RESTORE_DB}.users r LEFT JOIN huaguang_aigc.users c ON c.id=r.id WHERE c.id IS NULL
UNION ALL SELECT 'colleges', COUNT(*) FROM ${RESTORE_DB}.colleges r LEFT JOIN huaguang_aigc.colleges c ON c.id=r.id WHERE c.id IS NULL
UNION ALL SELECT 'grades', COUNT(*) FROM ${RESTORE_DB}.grades r LEFT JOIN huaguang_aigc.grades c ON c.id=r.id WHERE c.id IS NULL
UNION ALL SELECT 'majors', COUNT(*) FROM ${RESTORE_DB}.majors r LEFT JOIN huaguang_aigc.majors c ON c.id=r.id WHERE c.id IS NULL
UNION ALL SELECT 'classes', COUNT(*) FROM ${RESTORE_DB}.classes r LEFT JOIN huaguang_aigc.classes c ON c.id=r.id WHERE c.id IS NULL
UNION ALL SELECT 'invitations', COUNT(*) FROM ${RESTORE_DB}.invitations r LEFT JOIN huaguang_aigc.invitations c ON c.id=r.id WHERE c.id IS NULL;
"

echo "=== sample restore academic ==="
docker exec -i huaguang-mysql mysql -uroot -proot "$RESTORE_DB" -e "
SELECT * FROM colleges LIMIT 5;
SELECT * FROM grades LIMIT 5;
SELECT * FROM majors LIMIT 5;
SELECT * FROM classes LIMIT 5;
"
