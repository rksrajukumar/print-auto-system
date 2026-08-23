const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

let dbPromise;

function getPool() {
  if (!dbPromise) {
    const dbPath = process.env.SQLITE_DB_PATH ||
      path.join(process.cwd(), "database", "auto_print.sqlite");

    dbPromise = open({ filename: dbPath, driver: sqlite3.Database })
      .then(async (db) => {
        await db.exec("PRAGMA foreign_keys = ON;");
        await db.exec(`
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
        console.log("[DB] SQLite ready:", dbPath);
        return db;
      });
  }
  return dbPromise;
}

async function testDatabaseConnection() {
  const db = await getPool();
  await db.get("SELECT 1 AS ok");
  console.log("[DB] SQLite connection OK");
  return true;
}

module.exports = { getPool, testDatabaseConnection };
