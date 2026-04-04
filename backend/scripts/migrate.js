require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getDB } = require('../config/db');

function migrate() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      deposito_id TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'user',
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS direcciones_corregidas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      address1_original TEXT,
      city_original TEXT,
      lat_nueva REAL,
      lng_nueva REAL,
      observation TEXT,
      deposito_id TEXT,
      usuario TEXT,
      fecha_correccion TEXT DEFAULT (datetime('now')),
      tipo TEXT DEFAULT 'eventual',
      metodo_geocodificacion TEXT DEFAULT 'mapbox',
      intentos_envio INTEGER DEFAULT 1,
      estado_envio TEXT DEFAULT 'ok',
      error_detalle TEXT,
      dispatch_date_original TEXT,
      client TEXT,
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS direcciones_fijas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_referencia TEXT NOT NULL,
      address1 TEXT,
      address2 TEXT,
      city TEXT,
      state TEXT,
      country TEXT DEFAULT 'Argentina',
      zip_code TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      deposito_id TEXT NOT NULL,
      creado_por TEXT,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      veces_usada INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cache_drivin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      datos_json TEXT NOT NULL,
      deposito_id TEXT,
      estado TEXT DEFAULT 'pendiente',
      ultima_actualizacion TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cache_code ON cache_drivin(code);
    CREATE INDEX IF NOT EXISTS idx_cache_deposito ON cache_drivin(deposito_id);
    CREATE INDEX IF NOT EXISTS idx_corregidas_code ON direcciones_corregidas(code);
    CREATE INDEX IF NOT EXISTS idx_fijas_deposito ON direcciones_fijas(deposito_id);
  `);

  console.log('[Migrate] Tablas creadas/verificadas correctamente.');
}

migrate();
