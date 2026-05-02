#!/usr/bin/env bash
set -e

TRIPO_KEY='tsk_FxtT8t4LZl_eBPOErLOM9MwA0F9KgSrbLYaVDTSFm56'
TRIPO_BASE='https://api.tripo3d.ai/v2/openapi'

echo "=== INSERT tripo3d models + keys ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc <<SQL
SET @t1 := UUID();
SET @t2 := UUID();
SET @k1 := UUID();
SET @k2 := UUID();

INSERT INTO ai_models
  (id, modelName, displayName, description, provider, type, source,
   apiKey, baseUrl, isActive, isPublic, deductPoints, \`order\`,
   maxTokens, temperature)
VALUES
  (@t1, 'tripo3d-text-to-model',  'Tripo 3D 文生模型',
   'Tripo 官方文生 3D，参数与官网保持一致',
   'custom', '3d', 'tripo',
   NULL, '${TRIPO_BASE}', 1, 1, 30, 100,
   4096, 0.70),
  (@t2, 'tripo3d-image-to-model', 'Tripo 3D 图生模型',
   'Tripo 官方图生 3D，适合单图转高质量 3D 资产',
   'custom', '3d', 'tripo',
   NULL, '${TRIPO_BASE}', 1, 1, 30, 101,
   4096, 0.70);

INSERT INTO model_keys
  (id, modelId, apiKey, baseUrl, weight, isActive, usageCount)
VALUES
  (@k1, @t1, '${TRIPO_KEY}', '${TRIPO_BASE}', 1, 1, 0),
  (@k2, @t2, '${TRIPO_KEY}', '${TRIPO_BASE}', 1, 1, 0);

SELECT 'inserted ai_models' AS step, modelName, isActive, isPublic FROM ai_models WHERE id IN (@t1, @t2);
SELECT 'inserted model_keys' AS step, mk.id, am.modelName, mk.isActive, mk.baseUrl, LENGTH(mk.apiKey) AS keyLen
  FROM model_keys mk JOIN ai_models am ON am.id = mk.modelId
  WHERE mk.id IN (@k1, @k2);
SQL

echo
echo "=== final state ==="
docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e \
  "SELECT modelName, type, source, isActive, isPublic, baseUrl FROM ai_models WHERE modelName LIKE 'tripo3d%';"

docker exec -i huaguang-mysql mysql -uroot -proot huaguang_aigc -e \
  "SELECT mk.id, am.modelName, mk.isActive, mk.weight, mk.baseUrl, LENGTH(mk.apiKey) AS keyLen FROM model_keys mk JOIN ai_models am ON am.id = mk.modelId WHERE am.modelName LIKE 'tripo3d%';"
