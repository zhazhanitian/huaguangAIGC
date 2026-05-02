const mysql = require('/app/node_modules/mysql2/promise');
const { extractPriceList, estimateMaxPrice } = require('/app/dist/common/mapi-pricing.js');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'mysql',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'root',
    database: process.env.DB_DATABASE || 'huaguang_aigc',
  });

  const [rows] = await conn.execute(
    "SELECT id, modelName, type, rawMetadata, deductPoints FROM ai_models WHERE source='mapi'",
  );
  const updates = [];
  for (const row of rows) {
    const list = extractPriceList(row.rawMetadata);
    if (!list.length) {
      updates.push({
        id: row.id,
        modelName: row.modelName,
        type: row.type,
        old: row.deductPoints,
        next: row.deductPoints,
        changed: false,
        reason: 'no price list',
      });
      continue;
    }
    const type = row.type === 'video' ? 'video' : row.type === 'image' ? 'image' : 'text';
    const hints =
      type === 'image'
        ? { n: 1 }
        : type === 'video'
          ? { duration: 5, resolution: '720p', withAudio: true }
          : { promptTokens: 5000, completionTokens: 3000 };
    const estimate = estimateMaxPrice(list, type, hints);
    const next = Math.max(0, Number(estimate.points || 0));
    await conn.execute('UPDATE ai_models SET deductPoints=? WHERE id=?', [next, row.id]);
    updates.push({
      id: row.id,
      modelName: row.modelName,
      type: row.type,
      old: Number(row.deductPoints || 0),
      next,
      changed: Number(row.deductPoints || 0) !== next,
      breakdown: estimate.breakdown,
    });
  }
  await conn.end();
  console.log(JSON.stringify({ total: updates.length, updates }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
