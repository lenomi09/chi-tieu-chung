'use strict';

// Chạy 1 lần: node scripts/migrate-local-db-to-turso.js
// Đọc data.db (SQLite local) và nạp toàn bộ sang Turso (TURSO_DATABASE_URL/TURSO_AUTH_TOKEN
// trong .env). Dùng khi bạn đã có dữ liệu thật chạy local rồi mới quyết định deploy.

require('dotenv').config();
const path = require('path');
const { createClient } = require('@libsql/client');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function main() {
  if (!TURSO_URL) {
    console.log('Chưa có TURSO_DATABASE_URL trong .env — không có gì để migrate lên Turso.');
    return;
  }

  const source = createClient({ url: `file:${path.join(__dirname, '..', 'data.db')}` });
  const dest = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  await dest.batch(
    [
      `CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY, date TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        amount REAL NOT NULL, payer_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'approved'
      )`,
      `CREATE TABLE IF NOT EXISTS expense_shares (
        expense_id TEXT NOT NULL, member_id TEXT NOT NULL,
        PRIMARY KEY (expense_id, member_id)
      )`,
      `CREATE TABLE IF NOT EXISTS settlements (
        id TEXT PRIMARY KEY, date TEXT NOT NULL, from_id TEXT NOT NULL, to_id TEXT NOT NULL,
        amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'approved'
      )`,
    ],
    'write'
  );

  const existingMembers = await dest.execute('SELECT 1 FROM members LIMIT 1');
  if (existingMembers.rows.length > 0) {
    console.log('DB Turso đích đã có dữ liệu — dừng lại để tránh trùng lặp.');
    return;
  }

  const [members, expenses, shares, settlements] = await Promise.all([
    source.execute('SELECT id, name FROM members'),
    source.execute('SELECT id, date, description, amount, payer_id, status FROM expenses'),
    source.execute('SELECT expense_id, member_id FROM expense_shares'),
    source.execute('SELECT id, date, from_id, to_id, amount FROM settlements'),
  ]);

  const statements = [];
  for (const m of members.rows) {
    statements.push({ sql: 'INSERT INTO members (id, name) VALUES (?, ?)', args: [m.id, m.name] });
  }
  for (const e of expenses.rows) {
    statements.push({
      sql: 'INSERT INTO expenses (id, date, description, amount, payer_id, status) VALUES (?, ?, ?, ?, ?, ?)',
      args: [e.id, e.date, e.description, e.amount, e.payer_id, e.status],
    });
  }
  for (const s of shares.rows) {
    statements.push({
      sql: 'INSERT INTO expense_shares (expense_id, member_id) VALUES (?, ?)',
      args: [s.expense_id, s.member_id],
    });
  }
  for (const s of settlements.rows) {
    statements.push({
      sql: 'INSERT INTO settlements (id, date, from_id, to_id, amount) VALUES (?, ?, ?, ?, ?)',
      args: [s.id, s.date, s.from_id, s.to_id, s.amount],
    });
  }

  if (statements.length > 0) {
    await dest.batch(statements, 'write');
  }

  console.log(
    `Đã migrate lên Turso: ${members.rows.length} thành viên, ${expenses.rows.length} khoản chi, ${settlements.rows.length} thanh toán.`
  );
  source.close();
  dest.close();
}

main().catch((err) => {
  console.error('Migrate lên Turso thất bại:', err);
  process.exit(1);
});
