#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p /root/db_recovery
echo "BACKUP_TS=$TS"
docker exec huaguang-mysql mariadb-dump -uroot -proot --single-transaction --routines --triggers huaguang_aigc | gzip > "/root/db_recovery/huaguang_current_before_recovery_${TS}.sql.gz"
ls -lh "/root/db_recovery/huaguang_current_before_recovery_${TS}.sql.gz"
echo "=== current critical counts ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc <<'SQL'
SELECT 'users' AS table_name, COUNT(*) AS cnt FROM users
UNION ALL SELECT 'colleges', COUNT(*) FROM colleges
UNION ALL SELECT 'grades', COUNT(*) FROM grades
UNION ALL SELECT 'majors', COUNT(*) FROM majors
UNION ALL SELECT 'classes', COUNT(*) FROM classes
UNION ALL SELECT 'invitations', COUNT(*) FROM invitations;
SQL
