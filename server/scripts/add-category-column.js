// 添加 category 字段到 bad_words 表
const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'root',
    database: 'huaguang_aigc',
  });

  try {
    // 检查列是否存在
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'huaguang_aigc' AND TABLE_NAME = 'bad_words' AND COLUMN_NAME = 'category'
    `);

    if (columns.length === 0) {
      console.log('Adding category column...');
      await connection.query(`
        ALTER TABLE bad_words ADD COLUMN category VARCHAR(100) NULL COMMENT '分类（如色情/政治/暴力等）' AFTER level
      `);
      console.log('Column added successfully!');
    } else {
      console.log('Column already exists.');
    }
  } catch (error) {
    console.error('Migration failed:', error.message);
  } finally {
    await connection.end();
  }
}

migrate();
