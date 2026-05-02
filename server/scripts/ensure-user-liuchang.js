/**
 * 创建或重置创作端普通用户（role=user），用于手机号登录
 * 用法：在 server 目录下 node scripts/ensure-user-liuchang.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const PHONE = process.env.USER_BOOTSTRAP_PHONE || '13900001234';
const PASSWORD = process.env.USER_BOOTSTRAP_PASSWORD || 'Liuchang123';
const USERNAME = process.env.USER_BOOTSTRAP_USERNAME || '刘畅';

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'root',
    database: process.env.DB_DATABASE || 'huaguang_aigc',
  });

  const [rows] = await conn.execute(
    'SELECT id FROM users WHERE phone = ? LIMIT 1',
    [PHONE],
  );

  if (rows.length) {
    await conn.execute(
      `UPDATE users SET password = ?, role = 'user', status = 'active', username = ? WHERE phone = ?`,
      [hash, USERNAME, PHONE],
    );
    console.log(`已更新用户：手机号 ${PHONE}，昵称 ${USERNAME}，密码 ${PASSWORD}，角色 user`);
  } else {
    const id = crypto.randomUUID();
    const inviteCode =
      'USR' + crypto.randomBytes(4).toString('hex').toUpperCase();
    await conn.execute(
      `INSERT INTO users (
        id, username, email, password, role, status, balance,
        phone, inviteCode, createdAt, updatedAt
      ) VALUES (?, ?, NULL, ?, 'user', 'active', 0, ?, ?, NOW(), NOW())`,
      [id, USERNAME, hash, PHONE, inviteCode],
    );
    console.log(`已创建用户：手机号 ${PHONE}，昵称 ${USERNAME}，密码 ${PASSWORD}，角色 user`);
  }

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
