require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:8080',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'null' // file:// protocol
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // En desarrollo permitir todo; en producción restringir
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir frontend estático (para desarrollo integrado)
app.use(express.static(path.join(__dirname, '../frontend')));

// Inicializar DB y usuarios
const { getDB } = require('./config/db');
try {
  getDB();
  require('./scripts/migrate');
  // Auto-seed: crear usuarios si la tabla está vacía
  const db = getDB();
  const count = db.prepare('SELECT COUNT(*) as c FROM usuarios').get();
  if (!count || count.c === 0) {
    console.log('[Server] Base de datos vacía, creando usuarios...');
    const { seed } = require('./scripts/seed');
    seed().catch(err => console.error('[Server] Error en seed:', err.message));
  }
} catch (err) {
  console.error('[Server] Error inicializando DB:', err.message);
}

// Rutas API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/drivin', require('./routes/drivin'));
app.use('/api/direcciones', require('./routes/direcciones'));
app.use('/api/fijas', require('./routes/fijas'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '1.0.0', timestamp: new Date().toISOString() });
});

// Depositos config (sin auth para el frontend)
app.get('/api/config/depositos', (req, res) => {
  try {
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/depositos.json'), 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al leer configuración' });
  }
});

// SPA fallback para el frontend
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint no encontrado' });
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`[Server] Andesmar Geo corriendo en http://localhost:${PORT}`);
  console.log(`[Server] NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
