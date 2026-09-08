'use strict';

const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

// Local dev: file SQLite ngay trên máy, không cần mạng.
// Production: trỏ TURSO_DATABASE_URL/TURSO_AUTH_TOKEN sang DB Turso free.
const DB_URL = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, '..', 'data.db')}`;
const DB_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

const client = createClient({
  url: DB_URL,
  authToken: DB_AUTH_TOKEN,
});

let initPromise = null;

async function columnExists(table, column) {
  const rs = await client.execute(`PRAGMA table_info(${table})`);
  return rs.rows.some((r) => r.name === column);
}

async function doInit() {
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        amount REAL NOT NULL,
        payer_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'approved',
        receipt TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS expense_shares (
        expense_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        PRIMARY KEY (expense_id, member_id)
      )`,
      `CREATE TABLE IF NOT EXISTS settlements (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'approved'
      )`,
    ],
    'write'
  );

  // DB được tạo trước khi có các cột này (bản cũ) sẽ không có — thêm vào nếu thiếu.
  if (!(await columnExists('expenses', 'status'))) {
    await client.execute("ALTER TABLE expenses ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
  }
  if (!(await columnExists('expenses', 'receipt'))) {
    await client.execute('ALTER TABLE expenses ADD COLUMN receipt TEXT');
  }
}

function init() {
  if (!initPromise) {
    initPromise = doInit();
  }
  return initPromise;
}

function newId() {
  return crypto.randomUUID();
}

async function getMembers() {
  await init();
  const rs = await client.execute('SELECT id, name FROM members ORDER BY rowid');
  return rs.rows.map((r) => ({ id: r.id, name: r.name }));
}

async function addMember(name) {
  await init();
  const id = newId();
  await client.execute({ sql: 'INSERT INTO members (id, name) VALUES (?, ?)', args: [id, name] });
  return id;
}

async function renameMember(id, name) {
  await init();
  const rs = await client.execute({ sql: 'UPDATE members SET name = ? WHERE id = ?', args: [name, id] });
  return rs.rowsAffected > 0;
}

async function memberExists(id) {
  await init();
  const rs = await client.execute({ sql: 'SELECT 1 FROM members WHERE id = ?', args: [id] });
  return rs.rows.length > 0;
}

async function memberIsReferenced(id) {
  await init();
  const [inExpensePayer, inExpenseShare, inSettlement] = await Promise.all([
    client.execute({ sql: 'SELECT 1 FROM expenses WHERE payer_id = ? LIMIT 1', args: [id] }),
    client.execute({ sql: 'SELECT 1 FROM expense_shares WHERE member_id = ? LIMIT 1', args: [id] }),
    client.execute({
      sql: 'SELECT 1 FROM settlements WHERE from_id = ? OR to_id = ? LIMIT 1',
      args: [id, id],
    }),
  ]);
  return inExpensePayer.rows.length > 0 || inExpenseShare.rows.length > 0 || inSettlement.rows.length > 0;
}

async function deleteMember(id) {
  await init();
  await client.execute({ sql: 'DELETE FROM members WHERE id = ?', args: [id] });
}

async function getExpenses() {
  await init();
  const [expRs, shareRs] = await Promise.all([
    client.execute(
      'SELECT id, date, description, amount, payer_id, status, receipt FROM expenses ORDER BY date DESC, rowid DESC'
    ),
    client.execute('SELECT expense_id, member_id FROM expense_shares'),
  ]);
  const sharesByExpense = new Map();
  for (const row of shareRs.rows) {
    const list = sharesByExpense.get(row.expense_id) || [];
    list.push(row.member_id);
    sharesByExpense.set(row.expense_id, list);
  }
  return expRs.rows.map((r) => ({
    id: r.id,
    date: r.date,
    description: r.description,
    amount: r.amount,
    payerId: r.payer_id,
    status: r.status,
    receipt: r.receipt || null,
    shareMemberIds: sharesByExpense.get(r.id) || [],
  }));
}

