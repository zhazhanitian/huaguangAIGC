/**
 * 确保存在可登录后台的管理员账号（手机号 + 密码，与 /api/auth/admin/login 一致）
 * 用法：在 server 目录下执行 node scripts/ensure-admin-user.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const PHONE = process.env.ADMIN_BOOTSTRAP_PHONE || '13800138000';
const PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'Admin123456';
const USERNAME = process.env.ADMIN_BOOTSTRAP_USERNAME || '系统管理员';

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
      `UPDATE users SET password = ?, role = 'super', status = 'active', username = ? WHERE phone = ?`,
      [hash, USERNAME, PHONE],
    );
    console.log(`已更新管理员：手机号 ${PHONE}，密码 ${PASSWORD}，角色 super`);
  } else {
    const id = crypto.randomUUID();
    const inviteCode =
      'ADM' + crypto.randomBytes(4).toString('hex').toUpperCase();
    await conn.execute(
      `INSERT INTO users (
        id, username, email, password, role, status, balance,
        phone, inviteCode, createdAt, updatedAt
      ) VALUES (?, ?, NULL, ?, 'super', 'active', 0, ?, ?, NOW(), NOW())`,
      [id, USERNAME, hash, PHONE, inviteCode],
    );
    console.log(`已创建管理员：手机号 ${PHONE}，密码 ${PASSWORD}，角色 super`);
  }

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
