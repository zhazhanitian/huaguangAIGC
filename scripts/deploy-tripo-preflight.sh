#!/usr/bin/env bash
set +e

echo "=== existing tripo3d-* records ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e \
  "SELECT id, modelName, type, source, isActive, isPublic FROM ai_models WHERE modelName LIKE 'tripo3d%';"

echo
echo "=== ai_models nullable columns reference ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e \
  "SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='huaguang_aigc' AND TABLE_NAME='ai_models' ORDER BY ORDINAL_POSITION;"

echo
echo "=== model_keys nullable columns reference ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e \
  "SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='huaguang_aigc' AND TABLE_NAME='model_keys' ORDER BY ORDINAL_POSITION;"
