const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");

let db = null;

function getDbPath() {
  const file = process.env.SQLITE_DB_PATH ||
    path.join(process.cwd(), "database", "auto_print.sqlite");

  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return file;
}

function initializeDatabase() {
  if (db) return db;

  const dbPath = getDbPath();
  db = new sqlite3.Database(dbPath);

  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");

    db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL UNIQUE,
        client_token TEXT NOT NULL UNIQUE,
        client_name TEXT DEFAULT '',
        pc_name TEXT DEFAULT '',
        hostname TEXT DEFAULT '',
        printer_name TEXT DEFAULT '',
        status TEXT DEFAULT 'offline',
        last_seen TEXT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL UNIQUE,
        client_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        print_type TEXT DEFAULT 'BW',
        paper_size TEXT DEFAULT 'A4',
        copies INTEGER DEFAULT 1,
        amount NUMERIC DEFAULT 0,
        payment_status TEXT DEFAULT 'pending',
        job_status TEXT DEFAULT 'queued',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        printed_at TEXT NULL
      );

      CREATE TABLE IF NOT EXISTS payment_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT UNIQUE,
        upi_id TEXT DEFAULT '',
        upi_number TEXT DEFAULT '',
        qr_data TEXT,
        base_amount NUMERIC DEFAULT 10.00,
        bw_per_page NUMERIC DEFAULT 1.00,
        colour_per_page NUMERIC DEFAULT 5.00,
        minimum_amount NUMERIC DEFAULT 10.00
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT DEFAULT 'INFO',
        message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  console.log("[DB] SQLite ready:", dbPath);
  return db;
}

// MySQL-compatible execute() adapter for the existing routes/services.
function execute(sql, params = []) {
  const conn = initializeDatabase();
  const normalized = String(sql).trim().toUpperCase();

  return new Promise((resolve, reject) => {
    if (normalized.startsWith("SELECT") || normalized.startsWith("PRAGMA") ||
        normalized.startsWith("WITH")) {
      conn.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve([rows || [], []]);
      });
      return;
    }

    conn.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve([{ affectedRows: this.changes || 0, insertId: this.lastID || 0 }, []]);
    });
  });
}

function run(sql, ...params) {
  const conn = initializeDatabase();
  return new Promise((resolve, reject) => {
    conn.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes || 0, lastID: this.lastID || 0 });
    });
  });
}

function get(sql, ...params) {
  const conn = initializeDatabase();
  return new Promise((resolve, reject) => {
    conn.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, ...params) {
  const conn = initializeDatabase();
  return new Promise((resolve, reject) => {
    conn.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function getPool() {
  const conn = initializeDatabase();
  return {
    execute,
    run,
    get,
    all,
    raw: conn
  };
}

async function testDatabaseConnection() {
  await get("SELECT 1 AS ok");
  console.log("[DB] SQLite connection OK");
  return true;
}

module.exports = { getPool, testDatabaseConnection };
