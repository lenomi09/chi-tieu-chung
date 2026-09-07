'use strict';

// Chạy 1 lần: node scripts/migrate-json-to-db.js
// Đọc data.json (dữ liệu cũ dạng file JSON) và nạp vào DB SQLite mới (lib/db.js).
// Không tự động chạy khi start server — tránh side-effect bất ngờ.

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

const JSON_FILE = path.join(__dirname, '..', 'data.json');

async function main() {
  if (!fs.existsSync(JSON_FILE)) {
    console.log(`Không thấy ${JSON_FILE} — không có gì để migrate.`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
  const members = raw.members || [];
  const expenses = raw.expenses || [];
  const settlements = raw.settlements || [];

  const existingMembers = await db.getMembers();
  if (existingMembers.length > 0) {
    console.log('DB đích đã có dữ liệu thành viên — dừng lại để tránh trùng lặp.');
    console.log('Nếu bạn chắc chắn muốn migrate lại, hãy xoá file data.db rồi chạy lại script này.');
    return;
  }

  // Ghi trực tiếp bằng id gốc trong data.json để các tham chiếu (payerId, shareMemberIds...)
  // không bị lệch — không dùng db.addMember() vì hàm đó luôn tự sinh id mới.
  const client = require('@libsql/client').createClient({
    url: process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, '..', 'data.db')}`,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY, date TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        amount REAL NOT NULL, payer_id TEXT NOT NULL
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

  const statements = [];
  for (const m of members) {
    statements.push({ sql: 'INSERT INTO members (id, name) VALUES (?, ?)', args: [m.id, m.name] });
  }
  for (const e of expenses) {
    statements.push({
      sql: 'INSERT INTO expenses (id, date, description, amount, payer_id) VALUES (?, ?, ?, ?, ?)',
      args: [e.id, e.date, e.description || '', e.amount, e.payerId],
    });
    for (const mid of e.shareMemberIds || []) {
      statements.push({
        sql: 'INSERT INTO expense_shares (expense_id, member_id) VALUES (?, ?)',
        args: [e.id, mid],
      });
    }
  }
  for (const s of settlements) {
    statements.push({
      sql: 'INSERT INTO settlements (id, date, from_id, to_id, amount, status) VALUES (?, ?, ?, ?, ?, ?)',
      args: [s.id, s.date, s.fromId, s.toId, s.amount, s.status || 'approved'],
    });
  }

  if (statements.length > 0) {
    await client.batch(statements, 'write');
  }

  console.log(
    `Đã migrate: ${members.length} thành viên, ${expenses.length} khoản chi, ${settlements.length} thanh toán.`
  );
}

main().catch((err) => {
  console.error('Migrate thất bại:', err);
  process.exit(1);
});