async function addExpense({ date, description, amount, payerId, shareMemberIds, status = 'approved', receipt = null }) {
  await init();
  const id = newId();
  const statements = [
    {
      sql: 'INSERT INTO expenses (id, date, description, amount, payer_id, status, receipt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, date, description, amount, payerId, status, receipt],
    },
    ...shareMemberIds.map((mid) => ({
      sql: 'INSERT INTO expense_shares (expense_id, member_id) VALUES (?, ?)',
      args: [id, mid],
    })),
  ];
  await client.batch(statements, 'write');
  return id;
}

async function getExpenseById(id) {
  await init();
  const rs = await client.execute({
    sql: 'SELECT id, date, description, amount, payer_id, status, receipt FROM expenses WHERE id = ?',
    args: [id],
  });
  if (rs.rows.length === 0) return null;
  const r = rs.rows[0];
  return {
    id: r.id,
    date: r.date,
    description: r.description,
    amount: r.amount,
    payerId: r.payer_id,
    status: r.status,
    receipt: r.receipt || null,
  };
}

async function setExpenseStatus(id, status) {
  await init();
  const rs = await client.execute({ sql: 'UPDATE expenses SET status = ? WHERE id = ?', args: [status, id] });
  return rs.rowsAffected > 0;
}

async function updateExpense(id, { date, description, amount, payerId, shareMemberIds, receipt = null }) {
  await init();
  const statements = [
    {
      sql: 'UPDATE expenses SET date = ?, description = ?, amount = ?, payer_id = ?, receipt = ? WHERE id = ?',
      args: [date, description, amount, payerId, receipt, id],
    },
    { sql: 'DELETE FROM expense_shares WHERE expense_id = ?', args: [id] },
    ...shareMemberIds.map((mid) => ({
      sql: 'INSERT INTO expense_shares (expense_id, member_id) VALUES (?, ?)',
      args: [id, mid],
    })),
  ];
  await client.batch(statements, 'write');
}

async function expenseExists(id) {
  await init();
  const rs = await client.execute({ sql: 'SELECT 1 FROM expenses WHERE id = ?', args: [id] });
  return rs.rows.length > 0;
}

async function deleteExpense(id) {
  await init();
  await client.batch(
    [
      { sql: 'DELETE FROM expense_shares WHERE expense_id = ?', args: [id] },
      { sql: 'DELETE FROM expenses WHERE id = ?', args: [id] },
    ],
    'write'
  );
}

async function getSettlements() {
  await init();
  const rs = await client.execute(
    'SELECT id, date, from_id, to_id, amount FROM settlements ORDER BY date DESC, rowid DESC'
  );
  return rs.rows.map((r) => ({
    id: r.id,
    date: r.date,
    fromId: r.from_id,
    toId: r.to_id,
    amount: r.amount,
  }));
}

async function addSettlement({ date, fromId, toId, amount }) {
  await init();
  const id = newId();
  await client.execute({
    sql: 'INSERT INTO settlements (id, date, from_id, to_id, amount) VALUES (?, ?, ?, ?, ?)',
    args: [id, date, fromId, toId, amount],
  });
  return id;
}

async function resetData() {
  await init();
  await client.batch(
    ['DELETE FROM expense_shares', 'DELETE FROM expenses', 'DELETE FROM settlements'],
    'write'
  );
}

function closeDb() {
  client.close();
}

async function getState() {
  const [members, expenses, settlements] = await Promise.all([
    getMembers(),
    getExpenses(),
    getSettlements(),
  ]);
  return { members, expenses, settlements };
}

module.exports = {
  newId,
  getMembers,
  addMember,
  renameMember,
  memberExists,
  memberIsReferenced,
  deleteMember,
  getExpenses,
  addExpense,
  updateExpense,
  expenseExists,
  getExpenseById,
  setExpenseStatus,
  deleteExpense,
  getSettlements,
  addSettlement,
  resetData,
  getState,
  closeDb,
  DB_URL,
};
