const mysql = require("mysql2/promise");

let pool;

function getPool() {
  if (pool) return pool;

  const url = process.env.MYSQL_URL;

  if (url) {
    pool = mysql.createPool(url);
  } else {
    const host = process.env.MYSQL_HOST;
    const user = process.env.MYSQL_USER;
    const password = process.env.MYSQL_PASSWORD;
    const database = process.env.MYSQL_DATABASE;
    const port = Number(process.env.MYSQL_PORT || 3306);

    if (!host || !user || !database) {
      throw new Error(
        "MySQL configuration missing: MYSQL_HOST, MYSQL_USER and MYSQL_DATABASE are required."
      );
    }

    if (
      process.env.NODE_ENV === "production" &&
      ["127.0.0.1", "localhost", "::1"].includes(host)
    ) {
      throw new Error(
        "MYSQL_HOST cannot be localhost/127.0.0.1 in production. Set the real MySQL server host."
      );
    }

    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });
  }

  return pool;
}

async function testDatabaseConnection() {
  const db = getPool();
  const connection = await db.getConnection();

  try {
    await connection.ping();
    console.log("[DB] MySQL connection OK");
    return true;
  } finally {
    connection.release();
  }
}

module.exports = {
  getPool,
  testDatabaseConnection
};
