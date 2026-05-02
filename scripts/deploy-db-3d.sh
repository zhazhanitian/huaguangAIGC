#!/usr/bin/env bash
set +e
echo "=== 3D / Tripo / Tencent-3D models ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e \
  "SELECT modelName, type, source, provider, isActive, isPublic FROM ai_models WHERE type='3d' OR modelName LIKE 'tripo%' OR modelName LIKE 'tencent-hunyuan-3d%';"

echo
echo "=== model_keys for 3D ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e \
  "SELECT mk.id, am.modelName, mk.isActive, mk.weight, LENGTH(mk.apiKey) AS keyLen, mk.baseUrl FROM model_keys mk JOIN ai_models am ON am.id = mk.modelId WHERE am.modelName LIKE 'tripo%' OR am.modelName LIKE 'tencent-hunyuan-3d%';"

echo
echo "=== ai_models recent additions or changes ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e \
  "SELECT modelName, type, source, isActive, isPublic, updatedAt FROM ai_models ORDER BY updatedAt DESC LIMIT 10;"
