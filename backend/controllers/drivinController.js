const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../config/db');

const DRIVIN_BASE_URL = process.env.DRIVIN_BASE_URL || 'https://external.driv.in/api/external/v2';
const DRIVIN_API_KEY = process.env.DRIVIN_API_KEY || '';

function getDepositos() {
  const filePath = path.join(__dirname, '../config/depositos.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8')).depositos;
}

// Normalizar texto: quitar tildes, minúsculas
function normalizar(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function asignarDeposito(direccion, depositos) {
  const zip = (direccion.zip_code || '').toString().trim();
  const city = normalizar(direccion.city);

  for (const dep of depositos) {
    const { codigos_postales = [], codigos_postales_extra = [], excluir_codigos_postales = [] } = dep.reglas;
    const todosLosCPs = [...codigos_postales, ...codigos_postales_extra];

    // Prioridad 1: código postal exacto
    if (zip && todosLosCPs.length > 0 && todosLosCPs.includes(zip)) {
      return dep.id;
    }
  }

  // Prioridad 2: ciudad, con verificación de exclusión de CP
  for (const dep of depositos) {
    const { ciudades = [], excluir_codigos_postales = [] } = dep.reglas;
    const ciudadesNorm = ciudades.map(normalizar);

    if (ciudadesNorm.length > 0 && ciudadesNorm.includes(normalizar(city))) {
      // Para Mendoza: verificar que el CP no esté excluido
      if (excluir_codigos_postales.length > 0 && zip && excluir_codigos_postales.includes(zip)) {
        continue;
      }
      return dep.id;
    }
  }

  return 'sin_asignar';
}

async function fetchDrivin(req, res) {
  try {
    const response = await fetch(`${DRIVIN_BASE_URL}/addresses?georeferenced=0`, {
      headers: { 'X-API-Key': DRIVIN_API_KEY }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[Drivin] Error al consultar:', response.status, text);
      return res.status(502).json({ error: `Error al consultar Driv.in: ${response.status}` });
    }

    const data = await response.json();
    const addresses = Array.isArray(data) ? data : (data.addresses || data.data || []);
    const depositos = getDepositos();
    const db = getDB();

    // Guardar/actualizar en caché
    const upsert = db.prepare(`
      INSERT INTO cache_drivin (code, datos_json, deposito_id, estado, ultima_actualizacion)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(code) DO UPDATE SET
        datos_json = excluded.datos_json,
        deposito_id = excluded.deposito_id,
        ultima_actualizacion = excluded.ultima_actualizacion
    `);

    // Verificar cuáles ya fueron corregidas
    const corregidas = db.prepare('SELECT code FROM direcciones_corregidas').all().map(r => r.code);
    const correcidasSet = new Set(corregidas);

    let procesadas = 0;
    for (const addr of addresses) {
      const depositoId = asignarDeposito(addr, depositos);
      const estado = correcidasSet.has(addr.code) ? 'corregida' :
        (addr.lat && addr.lng) ? 'coords_aprox' : 'sin_coords';

      upsert.run(addr.code, JSON.stringify(addr), depositoId, estado);
      procesadas++;
    }

    console.log(`[Drivin] ${procesadas} direcciones actualizadas en caché`);
    return res.json({ ok: true, total: procesadas, timestamp: new Date().toISOString() });

  } catch (err) {
    console.error('[Drivin] Error:', err);
    return res.status(500).json({ error: 'Error interno al consultar Driv.in' });
  }
}

function getDirecciones(req, res) {
  try {
    const db = getDB();
    const user = req.user;
    const { deposito, estado, ciudad, desde, hasta, q } = req.query;

    let query = `SELECT cd.*, dc.fecha_correccion, dc.lat_nueva, dc.lng_nueva,
                        dc.metodo_geocodificacion, dc.intentos_envio, dc.error_detalle
                 FROM cache_drivin cd
                 LEFT JOIN (
                   SELECT code, fecha_correccion, lat_nueva, lng_nueva,
                          metodo_geocodificacion, intentos_envio, error_detalle
                   FROM direcciones_corregidas
                   WHERE id IN (SELECT MAX(id) FROM direcciones_corregidas GROUP BY code)
                 ) dc ON cd.code = dc.code
                 WHERE 1=1`;
    const params = [];

    // Filtrar por depósito
    if (user.rol !== 'admin') {
      query += ` AND (cd.deposito_id = ? OR cd.deposito_id = 'sin_asignar')`;
      params.push(user.deposito_id);
    } else if (deposito && deposito !== 'all') {
      query += ` AND cd.deposito_id = ?`;
      params.push(deposito);
    }

    // Filtrar por estado
    // Por defecto se ocultan las ya corregidas (solo se muestran si se pide explícitamente)
    if (estado && estado !== 'all') {
      query += ` AND cd.estado = ?`;
      params.push(estado);
    } else if (!estado || estado === 'all') {
      query += ` AND cd.estado != 'corregida'`;
    }

    query += ` ORDER BY cd.ultima_actualizacion DESC`;

    const rows = db.prepare(query).all(...params);

    // Parsear JSON y aplicar filtros de frontend
    let result = rows.map(row => {
      const datos = JSON.parse(row.datos_json);
      return {
        ...datos,
        deposito_id: row.deposito_id,
        estado: row.estado,
        ultima_actualizacion: row.ultima_actualizacion,
        lat_nueva: row.lat_nueva,
        lng_nueva: row.lng_nueva,
        fecha_correccion: row.fecha_correccion,
        metodo_geocodificacion: row.metodo_geocodificacion,
        error_detalle: row.error_detalle
      };
    });

    return res.json({ direcciones: result, total: result.length });
  } catch (err) {
    console.error('[Drivin] Error getDirecciones:', err);
    return res.status(500).json({ error: 'Error al obtener direcciones' });
  }
}

async function enviarDrivin(req, res) {
  try {
    const { addresses } = req.body;
    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({ error: 'Se requiere array de addresses' });
    }

    const db = getDB();
    const resultados = [];

    for (const addr of addresses) {
      let intentos = 0;
      let ok = false;
      let errorMsg = null;

      while (intentos < 2 && !ok) {
        try {
          if (intentos > 0) {
            await new Promise(r => setTimeout(r, 3000));
          }

          const response = await fetch(`${DRIVIN_BASE_URL}/addresses`, {
            method: 'PUT',
            headers: {
              'X-API-Key': DRIVIN_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ addresses: [addr] })
          });

          if (response.ok) {
            ok = true;
          } else {
            const txt = await response.text();
            errorMsg = `HTTP ${response.status}: ${txt}`;
          }
        } catch (e) {
          errorMsg = e.message;
        }
        intentos++;
      }

      // Guardar en DB
      const addr_original_data = db.prepare('SELECT datos_json FROM cache_drivin WHERE code = ?').get(addr.code);
      const original = addr_original_data ? JSON.parse(addr_original_data.datos_json) : {};

      const observation = addr.observation || `Dir. original: ${original.address1 || ''}, ${original.city || ''}`;

      db.prepare(`
        INSERT INTO direcciones_corregidas
        (code, address1_original, city_original, lat_nueva, lng_nueva, observation,
         deposito_id, usuario, tipo, metodo_geocodificacion, intentos_envio,
         estado_envio, error_detalle, dispatch_date_original, client, name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        addr.code,
        original.address1 || addr.address1,
        original.city || addr.city,
        addr.lat, addr.lng,
        observation,
        req.user.deposito_id,
        req.user.username,
        addr._tipo || 'eventual',
        addr._metodo || 'mapbox',
        intentos,
        ok ? 'ok' : 'error',
        ok ? null : errorMsg,
        original.dispatch_date || null,
        original.client || addr.client,
        original.name || addr.name
      );

      // Actualizar estado en caché
      db.prepare(`UPDATE cache_drivin SET estado = ? WHERE code = ?`)
        .run(ok ? 'corregida' : 'error_envio', addr.code);

      resultados.push({ code: addr.code, ok, error: ok ? null : errorMsg });
    }

    const exitosos = resultados.filter(r => r.ok).length;
    const fallidos = resultados.filter(r => !r.ok).length;

    return res.json({
      ok: fallidos === 0,
      exitosos,
      fallidos,
      resultados
    });

  } catch (err) {
    console.error('[Drivin] Error enviarDrivin:', err);
    return res.status(500).json({ error: 'Error interno al enviar a Driv.in' });
  }
}

function getMapboxToken(req, res) {
  return res.json({ token: process.env.MAPBOX_TOKEN || '' });
}

module.exports = { fetchDrivin, getDirecciones, enviarDrivin, getMapboxToken, asignarDeposito, getDepositos };
