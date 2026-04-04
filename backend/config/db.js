const path = require('path');

let db;
let dbType;

function getDB() {
  if (db) return db;

  const useSqlite = process.env.USE_SQLITE === 'true' || !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('tu_usuario');

  if (useSqlite) {
    dbType = 'sqlite';
    const Database = require('better-sqlite3');
    const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '../andesmar_geo.sqlite');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    console.log(`[DB] Usando SQLite en: ${dbPath}`);
  } else {
    dbType = 'postgres';
    // Implementación PostgreSQL (opcional, se activa si DATABASE_URL está configurado)
    console.log('[DB] Modo PostgreSQL no implementado en esta versión. Usando SQLite.');
    dbType = 'sqlite';
    const Database = require('better-sqlite3');
    const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '../andesmar_geo.sqlite');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }

  return db;
}

function getDBType() {
  return dbType;
}

module.exports = { getDB, getDBType };
