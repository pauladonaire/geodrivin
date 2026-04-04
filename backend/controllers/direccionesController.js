const { getDB } = require('../config/db');
const path = require('path');
const fs = require('fs');

function getDepositos() {
  const filePath = path.join(__dirname, '../config/depositos.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8')).depositos;
}

function getDepositos_route(req, res) {
  try {
    const depositos = getDepositos();
    const db = getDB();
    const user = req.user;

    const counts = db.prepare(`
      SELECT deposito_id, COUNT(*) as total,
             SUM(CASE WHEN estado = 'sin_coords' THEN 1 ELSE 0 END) as sin_coords,
             SUM(CASE WHEN estado = 'coords_aprox' THEN 1 ELSE 0 END) as coords_aprox,
             SUM(CASE WHEN estado = 'corregida' THEN 1 ELSE 0 END) as corregidas,
             SUM(CASE WHEN estado = 'error_envio' THEN 1 ELSE 0 END) as errores
      FROM cache_drivin
      GROUP BY deposito_id
    `).all();

    const countMap = {};
    for (const c of counts) {
      countMap[c.deposito_id] = c;
    }

    let deps = depositos.map(d => ({
      ...d,
      stats: countMap[d.id] || { total: 0, sin_coords: 0, coords_aprox: 0, corregidas: 0, errores: 0 }
    }));

    if (user.rol !== 'admin') {
      deps = deps.filter(d => d.id === user.deposito_id);
    }

    // Agregar "sin_asignar"
    const sinAsignar = {
      id: 'sin_asignar',
      nombre: 'Sin asignar',
      color: '#666666',
      stats: countMap['sin_asignar'] || { total: 0, sin_coords: 0, coords_aprox: 0, corregidas: 0, errores: 0 }
    };

    return res.json({ depositos: deps, sin_asignar: sinAsignar });
  } catch (err) {
    console.error('[Direcciones] getDepositos:', err);
    return res.status(500).json({ error: 'Error al obtener depósitos' });
  }
}

function getHistorial(req, res) {
  try {
    const db = getDB();
    const user = req.user;
    const limit = parseInt(req.query.limit) || 100;

    let query = `SELECT * FROM direcciones_corregidas WHERE 1=1`;
    const params = [];

    if (user.rol !== 'admin') {
      query += ' AND deposito_id = ?';
      params.push(user.deposito_id);
    }

    query += ' ORDER BY fecha_correccion DESC LIMIT ?';
    params.push(limit);

    const historial = db.prepare(query).all(...params);
    return res.json({ historial });
  } catch (err) {
    console.error('[Direcciones] getHistorial:', err);
    return res.status(500).json({ error: 'Error al obtener historial' });
  }
}

function getEstadisticas(req, res) {
  try {
    const db = getDB();
    const user = req.user;
    const today = new Date().toISOString().split('T')[0];

    let whereClause = '';
    const params = [];

    if (user.rol !== 'admin') {
      whereClause = ' WHERE deposito_id = ?';
      params.push(user.deposito_id);
    }

    const estadoWhere = whereClause ? whereClause + ' AND estado = ?' : ' WHERE estado = ?';

    const stats = {
      total_cache:      db.prepare(`SELECT COUNT(*) as c FROM cache_drivin${whereClause}`).get(...params)?.c || 0,
      sin_coords:       db.prepare(`SELECT COUNT(*) as c FROM cache_drivin${estadoWhere}`).get(...params, 'sin_coords')?.c || 0,
      coords_aprox:     db.prepare(`SELECT COUNT(*) as c FROM cache_drivin${estadoWhere}`).get(...params, 'coords_aprox')?.c || 0,
      corregidas_total: db.prepare(`SELECT COUNT(*) as c FROM cache_drivin${estadoWhere}`).get(...params, 'corregida')?.c || 0,
    };

    // Corregidas hoy
    const hoyParams = user.rol !== 'admin' ? [today, user.deposito_id] : [today];
    const correccionesHoy = db.prepare(`
      SELECT COUNT(*) as c FROM direcciones_corregidas
      WHERE date(fecha_correccion) = ?
      ${user.rol !== 'admin' ? 'AND deposito_id = ?' : ''}
    `).get(...hoyParams);

    stats.corregidas_hoy = correccionesHoy?.c || 0;

    return res.json(stats);
  } catch (err) {
    console.error('[Direcciones] getEstadisticas:', err);
    return res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
}

module.exports = { getDepositos_route, getHistorial, getEstadisticas };
